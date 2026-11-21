---
id: docs-log
type: note
purpose: "Record implementation and documentation updates"
---

## [2026-11-21] feature | Past water: European LGM lakes and rivers, Mesopotamian coast stages (?pastwater=1)

Task 0011 (`docs/tasks/0011-past-water-lgm-europe-mesopotamia/`), research 0014 ranks 3-4. Both sources checked first: the CRC806
"LGM major inland waters of Europe" shapefiles are CC-BY (227 + 77 KB, pinned by sha256); Giosan & Goodman 2025 (PLOS ONE) is CC BY 4.0
but its SI holds no coastlines, so the three coast stages are traced from its Fig 6 and labelled interpreted. The past-water machinery
now takes several scenarios: the epoch is the unit (unique id, mask, optional freshwater-distance patch, level rule: plane, per pixel or
the sea), a year has a set of active epochs, and epochs active together never share a cell, so the ranker's one-byte cache still holds.
LGM: one snapshot, 26.5-19 ka BP only; lakes are wet, rivers and fresh lakes count as fresh water; no Black Sea in the data. Mesopotamia:
~7-8, ~6 and ~4 ka BP stages at the head of the Gulf, sea (not fresh). Real data: 0 groups in modelled water with the flag on at -20000,
-6000, -4000 and -2000 (14,242 / 4,002 / 4,119 / 168 off), people conserved (unplaced groups counted), nothing moved outside the regions;
controls unchanged. Flag off: no change (`pnpm visual`). Patches 105 KB fetched only with the flag; 8 new Earth frames (local only).
`docs/ops/past-water.md` rewritten for three scenarios.

## [2026-11-21] feature | Guided tour behind ?tour=1

Task 0010 (`docs/tasks/0010-guided-tour/`). With `?tour=1` a card at the top of the left column walks a first-time visitor
through nine stops: Africa at 100,000 BCE, the first people outside Africa (60,000 BCE), Sahul (46,000 BCE), the
Neanderthals fading (38,000 BCE), the Americas (12,000 BCE), HYDE's first year (10,000 BCE), the Nile (3000 BCE), Rome
(year 0) and the world in 1900. Each stop flies the camera, sets the year and gives two sentences, labelled measured or
modelled, whose numbers are computed from `PEOPLE_TOTALS`, `OTHER_HUMANS` and `seaLevelAt` or pinned to `arrivals.yaml`
by `lib/tour.test.ts`. Arrows step, Esc leaves; a drag, wheel or key stops a flight. `scripts/tour-shots.mjs` steps through
every stop on the real build with no console errors. Without the flag nothing changes (`pnpm visual`). The wording is a
first draft for Will: `docs/ops/tour.md`.

## [2026-11-21] update | Pre-HYDE model: research 0009 P5, P6, P8 and the rest of P9 applied, rerun and published

Three new optional `arrivals.yaml` row fields, read by `prehistory_population.py` ([task 0012](tasks/0012-pre-hyde-research-0009-rest/plan.md)):
`density_multiplier` (P5: `europe_west` at half density 26-20 ka; its 26-20 / 36-30 ka people ratio 1.49 → 0.78 against evidence 0.87 raw / 0.55 corrected,
22 ka people 196k → 104k, rank correlation with the evidence 0.30 → 0.69), `weight_evidence: none` (P8: eight rows; `totals.json` gains `unevidenced_share`,
40% at 20 ka, and the counter's range at 18,000 BCE goes 2.3–8.0 M → 1.8–11.2 M) and `hyde_after_arrival` (P9: Madagascar, the Caribbean and Arctic Canada
get no HYDE people before 10,000 BCE; was up to 806 / 638 / 6). P6: ramps steppe and central Asia 4 → 2 ka, east Asia 4 → 8 ka. P7 left alone, P10 not started;
`pacific_remote` (holds the Philippines) left in the blend. Reran `prehistory_population.py --verify` (28 of 90 images changed, central totals unchanged),
`model_vs_evidence.py`, `arrival_check.py` (unchanged) and `anthropology/deep.py`. Published with `GRID_ONLY=1 scripts/deploy-budgie.sh` from this job.
See [research 0009](research/0009-model-vs-evidence/research.md#after-p5-p6-p8-and-p9-2026-11-21).
Origin: all 90 images match `rerun-0012/prehistory-manifest.sha256`; prod smoke passes; `humans_-20000.webp` and `humans_-11000.webp` through Cloudflare match with a
cache-busting query, while the plain URL was still the old cached copy (24 h `max-age`, no purge credentials), so the new images show once it expires.

## [2026-11-21] feature | World population chart under the counter, behind `?chart=1`

A small SVG chart (300 × 70, the app's panel style, no chart library) under the counter in the time panel: world people on a log
scale (100k to 1B) over the time bar's own compressed time axis, 100,000 BCE to 1900. Before 10,000 BCE it shades the MODELLED
low-high band (dashed central line) and labels it "modelled"; from 10,000 BCE it draws HYDE's measured totals solid, labelled
"HYDE"; the slider year is a vertical line with a dot on the curve. Click or drag on it sets the year (the same scale as the bar,
so a year is the same fraction of both widths). Off without the flag: `PopulationChart` renders nothing, the DOM and `pnpm visual`
are unchanged.

One source of truth: `lib/populationSeries.ts` builds the series from `PEOPLE_TOTALS` (the counter's own table: the model's
low / central / high from `prehistory_totals.json`, HYDE's `HYDE_TOTALS`) and `posAt` / `timeAt` from `timeScale.ts`. The band
closes onto HYDE's figure at HYDE_MIN with one join point that is also the line's first point: no gap, no year drawn twice
(`lib/populationSeries.test.ts`). `node scripts/verify-chart.mjs <dir>` drives it in the real app (shots at 50,000 BCE, 5000 BCE,
1900, desktop and phone width; no chart without the flag; a click and a drag set the year). The app has one dark look, so no
light shots. Flagged until Will has looked; the time bar's comment already says population over time is the counter's chart.

## [2026-11-21] perf | Close-up 3D reaches detail in ~2.4 s cold instead of ~6.9 s

Task 0009 (`docs/tasks/0009-terrain-close-up-time-to-detail/`). Tilted zoom 10 waited for ~90 Terrarium tiles from AWS S3,
six at a time, and meshed each burst of tiles in one long task. Now the elevation tiles are one zoom coarser and meshed
every 2 pixels (the same ~300 m vertex spacing, a quarter of the requests), spread over the bucket's two hostnames (12 in
flight; the flat relief too), requested as soon as the close-up is on, and meshed at most ~8 ms per frame by a cheaper
builder (`lib/eraGround.ts`); far tiles of the tilted view merge into parents (`lib/demLod.ts`) and every tile has skirts.
The flat colour pyramid is no longer drawn under the close-up, draws one zoom coarser below zoom 4.5, and fetches its
reference photo once. The benchmark now reports long tasks while tiles stream (boot excluded).

Headless before/after on Will's MacBook (operator: no windows), interleaved per scene, load 3-8 (`docs/ops/terrain-bench.md`
"Close-up time to detail"): tilted zoom 10 cold median/worst 6.85/6.99 → 2.43/3.02 s (pyramid off) and 6.99/7.43 →
2.47/3.16 s (on); warm → 0.71/0.66 s; terrain requests 89 → 34; longest task while streaming 113 → 51 ms; headed fps
46 → 101 worst. The worst scene (Alps) still misses the 3 s cold target by 0.02-0.16 s: S3 round trips from NZ; budgie or
Cloudflare-hosted DEM tiles are the next lever. Remaining long tasks are WebGL shader linking on a layer's first draw and
React re-rendering, not terrain work. Ground is unchanged (Doggerland and UK 50,000 BCE screenshots pixel-identical; Alps
snow patches move a little because the snow line's base is a now-larger tile's mean height).

**Colour pyramid (`?terrain_tiles=1`) pass/fail, for Will to decide the default:** it no longer slows the close-up or its
fps (tilted cold/warm equal to off; headed worst fps 112 on vs 101 off), but zoom 4 is still 0.37 s slower to full detail
(0.57 vs 0.20 s; era image on screen at 0.15 s either way), a 191 ms shader-link task appears at zoom 4, and tilted cold worst
is 3.16 s. So it does not pass every target; it stays behind the flag (operator steer: Will decides defaults).

## [2026-11-21] feature | Group marks at middle zoom: signs and households instead of flat discs; a quieter time bar

Will saw big flat circles between the far-out firelight and the street-level footprints. A unit mark (MorphScatterplotLayer,
`unitMorphVertex.ts`) now changes with zoom in three steps, all in one shader: far out it is the flickering fire it was; from
about zoom 7 it turns into its kind's sign at a fixed size (a fire for a forager band, a tent for a herding camp, a house for a
farming village, three roofs for a small town); once its footprint is bigger than the sign (~7 px) it shows its households at
their real spread (hearths, tents, houses; about 60% of cells, never finer than 8 px so each reads as a house, ragged edge), over a faint wash. The kind
is read from the mark's colour (`VILLAGE_GREEN_CUT`, `BAND_GREEN_CUT`, tested against `LOOKS`), the head count from its radius.
Footprints are now about where people stand at street zoom (`FOOTPRINT_M`: band and camp 250 m, village 500 m, times
sqrt(people / typical)), not 600 / 900 / 1500 m. Towns and cities, grid glow cells and named Reba cities alike, are their built-up
area at 15,000 people per km² (`cityRadiusM`: Rome 100 CE ~3.1 km, not a 30 km disc) packed with roofs in a glow that runs well
beyond it; city names are a clean label above the town (count `~450k`, dim, from zoom 8) instead of "Rome / 450,000 modelled".
The legend uses the same signs (`WaySign.tsx`). Time bar: the faint population wedge, data-year ticks and the "modelled |
measured" words are gone from the track (measured years are a shade lighter, a hairline at 10,000 BCE, "· modelled" on hover;
population over time is the counter chart's job, `?chart=1`); the readout hides "sea ≈ today" (sea level shows when 5 m or more
off today) and the "data year" chip, says "estimated" only between data years, and loading is a small dot (detail on hover).

## [2026-11-21] feature | Climate-adjusted HYDE spread behind ?spread=1

The app now reads `hyde_climate_spread.py`'s adjusted images (Green Sahara, exposed shelves; regional totals kept) for
10,000–4,000 BCE when `?spread=1` is set, from `/grid/adjusted/` (a subfolder of budgie's existing grid mount, so no compose
or Caddy change). `lib/adjustedSpread.ts` owns the flag, years and words; the decoder marks `GridData.adjusted` only when the
image was read and its world total matches `HYDE_TOTALS` (else it draws HYDE's and the note says so). Units, Grid, the morph,
hover card, grounding panel and empty-view note follow; the counter note says "Adjusted spread (modelled on HYDE)", Dots says
it is not applied. Real data: world totals agree to 6e-5 every year; at 8,000 BCE the Sahara box goes 38,000 → 101,000 people
and the North Sea box 8,400 → 15,700; the -4,000 → -3,000 Sahara step is smaller with the flag (537k → 627k vs 242k → 627k).
`pnpm visual` without the flag: 7 pass, 3 (Rome grid, dots, person) fail identically on main's own build (stale baselines after
44db356's terrain-note change), so not this change. `deploy-budgie.sh` rsyncs `grid_adjusted` (never deletes); `smoke.sh` warns
while unpublished (prod: WARN). Publish after merge with `GRID_ONLY=1 scripts/deploy-budgie.sh`. Task 0007,
`docs/ops/hyde-climate-spread.md` "In the app".

## [2026-11-21] feature | Cited language expansions behind ?langs=deep (research 0007 steps 2-3)

`footstep-generator/anthropology/languages_expansions.yaml`: 33 hand-written rows. Step 2 covers historical and colonial
movements: Spanish (6 areas), Portuguese, English (4), Arabic (2) and Turkic (2). Step 3 covers deep-time expansions: Bantu (3),
Austronesian (6), Pama-Nyungan, Sino-Tibetan, Uralic, Quechua (2), Aymara, and Indo-European, Afro-Asiatic and Uto-Aztecan as
disputed rows with no area. Every source was fetched (Crossref + Europe PMC abstracts, one open full text, publisher pages): 12
rows checked, 21 `unverified` with the reason. Britannica, Te Ara, NZHistory and the NMA refuse automated fetches, so most
historical dates were read on Wikipedia only. `languages_expansions.py` validates the table and writes
`footsteps-web/public/languages/expansions.json` (6,579 bytes, 1,698 gzipped). The hover card adds "Languages spreading here:
Bantu (from about 4,000-5,000 years ago; Koile et al. 2022)" only with `?langs=deep`, only on land, never before 3050 BCE
(5 ka, enforced in the asset and again in the lookup). The atlas and the API are unchanged. Browser check
`footsteps-web/scripts/verify-language-expansions.mjs`: Mexico 1700, central Africa 1000 BCE and Anatolia 1200, plus 4000 BCE for the
floor, each with the flag on and off. Spec and plan: `docs/tasks/0008-languages-cited-expansions/`. See `docs/ops/languages.md`.

## [2026-11-21] deploy | Terrain colour pyramid published to budgie

Rebuilt `data/tiles/terrain/detail/` with `footstep-generator/terrain_tiles.py` from fresh Blue Marble 500 m
downloads (the earlier build lived only in a reaped worktree): 47,662 tiles + ref + manifest, 138.2 MB, the same
per-zoom counts as `docs/ops/terrain-images.md`. Rsynced to budgie `app/terrain/detail/` (the deploy script's
`detail/***` rule, run alone so no other data moved). Prod serves the manifest, ref and z7/z8 tiles as PNG/WebP, and
`?terrain_tiles=1` on footsteps.willhs.me draws the sharp tiles (UK 50,000 BCE z7). `scripts/smoke.sh` still printed
its "not published" warning: Cloudflare held a 404 for the bare `manifest.png` from before publishing, because the
Caddy `/terrain/*` rule gives 404s the same one-day `Cache-Control`. The app's `?v=2` URLs were unaffected. Fix
filed as Steady task 63cb97ee.

## [2026-11-21] feature | Terrain colour pyramid behind ?terrain_tiles=1

`footstep-generator/terrain_tiles.py` tiles NASA Blue Marble at 500 m into one year-independent Web Mercator pyramid
(z3–8, 47,662 tiles, 138 MB, alpha = today's land from Natural Earth 10m ramped inland). The browser recolours it per
terrain year as `photo × era ÷ ref` (`lib/terrainDetail.ts`, `layers/TerrainDetailLayer.ts`, and the close-up 3D
ground), keeping the year cross-fade and fetching no tiles on a scrub. Benchmark (tiles off vs on, matched load):
texel 64 → 2 px at zoom 8, 256 → 8 at 10, 1024 → 32 at 12; tilted zoom 10 cold 6.6 → 4.9 s; but zoom 4 waits
+0.4–0.7 s for tiles and tilted pan fps drops up to ~15 (still ≥ 94), so it ships behind `?terrain_tiles=1`.
Fine texture on past eras is today's ground, labelled imagined. Publish with `GRID_ONLY=1 scripts/deploy-budgie.sh`
(after merge). See `docs/ops/terrain-images.md` "Detail tiles", `docs/ops/terrain-bench.md`, task 0006.

## [2026-11-21] add | Screenshot regression: `pnpm visual`, ten fixed scenes compared with committed baselines

`footsteps-web/scripts/visual.mjs` opens ten fixed scenes (globe 1900; Rome 1000 BCE in Units, Grid and Dots; Nile 3000 BCE and Doggerland 10,000 BCE close-up 3D; UK 50,000 BCE empty-view note; Croatia 50,000 BCE other humans; the hover card; a selected person) in headless Chromium on the real GPU with real data, waits until each is settled (no requests, `main[data-loading]` off, the scene's own condition, three identical screenshots), and compares with `e2e/visual/*.webp` by pixelmatch (0.1 % of pixels allowed). A failure writes an expected | actual | diff sheet. New `?still=1` (`lib/still.ts`) stops the shader clock and pins the sun clock to one fixed day so pixels are stable. Elevation tiles are cached on disk (`visual-cache/`); data is found in this checkout or the primary checkout of a worktree. The static server moved out of `terrain-bench.mjs` into `scripts/static-server.mjs`. Not wired into CI: no GPU, no data in git. `docs/ops/visual-regression.md`.

## [2026-11-21] feature | A dated, shared Mega-Chad highstand behind ?pastwater=1

Research 0014's first build. `footstep-generator/past_water.py` flood-fills the Terrarium DEM at 329 m from Lake Chad (4-connected, inside a lid it must not reach): 358,873 km², against Armitage et al.'s 361,000. It writes a 646 B mask, an 8 KB freshwater-distance patch and a manifest (datum "metres above the geoid, not the year's ocean level", dates **calendar BP from 1950: 11.5–5 ka BP = -9550…-3050**, fresh water assumed, uncertainty listed) to `public/pastwater/`. One mask and one epoch function now feed the Earth picture (`terrain_image.py --pastwater`: 7 frames, full strength inside the window, nothing outside, no alpha fade), the ranker's wet exclusion and freshwater distances (`siteRanking.ts`: epoch-keyed cache, so a cell with no sea around it still re-ranks when only the epoch changes), and the close-up lake plane (`lakeVertices`: mask and DEM below 329 m, surface 329 m on the DEM's own datum, not `seaLevel`). Outside the window the scenario is inactive (geography unknown, not dry lakebed): -12000 and 0 draw and place exactly as without the flag, and the note says so.

Cell and world headcounts are untouched. A cell the lake covers has no usable spot: its groups are not drawn and counted in `Units.unresolved` (3,263 groups, 9,552 people at -6000, shown in the note), never forced into the water or dropped from the totals. A spot the lake touches at all is never a "doubtful shore spot" (a first build left 23 groups in lake pixels; real data now shows 0, by the ranker-free check in `past_water_check.py`, against 3,410 with the epoch off). Grid places nobody and says so; Dots is a static archive and says the model does not apply there. Real-data counts, bytes and screenshots in `docs/ops/past-water.md`. Flag off: nothing changes (the standard -6000 and -12000 frames regenerate byte-identical). No deployment; `deploy-budgie.sh` gained the pastwater frame rsync and the app falls back to the ordinary frame if one is missing.

## [2026-11-21] verify | Glottolog language baseline confirmed on production

Confirmed deployment of `9331154`: CI, image rollout, quick smoke and full smoke passed. The production anthropology API serves Glottolog 5.4 family counts and nearest languages for Oaxaca in 1500 and 1900 (194 languages, baseline year 1500), with no language value in 3000 BCE. The browser harness passed all five real-data scenes, including the absent line before 1500 and Atlantic-Congo at Lagos; screenshots retained with the follow-up job evidence. See `docs/ops/languages.md`.

## [2026-11-21] add | Hover card: a language line from Glottolog, a baseline for about 1500 CE (research 0007, step 1)

`footstep-generator/anthropology/languages.py` reads Glottolog 5.4 (Zenodo 24104033, CC BY 4.0, both files pinned by sha256), drops sign, pidgin, creole, artificial, post-1500 transplanted (27) and ancient written (124) languages, and adds a `languages` block to 804 of the atlas's 904 land cells: families with language counts and the 3 nearest languages within 500 km. The record serves it as `fields.languages` for eras 1500-1900 and says unknown before (nothing before 5 ka; no family colours on the globe). The left-column hover card shows "Languages recorded here (about 1500 CE): ..." from 1500, with a caveat that points are documented positions and later movement is not applied. `GET /api/anthropology` takes `&fill=0` (never calls the model; the card asks per cell as the cursor moves). D-PLACE societies carry their `glottocode` through `build.py`. Record size 641,973 -> 699,872 bytes gzipped (+9.0%). Fixed on the way: `build.py` took Seshat snapshots back to 100,000 BCE, so a rebuild differed from the committed atlas; it now reproduces it. Browser check on real data (Oaxaca 1500, 1900, 3000 BCE, 1400; Oyo 1500): `scripts/verify-languages.mjs`. Not done: colonial replacement (step 2), deep-time expansions (step 3), Seshat family normalisation. `docs/ops/languages.md`.

## [2026-11-21] feature | People's ages come from modelled life-course profiles by way of life (research 0006)

`people.ts` no longer draws every age from one rough structure. `demography_asset.py` compiles `demography.yaml` (new `sampling` block: bins, the editorial 50+ tail, a 2,000-year early-farmer window) into the validated `lib/demography.json`; `lib/farmingOnset.json` (the year crops first reach each 5° cell in the food model) is the regional transition evidence. A band uses the forager profile; a village uses early-farmer until 2,000 years after local crop onset, then agrarian (no calendar cut-off; no onset evidence: agrarian); herding camps have no researched profile and keep the old structure, labelled. Ages come from each person's own hashed stream (band by the share CDF, integer age within it, 50+ by the truncated exponential tail), so a profile change moves no position, sex or id. The adult anchor, minimum group sizes, caps and the 13/55 role cut-offs are unchanged. The person card says "Age drawn from the X scenario. Modelled age structure; individual speculative." and the grounding note no longer says "typical pre-modern population". Tests: fixed-seed repeatability, five-bin frequencies per profile over ~75,000 people, 80+ still possible, edges at 5/15/30/50, ids/coordinates/sex unchanged when the profile changes, profile choice by region and year; pytest that the committed asset matches the YAML. Browser check on real data (`scripts/verify-ages.mjs`): Kalahari 1800 forager band, Nile 1500 CE agrarian village, Levant 7000 BCE early-farmer village. `docs/ops/ages.md`. Open for Will: the herder profile, the role cut-offs, tail scale sensitivity.

## [2026-11-21] update | Pre-HYDE model: southern China split from mainland Southeast Asia (research 0009 P3)

`arrivals.yaml`: `southeast_asia_mainland` capped at 22°N (`[92, -2, 112, 22]`, still 70 ka), new `south_china` row (`[92, 22, 112, 28]`, `east_asia`'s dates, central 42 ka, ramp 8). Kunming, Guilin and Yuchanyan were in the 70 ka box although the oldest dated sites there are 34.0 and 21.5 ka. Reran `prehistory_population.py --verify`, `anthropology/deep.py`, `model_vs_evidence.py` (research 0009 charts and `results.json`, now 28 regions) and `arrival_check.py`. The three places first have people at 40,000 BCE (was 68,000); 36 of 90 images changed (68,000 to 33,000 BCE), `totals.json` byte-identical, mainland Southeast Asia south of 22°N moves only by the world rescale (+3-5%). The images are published after landing with `GRID_ONLY=1 scripts/deploy-budgie.sh`. See [research 0009](research/0009-model-vs-evidence/research.md#after-p3-southern-china-split-from-mainland-southeast-asia-2026-11-21).

## [2026-11-21] add | Close-up shelters behind ?shelters=1: dwellings from Ethnographic Atlas house codes

At street zoom (11.5+, flat map's 3D relief) `?shelters=1` draws one dwelling per household of each group in view, and dense roof clusters for glow cells and named cities, as six low-poly instanced shapes (windbreak, dome, cone, drum, gable, block) standing on the Terrarium ground height, never on water. The type is modelled: `Units.society` carries the analog society the settlement model drew each group from, and `public/dwellings.json` (15 KB, `settlements.py --dwellings`) holds its EA079/EA081/EA083 house codes; two dug types (mammoth-bone huts on the Russian Plain, Near East mud-brick) override where they cover the place, era and kind of group. Where each dwelling stands is imagined (its household's place). Hover one for "Like the X, recorded 19xx: ..." / "Imagined: ..." / "the ethnographic present is not the past"; legend and settlement note say the same. Off by default until Will reviews it on prod. `docs/ops/settlements.md` "Shelters in the close-up"; browser check `scripts/verify-shelters.mjs`.

## [2026-11-21] feature | Opt-in people figures and nearby animals

Added `?figures=1`: the newest footprint becomes an upright adult/child silhouette, with the remaining prints as its trail. The merged daily routine (`20d321b`) supplies sleep, rest, trip poses and carried equipment. Person objects, ids and picking remain unchanged, including other kinds of human.

Nearby GPU-animated animals use PHYLACINE ranges at their own cell and millennium; domestic herds require farmer/herder people and food-model availability. Counts and looks are imagined, bounded and capped. Species picking labels wild ranges and domestic spread separately. Footprints remain the default pending Will's review on prod. The real-data browser harness captures the four requested scenes, day/night, and measures street fps.

## [2026-11-21] add | Terrain benchmark: fixed camera paths with a baseline

`footsteps-web/scripts/terrain-bench.mjs` (pure parts in `terrain-bench-lib.mjs`, pinned by `lib/terrainBench.test.ts`) drives headed Chrome over 5 scenes (Alps, Nile, Doggerland, Amazon, steppe) at zoom 4 to 12, flat and tilted 3D from zoom 8, cold and warm. It reports time to detail, fps over a fixed pan, long tasks, network bytes and requests, and the colour texel in screen px, with a screenshot per variant, JSON plus a markdown table with goal checks, and `--compare old.json new.json`. No rendering changed. Baseline on main `5943d1f` (before the close-up ground-cover job): zoom 10 tilted takes 6.7 to 7.1 s cold and 1.7 to 2.2 s warm (goal 3 s / 1.5 s), 125+ fps panning (passes), longest main-thread task 164 ms (goal 50), colour texel 256 px at zoom 10 (goal 2). A first run on a busy machine (load 60 to 118) was 2 to 3 times worse, so each result records the load average and `--max-load` waits for quiet. `docs/ops/terrain-bench.md`.

## [2026-11-21] update | People follow a daily routine at street zoom (?routine=1)

Will asked for humans with a basic state and a plausible routine from anthropology. Behind `?routine=1` (off until reviewed on prod), each person at street zoom is asleep, at the hearth, playing (children), or away on a trip (gathering, hunting, fishing, fields, herding, water and wood, visiting another camp) by the local sun time. A `DayPlan` per person per hour (`lib/routine.ts`, seeded by the spot hash, tilted by way of life, role, sex and age; sleep, day length and food-getting hours from `time_use.yaml`, a test fails if they drift) reaches the footprint shader as two attributes and the sun hour as a uniform: sleepers stand still with paired feet, trip people walk a straight road at 1.2 m/s to a spot 0.2-15 km away, work a small loop there and walk back. The name tags follow people along their trips and the person card says what they are doing now, labelled imagined ("the pattern is modelled from time-use studies, this person's day is not known"). `?utc=` and `?warp=` bend the sun clock (stats panel, Day/night shading and the routine) for checking day and night. Seen on a Nile 1500 CE village, night and midday. Existing behaviour found: bands under 15 people draw no individuals at street zoom (Kalahari 1800 CE), so no forager band could be shown in the browser. `docs/ops/routine.md`.

## [2026-11-21] research | Past terrain and water sources

- Research 0014 (`docs/research/0014-past-terrain/research.md`) compares ice/GIA/regional sea level, lakes, shelf drainage and Holocene delta sources, including licences, grids, epochs, sizes, pipeline consumers and unresolved access.
- Corrects the premise: Mega-Chad is already painted, but does not feed water distances or lake exclusion. `2028734` only hides modern coastline lines.
- Recommends a shared Mega-Chad water model first; filed headless M task `eb6ee923-1664-439e-ab09-72bc149aee6c` under the close-up goal, default off behind `?pastwater=1`. No app or production data changes.

## [2026-11-21] add | Close-up 3D ground cover by biome behind `?ground=1`

The zoomed-in ground now reads as its biome instead of flat era-image colour, behind `?ground=1` (off until Will reviews it on prod). Each ground vertex carries a `Cover` from its Krapp biome, the snow line and low flat ground (`coverFor`, `lib/close3d.ts`); a deck.gl extension (`layers/groundDetail.ts`) paints it in the fragment shader: grass patches and clumps, a lumpy tree canopy for forest (sparse crowns for savanna), sand dunes and ripples, cracked ice, reed and pools on low flat ground, banded rock on steep slopes. No new download; the old plant marks stay off (`?plants=1`). Pattern size follows the pixel (a lattice never under ~3 px), so it stays visible at zoom 10-12 without shimmer. The "3D:" note says "surface imagined" and its hover text says the biome is modelled and the pattern imagined (`close3dNote`). Before/after shots for Amazon, Sahara, Mongolian steppe, Scandinavian ice and Mesopotamian marsh at zoom 10 and 12 came from the new `scripts/measure-ground.mjs`; frame rate with the flag on or off is inside the noise (mean 19.9 vs 21.6 fps at zoom 10, 15.8 vs 15.3 at zoom 12). Wet ground is a geometry rule (low and flat), since the elevation tiles carry no rivers. `docs/ops/close-up-scene.md`.

## [2026-11-20] change | Other kinds of human walk at street zoom like our own people

Will asked for footsteps and "the rest of the human things" when zoomed in. At street zoom each guessed band in view becomes its ~15 people in lavender footprints (`walkersOf`, `PeopleLayer`), with name tags and the same click card, which names their kind and says the band is a guess. "Imagine their day" sends `kindOfHuman`: the day API names the kind, drops our own head counts and recorded-forager analogies, and limits the day to what archaeology supports. The portrait is still our generic template ("not a likeness"). `docs/ops/other-humans.md` "Walkers".

## [2026-11-20] add | "No one here at this date" note for an empty view

A blurry, empty close-up (UK, 50,000 BCE) read as still loading. `lib/emptyView.ts` totals the people in cells inside the view box (pitch included, half a cell of margin, dateline-safe) and counts other-human bands; when no one of our species is there, the left column says whether the model or HYDE puts no one in view, or that the lavender sparks are another kind of human. Shown only zoomed in (≥ 4), on the flat map, once the year's data has loaded; checked 400 ms after the view settles. Checked: UK 50,000 BCE (note), Croatia 50,000 BCE (other humans only), central Africa (no note).

## [2026-11-20] change | Modern coastline lines off by default

Will saw solid lines over the UK at 50,000 BCE, zoom 7: the faint modern coastline (Natural Earth 110m, `useTerrainLayers.ts`), whose long straight segments show close in and sit inland in the Ice Age. Off now; `?coast=1` draws it. Checked at the same time: that view is fully drawn after ~10 s (no pending requests; zoom 7 is below the 3D close-up, so no elevation tiles); it looks unfinished because the era image is ~20 km per pixel and the model has no one in Britain then (hover card: "No one modelled"). The sharpness is goal 4cb72add.

## [2026-11-20] change | No floating pop-ups: the left column shows what is hovered or selected

Will: no hover modal, just the left info panel for whatever is hovered or selected. The other-human site/band card (`OtherHumansTooltip`), the dated-evidence card (`EvidenceTooltip`, `?evidence=1`) and the Dots click popup (`PopulationTooltip`, now read through `useTooltipData`) render in the left column instead of at the cursor. One at a time: a hovered site, band or mark beats the place card; over the column itself nothing is hovered, so the legend returns. `getTooltipPosition` is gone.

## [2026-11-20] change | Other kinds of human drawn like our own people

Will saw sparkling fires for our people and static triangles with name labels for Neanderthals, and asked for them not to differ in so many ways. The bands now use the people's own `FireLayer` sprite, size and flicker, thinned far out by the same people-per-fire and zoom rule (`peoplePerFire`, `fireVisibleFraction`; all bands from the groups zoom), so colour is the only difference. The shapes (▲ ■ ✦ ★) and the name labels are gone; the hover card names the species and when it was last seen. `docs/ops/other-humans.md` "Bands".

## [2026-11-20] change | Other kinds of human drawn as guessed bands, not areas

Will asked for the other humans to be drawn like the people: points, even if guessed. The hand-drawn ranges moved to `footstep-generator/other_humans/bands.yaml` with guessed numbers (Neanderthals 20,000 inside Bocquet-Appel & Degioanni's 5,000-70,000; Denisovans 10,000, Flores 500, Luzon 1,000, all said to be guesses) and a band of 15 (Skov 2022). `other_humans_bands.py` spreads the bands by the pre-HYDE habitat model inside each range, on dry land at each 1 ka step's sea level, with stable cells so bands persist (`public/other_humans/bands.json`, 97 KB). The app draws one mark per band, ▲ Neanderthals, ■ Denisovans, ✦ Flores, ★ Luzon, hoverable, thinning out band by band as a species fades. `docs/ops/other-humans.md` "Guessed bands".

## [2026-11-20] change | Hover card docked in the left column; plant marks off

Will asked to dock the hover card in the left pane and to drop the trees unless they could look much more real. The card now sits in the left column (`FootstepsViz.tsx`) in place of the legend while the cursor is on the map; over the column the card goes and the legend returns, so "About the data" stays reachable. It shrinks to fit (ground picture capped at 22vh); on a ~715 px tall window the lower rows (regional group, animals) are cut. The column's top tracks the stats panel's measured height (`--ov-stats-h`), and the settlement note is in the column's flow above the card instead of absolute. The close-up 3D plant marks (cones and blobs) are off; `?plants=1` draws them, and the 3D label reads "3D: ground measured". The cursor-anchor helpers (`cardAnchor`, `cardHeightFor`) are gone.

## [2026-11-20] change | Settlement model is now the default Units view

Will asked to make `?settlements=1` the default after the rows, panel and largest-settlement fixes. `lib/settlements.ts` `settlementsFromParams` (used by `FootstepsViz.tsx` and the grid worker) is now on unless `?settlements=0`; `?settlements=1` and `?seasons=1` still turn it on. The panel reads "Settlements · modelled" (was "Settlement experiment"). `?settlements=0` keeps the old even-groups path byte-for-byte. `docs/ops/settlements.md` "Turn it off", `scripts/verify-settlements.mjs` (baseline scene is now `settlements=0`).

## [2026-11-20] fix | Smoke retries the API check through the Watchtower restart window

The live smoke got a 502 from /api/anthropology because the API container restarts separately from the web one. scripts/smoke.sh now retries that request for ~2 minutes (curl --retry-all-errors).

## [2026-11-20] update | Groups no longer line up in rows under ?settlements=1

Will's screenshot (Italy 1000 BCE, zoom 7) showed groups in a grid. Premise checked and quantified first: `siteRanking.ts` ranked a cell's 16 spots by a score that ties or follows a smooth interpolation slope on flat inland ground (the water layer is one value per 5′ cell, the slope a 2.5′ class), and ties kept index order, so the best spot was a corner of the cell: candidates 0/3/12/15 won 65 % of first groups (25 % if even). Measured with a new `siteRegularity.ts` (nearest-neighbour spread, Clark-Evans, and a square order: how often nearest neighbours lie on the grid axes): square order 0.45 (Italy 1000 BCE) and 0.42 (Nile 1500 CE) with `?settlements=1`, against 0.13 and 0.11 for `?sites=0`. Fix, behind the flag only: candidates now cover the whole cell (middle 80 % of each stratum, was ±0.45) and the score gets a stable per-(cell, spot) factor of 1 ± 0.35 (±0.2 left the square order at 0.15-0.19). After: 0.144 and 0.139, cv 0.56 and 1.02, no rows in the screenshots flat or in 3D. Cell totals, group counts, ids and the stability of a group's spot across years are unchanged (tests). Group counts per cell stay exact on purpose: the metrics show per-cell exactness did not force a lattice once spots and noise were fixed, and varying counts would break cell totals and the morph's ids. The clustered-point-process option is written up as research 0012 follow-up 5, not built. `docs/ops/site-terrain.md` "Regularity", `scripts/verify-regularity.mjs`, `settlementRegularity.real.test.ts`.

## [2026-11-20] change | Settlement experiment panel collapses to one line

Under `?settlements=1` the "Settlement experiment · modelled" note is one line until tapped (`SettlementNote.tsx`). Expanded it is seven short plain-word lines; Pin keeps it open on later visits (localStorage, try/catch), Close folds it. Checked flat and phone width.

## [2026-11-20] fix | Capped the "largest settlement around here" figure (?settlements=1)
Central Italy 1000 BCE showed "about 36,000" on a foraging-with-a-little-farming cell. `lib/rankSize.ts` now: gives no figure unless the hovered cell is farmer or urban; uses a ~150 km block (level 4) instead of ~590 km; caps the tail at the biggest Reba city within 1,500 km that year (if above 5,000) else at a 5,000 town ceiling (`TOWN_CEILING`); never goes below the HYDE town cell under the cursor; a named city in the block still wins. The card line says what bounded it. Checked against the catalog: Italy 1000 BCE → 5,000 ceiling; Nile 1500 CE → Cairo 400,000; Mesopotamia 3000 BCE → Uruk 40,000; Rome 1 CE → Rome 800,000 (named). The cap numbers are assumptions (the ceiling is a round figure for the largest Neolithic/Bronze Age towns), not data.

## [2026-11-20] update | Farm settlement layouts by EA030 and a largest-settlement hover line (?settlements=1)

Research 0012 follow-up 4 (options A then B), behind `?settlements=1` only. A: each farming group takes the EA030 settlement pattern of the analog society it was drawn from; dispersed homesteads scatter (farthest free ranked spot), hamlets cluster (later houses 450-650 m from the first), villages and complex societies stand apart on the best ranked spots (what every group did before). Only positions change; totals, counts, ids and sizes are untouched, and the group's place depends only on the groups before it. B: the hover card gains "Largest settlement around here: about N people" from a rank-size tail over the ~590 km block (`lib/rankSize.ts`), exponent 0.6 / 0.7 / 0.8 for dispersed / hamlet / village regions, mixed by the analogs and labelled assumed and imagined; a named city or HYDE town cell in the block is a floor. The task's premise that NW Europe is a dispersed-farmstead region was false: the catalog gives it (and Rome and the Nile) only villages and complex societies, so those look as before; hamlet regions are the Sahel and SE Asia, dispersed the Amazon, Melanesia and tropical Asia. The exponents are assumptions tuned by eye to two places, not a fit. Hover-card height is now reserved per row (the new row ran off a 900 px window). Not done: street-zoom household spacing by layout; cells still cap at 4 farming groups. `docs/ops/settlements.md`, `scripts/verify-layouts.mjs`.

## [2026-11-20] update | Households and a hover-only regional group (?settlements=1)

Behind `?settlements=1` only. At street zoom a group's people now stand in households of 2-7 (mean 4.51, Binford 4.48 as cited in research 0012) round the group's ranked spot, laid out on a sunflower spiral (`layers/households.ts`, `people.ts`); age, sex, role and footwear are unchanged and person *i* never depends on group size, so the year morph's steady/leaving/entering split holds. The level above is a regional group of about 840 people (Binford 839): a block of 2^k x 2^k HYDE cells, nested and year-independent, sized to the smallest block that holds that many (`lib/regionalGroup.ts`); none is modelled where one cell already holds over 3,360 or the land is nearly empty. It is drawn only as one soft tint for the hovered or selected place (`layers/regionTint.ts`) with a hover-card line "Part of a regional group of about N people" (modelled); the legend says layout and edge are imagined. Checked in a real browser (`scripts/verify-households.mjs`): a forager band at 11,000 BCE and a 1500 CE village, flat and 3D, 110-120 fps. Deep-time sparse cells (Ohalo II, 21,000 BCE) never hold a group of 15, so no individuals appear there. See [settlements](../ops/settlements.md).

## [2026-11-20] update | Modelled Ice Age people only on land sub-cells

`gridData.ts` no longer shares a 0.5° modelled block's people equally over its 36 five-minute sub-cells: it gives them only to the sub-cells that are land at `seaLevelAt(year)`, read from the baked site terrain (`hooks/landSubcells.ts`; a sub-cell is land when under half of its 2 × 2 terrain pixels are sea). Block totals are now exact (no re-rounding to encoding levels), a block that is all sea at that level keeps its people (`GridData.seaBlocks`: 1 at 21,000 BCE). At 21,000 BCE people on wholly-sea sub-cells go 70,606 → 302, cells 1,175,040 → 1,156,314, the world total moves 0.03 % (3,703,509 → 3,702,465) as the old rounding goes; with `?settlements=1` groups in the sea there go 867 → 38. App-side only: `prehistory_population.py`, the images and `totals.json` are untouched, nothing to republish. The terrain image is now fetched for every modelled year. Checked in the browser at 21,000 BCE on Doggerland, the Sunda shelf and the Bay of Biscay coast. See [prehistory population](../ops/prehistory-population.md) and [site terrain](../ops/site-terrain.md).

## [2026-11-19] update | Ranked, stable group spots on land near water (?settlements=1)

`?settlements=1` now puts group *k* of a cell at the cell's *k*-th ranked spot (16 candidates: flat ground x near fresh water x near the year's coast, never in the sea or a lake at that year's sea level) instead of a seeded random point; the default Units path is unchanged and `?sites=0` keeps the old positions. Baked `footsteps-web/public/sites/site_terrain.webp` (2.4 MB, 2.5' grid, Terrarium z6 + Natural Earth land and lakes) with `footstep-generator/site_terrain.py`; the ranker is `layers/siteRanking.ts`, cached by cell id in the grid worker. Measured first on the real data: 42,738 of 2.6 M groups were in the sea in 1900 CE (46,746 by Natural Earth's polygons); now 13,924 (10,508 by the polygons), not zero: the coast is only known to 4.6 km and about 3,970 cells have no surely dry spot; the modelled 21,000 BCE image puts 17,862 sub-cells' people in the sea, which a placement change cannot fix. First year load costs about 17 s more in the worker, later years under 1 s. See [site terrain](../ops/site-terrain.md).

## [2026-11-19] update | Published the Hokkaido/Ryukyu prehistory rerun to budgie
Regenerated the 90 modelled-population images (all matched the research 0013 manifest) and rsynced them to budgie; only `humans_-36000.webp` to `humans_-26000.webp` changed. Origin and public bytes match. No Cloudflare purge issued (no credentials). See [research 0013](research/0013-arrivals-deep-past-source-check/research.md#rerun-2026-11-19).

## [2026-11-19] update | Prehistory model rerun for Hokkaido 38 -> 30 ka

Reran `prehistory_population.py --verify`, `anthropology/deep.py` (full), `model_vs_evidence.py` and `arrival_check.py` against `arrivals.yaml` at `7e31399`. Hokkaido is empty until 28,000 BCE (was 36,000); 11 of 90 images changed (36,000 to 26,000 BCE), the other 79 are byte-identical; world totals and `totals.json` unchanged; the Ryukyu 38 -> 36 ka edit from the same commit also shows. The atlas `deep` cells were refreshed (only `people` changed). The images still need publishing from `main`. See [research 0013](../research/0013-arrivals-deep-past-source-check/research.md#rerun-2026-11-19).

## [2026-11-19] update | Baked a river and lake distance layer for placing groups

`footstep-generator/water_distance.py` turns Natural Earth 10m rivers, lake centerlines and lakes (v5.1.2, pinned sha256, public domain; saline lakes left out) into one
year-independent lossless WebP: great-circle distance from each HYDE 5′ cell to the nearest fresh water, 8-bit on a square-root scale (31 m steps near water, 2,000 km at the top,
code 0 = water in the cell). 5′ not 2.5′: 872 KB against 2.47 MB. Committed at `footsteps-web/public/water/` with a JSON sidecar, so no deploy-script or compose change; Caddy
caches `/water/*` like `/ground/*`. The distance is a numpy jump flood ranked by haversine; two rounds match brute force on 4,000 sampled cells. HydroRIVERS not used (agreement unread).
Present-day courses only: the Green Sahara is a documented caveat with an `--extra-water` hook, nothing palaeo invented. No app code reads it yet (research 0012 part 2).
See `docs/ops/water-distance.md`.

## [2026-11-19] update | Checked the memory-only entries in arrivals.yaml and deep_past.yaml

Looked up every `verification: memory` entry (15 arrival regions, 8 habitat rules, 31 technocomplexes, the biome-prey block).
None is left as `memory`: each is `checked` (DOIs in `source`, all 141 DOIs resolve in Crossref) or `could_not_verify` with a reason,
and a `could_not_verify:` sentence lists the details no paper was found for; the atlas passes it into each field's note. Fixed
wrong citations and values (Burney/Dewar Madagascar, Kostenki, Tolbor, Bourgeon, Chusang, Japan dates, Lapita, Tallavaara's
"ka" that were people, Cueva de los Aviones 50 ka not 115, Mezhirich 18 ka not 15, the eyed-needle "first", the Fort Rock sandals
mis-placed at Paisley). **Hokkaido's arrival moved 38 → 30 ka** (Nakazawa 2017); with Madagascar, Caribbean and Pacific changes
(after the model window) it is listed in `docs/research/0013-arrivals-deep-past-source-check` as a population-model rerun follow-up; the
model was not rerun. `deep.py --tables-only` refreshes the committed atlas's table sections without the model data.

## [2026-11-19] update | Food table: recalled dates looked up, 56 of 531 claims checked

Every origin and every other dated claim in `footstep-generator/food/` was looked up (Crossref and Europe PMC abstracts, a research agent for pages the abstracts missed). 56 claims are now `checked` (was 19), each with a DOI or URL in its `source`; the 8 origins and 35 other dated claims that could not be confirmed carry `unverified`, the reason; fronts and historic dates keep a default reason (`model.NOT_VERIFIED_DEFAULT`). Two tests enforce this, so a recalled figure cannot pass as a checked one. The forager table is marked could-not-verify (books). Wrong values fixed, several moving the first-appearance era: potato 8.0 → 5.0 ka (no directly dated find is older than ~5.4 ka), cassava in Mesoamerica 4.6 → 6.5 (4600 BC misread as 4.6 ka), broomcorn millet origin 8.7 → 10.0 and Europe 6.0 → 3.6, common bean in the Andes 2.5 → 5.0, sorghum 4.5 → 5.0, donkey 6.0 → 7.0, water buffalo (Yangtze 7.0 ka removed; Indus 4.5, SE Asia 3.0), guinea pig 6.0 → 5.0, soybean in Japan 5.0, wheat in China split (lower Yellow River 4.6, Gansu 3.9), dingo 3.35, dromedary 3.0, Ganges rice demoted from a second origin to a spread. Several citations were wrong (Kwak 2009 is Crop Science, Kaplan & Lynch 1999 is Economic Botany, Lee 2011 is PLoS ONE, Balme 2018 is Scientific Reports, Hather & Kirch is Mangaia). The hover row now says "checked" / "not verified" instead of "checked summary" / "recalled". `food.json.gz` and the web export were rebuilt in the job workspace but are git-ignored: publish with `GRID_ONLY=1 scripts/deploy-budgie.sh` from the home network. Details: `docs/ops/food.md`, "Verification pass".

## [2026-11-19] update | Checked the recalled sources in the footwear and other-humans tables

Looked up every citation written from memory. `lib/footwear.ts`: the ~40,000-year footwear start is Tianyuan 1
(Trinkaus & Shang 2008), not Trinkaus 2005, which finds footwear frequent only by ~30–26 ka in western Eurasia; Fort Rock
sandals (10,500–9,300 cal BP, Connolly & Cannon 1999), Areni-1 (3627–3377 cal BC, Pinhasi 2010) and Otzi (~3300 BC) confirmed;
Han stitched shoes and a separate heel could not be verified, so neither is claimed. `lib/otherHumans.ts`: each of the 24 sites
and four species now has a DOI and is either checked or says why it could not be (`couldNotVerify`, shown in the tooltip);
fixed ranges for 12 sites, two wrong coordinates (Mandrin, Teshik-Tash), the Chagyrskaya head-count, the Kebara hyoid
claim and the "Welker 2024" Baishiya citation (Xia et al. 2024; also in `arrivals.yaml`). Tests now fail on an unexplained
unchecked entry and when the end dates drift from `arrivals.yaml`. See `docs/ops/other-humans.md`.

## [2026-11-19] feature | Marauder's Map name tags beside walking people

At the closest zoom (from ~16.6, full at 17.4, flat map) each of up to 150 people nearest the view centre gets a small warm tag
"role, age" beside their newest footprint, e.g. "potter, 34", fading in with zoom. Imagined, like the people. Tags skip overlaps
in screen space, prefer people tagged last time (no flicker), and in the tilted close-up 3D view drop tags the perspective would draw
too small to read. To follow a walker, `lib/gait.ts` ports the shader's footprint gait to TS (pinned by `lib/gait.test.ts`; the two
carry a "keep in sync" comment). GPU `sin` hashes differ between cards, so the per-person hash is now computed in TS
(`Person.gait`, `gaitSeed`) and read by the shader as an attribute; people's walks changed pattern once but are as stable as before.
Tag positions update every 200 ms as data only (no layer rebuild). `?tags=0` turns them off. Checked in the browser: flat and 3D
village (1500 CE, Nile delta), a 14,000 BCE band; ~140 fps with and without tags. See `footsteps-web/AGENTS.md`.

## [2026-11-19] research | Better human groups: placement, nesting, hierarchy, polities

Research note `docs/research/0012-group-structure/research.md` (no app code). Groups in a cell are not "evenly spread": `settlementUnits.ts` clumps them at two random anchors
per cell and neither builder tests land or water. Only sub-cell data (Terrarium slope, distance to water, the year's coast) can move a group, since HYDE, biome and climate are
cell-sized or coarser and cell totals are fixed. Recommended first build: a ranked, year-independent site list per cell (group k sits at site k, so scrubbing and ids stay
stable) behind `?settlements=1`, plus a baked river-distance image. Nesting uses Hamilton et al. 2007 Table 1 (4.5 / 15.6 / 53.7 / 165 / 839, ratio about 3.8) and shows one extra
level at a time. Polities: no borders (vision), at most a baked hover-card name from Cliopatria (CC BY 4.0, verified). Four follow-up tasks outlined; unresolved licences listed.

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
