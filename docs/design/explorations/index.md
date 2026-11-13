---
id: design-explorations-constants
type: note
purpose: "Ten design explorations for the constants of human life, with a feasibility verdict each and the 3 to prototype first"
date: 2026-11-14
---

# Design explorations: the constants of human life

Ten throwaway mockups, one per idea, for showing more of human life than where people were and how many.
They start from [human-constants.md](../../philosophy/human-constants.md) and [vision.md](../../philosophy/vision.md).
Each is one HTML file: open it straight from disk, no build step. Drag the slider and the map, the panel and
the over-time line all change together. The numbers are fake but plausible unless a page says otherwise.

Vision alignment: Footsteps, explore the constants of human life (goal); "want to reach my potential with software" (vision).

## How to read a page

Every page shows its idea in the three places it could live in the app, in a mock of the real screen:

1. **On the map:** what changes on the dark map itself.
2. **In the details panel:** what "What we know here" says for a clicked place and year.
3. **Over time:** a line or band drawn above the slider rail.

Under the mock there are six cards: what it shows, which **kind** it is (measured, modelled or imagined, as in the
vision), the data with a **verdict** (have it / can get it / speculative only), risks, **gender and war**, and the other
shapes I considered. The look follows the app: dark map, quiet glass panels, people the only warm colour. Measured
data is cyan, modelled data is neutral, and imagined things are warm text or a warm-outline button, like "Imagine their day".

## The ten

| # | Idea | Constant | Kinds | Verdict | Main risk |
|---|---|---|---|---|---|
| 01 | [Day clock](01-day-clock.html) | Daily schedule | Sun: measured · hours: modelled · a person's day: imagined | **Can get it** (~10 time-use studies + free astronomy) | A few 20th-century studies stretched over 50,000 years |
| 02 | [On the plate](02-on-the-plate.html) | Food | Cropland: measured · shares: modelled · a meal: imagined | **Have it** for the staple food and how food was got; can get it for dishes | Shares look precise; crop spread outlines are hand-drawn |
| 03 | [Nested groups](03-nested-groups.html) | Groups | Recorded levels: sourced · rings: modelled | **Can get it** (D-PLACE EA032/EA033, EA012, Seshat hierarchy) | Neat nesting is a model; modern people belong to many overlapping groups |
| 04 | [Ritual and belief](04-ritual-and-belief.html) | Religion and ritual | Dated sites, EA034: measured · moral-gods share: modelled · festival: imagined | **Can get it** for ~1850–1950 and the Pacific; **speculative** for the deep past beyond dated sites | Contested science (the 2019 *Nature* moralising-gods paper was retracted); a "world religions" map creeping in |
| 05 | [Conflict in ordinary lives](05-conflict-in-ordinary-lives.html) | War and conflict | Walls, skeletons: measured · violent-death share: modelled · life lens: imagined | **Speculative** at map scale; **can get it** for points | Ideological fight (Pinker vs Fry); turning into a battles map |
| 06 | [Trade reach](06-trade-reach.html) | Markets and trade | Sourced objects: measured · inferred links: modelled · a trader's journey: imagined | **Can get it** for a few dozen showcase places only | Curated places tilt to Europe, the Near East and China |
| 07 | [Animals](07-animals.html) | Animals | Grazing, domestication dates: measured · herd counts, megafauna: modelled | **Have it** for herds; can get it for wild animals and megafauna | Animals competing with people for attention; present-day ranges used for the past |
| 08 | [Habitat hover card](08-habitat-hover-card.html) | Habitat (and the hover card) | Biome, climate: measured · settlement mix: modelled · house: analogue · camp picture: imagined | **Have it** (the atlas already returns it) | 1900s houses placed on 5000 BCE |
| 09 | [Life course](09-life-course.html) | Birth, childhood, old age, life expectancy | Life expectancy 1800+: measured · survival, pyramid: modelled · someone aged 60: imagined | **Can get it** (model life tables keyed by way of life) | Showing life expectancy alone repeats the "everyone died at 30" myth |
| 10 | [Who did what](10-who-did-what.html) | Gender, work, archetypes | Recorded tasks: measured · spread: modelled · roles: imagined | **Can get it** for ~1850–1950 only; nothing honest before | Ethnographers' bias; stereotypes leaking into the default view |

The constants not given a page of their own: **climate** is already on the map (terrain, sea level, temperature);
**politics** shows up in 03 (levels) and the atlas's polity names; **gathering resources** is the way-of-life mix the
app already has, and feeds 01, 02 and 07; **social activities** and **archetypes** live inside 01's clock and 10's roles.

## Gender and war, across all ten

**Gender.** One rule held up on every page: the default view shows the whole group, as the day API does now (commit `4a654a6`).
A split by sex appears only on request, only where a named record exists, and always next to how much that task
varied across societies. Records only cover about 1850–1950 (D-PLACE EA044–EA054, SCCS), so before that the pages
say "no records" and show nothing rather than guess. Demography is different: an age pyramid split by sex (09) is
biology, not roles, and is fine. Page 10 exists to make this rule visible.

**War.** "Not empires and wars" means no borders, battles, armies, sides or war dates anywhere. Conflict appears only
as it touched an ordinary life (05): walls round a village, a dated site where people were killed, a wide and honest
range for the chance of dying by violence, and how often raids came in the nearest recorded society. Every other page
leaves war out and links to 05. One call made in 06: the slave trade (1500–1860s) is **not** hidden or drawn as trade.
It is a separate line labelled "people, not goods", because hiding it would misrepresent ordinary lives on both ends of it.

## What every page shares

- **Data shape:** each page is driven by one `ERAS` table (the same 10 years, 50,000 BCE to 1900 CE) plus small lookup
  tables. If one graduates, that maps onto an atlas field per 5° cell × era, the same shape as `/api/anthropology`.
- **A good first step for all of them:** ingest more fields from the D-PLACE EA zip the atlas build already downloads
  (EA012, EA032–EA034, EA044–EA054). That one change moves 03, 04 and 10 from "can get it" towards "have it". SCCS
  (warfare, for 05) is a separate D-PLACE dataset, not fetched yet.
- **Known gap in the mocks:** the details panel covers everything east of ~95°E at world zoom, so most showcase places
  are in Africa, Europe, West Asia and the Americas. The real app pans; the mocks don't.

## Confidence in the facts on these pages

- **Checked in this repo:** the atlas fields and EA codes it uses (`footstep-generator/anthropology/build.py`: EA001–EA005,
  EA029, EA030, EA040, EA041, EA042, EA079, EA081, EA083), HYDE land use, Seshat sites, p3k14c, and the climate series.
- **Checked against D-PLACE (2026-11-14, `cldf/variables.csv` in dplace-dataset-ea):** EA012 marital residence,
  EA031 community size, EA032/EA033 jurisdictional hierarchy, EA034 high gods, EA044–EA054 sex differences by task
  (metal, weaving, leather, pottery, boats, houses, gathering, hunting, fishing, animal husbandry, agriculture).
- **From the literature, from memory; check before building:** every citation's exact figures (Gurven & Kaplan 2007,
  Gómez et al. 2016, Bowles 2009, Anderson et al. 2023, Hamilton et al. 2007, Brooks et al. 2018, Larson et al. 2014,
  Yetish et al. 2015, Riley 2005 and the rest), and every society name, record year and coding shown in a panel.
  Those are placeholders.

## Shortlist: the three to prototype first

Ranked by how much new each one shows Will, how honest it can be with the data, and how cheap it is to build in the
real app.

1. **[Life course](09-life-course.html).** It has the biggest "huh" of the ten: of 100 babies, most deaths were small
   children, yet adults often lived into their 60s and 70s. That fixes a myth instead of repeating it. The data path is
   short (a few model life tables keyed by the way of life the atlas already has), it works at every year from
   100,000 BCE, and it uses all three placements well: survival curve in the panel, age-sized dots on the map, two
   life-expectancy lines on the slider. The risk is low and it touches no contested politics.
2. **[On the plate](02-on-the-plate.html).** The data is already in the app (the atlas's staple crop and food-source
   shares, HYDE cropland and grazing), so it is the cheapest to make real. Food is the most relatable constant, and the
   over-time band (wild food falling from ~100% to a few percent) tells the farming story in one glance. The imagined
   meal slots in beside the existing "Imagine their day".
3. **[Day clock](01-day-clock.html).** It deepens the feature Footsteps already has: the clock gives "Imagine their day"
   a grounded frame, and the night line sweeping the map is free (pure astronomy) and makes the whole planet feel alive.
   The hours need ~10 time-use studies typed in by hand, which is a day's work. It also shows the counter-intuitive
   result that farmers worked longer days than foragers.

**Runners-up.** [Habitat hover card](08-habitat-hover-card.html) is the cheapest of all ("have it") but adds less that is
new, since the portrait and panel already show the dwelling. [Nested groups](03-nested-groups.html) answers an open
question well and is next once the extra EA fields are ingested. [Who did what](10-who-did-what.html) is less a feature
than a rule: adopt its "opt-in, sourced, show the range" rule now, whatever gets built.

**Hold.** [Conflict](05-conflict-in-ordinary-lives.html), [ritual](04-ritual-and-belief.html) and
[trade](06-trade-reach.html) can be done honestly only as hand-curated points, so they are better as a later "evidence
layer" that shares one design with the p3k14c dated sites (not drawn yet) than as three separate features.

## Files

- `NN-*.html`: the ten mockups. The world outline in each is inlined from `footsteps-web/public/world-simple.geojson`.
- [decisions.tsv](decisions.tsv): the decision trail for this exploration.
