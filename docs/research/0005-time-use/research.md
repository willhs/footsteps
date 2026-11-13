---
id: research-0005-time-use
type: research
purpose: "What time-use studies say about a day by way of life, how to feed it to the day API, and a 'day clock' visual concept"
date: 2026-11-14
---

# Time use: grounding "Imagine their day"

## Question

"Imagine their day" (`deploy/budgie/api/day_api.py`) is generated from place, year, density and way of life. Which measured time-allocation figures can ground the schedule, and how should they reach the prompt?

## Premise check

| Task note | Found |
|---|---|
| Daily schedule is a human constant | True: [human-constants.md](../../philosophy/human-constants.md). |
| Day API is purely generated | True. `prompt()` passes facts and atlas record only; no hours (`day_api.py`). |
| No time-use file exists | True. Created `footstep-generator/anthropology/time_use.yaml`. |
| Studies listed give usable numbers | **Only partly.** In this session I could read secondary summaries for Lee (!Kung) and Dyble 2019 (Agta) only. Hadza, Tsimane, Ache, Machiguenga and pastoralist hours were not extracted, and I did not open any primary paper. |

Confidence: every figure in the YAML is tagged `check: secondary` (seen in a press release or review quoting the paper) or empty. Nothing is verified against a primary table. **Do not show these numbers to users as fact until someone reads the papers.** This is the main limit of this note.

## What is solid

- **Foragers do not work all day.** Food getting is a few hours: Lee's !Kung ~2.2-2.4 h/day on food alone, ~6 h on a working day, ~2.5 working days/week [secondary]. Counting processing, tools and housework, Lee gets 44.5 h/week for men and 40.1 for women (~6 h/day) [secondary]. Critics (Harpending, Wandsnider) say Lee's diet and calorie figures flatter !Kung well-being, so treat it as a lower bound for a good year.
- **Leisure is large in daylight for Agta**: ~30 h/week, with ~24 h out-of-camp work and ~20 h domestic chores. Farming Agta do ~30 h/week of work against ~20 for foragers [secondary, Dyble et al. 2019: 10 camps, 359 people, 6am-6pm sampling].
- **Horticulture raises return per hour, not hours** (Kraft et al. 2021, Hadza vs Tsimane) [secondary].

## What varies

- **Definition of work.** Food getting only, food plus processing, or all chores. Do not add across studies.
- **Method.** Spot-check observation (Agta, daylight only) against interview recall (Tsimane) against full-day follow (Hadza).
- **Season and setting.** Ache work fewer hours at a settlement than on forest treks. Seasonal calendars exist but no hours were extracted.
- **Observation era.** All are 20th-21st century groups under contact. They are analogues for deep prehistory, not records.
- **Farmers.** The only farming figure here is from foragers who took up farming. Ancient peasants, pastoralists and city dwellers have no row.

## Sex and gender

Following commit `4a654a6`, no figure in the YAML is split by sex and the prompt must not be. Lee and Dyble do report differences (e.g. women moving from chores to field work); they sit in `sex_note` as context. If we later want to show roles, it needs a sourced, varied set (D-PLACE/SCCS), per [human-constants.md](../../philosophy/human-constants.md).

## Feeding it to the day API

1. Add a loader for `time_use.yaml` beside `atlas.py`. It selects the way of life already computed (`foraging`, `farming`, `herding`, `mixed`; `fishing` falls back to forager).
2. In `prompt()`, add `facts["typical_adult_time_use"]` only for rows with a value: `{"food_getting_h": "about 2-6, typically 4", "leisure_h_daylight": ...}` plus a one-line source tag. Omit nulls so the model is not invited to invent them.
3. Add to `SYSTEM`: "Make the schedule's proportions consistent with typical_adult_time_use; do not invent hours it does not give." Bump `PROMPT_VERSION` (cache key) to 3.
4. Add the study names to `grounded_in` so the card's "what we actually know" panel can cite them.
5. For people with no row (herding, cities, children, elders), say nothing quantitative; the existing uncertainty note covers it.

Cost: about 100 extra input tokens per generation; negligible against the daily cap.

## Day clock concept

A 24-hour ring on the card, drawn from the same record as the text:

- Arcs for food getting, domestic, leisure, sleep; arc width = hours; **solid** fill where measured (a cited row), **hatched** for the model's filling of the gaps, in line with the measured/modelled/imagined rule in [vision.md](../../philosophy/vision.md).
- Range shown as a soft edge on each arc (lo..hi).
- Hover an arc: the study and number. The schedule entries sit around the ring at their times.
- Empty rows stay grey and say "unknown", not zero.

## Gaps and next steps

1. Read the primary tables (Lee 1979, Hawkes et al. 1997, Marlowe 2010, Gurven's Tsimane papers, Hill 1985, Johnson 1975, Dyble 2019) and move `check` to `read`. Size: M.
2. Find pastoralist and peasant studies (Turkana, Maasai, historic European farm labour). Size: M.
3. Sleep (Yetish 2015) and childcare hours.
4. Then wire the loader and prompt change above. Size: S.

## Sources

- Dyble et al. 2019, Nat Hum Behav, doi:10.1038/s41562-019-0614-6; [Cambridge summary](https://www.cam.ac.uk/research/news/farmers-have-less-leisure-time-than-hunter-gatherers-study-suggests)
- Lee 1979, The !Kung San (via secondary summaries, e.g. [Original affluent society](https://www.wikipedia.com/wiki/Original_affluent_society))
- Kraft et al. 2021, Nat Hum Behav, doi:10.1038/s41562-020-01002-7
- Hawkes, O'Connell & Blurton Jones 1997, Curr Anthropol 38 (not read)
- Johnson 1975, Ethnology; Hill et al. 1985; Gurven & Kaplan 2006 (not read)
