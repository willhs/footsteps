---
id: first-load
type: reference
purpose: "What a cold first visit costs (JS bytes, first globe, first people, long tasks), how to measure it, and what keeps it down"
updated: 2026-11-22
---

# First load

How long a first-time visitor waits, on an empty cache, before the globe and then the people are on screen.
Task 0014 (`docs/tasks/0014-first-load-time-to-first-people/`).

## Measure

```bash
cd footsteps-web
pnpm build
node scripts/first-load.mjs                                   # out/ served like prod (gzip, cache headers) + real data; desktop and fast4g, 3 runs
node scripts/first-load.mjs --app ../old-out --label before   # another build, for a before/after pair on one machine
node scripts/first-load.mjs --base https://footsteps.willhs.me
node scripts/first-load.mjs --flags                           # each opt-in loads its code; none is in the default first load
```

Each run is a new browser context (empty HTTP cache, no service worker) on the real GPU, headless.

- **first globe**: User Timing mark `footsteps:first-globe`, set in the first deck.gl frame drawn after the Earth layers
  are handed to deck (`lib/firstLoadMarks.ts`, `FootstepsViz` `onAfterRender`).
- **first people**: mark `footsteps:first-people`, the first frame after the year's people layers (firelight, grid, units or
  Dots) are handed to deck. Both are visible in DevTools' Performance panel too.
- **people images in**: when both opening years' people images had downloaded (the only "people" number for a build
  without the marks: `--no-marks`).
- **JS wire / parsed**: transfer size and decoded size of the scripts that arrived before first people (main thread;
  the grid worker's own script is not counted).
- **long tasks**: main-thread tasks over 50 ms before first people; blocking = the sum of each beyond 50 ms.
- Profiles: `desktop` unthrottled; `fast4g` = 9 Mbps down, 1.5 Mbps up, 150 ms RTT and 4× CPU slowdown.
- `--flags` loads each opt-in (close-up 3D, `?shelters=1`, `?figures=1`, `?terrain_tiles=1`, `?evidence=1`, `?tour=1`,
  `?chart=1`, `?bar=old`, `?mode=dots`) and looks for a string from its own chunk; the default visit must not carry it
  before first people. `?terrain_tiles=1` needs the pyramid, which is only on prod: copy its `manifest.png?v=2` and
  `ref.webp` into a folder and pass `--serve-extra /terrain/detail=DIR`.
- `BUNDLE_REPORT=file.json pnpm build` writes every client chunk's modules and sizes (`next.config.js`), to see what a
  chunk carries.

## Before and after (task 0014)

Default visit (globe, 1000 BCE), local static export with real data, same MacBook, 5 cold runs, medians,
2026-11-22. Before = main `675a6b3` plus the marks only.

| profile | build | JS wire | JS parsed | first globe | first people | long tasks (max, blocking) | bytes to first people |
|---|---|---|---|---|---|---|---|
| desktop | before | 689 KiB | 2,447 KiB | 0.36 s | **4.74 s** | 4 (129 ms, 119 ms) | 10,251 KiB |
| desktop | after | 437 KiB | 1,443 KiB | 0.37 s | **0.74 s** | 3 (85 ms, 56 ms) | 8,115 KiB |
| fast4g | before | 689 KiB | 2,447 KiB | 3.21 s | **13.70 s** | 8 (261 ms, 457 ms) | 8,370 KiB |
| fast4g | after | 437 KiB | 1,443 KiB | 3.58 s | **5.57 s** | 4 (103 ms, 80 ms) | 4,840 KiB |

Initial scripts: 14 files, 2.59 MB raw / 728 KB gzip → 11 files, 1.56 MB / 471 KB. Next's "First Load JS" for `/`:
683 kB → 427 kB. Desktop first-people runs varied 3.8–5.2 s before (machine load), 0.6–1.3 s after.

Prod before (`675a6b3`, no marks, 3 runs, 2026-11-22): JS 707 KiB wire / 2,447 KiB parsed; people images in 0.47 s desktop,
5.84 s fast4g. Prod after: run `node scripts/first-load.mjs --base https://footsteps.willhs.me` once this has deployed.

Raw runs, the request lists and the bundle reports are in the job's evidence folder (not in git).

## What changed

1. **The firelight no longer waits for the settlement model.** Before, the grid worker replied to a year only after
   building its world settlement units, which first fetch and decode `site_terrain.webp` (2.4 MB), `water_distance.webp`
   (0.9 MB) and `settlements.json`: the people image was in at 0.2 s but nothing was drawn until 3.8–5 s. The worker now
   posts the decoded grid first (`{ year, data }`, a copy) and the full snapshot after; `loadGridData` (gridLoader.ts)
   resolves on the first, and the far-out firelight (`usePresenceLayers`) uses it. Units, morphs and everything zoomed in
   still wait for the full snapshot, as before.
2. **deck.gl and luma.gl tree-shake.** `next.config.js` aliased `@deck.gl/core`, `/layers`, `/react` and `/mesh-layers` to
   their CommonJS builds, which ship whole; `mesh-layers` alone brought the glTF, Draco, KTX loaders and apache-arrow
   (~1.2 MB unminified). All deck.gl packages now resolve to their ES module builds. The alias's worry (two luma.gl shader
   assemblers) only applies to a mix of CJS and ESM; pnpm has one deck.gl 9.1.14 and one luma.gl 9.1.9, and `pnpm visual`
   matches main in all ten scenes, including both close-up 3D ones.
3. **Close-up and opt-in code loads on use.** `lib/lazyModule.ts` (`lazy`, `useLazy`): `Close3DLayer` (prefetched on idle
   after first people, so a zoom-in does not wait; a deep link straight to the close-up shows the flat era images for the
   moment the code takes, as it does while the ground decodes), `TerrainDetailLayer` (`?terrain_tiles=1`), `AnimalsLayer`
   (`?figures=1`), the evidence marks and DNA loader (`?evidence=1`). `next/dynamic` behind the flag: the tour
   (`TourGuide.tsx`, `?tour=1`), the population chart (`?chart=1`), the old time bar (`?bar=old`), the evidence tooltip.
   Dots was already lazy.
4. **The opening year's images start with the HTML.** An inline head script (`lib/firstLoadPreload.ts`, the app's own
   `bracketIn` inlined as source) adds `<link rel=preload as=fetch>` for the two Earth images (high priority) and the two
   people images and land-use maps around the opening year (`?year=` or 1000 BCE); none for Dots, `?spread=1`,
   `?pastwater=1` or `?tour=1`, whose first images differ. The worker's fetches then come from the HTTP cache (~200 B
   revalidations, no second download). `app/page.tsx` starts the worker on those years when the script runs, before React mounts.

Nothing drawn changed: `pnpm visual` gives the same per-scene pixel counts as on main (the non-zero ones are the sun-clock
text and the pre-HYDE population text, stale against the baselines on main too).

## Biggest remaining costs

- **The settlement model's images** — `site_terrain.webp` 2.4 MB, `water_distance.webp` 0.9 MB, `settlements.json` 0.45 MB:
  fetched with the first year although only the Units view (zoom ≥ 4.8) uses them. On fast 4G they share the line with the
  people images. Loading them when units are first wanted would save ~3.8 MB on a visit that stays zoomed out.
- **Neighbour-year prefetch and the rest of the first view**: the total settles at ~11 MB (two more people years, two more
  Earth years).
- **Fast 4G first globe** is 0.37 s later than before (3.58 s vs 3.21 s): the Earth images now share the line with the
  preloaded people images. Locally that is HTTP/1.1; prod (Cloudflare, HTTP/2) honours `fetchpriority=high`, so check it there.
- **JS**: React + Next runtime (~1.1 MB unminified), `@deck.gl/core` 471 KiB, `@luma.gl/webgl` 251 KiB, `@math.gl/core`,
  and `wgsl_reflect` 210 KiB (luma.gl's WebGPU shader reflection, unused on WebGL; a stub alias could drop it, untested).
- **Long tasks**: the longest left is ~85 ms desktop / ~100 ms fast 4G, during script evaluation and deck.gl start-up.
