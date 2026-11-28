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
A second pass added islands not counted above, from their settlement dates alone (emptying a box HYDE already leaves empty
changes nothing): the Marianas (~1500 BCE), Vanuatu, New Caledonia, Fiji, Tonga and Samoa (Lapita, held at HYDE's -1000),
Madeira (1420), Cape Verde (1462), Bermuda (1612), St Helena (1659) and the Seychelles (1770).

## 2. Way of life read from land use where nothing was domesticated

HYDE's grazing is better than feared: 0 cells with grazing ≥ 10% in Australia before 1900, in eastern North America
before 1700 and in Amazonia before 500 CE. Cropland traces remain (Australia 7-9 cells from 1000 BCE to 1700), and the
crowded-cell rule (≥ 600 people → farmer) named farmers wherever HYDE is dense, including before any crop.

**Fixed**: `lib/domesticatesGate.ts` (from `footstep-generator/food/gate.py`, the food table's dated claims at 1°): no
farmers before a crop, no herders before a herd animal; a crowded cell with neither stays foragers.

## 3. From looking at the live map (12 views, 2026-11-28)

**Fixed:**
- **North Europe at the glacial maximum.** At 20,000 BCE the modelled bands ran right up to the ice in Denmark, north Germany,
  Poland and Britain; the dated record has nobody there (Britain ~25-15 ka cal BP; north of ~52°N ~25-16 ka). `ABANDONMENTS`
  in `lib/firstSettlement.ts` empties Britain and Ireland 24,000-13,000 BCE and the plain between the Rhine and the Vistula
  north of 52°N 23,000-14,000 BCE. Kostenki on the Don stays occupied.
- **Towns at 10,000 BCE.** HYDE crowds over 40,000 people into cells on the Levant coast before any crop; a town now needs a
  crop to have arrived.
- **The hover card's way of life** read HYDE land use ungated; it now reads it through the same gate as the map.
- **Green Sahara.** At 6000 BCE the card said desert, 74 mm of rain (20°N 10°E), and the live map looked beige at zoom 3. The
  African Humid Period made it grassland and savanna with lakes; Beyer/Krapp's HadCM3 climate under-states it. The terrain
  images already paint a literature overlay for it (`terrain_image.py` `green_sahara`, also used by `hyde_climate_spread.py`),
  but the habitat lookup the card reads does not. The card now says "Wetter than shown: the Green Sahara" on Saharan land
  9550-3550 BCE (`lib/greenSahara.ts`). Still to check: why the map looked beige at zoom 3 (the 500 m detail pyramid's
  recolouring, or terrain images on budgie older than the overlay).

- **Lake Texcoco.** At 1400 the Valley of Mexico's towns stood on the bed of Lake Texcoco: past water had no lakes there, and
  the static water is today's. A new past-water scenario (`past_water_texcoco.py`, docs/ops/past-water.md) floods the basin's
  five lakes 2050 BCE-1600 CE on the smoothed DEM, at a level calibrated to their ~1,600 km², keeps Tenochtitlan's island dry and
  counts only the fresh southern lakes as drinking water.

**Not fixed (source data):**
- Krapp's LGM biome at the ice edge is "deciduous taiga/montane forest" with moose (55.8°N 5.8°E, 20,000 BCE; and Beringia,
  62°N 170°W). Both were steppe-tundra (mammoth steppe). The card now adds "Steppe-tundra, not forest" under a forest biome
  north of 45°N (and Beringia) 28,000-13,000 BCE (`lib/biomeNotes.ts`); the lookup itself is unchanged.
- 40°N 95°W (Kansas/Nebraska) reads "Temperate deciduous forest" at 3000 BCE; it was tallgrass prairie. The card now adds
  "Grassland, not forest: the prairie" on the Plains 6000 BCE-1880 where the model has trees.
- HYDE draws a bright, city-like glow in central Mexico at 3000 BCE (Late Archaic). HYDE's numbers stand, but a cell is drawn as a city only from
  its region's first towns on (`lib/firstCities.ts`: Eridu and Uruk 3800 BCE, the Indus and Caral 2600 BCE, San Lorenzo 1200 BCE,
  Cahokia 1000 CE, 1500 where no region is listed); before that it is a dense farming village.
- Siberia at 1800 is nearly empty (the Sakha alone were ~200,000), and there are no reindeer or horse herders.
- The card calls a HYDE cell with no one "measured" ("No one counted · measured"). HYDE's pre-1500 cell values are
  allocations, not counts; the vision table calls HYDE "measured", so the word is Will's to change.

Rendering bugs found on the same pass (antimeridian, 404s, a hole in the Hudson Bay ice, the card and map disagreeing on
Sunda's land) were passed to the bugs thread.

## 4. Herders and foragers in farming country (Task 4 counts)

Populated cells by class under the old rules (crop ≥ 2% farmer; grazing ≥ 10% herder; else ≥ 600 people farmer; else forager):

| Region, year | cells | farmer | herder (crop 0) | forager with some land use | median people, herder cells |
| --- | --- | --- | --- | --- | --- |
| Germany 1000 | 7,615 | 4,328 | 2,331 | 444 | 346 |
| France 1000 | 5,039 | 3,433 | 1,141 | 101 | 409 |
| England 1000 | 2,654 | 1,504 | 174 | 942 | 293 |
| Poland 1000 | 5,183 | 2,600 | 121 | 2,380 | 483 |
| Kazakh steppe 1000 | 25,622 | 8,990 | 8,501 | 2,444 | 16 |
| Mongolia 1000 | 16,469 | 636 | 11,995 | 1,804 | 13 |
| Sahel 1000 | 29,112 | 5,040 | 11,375 | 6,884 | 44 |
| Andes puna 1400 | 4,204 | 204 | 1,018 | 1,077 | 100 |
| Tibet 1400 | 10,584 | 10 | 144 | 10,012 | 60 |

**Fixed** in `classifyCell`: crowded grazing cells (≥ 150 people) where crops are known are mixed farming; light grazing
(≥ 2%) is herding and light cropland (≥ 0.5%) farming.

## 5. Found, not fixed (from the image counts)

- **Missing land**: the Azores and East Polynesia (Tahiti) have no populated cells even in 1900. HYDE's country table or
  land mask misses them; fixing needs the raw HYDE files. Since filled with rough cited counts (`lib/missingIslands.ts`).
- **Greenland** is empty in 800 CE (Dorset people lived there until ~1300) and has ~1.3-1.5k people from 1000 to 1700.
- **Australia** is flat at ~257-264k from 10,000 BCE to 1700 CE. Recent estimates for 1788 run ~0.75-1.2 M (Williams
  2013); HYDE's figure is low and has no change through the Holocene. Not obviously wrong enough to override.
- **Reindeer** are not in the food table, so Arctic reindeer herders (Sámi, Nenets, Chukchi; large-scale herding from
  ~1700) read as foragers. Since added, dated (`food/animals.py`), and counted in the herding gate.
- **Fiji-Samoa** has 11k people in 1000 BCE: Lapita reached Fiji ~1000 BCE, so this is about right.
