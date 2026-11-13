#!/usr/bin/env python3
"""Evidence script for research 0004: what PHYLACINE 1.2.1 present-natural ranges hold.

Not part of the app. It only reads a sparse clone of PHYLACINE (CC0):

    git clone --depth 1 --filter=blob:none --sparse https://github.com/MegaPast2Future/PHYLACINE_1.2.git phylacine
    git -C phylacine sparse-checkout set Data/Traits Data/Ranges/Present_natural
    pip install --target /tmp/phylacine-pylib tifffile imagecodecs   # PIL cannot read these float64 LZW TIFFs
    python3 -P docs/research/0004-ground-view/phylacine_summary.py phylacine

Prints species counts by size and status, per-cell richness of large (>= 44 kg) non-marine species,
the compressed size of the presence matrix, and the large species in cell at a few places.
The raster is 360 x 142 cells of 96.5 km, Behrmann equal-area (standard parallel 30), presence 0/1,
sea 0. `cell()` below inverts that projection with a sphere scaled to the file's tiepoint, which is
good to about a cell (it is not the exact ellipsoidal formula).
"""
import collections
import csv
import math
import sys
import zlib

sys.path.insert(0, "/tmp/phylacine-pylib")
import numpy as np  # noqa: E402
import tifffile  # noqa: E402

D = sys.argv[1]
H, W = 142, 360
Y0, PX, PY = 7348382.0, 96486.27222222222, 96514.95774647887  # tiepoint y, pixel size (from the TIFF tags)

rows = list(csv.DictReader(open(f"{D}/Data/Traits/Trait_data.csv")))
kg = lambda r: float(r["Mass.g"]) / 1000  # noqa: E731
print("species", len(rows), dict(collections.Counter(r["IUCN.Status.1.2"] for r in rows)))
for thr in (10, 44, 100, 1000):
    big = [r for r in rows if kg(r) >= thr]
    c = collections.Counter(r["IUCN.Status.1.2"] for r in big)
    print(f">= {thr} kg: {len(big)}  EP={c['EP']} EX/EW={c['EX'] + c['EW']} extant={len(big) - c['EP'] - c['EX'] - c['EW']}")
mega = [r for r in rows if kg(r) >= 44 and r["Marine"] == "0"]
print("non-marine >= 44 kg:", len(mega))
by_name = {r["Binomial.1.2"]: r for r in mega}


def load(name):
    with tifffile.TiffFile(f"{D}/Data/Ranges/Present_natural/{name}.tif") as t:
        return t.pages[0].asarray() == 1


stack = {n: load(n) for n in by_name}
rich = np.sum([m.astype(np.int16) for m in stack.values()], axis=0)
nz = rich > 0
print("cells with >= 1:", int(nz.sum()), "of", H * W, "mean there %.1f p90 %d max %d" % (rich[nz].mean(), np.percentile(rich[nz], 90), rich.max()))
bits = np.packbits(np.stack([m[nz] for m in stack.values()]).astype(np.uint8), axis=1)
print("presence matrix, bit-packed + zlib bytes:", len(zlib.compress(bits.tobytes(), 9)))


def cell(lat, lon):
    return int((Y0 - Y0 * math.sin(math.radians(lat))) // PY), int(((lon + 180) / 360 * PX * W) // PX)


for place, (la, lo) in {"Serengeti": (-2.3, 34.8), "Great Plains": (41, -100), "Siberia": (65, 100), "Murray-Darling": (-33, 143), "N Greenland": (80, -40)}.items():
    i, j = cell(la, lo)
    sp = [n for n, m in stack.items() if m[i, j]]
    ep = [n for n in sp if by_name[n]["IUCN.Status.1.2"] == "EP"]
    top = sorted(sp, key=lambda n: -float(by_name[n]["Mass.g"]))[:6]
    print(f"{place}: {len(sp)} large species, {len(ep)} prehistorically extinct; biggest {top}")
