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
card's way of life reads land use through the domesticates gate too. On Saharan land 9550-3550 BCE the card says the climate
model is too dry (the Green Sahara); the terrain itself still shows desert. Research 0015 section 3.
