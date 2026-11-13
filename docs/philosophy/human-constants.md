---
id: human-constants
type: note
purpose: "The constants of human life Footsteps could show, beyond where and how many"
date: 2026-11-13
---

# Constants of human life

Footsteps shows position, time and density today. These are the things every human life has had in some form, and the kinds of things I'm interested in showing. I don't know yet which ones we can convey well. This is a list to choose from, not a plan.

Each one is a constant that takes different shapes across places and eras. The interesting part is the variation: a forager band's day vs a farmer's vs a city dweller's.

| Constant | What varies | Shown today | Possible sources |
|---|---|---|---|
| **Place, time, density** | Where people were and how many | Yes: the map, slider and counter | HYDE 3.5; modelled before 10,000 BCE ([research 0002](../research/0002-pre-hyde-population-model/research.md)) |
| **Daily schedule** | Waking, work, rest, sleep; seasonal rhythm | Imagined: "Imagine their day" | Ethnography (time-allocation studies); generated, labelled speculative |
| **Climate** | Cold, heat, drought, ice ages, seasons | Terrain per era | Krapp/Beyer climate, sea level ([research 0001](../research/0001-deep-prehistory-sources/research.md)) |
| **Animals** | Prey, herds, predators, pets, pests | No | Biomes; HYDE grazing; D-PLACE livestock |
| **Habitat** | Shelter, houses, settlement shape, terrain | Partly: biomes on the map; houses in portraits | D-PLACE house and settlement fields; Seshat largest settlement |
| **Groups** | Family, band, clan, village, tribe, city, state, nation; more levels in modern times | Partly: bands, villages and city glow | Seshat settlement hierarchy; D-PLACE jurisdictional levels |
| **Religion and ritual** | Beliefs, gods, burial, festivals, rites of passage | No | D-PLACE (high gods), Seshat (ritual), Pulotu (Pacific), archaeology |
| **Politics and philosophy** | Who decides, how power works, what the group values | Partly: polity names in the atlas | Seshat (polities, government), D-PLACE |
| **Food** | What people eat, staples, feasts, famine | Partly: staple crop in the atlas | HYDE crops/grazing; D-PLACE staples; forager diets (Binford) |
| **Gathering resources** | Foraging, hunting, fishing, farming, herding, mining, trade goods | Partly: way of life from land use | HYDE land use (ways-of-life goal in Steady) |
| **Social activities** | Play, storytelling, music, gatherings, kinship | No | Ethnography; generated, labelled speculative |
| **Gender** | Roles, work, family, status | Deliberately not assumed: the day API avoids dividing work by sex | D-PLACE and SCCS gender fields; handle with care |
| **Archetypes** | The kinds of people in a group: elder, child, healer, hunter, trader, leader | Partly: roles in portraits | Ethnography; generated |
| **War and conflict** | Raids, feuds, defence, fear, as part of ordinary life | No | SCCS warfare frequency; Seshat (warfare tech, fortifications); archaeology (violent deaths) |
| **Markets and trade** | Exchange, gifts, money, markets, trade routes | Partly: markets flag in the atlas | Seshat (markets, money); archaeology (obsidian, shell routes) |

## How they could be shown

Each constant fits one of the vision's three kinds ([vision.md](vision.md)):

- **Measured or modelled on the map:** things with spatial data, like density, way of life, climate, settlement size and maybe conflict levels.
- **In the details panel:** sourced facts for a clicked place and time, like religion, politics, food, groups and trade.
- **Imagined:** a person's day, social life and archetypes, labelled speculative and grounded in the facts above.

Ten mockups, one per constant, with a feasibility verdict each and a shortlist of three to build first: [design explorations](../design/explorations/index.md).

## What D-PLACE can ground

[D-PLACE](../ops/ethnography.md) records how 1,404 societies lived, mostly 1850-1950, coded the same way so they can be compared. We turned 25 of its variables into an export and a "nearest known analog" for a place, year and way of life. It can show **what a way of life looked like somewhere**, never **what happened at this place**: the ethnographic present is not the past, and each coded value is a coarse category for one community.

| Constant | What D-PLACE gives | How well |
|---|---|---|
| **Groups** | Community size, levels of authority above the community, descent, marital residence (about 1,150-1,270 societies each; community size 610); Binford camp sizes (293) | **Good.** The best-covered constant. Gives a believable band or village size and how nested it was, by way of life |
| **Habitat** | Settlement pattern, house plan, walls and roof (about 1,100-1,200 societies each) | **Good.** Already used for dwellings in the atlas |
| **Food, Gathering resources** | Share of food from gathering, hunting, fishing, herding, farming (all 1,404); crop type and farming intensity (about 1,200) | **Good for the mix, none for the meal.** Shares in 10-point bands; no dishes, seasons or famine |
| **Animals** | Which domestic animals and whether they were milked (1,181) | **Partial.** Livestock only; wild prey and predators come from [fauna](../ops/fauna.md) |
| **Politics and philosophy** | Levels of authority, class differences (about 1,100-1,150) | **Partial.** Says how hierarchical, not what people valued |
| **Religion and ritual** | One variable: whether a high god existed and cared about morals (775) | **Weak.** One coarse code. Pulotu (Pacific) and Seshat would add depth; not ingested |
| **War and conflict** | How often internal war and attacks on others happened (SCCS, about 160 societies) | **Weak but usable as a tone.** Three levels (continual, frequent, infrequent) for a small, well-described sample |
| **Markets and trade** | How much of the food came from trade (SCCS, 93-183 societies) | **Weak.** Small sample, coarse. Seshat covers markets and money for states |
| **Daily schedule** | Binford: mobile or settled, moves per year (258-334 foragers) | **Weak.** Seasonal rhythm for foragers only; no hours. Time-allocation studies would be the real source |
| **Place, time, density** | Binford population density for 334 foragers | **Weak.** A sanity check for forager density, not a map |
| **Climate** | A modelled 1900-1949 climate and a biome at each society | **Used for matching only**, not as climate data |
| **Gender, Social activities, Archetypes** | Sex differences in tasks and games exist in the Atlas (EA044-054, EA035) | **Not ingested.** Gender especially needs careful handling (see below) |

Verdict: a "nearest known analog" is feasible as a **details-panel fact** ("a society like this: the Kazakh, c. 1910") for Groups, Habitat, Food, Politics and, with caveats, War. It is not map data. See the three sanity checks and the limits in [ethnography](../ops/ethnography.md).

## Open questions

- Which constants can carry real data at map scale, and which only work in a clicked person's story?
- **War:** the vision says "not empires and wars", meaning no borders, battles or great-men timelines. War here means how conflict shaped ordinary lives. That still needs a careful line.
- **Gender:** the day API currently avoids assigning work by sex (commit `4a654a6`). Showing gender roles honestly needs sourced, varied data, not stereotypes.
- **Groups:** how to show nested groups (family inside band inside tribe), and how they multiply in modern times.
