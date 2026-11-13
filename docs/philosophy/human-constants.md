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

## Open questions

- Which constants can carry real data at map scale, and which only work in a clicked person's story?
- **War:** the vision says "not empires and wars", meaning no borders, battles or great-men timelines. War here means how conflict shaped ordinary lives. That still needs a careful line.
- **Gender:** the day API currently avoids assigning work by sex (commit `4a654a6`). Showing gender roles honestly needs sourced, varied data, not stereotypes.
- **Groups:** how to show nested groups (family inside band inside tribe), and how they multiply in modern times.
