"""Ice sheets at their dated extent, for `?ice=1` (docs/ops/ice-sheets.md).

Source: PaleoMIST 1.0, Gowan, Zhang, Khosravi et al. 2021, "A new global ice sheet reconstruction for the past 80 000 years",
Nature Communications 12: 1199, doi:10.1038/s41467-021-21469-w. Data: Gowan 2019, PANGAEA, doi:10.1594/PANGAEA.905800, licence
CC BY 4.0 (the dataset's PANGAEA metadata, read 2026-11-22). One 3.7 GB zip; the server answers byte ranges, so this script reads the
zip's directory remotely and fetches only the ice-margin files (each member's CRC-32 is checked by zipfile as it is read, then its
sha256 is pinned in ice_sheets_sources.json).

What is drawn
  * MARGINS, not thickness: the `margins/<region>/<age>.gmt` polygons (WGS84 lon/lat, `# @P` outer rings, `# @H` holes) of
    Eurasia, North America and Patagonia, every 2.5 ka from 80 ka to 0 BP. A 2.5' pixel of the app's world grid (8640 x 4320, row 0
    north, column 0 180 W) is ice when its centre is inside a polygon. Each (epoch, region) is one patch cropped to its ice.
  * BASIS per region (the readmes in the archive): Eurasia follows DATED-1's most-credible time slices (Hughes et al. 2016) at 25,
    20, 15 and 10 ka, with 27.5/22.5/17.5/12.5 ka set between them and 2.5-7.5 ka set to modern extents; North America is Gowan's
    own margin compilation (a second "a1" scenario differs only in MIS 3, before 30 ka); Patagonia is Ehlers et al. 2011 held from
    30 to 18 ka, GLIMS from 13 ka, interpolated between.
  * DATES: calendar ka BP from 1950. The RULE between epochs: a year shows the NEAREST native epoch (|BP - epoch| <= 1.25 ka,
    windows tile without gaps), never an interpolation. Before 81,249 BP there is no reconstruction: unknown, not ice-free.
  * LEFT OUT: Antarctica (nobody lives there, the Earth image's ice biome covers it, and its patch would be 8640 pixels wide), the
    ice thickness and surface height (PaleoMIST has them under CC BY, but the task keeps height out), DATED-1's min/max envelopes.

Outputs (footsteps-web/public/ice/)
  ice_sheets.json              manifest: source, licence, rule, regions, epochs and their patches (bytes, sha256, area), uncertainty
  ice_<age>_<region>.webp      the mask patch: red 255 = ice

    poetry run python footstep-generator/ice_sheets.py            # fetch (once), rasterise, write
    poetry run python footstep-generator/ice_sheets.py --verify   # also compare 20 ka with the 1-degree thickness grid
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

import past_water as pw

ROOT = pw.ROOT
OUT = ROOT / "footsteps-web" / "public" / "ice"
SRC = ROOT / "data" / "paleomist_src"
PINS = Path(__file__).resolve().parent / "ice_sheets_sources.json"

ARCHIVE_URL = "https://hs.pangaea.de/Maps/Global_Ice_Sheets/Gowan_ice_reconstruction.zip"
ARCHIVE_BYTES = 3_706_381_549  # Content-Length on 2026-11-22
PREFIX = "ice_reconstruction/"
REGIONS = ("Eurasia", "North_America", "Patagonia")
ALTERNATIVE = "North_America_a1"
AGES_BP = tuple(range(0, 80_001, 2500))
HALF_STEP = 1250
FIRST_ID = 101  # patch ids: past-water epoch ids are below 100 (lib/pastWater.ts), so one id names one exclusion everywhere
MARGIN = 2  # pixels kept round the ice in its patch
NX, NY, PIXEL_DEG = pw.NX, pw.NY, pw.PIXEL_DEG
GRID_1DEG = "global_grid/reconstruction_1_degree.nc"

BASIS = {
    "Eurasia": "DATED-1 most-credible time slices (Hughes et al. 2016, Boreas 45: 1-45) at 25, 20, 15 and 10 ka; 27.5, 22.5, 17.5 and "
    "12.5 ka set between them by Gowan; 2.5-7.5 ka modern extents (GLIMS); before 30 ka other cited reconstructions",
    "North_America": "Gowan's margin compilation for PaleoMIST (Dyke 2004 and dated sites listed in the archive's readme); the "
    "alternative 'a1' scenario differs only in MIS 3",
    "Patagonia": "Ehlers et al. 2011 LGM limit held 30-18 ka, GLIMS modern outlines from 13 ka, contour-interpolated between",
}
UNCERTAINTY = [
    "A reconstruction, not an observation: margins are drawn from dated moraines, sediments and model fits, every 2.5 ka.",
    "Nearest epoch, not interpolation: a year up to 1.25 ka from an epoch shows that epoch's margin; edges move in steps.",
    "Eurasia: DATED-1 gives minimum and maximum envelopes too; only the most-credible line (via PaleoMIST) is drawn.",
    "North America: PaleoMIST's 'a1' scenario keeps more ice in MIS 3 (before 30 ka); it is measured here, not drawn.",
    "Patagonia: one LGM limit held 30-18 ka; the authors meant to replace it with Davies et al.'s margins.",
    "Before 80 ka there is no reconstruction: the layer draws nothing, which is not the same as no ice.",
]


# --- source -------------------------------------------------------------------------------------------------------------

def urlopen(req: urllib.request.Request, tries: int = 5):
    """urlopen with a few retries: PANGAEA's file server answers 500/503 now and then."""
    import time
    for attempt in range(tries):
        try:
            return urllib.request.urlopen(req, timeout=120)
        except urllib.error.HTTPError as error:
            if error.code < 500 or attempt == tries - 1:
                raise
            time.sleep(5 * (attempt + 1))


class RangeFile(io.RawIOBase):
    """A read-only, seekable view of a remote file through HTTP Range requests (what zipfile needs to read one member)."""

    def __init__(self, url: str, size: int):
        self.url, self.size, self.pos = url, size, 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = 0) -> int:
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def readinto(self, b) -> int:
        if self.pos >= self.size:
            return 0
        end = min(self.size, self.pos + len(b)) - 1
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
        with urlopen(req) as r:
            data = r.read()
        b[: len(data)] = data
        self.pos += len(data)
        return len(data)


def members(regions=REGIONS + (ALTERNATIVE,)) -> list[str]:
    """The archive paths this build reads: each region's readme and margins."""
    out = [f"margins/{r}/readme" for r in regions]
    out += [f"margins/{r}/{age}.gmt" for r in regions for age in AGES_BP]
    return out


def fetch(names: list[str], src: Path = SRC) -> dict[str, Path]:
    """Each member under `src` (fetched once, CRC-32 checked by zipfile), checked against its pinned sha256 when pinned."""
    missing = [n for n in names if not (src / n).exists()]
    if missing:
        with urlopen(urllib.request.Request(ARCHIVE_URL, method="HEAD")) as r:
            size = int(r.headers["Content-Length"])
        if size != ARCHIVE_BYTES:
            raise ValueError(f"archive is {size} bytes, expected {ARCHIVE_BYTES} (the source changed; review before updating)")
        with zipfile.ZipFile(io.BufferedReader(RangeFile(ARCHIVE_URL, size), buffer_size=1 << 20)) as z:
            for n in missing:
                path = src / n
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(z.read(PREFIX + n))  # zipfile raises BadZipFile on a CRC mismatch
    pins = json.loads(PINS.read_text())["sha256"] if PINS.exists() else {}
    for n in names:
        got = hashlib.sha256((src / n).read_bytes()).hexdigest()
        if n in pins and pins[n] != got:
            raise ValueError(f"{n}: sha256 {got}, expected {pins[n]} (the source changed; review it before updating the pin)")
    return {n: src / n for n in names}


def write_pins(paths: dict[str, Path]) -> None:
    PINS.write_text(json.dumps({
        "archive": ARCHIVE_URL, "archive_bytes": ARCHIVE_BYTES, "doi": "10.1594/PANGAEA.905800", "licence": "CC-BY-4.0",
        "sha256": {n: hashlib.sha256(p.read_bytes()).hexdigest() for n, p in sorted(paths.items())},
    }, indent=1) + "\n")


# --- geometry -----------------------------------------------------------------------------------------------------------

@dataclass
class Polygon:
    outer: np.ndarray  # (n, 2) lon, lat
    holes: list[np.ndarray]


def parse_gmt(text: str) -> list[Polygon]:
    """Polygons of an OGR/GMT file: a `# @P` line starts a polygon's outer ring, `# @H` a hole of the current polygon. Coordinates
    with no marker after a `>` start a new polygon too."""
    polys: list[Polygon] = []
    ring: list[tuple[float, float]] | None = None
    kind = "P"

    def close():
        if ring and len(ring) >= 3:
            arr = np.asarray(ring, dtype=np.float64)
            if kind == "H" and polys:
                polys[-1].holes.append(arr)
            else:
                polys.append(Polygon(arr, []))

    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith(">"):
            close()
            ring, kind = None, "P"
        elif s.startswith("# @P"):
            close()
            ring, kind = [], "P"
        elif s.startswith("# @H"):
            close()
            ring, kind = [], "H"
        elif s.startswith("#"):
            continue
        else:
            if ring is None:
                ring, kind = [], "P"
            lon, lat = s.split()[:2]
            ring.append((float(lon), float(lat)))
    close()
    for p in polys:  # some files carry longitudes 180-360; the grid's run -180..180
        if p.outer[:, 0].min() > 180:
            p.outer[:, 0] -= 360
            for h in p.holes:
                h[:, 0] -= 360
    return polys


def rasterise(polys: list[Polygon]) -> np.ndarray:
    """A world mask (NY, NX) bool: True where a 2.5' pixel's centre is inside a polygon's outer ring and outside its holes."""
    import shapely
    world = np.zeros((NY, NX), dtype=bool)
    for p in polys:
        west, south = p.outer.min(axis=0)
        east, north = p.outer.max(axis=0)
        c0, c1 = max(0, int((west + 180) / PIXEL_DEG)), min(NX, int((east + 180) / PIXEL_DEG) + 1)
        r0, r1 = max(0, int((90 - north) / PIXEL_DEG)), min(NY, int((90 - south) / PIXEL_DEG) + 1)
        if c1 <= c0 or r1 <= r0:
            continue
        geom = shapely.make_valid(shapely.Polygon(p.outer, p.holes))  # a few source rings touch themselves
        shapely.prepare(geom)
        lon = -180 + (np.arange(c0, c1) + 0.5) * PIXEL_DEG
        lat = 90 - (np.arange(r0, r1) + 0.5) * PIXEL_DEG
        lon2, lat2 = np.meshgrid(lon, lat)
        world[r0:r1, c0:c1] |= shapely.contains_xy(geom, lon2, lat2)
    return world


def crop(world: np.ndarray) -> tuple[pw.Patch, np.ndarray] | None:
    """The mask cropped to its ice plus MARGIN pixels: (patch, uint8 0/255), or None when there is no ice."""
    rows = np.nonzero(world.any(axis=1))[0]
    cols = np.nonzero(world.any(axis=0))[0]
    if not len(rows):
        return None
    r0, r1 = max(0, rows[0] - MARGIN), min(NY, rows[-1] + MARGIN + 1)
    c0, c1 = max(0, cols[0] - MARGIN), min(NX, cols[-1] + MARGIN + 1)
    return pw.Patch(int(c0), int(r0), int(c1 - c0), int(r1 - r0)), (world[r0:r1, c0:c1] * 255).astype(np.uint8)


def area_km2(patch: pw.Patch, mask: np.ndarray) -> float:
    rows = np.arange(patch.y0, patch.y0 + patch.height)
    return float(((mask > 0).sum(axis=1) * pw.pixel_area_km2(rows)).sum())


# --- epochs -------------------------------------------------------------------------------------------------------------

def epoch_window(age_bp: int) -> tuple[int, int]:
    """(from_year, to_year), both inclusive: the years whose BP is nearest this epoch, i.e. BP in [age - 1250, age + 1249]."""
    return pw.BP_ZERO - (age_bp + HALF_STEP - 1), pw.BP_ZERO - (age_bp - HALF_STEP)


def epoch_at(year: float, ages=AGES_BP) -> int | None:
    """The epoch (ka BP x 1000) a calendar year shows, or None before the oldest window."""
    for age in ages:
        lo, hi = epoch_window(age)
        if lo <= year <= hi or (age == ages[0] and year > hi):
            return age
    return None


def ka(age_bp: int) -> str:
    return f"{age_bp / 1000:g}"


def build(paths: dict[str, Path], out: Path = OUT) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("ice_*_*.webp"):
        old.unlink()
    epochs = []
    next_id = FIRST_ID
    for age in sorted(AGES_BP, reverse=True):
        lo, hi = epoch_window(age)
        patches = []
        for region in REGIONS:
            cropped = crop(rasterise(parse_gmt(paths[f"margins/{region}/{age}.gmt"].read_text())))
            if cropped is None:
                continue
            patch, mask = cropped
            path = out / f"ice_{age}_{region.lower()}.webp"
            pw.write_gray(path, mask)
            meta = pw.mask_meta(path, patch)
            del meta["grid"]
            patches.append({"id": next_id, "region": region, **meta, "pixels": int((mask > 0).sum()), "area_km2": round(area_km2(patch, mask))})
            next_id += 1
        epochs.append({"bp": age, "ka": ka(age), "from_year": lo, "to_year": hi, "patches": patches})
    alt = []
    for age in sorted(AGES_BP, reverse=True):
        a = rasterise(parse_gmt(paths[f"margins/North_America/{age}.gmt"].read_text()))
        b = rasterise(parse_gmt(paths[f"margins/{ALTERNATIVE}/{age}.gmt"].read_text()))
        diff = a ^ b
        if diff.any():
            rows = np.nonzero(diff)[0]
            alt.append({"bp": age, "pixels_differ": int(diff.sum()), "area_km2_differ": round(float(pw.pixel_area_km2(rows).sum()))})
    manifest = {
        "id": "ice_sheets",
        "version": 1,
        "label": "Ice sheets (PaleoMIST 1.0, experimental)",
        "flag": "?ice=1",
        "source": {
            "name": "PaleoMIST 1.0",
            "citation": "Gowan, E.J., Zhang, X., Khosravi, S., et al. 2021. A new global ice sheet reconstruction for the past 80 000 "
            "years. Nature Communications 12: 1199. doi:10.1038/s41467-021-21469-w",
            "dataset": "doi:10.1594/PANGAEA.905800",
            "licence": "CC BY 4.0",
            "archive": ARCHIVE_URL,
            "archive_bytes": ARCHIVE_BYTES,
            "files": "margins/<region>/<age>.gmt, sha256 pinned in footstep-generator/ice_sheets_sources.json",
        },
        "evidence": "modelled (a published reconstruction of dated margins)",
        "rule": "a year shows the nearest native epoch (|BP - epoch| <= 1.25 ka); never interpolated. BP from 1950: year = 1950 - BP.",
        "outside": "before 81,249 BP (app year -79299): no reconstruction; nothing drawn, which is not the same as no ice",
        "grid": f"{NX} x {NY} world pixels of {PIXEL_DEG * 60:g}'; x0, y0 = column, row of the patch's north-west pixel (row 0 north, "
        "column 0 180 W); red 255 = ice (pixel centre inside a margin polygon)",
        "regions": {r: BASIS[r] for r in REGIONS},
        "left_out": [
            "Antarctica: nobody lives there and the Earth image's ice biome covers it; its patch would be 8640 pixels wide",
            "ice thickness and surface height: PaleoMIST has them (CC BY 4.0) but the first build keeps height out",
            "DATED-1's minimum and maximum envelopes",
        ],
        "uncertainty": UNCERTAINTY,
        "alternative_a1": alt,
        "epochs": epochs,
        "bytes": sum(p["bytes"] for e in epochs for p in e["patches"]),
    }
    manifest["digest"] = hashlib.sha256(json.dumps(epochs, sort_keys=True).encode()).hexdigest()[:12]
    (out / "ice_sheets.json").write_text(json.dumps(manifest, indent=1) + "\n")
    return manifest


# --- reproduce a published epoch ----------------------------------------------------------------------------------------

def compare_with_grid(age: int, out: Path = OUT, src: Path = SRC) -> dict:
    """Our margins at `age` against PaleoMIST's own 1-degree `ice_thickness` (> 0), a grid of nodes at whole degrees: per node, ours is ice
    when at least half the 2.5' pixels of the 1-degree box centred on it are. Counted over the nodes either calls ice inside our patches' boxes."""
    import xarray as xr
    path = fetch([GRID_1DEG], src)[GRID_1DEG]
    ds = xr.open_dataset(path, decode_times=False)
    manifest = json.loads((out / "ice_sheets.json").read_text())
    epoch = next(e for e in manifest["epochs"] if e["bp"] == age)
    world = np.zeros((NY, NX), dtype=bool)
    box = np.zeros((181, 361), dtype=bool)
    for p in epoch["patches"]:
        patch, mask, _ = pw.load_mask({"mask": p, "level": {"kind": "sea"}}, out)
        world[patch.y0:patch.y0 + patch.height, patch.x0:patch.x0 + patch.width] |= mask
        box[p["y0"] // 24:(p["y0"] + p["height"]) // 24 + 2, p["x0"] // 24:(p["x0"] + p["width"]) // 24 + 2] = True
    half = 12  # pixels: half a degree, so block j is centred on node j
    shifted = np.pad(np.roll(world, half, axis=1), ((half, half), (0, 0)))
    share = shifted.reshape(181, 24, 360, 24).mean(axis=(1, 3))
    ours = np.zeros((181, 361), dtype=bool)
    ours[:, :360] = share >= 0.5
    ours[:, 360] = ours[:, 0]  # 180 E = 180 W
    k = int(np.argmin(np.abs(np.abs(ds["time"].values) - age)))
    thick = ds["ice_thickness"].isel(time=k).transpose("lat", "lon").values  # lat ascending: flip to row 0 = 90 N
    theirs = thick[::-1, :] > 0
    either = (ours | theirs) & box
    agree = (ours == theirs) & either
    return {"bp": age, "grid_time": float(ds["time"].values[k]), "nodes_either": int(either.sum()),
            "agree_share": round(float(agree.sum() / max(1, either.sum())), 3),
            "ours_only": int((ours & ~theirs & box).sum()), "grid_only": int((theirs & ~ours & box).sum())}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--src", type=Path, default=SRC)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--pin", action="store_true", help="write the sha256 pins of the fetched members (first fetch only)")
    parser.add_argument("--verify", action="store_true", help="compare 20 ka and 15 ka with PaleoMIST's 1-degree thickness grid")
    args = parser.parse_args(argv)
    paths = fetch(members(), args.src)
    if args.pin:
        write_pins(paths)
    manifest = build(paths, args.out)
    for e in manifest["epochs"]:
        if 10_000 <= e["bp"] <= 27_500:
            print(e["ka"], "ka", {p["region"]: (p["area_km2"], p["bytes"]) for p in e["patches"]})
    print("bytes", manifest["bytes"], "patches", sum(len(e["patches"]) for e in manifest["epochs"]))
    if args.verify:
        for age in (20_000, 15_000):
            print(json.dumps(compare_with_grid(age, args.out, args.src)))


if __name__ == "__main__":
    sys.exit(main())
