---
id: docs-log
type: note
purpose: "Record implementation and documentation updates"
---

## [2026-11-18] feature | People as walking footprints

Zoomed in to individual people, each one is now a pair of footprints instead of a dot, inspired by the Marauder's Map
(`docs/philosophy/design-philosophy.md`). On the real clock a person walks (a new print every ~0.7 m step, the older
prints fading as the next foot lands) or stands with both feet together; about three in ten walk a lot, the rest
mostly stand and take a few steps now and then. The prints lie on the ground (tilt with the close-up 3D view) and draw
over its raised ground. Far out a walker steps almost on the spot; the stride shows only when zoomed right in, because
positions stay real-time and real-size. Footwear is imagined per person from era, latitude and way of life
(`lib/footwear.ts`, recalled sources): barefoot before ~40,000 years ago and for small children, hide wraps in cold
country, sandals for warm-country farmers after Fort Rock (~10,500 years ago), stitched shoes with a heel for Eurasian
villagers from 1 CE. Four print shapes (`layers/people.ts`); the person card names it.

## [2026-11-18] feature | Other kinds of human on the map

Neanderthals, Denisovans, *H. floresiensis* and *H. luzonensis* are drawn before ~30,000 BCE: approximate lavender ranges,
24 key dated sites with tooltips (find, age, source, "recalled" flag) and names with "last seen about N years ago", fading
out between each species' earliest and latest last dates (`lib/otherHumans.ts`, `hooks/useOtherHumansLayer.ts`,
`overlays/OtherHumansTooltip.tsx`). On by default with a View panel switch; `?humans=0` starts it off. The legend says the
ranges are approximate whenever they show. `TextLayer` drew nothing because deck.gl's CJS build wrapped `@mapbox/tiny-sdf`
wrongly; a webpack alias to `lib/shims/tinySdf.cjs` fixes it (and the `?settlements=1` city names). See `docs/ops/other-humans.md`.

## [2026-11-15] fix | React hydration error #418 on `?mode=` deep links

Reproduced first: in `next dev` and a production build a plain load was already clean (the task's
"every scene" was too broad), but any deep link with `?mode=` threw "Hydration failed" / React
error #418. Cause: `FootstepsViz` read `window.location.search` and the view-mode cookie inside
`useState` initialisers (`renderMode`, `debugModes`, `hoverCard`, `is3DMode`), so the first client
render differed from the static HTML. The "About the data" fold and `TerrainNote` were not at fault
(the fold already applied its stored state after mount). All four now start at the server's values
and take the URL/cookie value in the mount effect; the 3D cookie is written from the toggle handler
instead of an effect (which would have overwritten the cookie before it was read). The verify
scripts (`verify-prehistory-arrivals`, `-dna-evidence`, `-sun-seasons`, `-terrain`) no longer filter
hydration errors. Both `verify-prehistory-arrivals.mjs` and `verify-settlements.mjs` exit 0 against
`next dev` and a production build.

## [2026-11-15] feature | Evidence code reads arrivals.yaml; per-region arrival-date check

`footstep-generator/evidence/regions.py` no longer carries its own 11 coarse boxes: it loads `prehistory/arrivals.yaml` (27
regions) and assigns points by the model's rule (first box holding the point, else the nearest), so p3k14c, AADR, both reports
and `model_vs_evidence.py` share one region list. `tests/test_evidence.py` pins the region set, order, boxes and arrival dates to the
yaml and the assignment to `prehistory_population.assign_regions`. Continent no longer places anything (the `other` bucket is gone;
the AADR export's `rg` ids on disk are from the old boxes until it is rebuilt, and nothing reads them).

New `evidence/arrival_check.py` (+ `tests/test_arrival_check.py`): per region, modelled central/early/late arrival against the earliest
p3k14c date (any material and charcoal) and the earliest direct-dated AADR sapiens sample, flagging evidence older than `early`.
Result in research 0010: AADR never predates the early bound; seven regions are flagged by p3k14c only, mostly non-human or
unattributed old dates and over-wide boxes, with one real model gap (a Panama site at 10.6 ka falls in `pacific_remote` because of the
`central_america`/`south_america` box edges). The raw p3k14c dates were not on the machine, so that half reads research 0009's
`results.json` (same boxes and filter). No change to `arrivals.yaml` values or the model.

## [2026-11-15] chore | Publish ancient-DNA evidence data

The feature already landed in `9294765`. Copied the existing 381,520-byte AADR export
from the implementation workspace into the main checkout's `data/evidence/` and
`footsteps-web/public/evidence/`, then published with
`GRID_ONLY=1 bash /Users/will/projects/deep-footsteps/scripts/deploy-budgie.sh`.
The public `/evidence/aadr_samples.json.gz` matches the built file byte for byte
(SHA-256 `c71555b4b73fd3a1a4c164b1a38cd551c2f7f9d0f80fefbb765af3ee58360e3b`).
No data files are committed. Rebuild from the repository root with:

```bash
poetry run python footstep-generator/evidence/aadr.py fetch
poetry run python footstep-generator/evidence/aadr.py build
mkdir -p footsteps-web/public/evidence
cp data/evidence/aadr_samples.json.gz footsteps-web/public/evidence/
GRID_ONLY=1 bash scripts/deploy-budgie.sh
```

## [2026-11-15] add | Ancient-DNA evidence marks

Behind `?evidence=1`, AADR individuals appear as cyan diamonds beside the blue
radiocarbon circles. Both datasets use the same range fade and spatial bins,
but load independently. DNA hover identifies measured evidence, place, date range,
hominin (including the Neanderthal–Denisovan hybrid), publication and dating/location
caveats. The default view does not request AADR. Data remains gitignored; build and
copy commands are in `footstep-generator/evidence/README.md`.

Verified real-data Europe screenshots at 40,000 BCE and 3,000 BCE, plus modern-human
and Neanderthal hover at 40,000 BCE and the default Units view. Dots was explicitly
excluded by the operator because no local PMTiles are available. Added mark-logic
and tooltip tests and a repeatable browser verification script.

## [2026-11-15] fix | Publish the opt-in food lookup

The row, lazy loader, wording tests, browser verifier, and data sync already landed in
8e5b01a. This follow-up builds the ignored data, copies it into the main checkout,
and publishes it from the job workspace with `GRID_ONLY=1`. Initial public fetch
returned HTTP 404 despite successful sync: Compose omitted the food directory.
Add the read-only `/srv/app/food` mount, matching fauna and habitat, and apply the
Compose file to budgie's web service.

Exact commands from the job checkout (habitat inputs remain in the main checkout):

```bash
FOOTSTEPS_DATA=/Users/will/projects/deep-footsteps/data poetry run python footstep-generator/food/build.py --out data/food
poetry run python footstep-generator/food/export_web.py --input data/food/food.json.gz
mkdir -p /Users/will/projects/deep-footsteps/data/food /Users/will/projects/deep-footsteps/footsteps-web/public/food
cp data/food/food.json.gz /Users/will/projects/deep-footsteps/data/food/food.json.gz
cp footsteps-web/public/food/food.json /Users/will/projects/deep-footsteps/footsteps-web/public/food/food.json
ln -s /Users/will/projects/deep-footsteps/data/tiles data/tiles
GRID_ONLY=1 scripts/deploy-budgie.sh
rsync -az deploy/budgie/docker-compose.yml will@budgie:projects/deep-footsteps/deploy/budgie/
ssh -o BatchMode=yes will@budgie 'cd projects/deep-footsteps/deploy/budgie && docker compose up -d --no-deps web'
```

The tiles symlink is only needed in a fresh job checkout; all outputs stay ignored.
No application source or UI changes are needed for this follow-up.

## [2026-11-15] update | Opt-in food hover row

Added `?food=1` with lazy loading, up to four possible foods, individual confidence
and recalled/checked-summary labels, and biome-only forager foods before HYDE.
Updated the food runbook and agent rules with export and after-merge publishing
commands. The exporter keeps raw claims out of the web payload; deployment preserves
server food files. Availability is used rather than HYDE's sparse early farming
mask, with an explicit warning that this is not a measured diet. Default card
wording and network requests are unchanged (browser evidence).

## [2026-11-15] update | People fade between data years; kind changes already cross-faded

Checked "marks pop when a cell's way of life changes between data years": the continuous-time Units morph (`unitMorph.ts`) already handles it. A kind change gives different mark ids (kind slot is in the id), so the old kind fades out and the new one fades in over the year fraction, the glow/village urban threshold included. Browser frame diffs at world, Europe and zoom 9 (6000 BCE to 1900) show no step at data-year boundaries. Population totals are untouched (1300 CE still 468M).

The one hard switch left was the street-level people layer (zoom 11.5+): it swapped the `fromPeople` set for the `people` set at year fraction 0.5. `peopleForMorph` (`layers/people.ts`) now splits the people into steady, leaving and entering sets (person i never depends on the group's size, so a group that grows keeps the people it had), drawn as three `PeopleLayer`s whose opacity follows the fraction (`hooks/useGridLayer.ts`). Evidence: the job workspace `evidence/` folder (not committed). Separate, pre-existing: in the tilted 3D close-up at zoom 13 no people draw at all (same on eeecb90).

## [2026-11-15] create | Live day/night and seasonal settlement scenarios

Added an off-by-default day/night control with live mean-solar shading across map,
globe and close-up terrain, sharing its instant with a latitude-aware sun clock.
`?seasons=1` enables modelled June/December gathering and herder pasture scenarios
using settlement mobility, conserving cell populations. See
[settlement operations](ops/settlements.md) for limits and the repeatable browser check.

## [2026-11-15] fix | 3D close-up: no inland beaches or speck pools

Ground within 6 m of sea level was painted as beach everywhere, so inland valley floors showed pale sand patches, and
single DEM cells below sea level showed as tiny pools. Now only below-sea patches that reach the tile edge or cover 60+
vertices are open water (`openWater` in `lib/close3d.ts`); sand needs open water within two vertices; inland dips keep
their height, colour and trees.

## [2026-11-15] add | Post-deploy smoke check with automatic rollback

A bad image no longer stays live. After Watchtower rolls out a push, `deploy-budgie.yml` runs `scripts/smoke.sh --quick`
(app HTML, `/api/anthropology` returns an atlas record, one PMTiles archive, one grid/terrain/habitat image; ~15 s).
Pass: both images are tagged `:good` in GHCR. Fail: the `rollback` job moves `:latest` back to the digest pinned before
the deploy (`scripts/image-pins.sh`), Watchtower restores the old containers and never re-pulls the bad tag, the job
confirms `/version.txt` changed and the quick smoke passes, and `notify-medic` pages as before (the run is red). The full
smoke (every year's data) is its own `data` job: a data gap pages medic but does not roll back, because the old image
would not fix it. CI cannot reach budgie, so the rollback is a registry retag rather than an SSH. Rehearsed with
`scripts/rollback-drill.sh` on a local registry (good + bad image, dry run, real rollback, repeat run, missing digest);
the live path itself was not forced against prod. Runbook: README "Rolling back".

## [2026-11-14] update | Close-up 3D on by default

The tilted 3D landscape now shows for everyone from zoom 8 on the flat map; `?close3d=0` keeps it flat. The info
panel says "3D: ground measured, plants imagined" while it is on (the earlier top-centre note collided with the panels).

## [2026-11-14] add | Close-up 3D prototype (?close3d=1)

Zoomed in on the flat map, the camera tilts and the ground becomes a 3D landscape (`lib/close3d.ts`,
`layers/Close3DLayer.ts`): Terrarium relief (×1.6), water flat at the year's sea level, the era image's colour with a
baked hillshade, sand on the shore, rock on steep slopes and snow above a lapse-rate snow line, and low-poly plants by
Krapp biome (dense forest, scattered savanna trees, bare desert). Checked: Kilimanjaro at 8,000 BCE (summit snow,
montane forest on the wet side), Kent at 12,000 BCE (dry Channel), Corsica–Sardinia joined at 18,000 BCE, the Hoggar.
Not yet: people sit at z = 0 (drawn on top), no sky or haze, globe mode unaffected. Behind a flag until it looks right.

## [2026-11-14] update | Push to main deploys the app

Green CI on `main` now builds `ghcr.io/willhs/footsteps-web` (static export baked into Caddy, `deploy/budgie/web/Dockerfile`)
and `ghcr.io/willhs/footsteps-api` (`.github/workflows/deploy-budgie.yml`). Watchtower on budgie pulls them, and the
workflow waits for `/version.txt` to show the commit, smoke-tests prod and pages Medic on failure. Data and PMTiles stay
on budgie (mounted over `/srv/app/<folder>`) and are still published with `scripts/deploy-budgie.sh`, which no longer builds
the app. CI had been red on main since raw sea-level data went missing on the runner; that test now skips without it.

## [2026-11-14] update | People keep real-time pace; local sun time when zoomed in

Bands and camps no longer drift around their spot (`unitMorphVertex.ts`): the old drift moved them ~1.5 km every ~20 s.
Close in (`layers/people.ts`) most people stay put with a small shuffle and about one in four walks a loop of up to ~25 m
at ~1 m/s. From zoom 7 the info panel shows the local sun time at the map centre right now (`lib/sunTime.ts`), since the
close-up view runs on today's clock. Day/night lighting is still a separate idea.

## [2026-11-14] update | Fewer fires when there were fewer people

The far-out firelight used ~150,000 marks every year, so 50,000 BCE (~1 M people, ~7 per fire) looked as full as
1900 (~1.6 B, ~10,000 per fire). `fireBudget` in `layers/FireLayer.ts` now scales the marks by the square root of the
world total (full budget at 1.6 B): ~3,800 marks of ~260 people at 1 M, ~8,000 at 10,000 BCE. The deep past reads thin
and 1900 bunches around Lake Victoria, the highlands and coasts. Units (closer in) were already one mark per band or village.

## [2026-11-14] update | Publish corrected prehistory arrival images

Copied the 90 regenerated images from the arrival-fix worktree into main and deployed
the app, data and dependent anthropology API to budgie. Refreshed those exact image
URLs in Cloudflare; all 90 public image hashes match the regeneration manifest.
Documented the worktree-copy and cache-refresh steps in the
[prehistory operations reference](ops/prehistory-population.md#run). Live browser
arrival assertions passed; its final console gate reports the existing React `#418`
deep-link hydration errors.

## [2026-11-14] add | Sharp past coastlines when zoomed in

`TerrainReliefLayer.ts` redraws land and sea near the coast from the elevation tiles at the year's sea level, from zoom 5.
Ice-age Corsica–Sardinia and Bass Strait now have crisp shores instead of the 20 km image blur. Guards and limits:
[terrain images](ops/terrain-images.md#high-zoom-relief-2026-11-14).

## [2026-11-14] fix | People stay visible close in; time bar scrub you can see; softer way-of-life colours

- Cells under 15 people now hold one whole band/camp/village with probability people ÷ group size (seeded per cell) instead
  of nothing. Firelight fades out over zoom 4.6–5.4, so thin forager land (most land before farming, and nearly every
  modelled pre-HYDE cell, split 36 ways from 0.5°) went blank from zoom ~5.5. `layers/units.ts`.
- Time bar drag: the needle stays under the finger on the bar; sliding up off the bar while dragging gives ¼ then 1/16
  speed, with a label. Replaces the speed-sensitive gain, whose hidden mode felt random. `lib/timeScale.ts`.
- Way-of-life colours back to one warm firelight family (cities stay cyan); kind of mark and the panel carry the way of life.

## [2026-11-14] add | "Imagine their day" grounded in the nearest recorded societies and measured hours

`day_api.py` now puts the 3 nearest D-PLACE societies ("like the !Kung (recorded 1950s)") and measured adult hours (`time_use.yaml`, foraging and
farming only) in the prompt, asks the model to cite them in `grounded_in`, and holds the facts under a token budget. The ranking moved to
`deploy/budgie/api/analogs.py` (re-exported by `ethnography.py`) and `ethnography.json.gz` moved beside it. No work is assigned by sex. Needs
`API_ONLY=1 scripts/deploy-budgie.sh`. See [ethnography](ops/ethnography.md#in-the-day-prompt).

## [2026-11-14] add | Ethnographic "nearest known analog" (D-PLACE)

`footstep-generator/anthropology/ethnography.py`: Ethnographic Atlas + SCCS + Binford + TEOW biome + ecoClimate merged by `xd_id` into 1,404
societies with 25 variables (`ethnography.json.gz`, 0.2 MB, committed), and `nearest_analogs` (3 most similar societies for a place, year and
way of life; score from subsistence, distance, temperature, precipitation, biome). Licence is CC BY-NC, not CC BY as the task said. Extends the
existing atlas (shares its zip reader and way-of-life rule) rather than duplicating it; not wired into the app or API. Method, limits and three
sanity checks: [ethnography](ops/ethnography.md); which constants it grounds: [human-constants](philosophy/human-constants.md#what-d-place-can-ground).

## [2026-11-14] add | Units by way of life (HYDE land use read by the app)

The client now loads `landuse_{year}.png` beside `humans_{year}.webp` and classes each populated 5′ cell
(`footsteps-web/lib/waysOfLife.ts`): people >= 40,000 urban; cropland >= 2% of the cell farmer; grazing >= 10%
herder; else forager, except a cell with >= 600 people is settled (farmer). Kind of group follows: bands (30),
villages (300), new herding camps (60), city glow; colour follows too, in the far-out firelight and the legend.
Share of the world's people by class under that rule (measured from the images, `grid_image.py` encoding):

| year | forager | farmer | herder | urban |
|---|---|---|---|---|
| 10,000 BCE | 98.0% | 2.0% | 0% | 0% |
| 5000 BCE | 90.5% | 9.2% | 0.3% | 0% |
| 1000 BCE | 33.4% | 64.4% | 2.1% | 0.1% |
| 1 CE | 17.7% | 79.8% | 2.3% | 0.2% |
| 1000 CE | 16.3% | 78.8% | 4.8% | 0.1% |
| 1900 CE | 2.0% | 83.0% | 3.0% | 12.0% |

The 2% farmers at 10,000 BCE are 37 cells over the density floor, not cropland (HYDE land use is all zero then).
Thresholds are coarse display choices, not findings; HYDE's cropland is itself a model. The hover card's
`wayOfLife` (0.5° cell, 5% crop) still has its own thresholds and can disagree with a 5′ mark. Years before HYDE
have no land use, so everyone is drawn as a forager.

## [2026-11-14] add | Food over time (crop and livestock domestication and spread)

`footstep-generator/food/`: a cited table of 19 crops and 15 domestic animals (domestication centres, first dates, 529
dated spread claims in 88 named boxes, the Columbian exchange), pooled with HYDE land use and the Krapp biome (from the habitat
tiles) into `data/food/food.json.gz` (35 KB, gitignored): for each 5 degree cell and HYDE era, which domesticates were
present, whether HYDE sees farming, and forager staples by biome. 328 of 529 claims are low-confidence front estimates
and only 19 were confirmed even against a web summary. Not wired into the app. Method and limits: [food](ops/food.md);
findings and how the hover card or a "what's on the plate" view could use it: [research 0008](research/0008-food-over-time/research.md).
## [2026-11-14] add | HYDE people adjusted for the climate then (not wired into the app)

`footstep-generator/hyde_climate_spread.py`: moves HYDE 3.5 people within ten macro-regions by habitable capacity then vs
1950 (reusing the pre-HYDE capacity model, plus the terrain's Green Sahara), keeping each region's total. 10,000-4,000 BCE,
`data/tiles/grid_adjusted/`. Sahara 8% -> 22% of Africa's people from 8,000 BCE; the North Sea floor, Sundaland and the Sahul
shelf gain people. Radiocarbon check: 28-47% of dated African sites are in the Sahara box then. Strength 1.0 is a choice.
Method and limits: [hyde-climate-spread](ops/hyde-climate-spread.md). `terrain_image.sahara_extent` and
`Model.climate_npp/adjust_npp` were factored out for it (no behaviour change).

## [2026-11-14] update | High-zoom terrain relief

Era colours now carry a cached Terrarium hillshade overlay from zoom 5, including
exposed shelves, plus illustrative surface grain. Source credits, colour-mask
limits and the real-GPU verification command are in [terrain images](ops/terrain-images.md).

## [2026-11-14] add | Large-animal ranges over time (fauna dataset)

`footstep-generator/fauna/`: PHYLACINE 1.2.1 present-natural ranges (CC0, not CC BY as the task said) for 329 land
mammals (>= 44 kg plus 14 key smaller ones), a cited extinction/extirpation table, and a land-ice mask, exported as
`data/fauna/fauna.json.gz` (122 KB, gitignored): species per 1 degree cell for each 1 ka step, 100,000 BCE to 1900.
Only 21 of 157 prehistorically extinct species have a species-level date; the rest take a regional window (tagged
`regional`). Not wired into the app. Method and limits: [fauna](ops/fauna.md).

## [2026-11-09] update | Halve first-load bytes

Default view (Units, 1000 BC), cold cache, Chromium, gzip like Caddy
(`footsteps-web/scripts/measure-first-load.mjs`):

| | before | after |
| --- | --- | --- |
| first paint (HTML+JS+CSS+first image) | 3,390,837 B | 1,602,224 B (47%) |
| settled, incl. both neighbour-year prefetches | 9,135,148 B | 3,963,663 B (43%) |
| population image, 1000 BC | 2,855,783 B | 1,145,942 B |
| JS | 473,136 B | 444,761 B |

- Population images are now `humans_{year}.webp`: lossless WebP of a 1023-level
  log scale (was 16-bit PNG). Lossless WebP of the old pixels only reached ~75%
  (year 0: 2.17 MB); the 16-bit low byte was noise, so levels were coarsened
  instead. Every cell is within ±0.76% of HYDE and decoded year totals within
  1.3×10⁻⁴ (worst: 10,000 BCE; most years under 3×10⁻⁵). Populated cells are
  unchanged. Screenshots differ in 0.03% of pixels; Units dot count moved
  2,019,963 → 2,021,566 (+0.08%). Chromium and Firefox decode every checked file
  identically to Pillow (`scripts/verify-webp-decode.mjs`).
- Dots-only code (PMTiles, MVT loader, tile-metrics worker) loads on first use of
  Dots mode (~28 kB gz out of the default bundle).
- Not done: tiling by view and cropping polar rows. Rows 0–128 are already empty and
  compress to nothing (cropped WebP was 0.1% smaller), and Units/morphing needs the
  whole world, so tiles would add requests without saving bytes.
- Caddy now sends a one-day `Cache-Control` for `/grid/`.

## [2026-11-09] update | Blend decoded grid years

Units and Grid now retain the displayed snapshot during loads and blend prepared
years over 300 ms. A Web Worker decodes, seeds and prepares binary rendering
attributes for neighbouring years in advance; the cache
retains five snapshots. An interrupted blend finishes before taking the latest
decoded request, keeping two GPU datasets and continuous brightness. GPU uploads
are staged in hidden chunks before a fade starts. Units draws a single union of
stable unit IDs, interpolating colours/radii on the GPU and keeping persistent
bands at full brightness. See the
[usage and verification instructions](../README.md#-how-to-use).
