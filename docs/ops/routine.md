---
id: ops-routine
type: ops
purpose: "How people at street zoom follow a daily routine (asleep, hearth, play, trips): the schedule, its sources, what is modelled and what is imagined, and the URL flags"
---

# Daily routine (`?routine=1`)

Off by default until Will has reviewed it on prod. With `?routine=1`, each person at street zoom (our own people and the
other kinds of human) has a state for the **local sun time** where they stand (`lib/sunTime.ts`, the same clock the stats
panel shows): asleep, at the hearth, playing, or away on a trip. The state drives the footprints
(`layers/people.ts` `gait` GLSL), the name tags and the person card.

**Modelled and imagined.** The *pattern* (how long people sleep, how many hours a day go on food getting, who tends
to do which job) is modelled from studies of recorded small-scale societies. *This person's day* (which trip, how far,
which way, when) is imagined, drawn from a seed. Nothing here is a finding about the past: the studies are 19th-21st
century people, and the slider's year has no date, so the routine runs on **today's date and sun clock**
(day length by season is real; the year on the slider only picks who is there). The person card says so.

## The shape

`lib/routine.ts`. A `DayPlan` is a sleep window (`wake`, `bed`) and at most one `away` spell (`from`..`to`), which is
either `{kind: 'play'}` or `{kind: 'trip', trip, dist, bearing}`. `stateAt(plan, localHour)` gives a `State`:

| State | Looks like (gait style) |
|---|---|
| `asleep` | Both feet together on the spot, no steps (1) |
| `hearth` | The old gait: standers shuffle, three in ten walk a loop of up to ~25 m (0) |
| `playing` (children 5-12) | On the move in a wide loop, resting now and then (2) |
| `trip`, leg `out` / `back` | Walking a straight road at 1.2 m/s toward / away from the destination, prints 0.7 m apart (transit) |
| `trip`, leg `there` | Working in a small, slow loop at the destination, 0.2-15 km from camp (3) |

Infants (under 5) stay at the hearth; elders (55+) only fetch water and wood; adults get one trip or none per day from a
table of odds by way of life (the group's kind: band = forager, village = farmer, camp = herder), role and sex.
The trip kinds are gathering, hunting, fishing, fetching water and wood, working the fields, herding and visiting another
camp ("travelling between camps": a day visit; camp moves are not modelled, because a spot stands for one camp).

**Seed.** A person's spot hash (`Person.gait`, `gaitSeed`), not their id: ids shift as the view changes, a spot does not.
Traits that do not change day to day (chronotype, sleep need) come from the seed alone; the trip, its length and its
bearing from the seed and the local day. Total people, ids and positions-per-group are untouched (the routine only
moves the footprints; `Person.position` is still the spot).

**Where it runs.** Plans are built on the CPU once per person per sun-clock hour (`planOf`, cached on the person) and
sent to the footprint shader as two vec4 attributes (`planAttributes`): `[wake, bed, from, to]` and
`[dist, bearing, plays, lon/15]`. The shader reads the sun hour as a uniform (`peopleAnim.sunUtc`, from
`lib/solarClock.ts`) and runs the same state logic per print, so nothing is recomputed per frame on the CPU and a walker
leaves camp smoothly in real time. `lib/gait.ts` (`routineGaitAt`) is the TS port the name tags and tests use.
**Change the GLSL and the port together** (`lib/gait.test.ts` pins values).

## Sources and how sure they are

Numbers sit in `lib/routine.ts` (`TRIPS`, `oddsFor`, `ADULT_GO`) and, for hours of food getting, must equal
`footstep-generator/anthropology/time_use.yaml` (exported to `deploy/budgie/api/time_use.json`); `routine.test.ts` reads the
export and fails if they drift. `check` is that yaml's status.

| What | Value | Source | Status |
|---|---|---|---|
| Time away on food-getting trips (walking included) | foragers 2.2-6.0 h, farmers 3.0-5.5 h | time_use.yaml `food_getting`: Lee 1979 (!Kung); Hawkes, O'Connell & Blurton Jones 1997 Curr Anthropol 38; Dyble et al. 2019 Nat Hum Behav 3:792, doi:10.1038/s41562-019-0614-6 | secondary (read via summaries) |
| Share of adults going out on a day | about 0.6-0.75 for the main roles | Between Lee's ~2.5 working days in 7 (!Kung) and the Hadza's near-daily foraging | a hedge, not a finding |
| Time awake | 15-17 h (so 7-9 h in bed), children +1.5 h, under-5s +3 h, elders -0.5 h | time_use.yaml `human_baseline` (14-17 h awake); Yetish et al. 2015 Curr Biol 25:2862 (5.7-7.1 h asleep) | `recalled`, paper not opened; child and elder offsets assumed |
| Waking about half an hour before sunrise | `wake = sunrise - 0.5 ± 0.75 h` | Same Yetish paper | `recalled` |
| Season | sunrise and sunset from the day length at the person's latitude, held to 8-16 h | `dayLengthHours` (`lib/sunTime.ts`); the clamp is an assumption for the poles | geometry exact, clamp assumed |
| Who does which job | Hunting mostly male; gathering, water and fuel mostly female; herding mostly male. Used as odds that tilt a role, never a rule ("hunter" is a role drawn without sex, so a woman can be one) | Murdock & Provost 1973 Ethnology 12:203, SCCS (D-PLACE) | `recalled`; time_use.yaml splits no figure by sex (research 0005 "Sex and gender") |
| Herding trips of 6-9 h | | None: time_use.yaml has no herding figure (its `gap`) | assumed |
| Trip distances (0.2-15 km one way), chore lengths, 1.2 m/s pace | | | assumed |
| Children 5-12 play between waking and the evening meal | | | assumed |

Not modelled: camp moves, seasons of work (planting, harvest peaks), meals, naps, ill people, festivals, the weather,
mothers staying with infants.

## Flags and checking

- `?routine=1` turns it on. Without it nothing changes (the shader's `routine` uniform is 0).
- `?utc=6.5` starts the sun clock at 06:30 UTC today; `?warp=60` runs it 60 times faster (a day in 24 minutes).
  Both also drive the stats panel's sun time and the Day/night shading (`lib/solarClock.ts`, `useSolarClock`). Local sun hour =
  UTC + longitude / 15 (Kalahari ~21°E is UTC + 1.4 h; the Nile delta ~31°E is UTC + 2.1 h).
- Example: a farming village, Nile 1500 CE, at midday:
  `/?year=1500&lat=30.8885&lng=31.131&zoom=17.4&routine=1&utc=10`; at night: `utc=1`.
- Click a person: the card adds "Now: gathering, about 2 km from camp. Imagined: the pattern is modelled from time-use
  studies of small-scale societies, this person's day is not known."

**Seen in the browser** (production build, real data): Nile 1500 CE village at 31.076°E 30.890°N, `zoom=17`: at 3 am (`utc=1`) everyone is at home, still, paired feet; at midday (`utc=10`)
adults are away (at zoom 13 they are scattered through the fields up to 2 km out), children play, tags show who is left. A forager band could not be shown: a band whose cell has fewer than 15
people drew no individuals at street zoom before 2026-11-24 (`peopleDrawn` in `layers/people.ts`; Kalahari 1800 CE was such a place); it is now drawn as a typical band (`nominalPeople`), so the forager schedule can be seen there too.

Tests: `lib/routine.test.ts` (share of people in each state by hour for a forager band, a farming village and a herding
camp; deterministic; food-getting hours equal the yaml's), `lib/gait.test.ts` (`routineGaitAt`), `lib/solarClock.test.ts`,
`lib/sunTime.test.ts` (`dayLengthHours`), `layers/personTags.test.ts` (tags follow a trip).
