#!/usr/bin/env python3
"""The languages block of the anthropology atlas: Glottolog's languages per 5-degree cell, a baseline
for about 1500 CE (research 0007, step 1; see docs/ops/languages.md).

    poetry run python footstep-generator/anthropology/languages.py fetch   # 2 files (1.7 MB) -> data/raw/glottolog/5.4/
    poetry run python footstep-generator/anthropology/languages.py         # add `languages` to each cell of the existing atlas

`build.py` calls `add_to()` too, so a full rebuild has it. Both pinned files must match their sha256.

Data shape, one direction of flow:

    languoid.csv (Glottolog 5.4) --filter--> languages: id, name, family, point
    languages_and_dialects_geo.csv --macroarea--^
    languages --5 degree cell of the point--> per cell: families with language counts
    languages --great-circle km to the cell centre--> per cell: the nearest few languages

`languages` per cell: {"n_languages", "n_families", "families": [{glottocode, name, n}, <= MAX_FAMILIES],
"nearest": [{glottocode, name, family, km}, <= NEAREST]}. The cell holds no block (the record says
"unknown") when no language point lies in it or within NEAR_KM of its centre. One block per cell, not
per era: it is a baseline, and `atlas.py` shows it only for eras from LANGUAGES_FROM.

What a Glottolog point means: where the language is documented, mostly 19th-21st century. It says nothing
about 3000 BCE, and for 1500-1900 it is a baseline that does not follow colonial replacement (step 2).
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import math
import os
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "deploy" / "budgie" / "api"))
import atlas as anth  # noqa: E402  cells, the source name and the baseline year are shared with the runtime

RAW = Path(os.environ.get("FOOTSTEPS_RAW") or ROOT / "data" / "raw")  # FOOTSTEPS_RAW: a scratch copy, e.g. in a job workspace
ATLAS = ROOT / "deploy" / "budgie" / "api" / "anthropology.json.gz"

VERSION = "5.4"
RECORD = "https://zenodo.org/api/records/24104033"  # "Glottolog custom downloads v5.4", 2026-11-10, CC BY 4.0
FILES = {  # name -> sha256 (md5 matches Zenodo's listing)
    "glottolog_languoid.csv.zip": "74a6874c4945ca5f9ac2157bcd97d1adf142290e30cd7b854d212648458d15ee",
    "languages_and_dialects_geo.csv": "02491971c59286e70304d2d7f71a5eccbdc78f06182ee634fdf2a02bb24d4e61",
}

MAX_FAMILIES = 8  # a 5 degree cell in New Guinea holds up to 28
NEAREST = 3
NEAR_KM = anth.NEAR_KM  # a language this close to the cell centre says something about the cell
EARTH_R_KM = 6371.0088

# Not languages people spoke about 1500: Glottolog top-level "families" that are categories, not families.
# (Unclassifiable, 124 languages with no known family, is kept and shown as one "Unclassified" group.)
DROPPED_TOP = {
    "sign1238": "Sign Language", "pidg1258": "Pidgin", "arti1236": "Artificial Language",
    "spee1234": "Speech Register", "book1242": "Bookkeeping", "unat1236": "Unattested",
    "mixe1287": "Mixed Language",  # four languages, all born of colonial contact
}
UNCLASSIFIED = "uncl1493"
# Glottolog has no creole flag: creoles sit inside their lexifier's family under nodes (or with names) that say so.
CREOLE = re.compile(r"creole|pidgin", re.I)
# Languages of these families whose macroarea is not the listed one are post-1500 transplants (Afrikaans, Papiamento,
# Pennsylvania German, Fiji Hindi, Haitian, Lucumi ...: 27 of them in 5.4), whose points would otherwise put
# Indo-European in Fiji and Atlantic-Congo in Cuba. Malagasy (Austronesian, Africa) is old enough to stay.
TRANSPLANTS = {"indo1319": "Eurasia", "atla1278": "Africa"}
# Glottolog also lists ancient and medieval written languages with a point (Latin in Rome, Classical Chinese in Xi'an).
# These had no speakers about 1500 (or are stages of a language kept under its living name). By exact name, each
# checked to exist once in 5.4: a version bump that renames one fails loudly. Not exhaustive; languages that died
# between 1500 and 1900 (Old Prussian, Crimean Gothic, Classical Nahuatl) stay: they were spoken at the baseline.
HISTORICAL = (
    "Akkadian", "Amorite", "Ancient Hebrew", "Ancient North Arabian", "Ancient North Greek", "Avestan", "Bactrian",
    "Carian", "Celtiberian", "Central East Middle German", "Cisalpine Gaulish", "Classical Chinese", "Classical Mandaic",
    "Classical Syriac", "Classical Tibetan", "Classical-Middle Armenian", "Cuneiform Luwian", "Dacian", "Early Irish",
    "Eblaite", "Egyptian (Ancient)", "Elamite", "Eteocypriot", "Etruscan", "Faliscan", "Galatian", "Gandhari", "Geez",
    "Gothic", "Hattic", "Hieroglyphic Luwian", "Hittite", "Hurrian", "Iberian", "Illyrian", "Imperial Aramaic (700-300 BCE)",
    "Ionic-Attic Ancient Greek", "Jewish Babylonian Aramaic (ca. 200-1200 CE)", "Kawi", "Khotanese", "Khwarezmian",
    "Late Middle Indo-Aryan", "Late Palestinian Aramaic", "Latin", "Lepontic", "Lusitanian", "Lycian A", "Lydian",
    "Maharastri Prakrit", "Medieval Greek", "Meroitic", "Messapic", "Middle Aramaic", "Middle Chinese", "Middle Dutch",
    "Middle English", "Middle High German", "Middle Low German", "Middle Mongol", "Minaean", "Minoan", "Noric",
    "Old Aramaic-Sam'alian", "Old Burmese", "Old Cham", "Old Chinese", "Old Dutch-Old Frankish",
    "Old English (ca. 450-1100)", "Old French (842-ca. 1400)", "Old Frisian", "Old Georgian", "Old High German (ca. 750-1050)",
    "Old Hungarian", "Old Japanese", "Old Kannada", "Old Khmer", "Old Latin", "Old Malay", "Old Marathi", "Old Mon",
    "Old Norse", "Old Nubian", "Old Ossetic", "Old Persian (ca. 600-400 B.C.)", "Old Provençal", "Old Russian",
    "Old Sabellic", "Old Saxon", "Old South-West British", "Old Spanish", "Old Tamil", "Old Telugu", "Old Turkic",
    "Old-Middle Welsh", "Oscan", "Pahlavi", "Paisaci Prakrit", "Palaic", "Pali", "Parthian", "Phoenician", "Phrygian",
    "Pictish", "Pisidian", "Punic", "Pyu", "Qatabanian", "Samaritan", "Sanskrit", "Sauraseni Prakrit", "Sidetic",
    "Sogdian", "Sumerian", "Tangut", "Tartessian", "Thracian", "Tokharian A", "Tokharian B", "Transalpine Gaulish",
    "Ugaritic", "Umbrian", "Urartian", "Venetic", "Zhangzhung",
)


def fetch(raw: Path = RAW) -> None:
    folder = raw / "glottolog" / VERSION
    folder.mkdir(parents=True, exist_ok=True)
    for name, sha in FILES.items():
        path = folder / name
        if not path.exists():
            with urllib.request.urlopen(f"{RECORD}/files/{name}/content", timeout=120) as res:
                path.write_bytes(res.read())
            print(f"fetched {path} ({path.stat().st_size / 1e6:.1f} MB)")
        if hashlib.sha256(path.read_bytes()).hexdigest() != sha:
            raise ValueError(f"{path}: sha256 does not match the pin for Glottolog {VERSION}")
        print(f"ok {path.name} sha256 {sha[:12]}")


def read_files(raw: Path = RAW) -> tuple[list[dict], dict[str, str]]:
    """(languoid rows, glottocode -> macroarea), after checking the pins."""
    folder = raw / "glottolog" / VERSION
    blobs = {}
    for name, sha in FILES.items():
        data = (folder / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != sha:
            raise ValueError(f"{name}: sha256 does not match the pin for Glottolog {VERSION}")
        blobs[name] = data
    with zipfile.ZipFile(io.BytesIO(blobs["glottolog_languoid.csv.zip"])) as z:
        rows = list(csv.DictReader(io.TextIOWrapper(z.open("languoid.csv"), encoding="utf-8")))
    geo = csv.DictReader(io.StringIO(blobs["languages_and_dialects_geo.csv"].decode("utf-8")))
    return rows, {r["glottocode"]: r["macroarea"] for r in geo}


def languages_of(rows: list[dict], macroarea: dict[str, str], historical: tuple[str, ...] = HISTORICAL) -> list[dict]:
    """Languages with a point, minus sign, pidgin, creole, artificial, transplanted and ancient or medieval ones.
    Each: {glottocode, name, family (glottocode), family_name, lat, lon}. An isolate is its own family."""
    by_id = {r["id"]: r for r in rows}

    def ancestors(r: dict):
        while r["parent_id"]:
            r = by_id[r["parent_id"]]
            yield r

    named = {n: [r for r in rows if r["level"] == "language" and r["name"] == n] for n in historical}
    if bad := [n for n, found in named.items() if len(found) != 1]:
        raise ValueError(f"HISTORICAL names that are not exactly one language in Glottolog {VERSION}: {bad}")
    dead = {found[0]["id"] for found in named.values()}
    out = []
    for r in rows:
        if r["level"] != "language" or not r["latitude"] or r["bookkeeping"] == "True":
            continue
        if r["family_id"] in DROPPED_TOP or r["id"] in dead:
            continue
        if CREOLE.search(r["name"]) or any(CREOLE.search(a["name"]) for a in ancestors(r)):
            continue
        if (home := TRANSPLANTS.get(r["family_id"])) and macroarea.get(r["id"]) != home:
            continue
        family = by_id[r["family_id"]] if r["family_id"] else r
        out.append({"glottocode": r["id"], "name": r["name"], "family": family["id"],
                    "family_name": "Unclassified" if family["id"] == UNCLASSIFIED else family["name"],
                    "lat": float(r["latitude"]), "lon": float(r["longitude"])})
    return out


def km_between(lat: float, lon: float, lats: list[float], lons: list[float]) -> list[float]:
    """Great-circle km from one point to many."""
    p1 = math.radians(lat)
    out = []
    for la, lo in zip(lats, lons):
        p2, dl = math.radians(la), math.radians(lo - lon)
        a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        out.append(2 * EARTH_R_KM * math.asin(math.sqrt(min(1.0, a))))
    return out


def cell_blocks(languages: list[dict], cell_keys: list[str]) -> dict[str, dict]:
    """CellKey -> languages block, for the cells that have one."""
    in_cell: dict[str, list[dict]] = {}
    for lang in languages:
        in_cell.setdefault(anth.cell_of(lang["lat"], lang["lon"]), []).append(lang)
    lats, lons = [lang["lat"] for lang in languages], [lang["lon"] for lang in languages]
    blocks = {}
    for key in cell_keys:
        south, west = (int(v) for v in key.split(","))
        km = km_between(south + anth.CELL_DEG / 2, west + anth.CELL_DEG / 2, lats, lons)
        close = sorted((d, i) for i, d in enumerate(km) if d <= NEAR_KM)[:NEAREST]
        here = in_cell.get(key, [])
        if not here and not close:
            continue
        counts: dict[str, dict] = {}
        for lang in here:
            fam = counts.setdefault(lang["family"], {"glottocode": lang["family"], "name": lang["family_name"], "n": 0})
            fam["n"] += 1
        families = sorted(counts.values(), key=lambda f: (-f["n"], f["name"]))
        blocks[key] = {
            "n_languages": len(here), "n_families": len(families), "families": families[:MAX_FAMILIES],
            "nearest": [{"glottocode": languages[i]["glottocode"], "name": languages[i]["name"],
                         "family": languages[i]["family_name"], "km": round(d)} for d, i in close],
        }
    return blocks


def add_to(atlas: dict, raw: Path = RAW) -> dict:
    rows, macroarea = read_files(raw)
    languages = languages_of(rows, macroarea)
    blocks = cell_blocks(languages, sorted(atlas["cells"]))
    for key, cell in atlas["cells"].items():
        cell.pop("languages", None)
        if key in blocks:
            cell["languages"] = blocks[key]
    atlas["sources"][anth.GLOTTOLOG] = SOURCE
    atlas["languages"] = {"glottolog": VERSION, "n_languages": len(languages), "from_era": anth.LANGUAGES_FROM}
    return atlas


SOURCE = {
    "what": f"Glottolog {VERSION}: spoken languages with a point, grouped by family per 5-degree cell; sign, pidgin, creole, "
            "artificial, post-1500 transplanted and ancient written languages left out. Documented positions, read as a baseline for about 1500 CE.",
    "url": "https://glottolog.org",
    "licence": "CC BY 4.0 (Hammarström, Forkel, Haspelmath & Bank, Glottolog 5.4, Max Planck Institute for Evolutionary Anthropology).",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", nargs="?", choices=["fetch", "build"], default="build")
    parser.add_argument("--raw", type=Path, default=RAW, help="where data/raw lives (default: the repository's)")
    parser.add_argument("--atlas", type=Path, default=ATLAS, help="the atlas to read")
    parser.add_argument("--out", type=Path, help="where to write it (default: over --atlas)")
    args = parser.parse_args()
    if args.command == "fetch":
        return fetch(args.raw)
    out = args.out or args.atlas
    before = args.atlas.stat().st_size
    atlas = add_to(json.loads(gzip.decompress(args.atlas.read_bytes())), args.raw)
    out.write_bytes(gzip.compress(json.dumps(atlas, separators=(",", ":")).encode(), mtime=0))
    cells = sum("languages" in c for c in atlas["cells"].values())
    print(f"{atlas['languages']['n_languages']} languages -> {cells} of {len(atlas['cells'])} cells; "
          f"{out.name} {before / 1e6:.3f} -> {out.stat().st_size / 1e6:.3f} MB")


if __name__ == "__main__":
    main()
