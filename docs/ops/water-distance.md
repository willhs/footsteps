---
id: water-distance
type: reference
purpose: "Sources, encoding, regeneration and limits of the baked distance-to-fresh-water image that placing groups will read"
---

# Water distance (rivers and lakes)

`footstep-generator/water_distance.py` bakes one **year-independent** image: for every HYDE 5′ cell, how far its centre is from the
nearest river or lake. It is a static model input like `public/settlements.json`. Part 2 (ranked candidate spots in
`siteRanking.ts`, research 0012 "Recommended first build") reads it under `?settlements=1`: [site terrain](site-terrain.md).

Output, committed: `footsteps-web/public/water/water_distance.webp` (**872 KB**, served at `/water/water_distance.webp`) and
`water_distance.json` beside it (the scale and sources, machine-readable).

## Grid and encoding

| | |
|---|---|
| Grid | HYDE's 5′: 4320 × 2160, row 0 = north (90° N), column 0 = 180° W, value at the cell centre |
| Why 5′ and not 2.5′ | 2.5′ (8640 × 4320) was baked as a trial: **2.47 MB**, over the ~1.5 MB commit line, for a smoother edge near water. 5′ is 872 KB and is the grid every other layer uses |
| Pixel | lossless WebP, RGB with the red channel carrying the value (green and blue repeat it; decode as `grid_image` does) |
| Scale | 8-bit code, `metres = 2,000,000 × (code / 255)²` |
| Step | 31 m at code 1, 0.8 km at code 5, 4 km at code 50, 8 km at code 255: fine near water, coarse far away |
| Code 0 | the cell holds water (a river line crosses it, or a lake covers any of it); under 8 m |
| Code 255 | 2,000 km or more |
| Distance | great-circle metres from the cell centre to the nearest water **cell centre**, so good to about half a cell (4.6 km) from the water itself |

`water_distance.decode(path)` reads it back to metres. A browser reads the red channel and applies the formula above.

Why square root: distances run from 0 to over 1,000 km, and what placing a group cares about is the first few kilometres.
99.9% of land cells (Natural Earth 110m land, north of 60° S) are within 1,455 km of water, so 2,000 km loses nothing on land.
Open ocean, Antarctica and the Greenland ice also read 255, as do **islands with no Natural Earth river**
(Hawaii's land reads 255): "far" there means "no water in the data", not a desert.
Rank sites inside a cell with it, and do not compare it across a small island and a continent.

## Sources

| Input | Where | Licence |
|---|---|---|
| Natural Earth 10m rivers + lake centerlines, v5.1.2, `ne_10m_rivers_lake_centerlines.geojson`, sha256 `bb854a900ecbd3b408df46d5e16e3e0f974ba55993f9d8b5c26e855273c0905a` | `data/raw/naturalearth/` | public domain |
| Natural Earth 10m lakes, v5.1.2, `ne_10m_lakes.geojson`, sha256 `2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9` | `data/raw/naturalearth/` | public domain |

The same two files `prehistory_population.py` reads (its river ×1.3 / lake ×1.3 rule). Downloaded by `fetch()` from
`raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/`, sha256-checked (a mismatch deletes the download and
stops), raw files not committed.

**HydroRIVERS was not used.** Its data agreement was not read (research 0012 left it unresolved), the Natural Earth lines are
enough to rank sites inside a cell, and the default was Natural Earth. If streams below Natural Earth's
level matter later, bake HydroRIVERS (filtered by stream order, offline) after reading its agreement.

What counts as water: every river line and lake-centerline line, and every lake polygon except the **saline lakes**
(`SALINE_LAKES`: Dead Sea, Aral, Great Salt Lake, Lake Eyre, Urmia, Van, Qinghai, Salton, Natron and others; their feeder rivers stay). It
is fresh water only; the sea is not here (part 2 takes the year's coast separately). Lake islands are not cut out.

## Regenerate

```bash
poetry run python footstep-generator/water_distance.py          # fetches Natural Earth to data/raw/naturalearth/ if absent
poetry run python footstep-generator/water_distance.py --raw DIR --out DIR --extra-water FILE.geojson
```

About 22 s and 1.4 GB of memory (the 1.25′ drawing is 149 M pixels); the output is byte-identical on a re-run. `NATURAL_EARTH_DIR` sets the raw folder when `data/raw` is not writable.
The distance is a jump flood over the lat/lon grid (numpy only, no scipy) ranked by exact haversine, two rounds: on 4,000 random cells it equals
brute force exactly; one round gave 0.2% near-miss cells (over by under 1%), so the second is kept. The test
`test_distance_matches_brute_force_on_a_small_world` pins "never short, within 1%".

## The Green Sahara caveat, and the hook

These are **present-day** courses. Between about 11 and 5 ka the Sahara and Arabia held lakes (Megachad) and wadis
(Tamanrasset, Irharhar, Tilemsi, Sahabi, Kufra and others) that are dry now, so a cell that reads "900 km from water" in the
Sahara was well watered then; `terrain_image.sahara_weight` and `hyde_climate_spread.py` already model the timing. **Nothing
palaeo is invented here.** The hook: `--extra-water FILE.geojson` (repeatable; `water_features(extra_water=[...])`)
adds any LineString/Polygon features to the water set, and the sidecar JSON records the files used. Baking a Green Sahara
variant (a second WebP, used only in the humid window) needs a sourced hydrography layer first, for example the palaeo-lake
and palaeo-drainage maps in Drake et al. 2011 or the Quaternary lake compilations; that is a follow-up, not part of this layer.
Until then part 2 should treat "far from water" in the Sahara, Arabia and the Thar between 11 and 5 ka as unreliable.

**One basin is now modelled, behind `?pastwater=1`:** Lake Mega-Chad's highstand (`past_water.py`) adds a dated, regional distance patch
(`public/pastwater/mega_chad_water.webp`, 8 KB, min of this image and the distance to the lake) that the ranker reads only in the scenario's years and
only inside the patch; this image and its bytes are untouched. See [past water](past-water.md).

## Other limits

- Natural Earth 10m omits small streams, springs and ephemeral channels, so inland cells can read tens of km from water that was there.
- Distance is straight-line, not walking distance, and says nothing about flow, size or the water table.
- Deltas and coasts: a Nile delta distributary that Natural Earth leaves out reads a few km away (Cairo's cell: 7.9 km).
- No glacial-maximum rivers on the exposed shelves (they sit under the sea in this image: ocean reads 255).

## Tests

`footstep-generator/tests/test_water_distance.py`: the scale (fine near water, saturates, round-trips); the distance against brute force
(thin lines, the antimeridian seam, a pole); fetch checks the sha256; saline lakes left out; the extra-water hook; the committed image
(the Nile at Luxor under 5 km, Lake Victoria 0, the Libyan desert over 400 km, Rub' al Khali over 800 km); and, when
Natural Earth is downloaded, that the image's zero cells are exactly the water the pinned inputs rasterise to.
