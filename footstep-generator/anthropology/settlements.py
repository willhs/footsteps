"""Build the static, explicitly modelled settlement catalog from Reba and D-PLACE.

Raw Reba CSVs stay in data/raw/reba; the compact catalog is a shipped model input,
not a population grid. Run by path from the repository root; --fetch retrieves
the pinned CC BY 4.0 source files and verifies their checksums.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "deploy/budgie/api"))
from analogs import load, nearest_analogs  # noqa: E402

RAW = ROOT / "data/raw/reba"
OUT = ROOT / "footsteps-web/public/settlements.json"
REBA = {
    "modelski": ("https://ndownloader.figshare.com/files/5356132", "f5757dbeeeacb6dc33c26522866eff57"),
    "chandler": ("https://ndownloader.figshare.com/files/5407640", "aeff29534fb11c4f320cd79fbcba9c8b"),
}
# Representative sizes, not claimed measurements or fitted category means.
EA_SIZES = {1: 30, 2: 75, 3: 150, 4: 300, 5: 700, 6: 2500, 7: 15000, 8: 75000}
WAYS = ("foraging", "farming", "herding", "urban")


def read_cities(paths: dict[str, Path]) -> list[dict]:
    """Merge coordinate identities, preferring Chandler for overlapping observations.

    Missing years stay missing; neither zero-fill nor extrapolation happens here.
    Co-located names are one city claim, so aliases cannot double-spend population.
    """
    cities: dict[str, dict] = {}
    for source in ("modelski", "chandler"):
        with paths[source].open(encoding="cp1252", newline="") as handle:
            for row in csv.DictReader(handle):
                try:
                    lat, lon = float(row["Latitude"]), float(row["Longitude"])
                except (ValueError, TypeError):
                    continue
                if not math.isfinite(lat + lon) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    continue
                observations = {}
                for key, value in row.items():
                    match = re.fullmatch(r"(BC|AD)_(\d+)", key or "")
                    if not match or not value.strip():
                        continue
                    year = int(match[2]) * (-1 if match[1] == "BC" else 1)
                    population = float(value.replace(",", ""))
                    if year <= 1900 and math.isfinite(population) and population > 0:
                        observations[year] = population
                if not observations:
                    continue
                identity = f"{lat:.2f},{lon:.2f}"
                if identity not in cities:
                    cities[identity] = {"id": f"reba:{identity}", "name": row["City"].strip(),
                                        "lon": lon, "lat": lat, "observations": {}, "sources": set()}
                city = cities[identity]
                city["observations"].update(observations)
                city["sources"].add(source)
    output = []
    for identity in sorted(cities):
        city = cities[identity]
        city["observations"] = sorted(city["observations"].items())
        city["source"] = "+".join(sorted(city.pop("sources")))
        output.append(city)
    return output


def ea_component(society: dict) -> dict | None:
    """Translate observed EA categories, keeping unknown mobility explicit."""
    values = society["values"]
    size = EA_SIZES.get(values.get("community_size"))
    pattern = values.get("settlement_pattern")
    if size is None or pattern not in range(1, 9):
        return None
    # EA030 1..4 denote nomadic through impermanent settlements. A mode is a
    # visual scenario; EA030 supplies no annual move count, so moves stays null.
    mode = "mobile" if pattern in (1, 2, 3, 4) else "settled"
    return {"weight": 1.0, "size": size, "moves": None, "pattern": pattern,
            "mode": mode, "society": society["id"]}


def binford_components(society: dict) -> list[dict]:
    """Annual dispersed/aggregated scenarios, never simultaneous extra people.

    B010 is a task group for sedentary societies; only B011 represents their
    residential settlement. Equal seasonal weights are an explicit model choice.
    """
    values = society["values"]
    moves = values.get("moves_per_year")
    aggregated = values.get("camp_size_aggregated")
    dispersed = values.get("cooperating_group")
    if moves is None or aggregated is None or moves < 0 or aggregated <= 0:
        return []
    base = {"moves": moves, "pattern": values.get("settlement_pattern"), "society": society["id"]}
    if moves == 0 or values.get("mobility") == 2:
        return [{**base, "weight": 1.0, "size": aggregated, "mode": "settled"}]
    if dispersed is None or dispersed <= 0:
        return []
    return [{**base, "weight": 0.5, "size": dispersed, "mode": "mobile"},
            {**base, "weight": 0.5, "size": aggregated, "mode": "aggregation"}]


def profile(analogs, *, binford: bool = False) -> dict:
    components = []
    total = sum(a.score for a in analogs)
    if total <= 0:
        raise ValueError("No supported settlement analogs")
    for analog in analogs:
        parts = binford_components(analog.society) if binford else [ea_component(analog.society)]
        for part in parts:
            if part is None:
                raise ValueError("Analog pool contains a society without a settlement size")
            components.append({**part, "weight": part["weight"] * analog.score / total})
    return {"components": components, "storage": None}


def build_profiles(export: dict) -> tuple[dict, dict]:
    """Regional EA mixtures and geography-neutral Binford climate mixtures.

    Regional mixtures rank distance and subsistence using the existing scorer.
    Climate mixtures hold geography/subsistence constant, leaving climate as
    the ranking signal; the score itself is not a predictive probability.
    """
    regional_pool = []
    for society in export["societies"]:
        if ea_component(society) is None:
            continue
        if society["way"] == "fishing":
            # The app's forager class includes fishers. Include their aquatic
            # share in the common subsistence score, retaining source values.
            values = {**society["values"]}
            values["hunting"] = values.get("hunting", 0) + values.get("fishing", 0)
            values["fishing"] = 0
            society = {**society, "way": "foraging", "values": values}
        regional_pool.append(society)
    regions = {}
    for row in range(36):
        for col in range(72):
            lat, lon = 87.5 - row * 5, -177.5 + col * 5
            regions[f"{row},{col}"] = [
                profile(nearest_analogs({"societies": regional_pool}, lat, lon, 0, way).analogs)
                for way in WAYS
            ]
    climate_pool = []
    for society in export["societies"]:
        if ("Binford" not in society["ids"] or society.get("temp_c") is None
                or society.get("precip_mm") is None or not binford_components(society)):
            continue
        values = {**society["values"], "gathering": 100, "hunting": 0,
                  "fishing": 0, "herding": 0, "agriculture": 0}
        climate_pool.append({**society, "lat": 0, "lon": 0, "way": "foraging", "values": values})
    climate = {}
    for temperature in range(-20, 36, 5):
        for precipitation in range(0, 3001, 250):
            matches = nearest_analogs({"societies": climate_pool}, 0, 0, -20000, "foraging",
                                      temp_c=temperature, precip_mm=precipitation)
            climate[f"{temperature},{precipitation}"] = profile(matches.analogs, binford=True)
    return regions, climate


def build_catalog(raw: Path = RAW) -> dict:
    for source, (_, checksum) in REBA.items():
        if hashlib.md5((raw / f"{source}.csv").read_bytes()).hexdigest() != checksum:
            raise ValueError(f"Checksum mismatch: {source}; retrieve the pinned file with --fetch")
    export = load()
    regions, climate = build_profiles(export)
    return {"version": 1, "cities": read_cities({s: raw / f"{s}.csv" for s in REBA}),
            "regions": regions, "climate": climate,
            "sources": {
                "reba": {"citation": "Reba, Reitsma & Seto 2016", "url": "https://doi.org/10.1038/sdata.2016.34",
                         "licence": "CC BY 4.0", "files": {s: {"url": u, "md5": m} for s, (u, m) in REBA.items()}},
                "ethnography": {"licence": "CC BY-NC 4.0", "caveat": export["caveat"],
                                "datasets": export["datasets"],
                                "sha256": hashlib.sha256((ROOT / "deploy/budgie/api/ethnography.json.gz").read_bytes()).hexdigest()},
                "method": "MODELLED. Regional EA030/EA031 analog mixtures; climate-only Binford B010/B011/B013 scenarios. Equal mobile/aggregation weights; storage unknown.",
                "societies": {s["id"]: {"name": s["name"], "year": s.get("year"), "sources": s["sources"]}
                              for s in export["societies"]},
            }}


def site_diagnostics(catalog: dict, public: Path = ROOT / "footsteps-web/public") -> dict:
    """Read real habitat pixels for archaeological scenario checks, not validation.

    Coordinates for Jomon and Natufian are representative regional probes. All
    dates are approximate calendar years. Climate is snapped exactly as in the
    browser; the 0.5-degree pixel cannot resolve a lakeshore or salmon river.
    """
    from PIL import Image

    meta = json.loads((public / "habitat_meta.json").read_text())
    sites = (("Ohalo II", -21000, 32.86, 35.55, "site vicinity"),
             ("Mezhyrich", -16000, 49.63, 31.41, "site vicinity"),
             ("Incipient Jomon", -12000, 40.9, 140.7, "representative region, not a site"),
             ("Natufian", -11000, 32.0, 35.0, "representative region, not a site"))
    output = []
    for name, year, lat, lon, support in sites:
        step = min(meta["maxKa"], max(0, math.floor((1950 - year) / meta["stepYears"] + 0.5)))
        path = public / "habitat" / f"bp_{step}.webp"
        cell_deg = 360 / meta["width"]
        col = math.floor(((lon + 180) % 360) / cell_deg)
        row = min(meta["height"] - 1, max(0, math.floor((90 - lat) / cell_deg)))
        with Image.open(path) as image:
            biome, t, p = image.convert("RGB").getpixel((col, row))
        record = {"name": name, "year": year, "lat": lat, "lon": lon, "support": support,
                  "habitat_file": str(path), "habitat_step_ka": step,
                  "biome": meta["biomes"].get(str(biome)), "pixel": [biome, t, p]}
        if not t or not p or biome in (0, meta["iceBiome"]):
            record.update({"status": "no_land_climate", "profile": None})
        else:
            temperature = meta["temperature"]["min"] + (t - 1) * meta["temperature"]["step"]
            precipitation = math.expm1((p - 1) / 254 * math.log1p(meta["precipitation"]["max"]))
            tb = min(35, max(-20, math.floor(temperature / 5 + 0.5) * 5))
            pb = min(3000, max(0, math.floor(precipitation / 250 + 0.5) * 250))
            profile = catalog["climate"][f"{tb},{pb}"]
            record.update({"status": "scenario_only", "temp_c": temperature,
                           "precip_mm": precipitation, "profile_bin": f"{tb},{pb}", "profile": profile,
                           "societies": {c["society"]: catalog["sources"]["societies"][c["society"]]
                                         for c in profile["components"]}})
        output.append(record)
    return {"caveat": "MODELLED scenario probes, not archaeological validation. Dates are approximate; climate cannot recover local resource geography or actual group sizes.",
            "checks": output}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--raw", type=Path, default=RAW)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--check-sites", type=Path, help="Inspect shipped catalog against real habitat pixels; write diagnostic JSON without rebuilding")
    args = parser.parse_args()
    if args.check_sites:
        result = site_diagnostics(json.loads(args.out.read_text()))
        args.check_sites.parent.mkdir(parents=True, exist_ok=True)
        args.check_sites.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"checks": len(result["checks"]), "output": str(args.check_sites)}))
        return
    args.raw.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        for source, (url, checksum) in REBA.items():
            body = urllib.request.urlopen(url, timeout=60).read()
            if hashlib.md5(body).hexdigest() != checksum:
                raise ValueError(f"Checksum mismatch: {source}")
            (args.raw / f"{source}.csv").write_bytes(body)
    catalog = build_catalog(args.raw)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"cities": len(catalog["cities"]), "regions": len(catalog["regions"]),
                      "climate_bins": len(catalog["climate"]), "bytes": args.out.stat().st_size,
                      "output": str(args.out)}))


if __name__ == "__main__":
    main()
