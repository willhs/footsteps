---
id: terrain-bench
type: reference
purpose: "The terrain benchmark: how to run it, what each number means, today's baseline against the goal's acceptance numbers"
updated: 2026-11-21
---

# Terrain benchmark

`footsteps-web/scripts/terrain-bench.mjs` is the scoreboard for the goal "Footsteps: detailed terrain, sharp and
fast at every zoom". It drives a real (headed) Chrome over fixed camera positions and reports how long the terrain
takes to arrive, how smooth panning is, how much the main thread stalls, what it costs in bytes, and how big one
colour texel is on screen. Every terrain change is measured before and after with it (`--compare`).
It changes no rendering: it only sets the URL's `lat`, `lon`, `zoom`, `year` and (flat) `close3d=0`.

## Run

```bash
pnpm --dir footsteps-web build            # a static export in footsteps-web/out (data linked into public/, see footsteps-web/AGENTS.md)
node footsteps-web/scripts/terrain-bench.mjs --label "after X"
# options: --base URL (a running server instead of out/)  --build (run pnpm build first)  --out DIR
#          --scenes alps,nile  --zooms 8,10  --modes flat,3d  --no-warm  --headed  --max-load N  --max-wait SECONDS
node footsteps-web/scripts/terrain-bench.mjs --compare old.json new.json     # deltas, per variant
node footsteps-web/scripts/terrain-bench.mjs --query terrain_tiles=1 --label "pyramid on"   # a URL flag on one build
```

Without `--base` it serves `out/` itself with production-like headers (hashed assets immutable, data cached a day,
gzip). The full run is 40 variants and takes about 15 minutes on a quiet machine. Output goes to
`footsteps-web/terrain-bench-out/<time>-<commit>/` (git-ignored): `terrain-bench.json`, `terrain-bench.md`, and one
`shots/<scene>-z<zoom>-<mode>.jpg` per variant. The JSON is written after every variant, so a stopped run keeps what it has.

**Run it on a quiet machine.** Each result records the 1-minute load average when it started. Another job, a game or a
second browser at load 60+ makes cold times two to three times longer and fps a quarter (see "Noise" below).
`--max-load 16` waits (up to `--max-wait`, default 300 s) for the load to fall before each variant. It runs headless by default
so it never steals focus (headless Chrome measured 60 rAF/s on the Metal GPU, 2026-11-21); the baselines below were headed, so pass `--headed` to compare against them.

## What it measures

Scenes (flat map at zoom 4, 6, 8, 10, 12; the tilted 3D landscape too at 8, 10, 12, where the app switches it on):

| scene | year | camera (lat, lon) | why |
|---|---|---|---|
| Alps | 1000 CE | 46.55, 8.0 | high relief, snow line |
| Nile | 1500 CE | 25.7, 32.6 | desert valley, flat floor |
| Doggerland | 10,000 BCE | 54.8, 2.0 | exposed shelf, the coast the year's sea level draws |
| Amazon | 1000 CE | -3.1, -60.0 | low, forested |
| Mongolian steppe | 0 CE | 47.2, 102.8 | open, rolling |

Each variant is opened **cold** (a fresh browser context: empty HTTP cache) and **warm** (a second page in the same
context: HTTP cache full, in-memory caches empty). Per load:

- **Time to detail** (`timing.doneMs`, ms from navigation start; the URL places the camera, so that is arrival):
  the era image, the elevation tiles and the habitat lookup have all arrived (nothing in flight, 1.5 s quiet) and two
  animation frames have followed the last arrival (the first builds meshes and uploads textures, the second shows them).
  Flat maps stream elevation tiles too from zoom 5 (the relief shader), so they wait for them. Zoom 4 loads the era image only.
  It is a proxy for "drawn", read from outside: the app has no "all tiles drawn" signal. A load that never settles is marked `timeout` at 90 s.
- **fps**: `requestAnimationFrame` deltas during a fixed pan (a 600 px sine drag, 120 steps), with p95 and max frame gap.
- **Long tasks**: `PerformanceObserver('longtask')` (main-thread tasks over 50 ms), count and longest, while loading,
  **while streaming** (`streaming`: tasks overlapping the window from the first elevation or pyramid tile request to time to
  detail; added 2026-11-21, the goal check uses it, because the load window also caught the app's boot, React hydration,
  before any tile is asked for) and while panning (tiles stream in during the pan).
- **Headless fps**: headless Chrome on this Mac delivers frames on demand, in whole vsyncs (66.7 / 83.3 ms gaps), so a
  headless pan reads ~20-28 fps for every view, flat zoom 4 with no terrain included: it counts redraws, not render cost.
  Compare max frame gap headless, and fps only from headed runs (`--headed`).
- **Network**: requests and bytes on the wire for the load and for the pan, split into *terrain* (era image, elevation
  tiles, habitat lookup) and everything else. The app also warms every year's firelight and the neighbour terrain years in the background, which is in the totals.
- **Texel**: size of one terrain colour texel in screen px at the screen centre (`texelOf` in `scripts/terrain-bench-lib.mjs`).
  Today the colour is one 2048 x 1024 era image (its real size is read from the response), so a texel is a fixed ~19.6 km
  of ground: east-west it is `2^zoom / 4` px at any latitude, and 1/cos(lat) times that tall. Tilt makes the foreground coarser than the centre.
  `texelOf` takes a colour source: `{kind: 'era-image', width, height}`, or `{kind: 'tile-pyramid', maxZoom}` when the run fetched
  colour-pyramid tiles (`/terrain/detail/`, counted as terrain): the tile deck.gl draws (zoom round(zoom + 1), capped at 8), never finer than the 500 m photo.
  The elevation sample spacing (`demSamplePx`) is in the JSON too.

The pure parts (scene table, texel maths, timing, goal checks, compare) are in `scripts/terrain-bench-lib.mjs` and pinned by `lib/terrainBench.test.ts`.

## Baseline (2026-11-21)

Main at `5943d1f` (rendering as of then; the benchmark script itself is the next commit), Will's MacBook (Apple M5 Pro,
ANGLE Metal, Chrome 157, 1440 x 900), load average 8 to 16 during the run. The close-up ground-cover job (task 0db83375)
had **not** landed, so this is the baseline before it. Full table: [`terrain-bench/baseline-5943d1f.md`](terrain-bench/baseline-5943d1f.md),
data for `--compare`: [`terrain-bench/baseline-5943d1f.json`](terrain-bench/baseline-5943d1f.json).

Median and worst of the five scenes at each zoom:

| zoom | mode | cold s (median / worst) | warm s (median / worst) | fps pan (worst scene) | longest task ms (worst) | terrain MB cold (median) | terrain req cold | texel px (east-west) |
|---|---|---|---|---|---|---|---|---|
| 4 | flat | 0.26 / 0.29 | 0.24 / 0.29 | 136.8 | 250 | 1.5 | 8 | 4 |
| 6 | flat | 3.65 / 4.13 | 1.24 / 2.07 | 114.1 | 254 | 4.9 | 55 | 16 |
| 8 | flat | 3.78 / 4.53 | 1.28 / 1.51 | 118.5 | 116 | 4.3 | 53 | 64 |
| 8 | 3d | 3.48 / 3.78 | 1.05 / 1.23 | 118.9 | 154 | 4.7 | 58 | 64 |
| 10 | flat | 4.10 / 4.42 | 1.28 / 1.62 | 133.7 | 313 | 3.3 | 53 | 256 |
| 10 | 3d | 6.91 / 7.14 | 2.04 / 2.22 | 125.1 | 164 | 6.2 | 118 | 256 |
| 12 | flat | 3.58 / 3.91 | 1.26 / 1.44 | 129.2 | 179 | 2.8 | 53 | 1024 |
| 12 | 3d | 6.63 / 7.56 | 2.11 / 2.34 | 101 | 130 | 4.8 | 120 | 1024 |

Against the goal's acceptance numbers:

| check | target | baseline | |
|---|---|---|---|
| zoom 10 tilted: full detail, cold | <= 3 s | 7.14 s (worst scene; 6.7 to 7.1 s) | FAIL |
| zoom 10 tilted: full detail, warm | <= 1.5 s | 2.22 s (worst scene; 1.7 to 2.2 s) | FAIL |
| zoom 10 tilted: fps panning | >= 50 | 125 fps (worst scene) | pass |
| zoom 10 tilted: main-thread task while streaming | none > 50 ms | longest 164 ms; 1 to 9 long tasks per variant | FAIL |
| colour texel up to zoom 12 | <= 2 px | 4 px at zoom 4, 16 at 6, 64 at 8, 256 at 10, 1024 at 12 | FAIL |

What the baseline says:

- Panning is already fast on this machine (above 100 fps everywhere, at zoom 12 3D 101 fps worst). The goal's weak spots are **time to detail** and **long tasks**, not fps.
- Tilted 3D at zoom 10 costs about 118 terrain requests (~100 elevation tiles at tile zoom 11, ~5 to 16 MB cold) and 7 s cold; the same view flat is 4 s with ~53 requests. Flat maps from zoom 5 already stream elevation tiles for the relief shader.
- Warm (HTTP cache full) is 1 to 2 s but not instant: it is main-thread decode and mesh building, not network. A worker plus an IndexedDB height cache would show up here first.
- Colour is the larger miss: one era image gives 256 screen px per texel at zoom 10 (about 130 times the 2 px target).
- The Alps are the heaviest scene (16 MB of terrain cold at zoom 10 3D: 2.8 s slower than flat); Doggerland's and the steppe's smooth ground costs the least.

Two screenshots are kept here: [Alps zoom 10 tilted](terrain-bench/alps-z10-3d.jpg) and [Doggerland zoom 10 tilted](terrain-bench/doggerland-z10-3d.jpg). The rest stay out of git (they are in each run's `shots/`).

## Colour pyramid, tiles off vs on (2026-11-21)

Task 0006 (`docs/tasks/0006-terrain-tiled-colour-pyramid/`) adds the 500 m colour pyramid (`terrain-images.md`
"Detail tiles"). Both runs are one build of the branch (working tree on `5a31a5a`), Will's MacBook, headed Chrome,
off with `--query terrain_tiles=0`, on with the pyramid on (it was the default during the run; it is now
`--query terrain_tiles=1`). Load average 3–6 off, 4–8 on. A first off run at load 6–16 was thrown away: its tilted
times were 1–2 s slower from load alone. Data: [`tiles-off-5a31a5a.json`](terrain-bench/tiles-off-5a31a5a.json),
[`tiles-on-5a31a5a.json`](terrain-bench/tiles-on-5a31a5a.json), per variant: [`tiles-compare.md`](terrain-bench/tiles-compare.md).
Shots: Nile zoom 10 tilted, [era image](terrain-bench/nile-z10-3d-era.jpg) and [with tiles](terrain-bench/nile-z10-3d-tiles.jpg).

Median and worst of the five scenes (seconds), worst-scene pan fps, longest main-thread task, texel (east-west px):

| zoom | mode | cold off → on | warm off → on | fps worst off → on | longest task ms off → on | texel px off → on |
|---|---|---|---|---|---|---|
| 4 | flat | 0.15 / 0.16 → 0.67 / 0.82 | 0.11 / 0.12 → 0.66 / 0.76 | 139.5 → 139.3 | 54 → 66 | 4 → 1 |
| 6 | flat | 3.34 / 3.74 → 3.60 / 3.81 | 1.00 / 1.15 → 1.02 / 1.19 | 140 → 135.3 | 69 → 57 | 16 → 1 |
| 8 | flat | 3.66 / 4.01 → 3.60 / 4.35 | 1.01 / 1.14 → 1.03 / 1.14 | 140 → 135 | 76 → 67 | 64 → 2 |
| 8 | 3d | 3.31 / 3.46 → 3.17 / 4.11 | 0.75 / 0.86 → 0.77 / 0.87 | 136.2 → 125.8 | 77 → 90 | 64 → 2 |
| 10 | flat | 3.74 / 4.25 → 3.78 / 4.04 | 1.12 / 1.18 → 1.15 / 1.16 | 139.4 → 136.5 | 61 → 62 | 256 → 8 |
| 10 | 3d | 6.61 / 6.65 → 4.85 / 4.88 | 1.71 / 4.03 → 1.68 / 1.69 | 109.6 → 94.4 | 131 → 183 | 256 → 8 |
| 12 | flat | 3.60 / 3.84 → 3.61 / 3.66 | 1.07 / 1.12 → 1.03 / 1.14 | 138.1 → 136.6 | 92 → 92 | 1024 → 32 |
| 12 | 3d | 6.52 / 6.86 → 5.85 / 6.67 | 1.67 / 5.00 → 1.66 / 1.69 | 109.8 → 100.9 | 179 → 178 | 1024 → 32 |

- **Texel**: 32 times finer from zoom 8 up (64 → 2 px at 8, 256 → 8 at 10); one px to zoom 7. The goal's 2 px holds to
  zoom 8; past it the z8 tiles stretch (the 500 m photo runs out).
- **Close view time to detail**: tilted zoom 10 cold 6.6 → 4.9 s in all five scenes; the off rerun at matched load
  reproduced the 6.6 s, so it is not load. Why fetching more makes the tilted view settle sooner is not explained
  (the ground tile now waits for its colour tile, which may change how deck.gl schedules the elevation requests);
  treat it as measured, not understood. Warm and flat times are unchanged within noise.
- **Regressions**: zoom 4 now waits for the tiles (+0.4–0.7 s to full detail; the era image is still on screen at
  0.15 s). Tilted pan fps is lower in some scenes (Nile zoom 10 110 → 94, Alps zoom 12 118 → 101, Nile zoom 8
  136 → 126), still far above the goal's 50. Terrain bytes +0.3–0.7 MB cold per view.
- **Rollout**: behind `?terrain_tiles=1` (off by default), because the task allows a flag-free rollout only with no
  regression. Flip the default in `lib/terrainDetail.ts` `terrainTilesParam` once Will has looked.

## Close-up time to detail (task 0009, 2026-11-21)

Task `docs/tasks/0009-terrain-close-up-time-to-detail/` (plan, decision trail). What changed (`close-up-scene.md`
"How the ground streams in"): elevation tiles one zoom coarser at the same vertex spacing (a quarter of the requests),
spread over the S3 bucket's two hostnames (12 in flight instead of 6, the flat relief too), requested as soon as the
close-up is on instead of after the year's data decodes, meshed at most ~8 ms per frame with a cheaper mesh build,
far-tile LOD and skirts; the colour pyramid is not drawn under the close-up, draws one zoom coarser below zoom 4.5
(2 px per texel from a quarter of the tiles), and fetches its reference photo once.

**How measured.** One build each of main before (`9a291c4` rendering) and the branch, served from disk, run **headless**
(operator request: no windows taking focus; before and after both headless), interleaved per scene (before off, after
off, after on, before on) so the machine's load hits both alike, load average 3-8, Will's MacBook (M5 Pro, ANGLE Metal).
Zooms 4, 10, 12, flat and tilted, pyramid off and on. Data: [`close-before-t0.json`](terrain-bench/close-before-t0.json),
[`close-after-t0.json`](terrain-bench/close-after-t0.json), `-t1` for the pyramid on; per variant:
[`close-compare.md`](terrain-bench/close-compare.md). The colour pyramid tiles were the scene areas mirrored from prod
(the pyramid is not in the primary checkout's data); the Nile variants log one 404 on both builds (a file outside the mirror).

Median / worst of the five scenes (s), terrain requests cold (median: elevation and pyramid tiles, era image, habitat), longest main-thread task while streaming (ms, worst, cold and warm):

| view | pyramid | cold before → after | warm before → after | terrain requests cold | longest task streaming |
|---|---|---|---|---|---|
| zoom 10 tilted | off | 6.85 / 6.99 → **2.43 / 3.02** | 3.88 / 9.09 → **0.71 / 0.75** | 89 → 34 | 113 → 51 |
| zoom 10 tilted | on | 6.99 / 7.43 → **2.47 / 3.16** | 4.55 / 5.95 → **0.66 / 0.71** | 101 → 40 | 140 → 57 |
| zoom 12 tilted | off | 6.45 / 6.57 → 2.07 / 3.27 | 4.51 / 6.48 → 0.58 / 0.67 | 87 → 33 | 216 → 0 |
| zoom 12 tilted | on | 6.34 / 7.39 → 2.08 / 2.79 | 1.90 / 6.01 → 0.63 / 0.79 | 93 → 37 | 128 → 106 |
| zoom 10 flat | off | 3.97 / 4.08 → 2.79 / 3.82 | 1.32 / 3.36 → 0.76 / 0.83 | 43 → 43 | 0 → 0 |
| zoom 4 flat | off | 0.27 / 0.33 → 0.20 / 0.22 | 0.15 / 0.19 → 0.16 / 0.18 | 8 → 8 | 0 → 0 |
| zoom 4 flat | on | 0.78 / 0.96 → 0.57 / 0.74 | 0.84 / 1.35 → 0.49 / 0.57 | 40 → 19 | 59 → 191 |

(Before this run the warm times were 1.7-2.2 s; the higher "before warm" here is the busy disk cache of a loaded machine on
the old 90-tile path, not a change in the baseline.) A headed run earlier the same day, at load 7-31 and without the
hostname sharding, gave the same picture with real fps: tilted zoom 10 cold 6.91 → 3.50 s, warm 2.21 → 1.07 s, worst pan
fps 46 → 101 (pyramid off) and 38 → 112 (on); a headed A/B of the sharding alone at load 6-10 took tilted zoom 10 cold
from 3.1-3.2 s to 2.3-2.9 s in four scenes, fps 115-119 both (Alps on: 3.67 → 3.65 s).

Against the goal's speed targets (tilted zoom 10, worst scene):

| check | target | before | after (pyramid off) | after (pyramid on) |
|---|---|---|---|---|
| full detail, cold | <= 3 s | 6.99 s | 3.02 s (median 2.43) — FAIL by 0.02 | 3.16 s (median 2.47) — FAIL by 0.16 |
| full detail, warm | <= 1.5 s | 9.09 s | 0.75 s — pass | 0.71 s — pass |
| no main-thread task > 50 ms while streaming | none | 113 ms, 6 tasks | 51 ms, 1 task (Alps) | 57 ms, 1 task |
| fps panning | >= 50 | headed 46 | headed 101 (no sharding), 115+ (sharding, z10) | headed 112 |

- **The cold gap and its cause.** Three of five scenes are under 3 s; the worst (Alps) is ~3.0-3.2 s. What is left is
  round trips to AWS S3 in us-east-1 from New Zealand (0.4-1.2 s per tile, HTTP/1.1, 12 at a time now) for ~34-40 tiles,
  after the era image (~0.15 s). The next lever is the goal's "DEM tiles cached on budgie/Cloudflare" (HTTP/2, near):
  not in this task.
- **Long tasks left while streaming** (named from Chrome CPU profiles of single loads, headless, not committed): WebGL program
  linking the first time a layer type draws (`_getLinkStatus`, 180-250 ms, e.g. the pyramid's shader at zoom 4: the
  191 ms above), and React re-rendering the page when the year's people data arrives (50-150 ms). Mesh building no
  longer shows in any long task; the app's boot (React hydration, 0.2-0.4 s) is before streaming.
- **Ground**: same vertices and colours; screenshots before/after are pixel-identical for Doggerland and the UK at 50,000
  BCE; the Alps differ only in snow patches (the snow line's base height is a tile's mean height, and a tile is now 4 times
  the area, nearer the 0.5° cell its temperature describes).

**The colour pyramid (`?terrain_tiles=1`) against every target, after this task.** It no longer slows the close-up
(tilted cold and warm are the same as with it off, its flat tiles are no longer drawn under the 3D ground) and the tilted
fps regression is gone (headed: worst 112 on, 101 off). It still does not pass everything: zoom 4 reaches full detail
0.57 s (worst 0.74) after 0.20 s without it (+0.37 s, was +0.5; the era image is on screen at 0.15 s either way), one
191 ms shader-link task streams in at zoom 4, and the tilted zoom 10 worst cold time is 3.16 s. Its texel passes 2 px up to zoom 8
(2 px at zoom 4 now, from z4 tiles; it was 1 px from 4× the tiles) and is 8 px at 10, 32 at 12. It stays behind
`?terrain_tiles=1`; flipping the default is Will's call (`terrainTilesParam` in `lib/terrainDetail.ts`). The task's idea
of skipping it at zoom <= 4 "because the era image is as sharp" was not taken: the era image is 4 px per texel at zoom 4,
twice the goal's 2 px.

## Noise

A first full run on 2026-11-21 happened while the machine was busy (load average 60 to 118: another job's python at ~280 % CPU, a game and two browsers). The same scenes then took 6 to 21 s cold (Doggerland 3D zoom 8: 21 s, one 6.7 s long task) and 11 to 80 fps panning, against 3.5 to 7 s and 100 to 140 fps on the quiet rerun that is the baseline above. Compare runs only if both were taken at a similar, low load average (it is printed in the table's `load` column).
Other limits: a single run per variant (no repeats); the elevation tiles come from AWS S3, so their latency is the network's; the era images are served locally.
