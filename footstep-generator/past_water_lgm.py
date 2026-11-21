"""European Last Glacial Maximum lakes and rivers, one dated snapshot, for `?pastwater=1` (docs/ops/past-water.md).

Source: Verheul, Zickel, Becker & Willmes 2015, "LGM major inland waters of Europe - GIS dataset", CRC806-Database,
doi:10.5880/SFB806.14. Licence CC-BY (the dataset's metadata PDF; its page says "attribution required, commercial use,
derivations allowed"; the version is not stated). Two zipped shapefiles in WGS84, compiled from published maps (Ehlers et al.
2011, Harrison et al. 1991, Toucanne et al. 2010, Grosswald 1980, Orombelli et al. 2004, Torfstein et al. 2013 and others), with
gaps in river courses filled by GEBCO flow routing. Temporal metadata: the LGM, 26,500-19,000 years BP.

What is modelled
  * ONE SNAPSHOT: the whole dataset holds from 26,500 to 19,000 BP (calendar BP from 1950: app years -24550 to -17050, both ends
    inclusive) and nowhere else. It is not interpolated toward the Holocene; outside the window the scenario is inactive (geography
    unknown, not dry).
  * LAKES are wet: every 2.5' pixel whose centre is inside a lake polygon. Polygons smaller than a pixel (most of the Alpine ones)
    vanish; the manifest counts them. Their water stands at one level per polygon: the median ETOPO1 height of its shore pixels (the
    polygon's own pixels beside a dry one), carried per pixel in the mask's green and blue. An estimate, not a dated shoreline.
  * FRESH WATER: rivers and every lake but the Caspian, Aral, Sarygamysh and Lisan (brackish to hypersaline) are fresh, assumed; they
    give the freshwater distance as min(static image, distance to these cells). Rivers are never wet: a line is not a 4.6 km pixel.
  * NOT IN THE DATA: the Black Sea (no polygon), modern lakes and rivers that were under ice or did not exist (they are kept: Natural
    Earth water is never removed), ice sheets themselves.

Outputs (public/pastwater/)
  lgm_europe.json        manifest (version 2): the epoch, its mask and distance patches, sources, licence, uncertainty
  lgm_europe_mask.webp   lakes on the 2.5' world grid: red 255 = lake; green * 256 + blue - 32768 = the lake's level (m)
  lgm_europe_water.webp  freshwater distance codes on the HYDE 5' grid where the LGM water is nearer than the static image's

    poetry run python footstep-generator/past_water_lgm.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

import past_water as pw
import water_distance as wd

NAME = "lgm_europe"
SRC = pw.ROOT / "data" / "pastwater_src"
BASE_URL = "https://crc806db.uni-koeln.de/data/Z/Z2/"
FILES = {  # name -> sha256 of the bytes fetched 2026-11-21
    "LGM_Lakes.zip": "8bd5e7e815cf414967459b2cfbf027136043c503abcd562045a61720e238f940",
    "LGM_River.zip": "04661e387f56bbe2b5c7fef4bf00713a4c78c05d3c970ee78e2fc563bb2e9711",
}
EPOCH = pw.Epoch(2, "LGM snapshot", 26_500, 19_000)
NOT_FRESH = ("Caspian Sea", "Aral Sea", "Sarygamysh Lake", "Lake Lisan")  # Name_2 of the brackish to hypersaline lakes
ETOPO = pw.ROOT / "data" / "raw" / "etopo" / "etopo_4min.nc"
MARGIN = 2  # pixels kept round the lakes in their patch
# Lakes whose source states an altitude (pk22_ice_4 text): a check on the shore-median level, not an input.
STATED_LEVEL_M = {0: 145, 1: 137, 2: 150, 3: 180}


def fetch(src: Path = SRC) -> dict[str, Path]:
    """The two zips in `src` (downloaded once), each checked against its pinned sha256."""
    src.mkdir(parents=True, exist_ok=True)
    paths = {}
    for name, sha in FILES.items():
        path = src / name
        if not path.exists():
            urllib.request.urlretrieve(BASE_URL + name, path)
        got = hashlib.sha256(path.read_bytes()).hexdigest()
        if got != sha:
            raise ValueError(f"{name}: sha256 {got}, expected {sha} (the source changed; review it before updating the pin)")
        paths[name] = path
    return paths


def read(paths: dict[str, Path]):
    import geopandas as gpd
    lakes = gpd.read_file(f"zip://{paths['LGM_Lakes.zip']}!LGM_Lakes.shp")
    rivers = gpd.read_file(f"zip://{paths['LGM_River.zip']}!LGM_River.shp")
    return lakes, rivers


def lake_labels(lakes) -> tuple[pw.Patch, np.ndarray]:
    """Each 2.5' pixel's lake (index + 1 in the shapefile; later polygons win where two overlap), 0 = none, cropped to the lakes' box."""
    import shapely
    west, south, east, north = lakes.total_bounds
    c0, c1 = int((west + 180) / pw.PIXEL_DEG) - MARGIN, int((east + 180) / pw.PIXEL_DEG) + MARGIN + 1
    r0, r1 = int((90 - north) / pw.PIXEL_DEG) - MARGIN, int((90 - south) / pw.PIXEL_DEG) + MARGIN + 1
    lon = -180 + (np.arange(c0, c1) + 0.5) * pw.PIXEL_DEG
    lat = 90 - (np.arange(r0, r1) + 0.5) * pw.PIXEL_DEG
    lon2, lat2 = np.meshgrid(lon, lat)
    labels = np.zeros(lon2.shape, np.int32)
    for i, geom in enumerate(lakes.geometry):
        a, b, c, d = geom.bounds
        sel = (lon2 >= a) & (lon2 <= c) & (lat2 >= b) & (lat2 <= d)
        if sel.any():
            inside = shapely.contains_xy(geom, lon2[sel], lat2[sel])
            labels[np.nonzero(sel)[0][inside], np.nonzero(sel)[1][inside]] = i + 1
    return pw.Patch(c0, r0, c1 - c0, r1 - r0), labels


def etopo_at(patch: pw.Patch) -> np.ndarray:
    """ETOPO1 (4' grid-registered) metres at the patch's pixel centres, nearest sample."""
    import xarray as xr
    with xr.open_dataset(ETOPO) as ds:
        z = ds["altitude"]
        lat = 90 - (patch.y0 + np.arange(patch.height) + 0.5) * pw.PIXEL_DEG
        lon = -180 + (patch.x0 + np.arange(patch.width) + 0.5) * pw.PIXEL_DEG
        return z.sel(latitude=xr.DataArray(lat, dims="y"), longitude=xr.DataArray(lon, dims="x"), method="nearest").values.astype(np.float32)


def shore_levels(labels: np.ndarray, elev: np.ndarray) -> dict[int, float]:
    """Per lake label, the median height of its shore pixels (its own pixels with a 4-neighbour that is no lake), whole metres."""
    wet = labels > 0
    dry_next = np.zeros_like(wet)
    dry_next[1:, :] |= ~wet[:-1, :]; dry_next[:-1, :] |= ~wet[1:, :]; dry_next[:, 1:] |= ~wet[:, :-1]; dry_next[:, :-1] |= ~wet[:, 1:]
    out = {}
    for label in np.unique(labels[wet]):
        own = labels == label
        shore = own & dry_next
        out[int(label)] = float(np.rint(np.median(elev[shore if shore.any() else own])))
    return out


def mask_rgb(labels: np.ndarray, levels: dict[int, float]) -> np.ndarray:
    """Red 255 where lake; green, blue = level + 32768 (whole metres) where lake, 0 elsewhere."""
    level = np.zeros(labels.shape, np.int32)
    for label, m in levels.items():
        level[labels == label] = int(m) + pw.LEVEL_OFFSET
    rgb = np.zeros(labels.shape + (3,), np.uint8)
    wet = labels > 0
    rgb[wet, 0] = 255
    rgb[..., 1] = np.where(wet, level >> 8, 0)
    rgb[..., 2] = np.where(wet, level & 255, 0)
    return rgb


def fresh_cells(lakes, rivers) -> np.ndarray:
    """HYDE 5' cells holding LGM fresh water: every river line, every lake not in NOT_FRESH (water_distance.py's any-pixel rule)."""
    from shapely.geometry import mapping
    lines, polys = [], []
    for geom in rivers.geometry:
        a, _ = wd._lines_and_polygons(mapping(geom))
        lines += a
    for name, geom in zip(lakes["Name_2"], lakes.geometry):
        if name in NOT_FRESH:
            continue
        _, b = wd._lines_and_polygons(mapping(geom))
        polys += b
    return wd.water_cells(lines, polys)


def run(src: Path, out: Path, baseline_image: Path) -> dict:
    lakes, rivers = read(fetch(src))
    patch, labels = lake_labels(lakes)
    elev = etopo_at(patch)
    levels = shore_levels(labels, elev)
    mask_file = out / f"{NAME}_mask.webp"
    pw.write_rgb(mask_file, mask_rgb(labels, levels))
    with Image.open(baseline_image) as im:
        baseline = np.asarray(im.convert("RGB"))[:, :, 0]
    dpatch, dcodes, changed = pw.distance_patch(fresh_cells(lakes, rivers), baseline)
    dist_file = out / f"{NAME}_water.webp"
    pw.write_gray(dist_file, dcodes)

    wet = labels > 0
    areas = pw.pixel_area_km2(np.nonzero(wet)[0] + patch.y0)
    lake_rows = []
    for i, name in enumerate(lakes["Name_2"]):
        n = int((labels == i + 1).sum())
        if name or n > 400:  # the named lakes and the big unnamed ones
            lake_rows.append({"index": i, "name": name or None, "pixels": n, "level_m": levels.get(i + 1), "fresh": name not in NOT_FRESH})
    stated = {str(i): {"stated_m": m, "shore_median_m": levels.get(i + 1)} for i, m in STATED_LEVEL_M.items()}
    epoch = {
        **pw.epoch_dates(EPOCH),
        "state": "one snapshot of the published LGM reconstruction, held unchanged through the window; never interpolated",
        "water": "lakes: fresh (assumed) except the Caspian, Aral, Sarygamysh and Lisan; rivers: fresh (assumed)",
        "paint": "lake",
        "level": {"kind": "pixel", "clip_to_dem": False,
                  "rule": "per lake: median ETOPO1 height of its shore pixels, whole metres, carried as green * 256 + blue - 32768"},
        "mask": {**pw.mask_meta(mask_file, patch), "red": "255 = lake, 0 = not", "lake_pixels": int(wet.sum())},
        "distance": {**pw.distance_meta(dist_file, dpatch, changed),
                     "rule": "min(static distance image, distance to LGM rivers and fresh lakes); outside the patch the static image is exact"},
    }
    manifest = {
        "id": NAME,
        "version": pw.SCHEMA_VERSION,
        "label": "European LGM lakes and rivers (published vectors, experimental)",
        "short": "LGM lakes and rivers",
        "evidence": "published vectors (compiled maps), levels estimated",
        "flag": "?pastwater=1",
        "datum": "lake levels in metres above mean sea level as in ETOPO1 (estimated from each lake's shore); outlines in WGS84 degrees",
        "summary": "European LGM lakes and rivers: one published snapshot (CRC806, compiled maps), 26.5–19 ka BP only; lakes keep groups out, "
                   "fresh ones and the rivers count as fresh water. No Black Sea in the data.",
        "epochs": [epoch],
        "outside_epochs": "scenario inactive: the geography is unknown at that date, which is not the same as dry; the app draws and places as it does without the flag",
        "area_km2": round(float(areas.sum())),
        "lakes": lake_rows,
        "lakes_below_the_grid": int(sum(1 for i in range(len(lakes)) if not (labels == i + 1).any())),
        "lakes_total": int(len(lakes)),
        "rivers_total": int(len(rivers)),
        "level_check": stated,
        "digest": pw.sha256_bytes(json.dumps([[vars(EPOCH)], epoch["mask"]["sha256"], epoch["distance"]["sha256"]]).encode())[:16],
        "licence": "CC-BY (CRC806 metadata PDF; dataset page: attribution required, commercial use and derivations allowed); version not stated",
        "sources": {
            "data": "Verheul, J., Zickel, M., Becker, D., Willmes, C. (2015): LGM major inland waters of Europe - GIS dataset. CRC806-Database, doi:10.5880/SFB806.14",
            "files": {name: {"url": BASE_URL + name, "sha256": sha} for name, sha in FILES.items()},
            "levels": "ETOPO1 4' (data/raw/etopo/etopo_4min.nc), median of each lake's shore pixels",
            "chronology": "the dataset's temporal metadata: LGM, 26,500-19,000 yBP (Clark et al. 2009); taken as calendar BP from 1950",
            "static_water": "footsteps-web/public/water/water_distance.webp (Natural Earth 10m v5.1.2)",
        },
        "uncertainty": [
            "One reconstruction stands for 7,500 years: lakes filled, drained and moved with the ice front inside the window.",
            "Outlines come from maps of different scales and authors; some river reaches are GEBCO flow routes, not observed channels.",
            "Lake levels are the median modern height of each outline's shore, not dated shorelines (they only set the close-up's water plane): "
            "the Polish ice-dammed lakes come out 30-60 m below the altitudes their sources state, Lake Lisan at -263 m where its LGM stand was "
            "nearer -160 m; the Caspian and Aral outlines are much larger than today and their LGM-age stands are debated.",
            "Freshness is assumed from the lake's kind (ice-dammed and river lakes fresh; the Caspian, Aral, Sarygamysh and Lisan not).",
            "The Black Sea is not in the dataset: its LGM level is not modelled here.",
            "Nothing is said outside the window: not dry, not wet.",
        ],
    }
    import terrain_image
    manifest["terrain"] = {"years": terrain_image.scenario_years(manifest),
                           "path": "/terrain/pastwater/earth_{year}.webp (terrain_image.py --pastwater); other years use the ordinary images"}
    (out / f"{NAME}.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"lakes {int(wet.sum())} pixels, {manifest['area_km2']:,} km2, patch {patch} {mask_file.stat().st_size} B; "
          f"distance patch {dpatch} {dist_file.stat().st_size} B, {changed} cells nearer; levels {stated}")
    return manifest


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Bake the European LGM lakes and rivers scenario (mask, distance patch, manifest)")
    ap.add_argument("--src", type=Path, default=SRC, help="where the CRC806 zips are cached (git-ignored)")
    ap.add_argument("--out", type=Path, default=pw.OUT)
    ap.add_argument("--baseline", type=Path, default=wd.OUT / "water_distance.webp")
    args = ap.parse_args(argv)
    run(args.src, args.out, args.baseline)


if __name__ == "__main__":
    sys.exit(main())
