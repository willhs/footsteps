---
id: world-model-audit
type: note
purpose: "Where the map's model of the world is obviously wrong, checked on the served data, and what was fixed"
scope: [hyde, islands, way-of-life, domesticates]
tags: [research, measured, modelled]
related: ["ops/grid-images.md", "research/0008-food-over-time/research.md", "research/0002-pre-hyde-population-model/research.md"]
---

# World-model audit (2026-11-28)

An unattended pass looking for places the map is obviously wrong: people where nobody lived, the wrong way of life, wrong
coasts or ice. The served grid images (`https://footsteps.willhs.me/grid/humans_{year}.webp`, `landuse_{year}.png`) were
decoded in a browser and summed per box: a cell counts when its centre is in the box; crop and grazing counted on populated
cells only.

## 1. HYDE puts people on islands before anyone reached them

People (populated 5′ cells) per HYDE year, before the fix:

| Island | -10000 | -5000 | -1000 | 0 | 500 | 800 | 1000 | 1200 | First settled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Iceland | 20 | 299 | 4,815 | 9,633 | 10,651 | 11,319 | 56,645 | 79,256 | ~874 CE |
| Faroes | 15 | 67 | 222 | 226 | 250 | 266 | 277 | 288 | ~500 CE |
| Madagascar | 58 | 68 | 264 | 394 | 12,705 | 101,760 | 219,222 | 395,134 | first millennium CE |
| Canaries | 414 | 2,273 | 45,407 | 104,464 | 90,859 | 85,207 | 90,866 | 124,904 | ~500 BCE-0 |
| Caribbean (Greater Antilles) | 1,075 | 3,355 | 8,850 | 11,608 | 37,133 | 79,980 | 141,216 | 269,366 | ~3800 BCE |
| Galápagos | 68 | 116 | 176 | 196 | 252 | 294 | 390 | 470 | never before 1535 |
| Hawaii | 0 | 0 | 2 | 2 | 18 | 150 | 622 | 2,515 | ~1190-1290 CE |
| Svalbard | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 19 | 1596 (no natives) |
| Falklands | 0 … 1 in 1400 | | | | | | | | 1764 |

Right already: New Zealand (0 until 1200), the Mascarenes (0 until 1700), Antarctica (0).

Cause: HYDE allocates each modern country's estimated people over its land at every date (HYDE readme,
`docs/research/readme_HYDE_3.3.txt`), so an island country gets a share long before settlement.

**Fixed**: `footsteps-web/lib/firstSettlement.ts`, a table of tight island boxes with a cited first-settlement year;
`gridDataFrom` leaves those cells empty before it (Units, Grid and the firelight; Dots is static and unchanged).

## 2. Way of life read from land use where nothing was domesticated

HYDE's grazing is better than feared: 0 cells with grazing ≥ 10% in Australia before 1900, in eastern North America
before 1700 and in Amazonia before 500 CE. Cropland traces remain (Australia 7-9 cells from 1000 BCE to 1700), and the
crowded-cell rule (≥ 600 people → farmer) named farmers wherever HYDE is dense, including before any crop.

**Fixed**: `lib/domesticatesGate.ts` (from `footstep-generator/food/gate.py`, the food table's dated claims at 1°): no
farmers before a crop, no herders before a herd animal; a crowded cell with neither stays foragers.

## 3. Found, not fixed

- **Missing land**: the Azores and East Polynesia (Tahiti) have no populated cells even in 1900. HYDE's country table or
  land mask misses them; fixing needs the raw HYDE files.
- **Greenland** is empty in 800 CE (Dorset people lived there until ~1300) and has ~1.3-1.5k people from 1000 to 1700.
- **Australia** is flat at ~257-264k from 10,000 BCE to 1700 CE. Recent estimates for 1788 run ~0.75-1.2 M (Williams
  2013); HYDE's figure is low and has no change through the Holocene. Not obviously wrong enough to override.
- **Reindeer** are not in the food table, so Arctic reindeer herders (Sámi, Nenets, Chukchi; large-scale herding from
  ~1700) read as foragers.
- **Fiji-Samoa** has 11k people in 1000 BCE: Lapita reached Fiji ~1000 BCE, so this is about right.
