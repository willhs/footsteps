## [2026-11-28] fix | No people on islands before their first settlers; no farmers or herders before domesticates

HYDE peoples Iceland and the Faroes from 10,000 BCE, Galápagos before 1535, and the Canaries, Madagascar, Hawaii and the
Caribbean before their first settlers. `lib/firstSettlement.ts` empties those islands before a cited first-settlement year.
The way of life now also needs a crop (farmers) or herd animal (herders) to have reached the 1° cell by then
(`lib/domesticatesGate.ts`, from the food table via `food/gate.py`); a crowded cell with neither stays foragers.
Research 0015 has the per-island counts read off the served images and what was found but not fixed.

## [2026-11-28] update | The counter shows how widely published world totals disagree

From 10,000 BCE the counter showed HYDE's total as a single figure ("4.6 million"), right after the modelled years' "~2-8
million, modelled, not measured", as if HYDE were a census. It now adds "estimates range 1–10 million" underneath: the lowest
and highest published totals for that year from `lib/population_estimates.json` (research 0005; built but not read until
now), geometric between years. 170–400 million at 1 CE; 1.6–1.8 billion by 1900.

## [2026-11-28] fix | Two language boxes that claimed the wrong places

`arabic-maghreb` (from 670) covered [25, -15, 40, 25], which took in Andalusia, the Peloponnese and southern Italy; it is now
North Africa plus the Ifriqiya cell (Tunisia and Sicily). `turkic-central-asia` (from 552) took in northern Iran, Afghanistan
and Tibet and left out Mongolia, where the Khaganate began; it now runs 40-55°N from 50°E to 120°E.

## [2026-11-28] fix | Nobody in Britain or the north European plain at the glacial maximum; no towns before crops; Green Sahara note

The modelled bands ran up to the ice in Denmark, north Germany and Britain at 20,000 BCE; `ABANDONMENTS` in
`lib/firstSettlement.ts` empties them for the dated gaps. A cell of 40,000+ is a town only once a crop had arrived. The hover
card's way of life reads land use through the domesticates gate too. On Saharan land 9000-3500 BCE the card says the climate
model is too dry (the Green Sahara), as the terrain images' overlay already paints it. Research 0015 section 3.

## [2026-11-28] fix | City names of the time; the hover card's way of life matches the map

The Reba catalog files Cahokia's 1000 CE figure under "St. Louis" (founded 1764) and Tenochtitlan's under "Mexico City";
`cityNameAt` in `lib/settlements.ts` labels them Cahokia, Tenochtitlan, and Istanbul as Byzantium / Constantinople before
330 / 1453. The hover card's way of life now reads the map's class for the cell (head count, land use and the domesticates
gate) instead of HYDE land use alone, which called Cusco, Mohenjo-daro and Memphis "Foraging".

## [2026-11-28] fix | No herder camps in medieval Germany; no foragers in Poland or Tibet

Grazing cells with 150+ people where crops are known are mixed farming (Germany 1000 CE had 31% of its cells drawn as herder
camps, median ~350 people; the steppe's herders are 13-44 per cell). Light grazing (≥ 2%) is herding and light cropland
(≥ 0.5%) farming, so Poland, England and Tibet are no longer mostly foragers. Research 0015 section 4.

## [2026-11-28] fix | Forager food is the game modelled there, not the biome's default

The food row (`?food=1`) gave foragers their biome's generic animals, so Ice Age Honshu, Doggerland and NE Siberia all ate
"moose, caribou". Where the fauna layer has large prey for the place and time, those are the animal staples now
(`gameAnimals` in `lib/fauna.ts`).

## [2026-11-28] update | The hover card gives a place's head count as a range

"≈ 230 people" now adds "could be 70–230, as world estimates differ": the year's spread of world totals (published estimates
from 10,000 BCE, the model's low-high before) applied to the cell, a floor on how unsure the figure is. Shown when the spread
is 20% or more and the count 10 or more (`uncertaintyFactorsAt` in `lib/time.ts`).

## [2026-11-28] fix | People on Tahiti, the Marquesas, Rapa Nui and the Azores

HYDE has no populated cell on these islands in any year, so Tahiti at 1500 said "No one here" while its card listed
Austronesian languages and taro. `lib/missingIslands.ts` adds a rough, cited count from settlement (Tahiti ~35,000 at contact,
Rapa Nui ~3,000 in 1722, the Azores 256,000 in 1900) over a few cells each, only where the image is empty.

## [2026-11-28] add | The lakes of the Basin of Mexico, before the colonial drainage

Past water had no Lake Texcoco, so at 1400 the Valley of Mexico's towns stood on its bed. `past_water_texcoco.py` floods the
basin floor from Texcoco on the same smoothed DEM as Mega-Chad, at a level calibrated to the lakes' area (1,598 km²), from
2050 BCE to 1600 CE; Tenochtitlan's island is kept dry, and only the fresh southern lakes (Xochimilco, Chalco) count as
fresh water. See docs/ops/past-water.md.

## [2026-11-28] add | Reindeer in the food table, and as herd animals in the Arctic

The food table had no reindeer, so Arctic Eurasia could never have herders and its card listed none. `food/animals.py` adds
them, dated: harnessed reindeer at Ust'-Polui on the lower Ob ~2 ka (Losey et al. 2021), riding reindeer round the Sayan in
the first millennium CE, Ohthere's tame herd c. 890 CE, and the large tundra herds of the Nenets, Dolgan, Chukchi and Koryak
from the 17th-18th centuries. They count in the herding gate (`domesticatesGate.json`, regenerated). The hover card's food
list (`public/food/food.json`, built from data on budgie) shows them once `food/build.py` and `export_web.py` are re-run there.

## [2026-11-28] fix | The hover card corrects the biome model on the prairie and the mammoth steppe

Kansas at 3000 BCE read "Temperate deciduous forest", and the ice edge at 20,000 BCE "Deciduous taiga". The card keeps the
model's biome and adds a line under it where the record disagrees: "Grassland, not forest: the prairie" (the Plains, 6000
BCE-1880) and "Steppe-tundra, not forest: the mammoth steppe" (north of 45°N and Beringia, 28,000-13,000 BCE), beside the
Green Sahara note, all from `lib/biomeNotes.ts`.

## [2026-11-28] fix | No city glows before a region's first towns

HYDE crowds city-like numbers into cells long before any city stood there (central Mexico glowed at 3000 BCE). A cell is now
drawn as a city only from its region's first towns (`lib/firstCities.ts`, 18 regions, 1500 CE elsewhere); before that it is a
dense farming village, and the hover card's density says village too.

## [2026-11-28] fix | More islands left empty before their first settlers

`lib/firstSettlement.ts` now also covers the Marianas (~1500 BCE), Vanuatu, New Caledonia, Fiji, Tonga and Samoa (Lapita, kept
from HYDE's -1000), Madeira (1420), Cape Verde (1462), Bermuda (1612), St Helena (1659) and the Seychelles (1770).
