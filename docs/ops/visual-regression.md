---
id: visual-regression
type: reference
purpose: "Screenshot regression: ten fixed scenes (Units, Grid, Dots, close-up 3D, hover, a selected person) compared with committed baselines; how to run it, update baselines on purpose, and why CI does not run it"
updated: 2026-11-21
---

# Visual regression

`pnpm visual` (in `footsteps-web/`) opens ten fixed scenes in real headless Chromium on the real GPU, with real data, screenshots
each once it has settled, and compares it with a committed baseline in `footsteps-web/e2e/visual/<scene>.webp`. It exits 1 if any scene
differs by more than the tolerance, or has no baseline. It exists because many changes now land overnight with nobody looking: a
change that moves pixels has to show up as a failing run with a picture, not as a surprise on the live site.

**Agents: run `pnpm visual` before committing any change that can move pixels** (layers, shaders, colours, layout, overlays, data
that feeds a drawing, the still hook). If it fails, look at the diff sheet and decide: a bug (fix it), or the intended new look
(update the baselines, see below, in the same commit as the change). Do not update baselines to make a failure go away unread.

## Run

```bash
pnpm build                       # the run serves the static export in out/; a stale out/ tests stale code
pnpm visual                      # all scenes; ~3 minutes on a quiet machine
pnpm visual --build              # the same, running pnpm build first
pnpm visual --scenes rome-1000bce-grid,rome-1000bce-hover
pnpm visual --out /some/dir      # actual images, diff sheets and report.md go here (default footsteps-web/visual-out/, not in git)
pnpm visual --data DIR           # a folder holding data/tiles (see "Data")  --base URL  use a server already running  --headed
```

Per scene it prints one line (`PASS 0 px differ (0.000%, limit 1024)`), then the size of all committed baselines. On a failure,
`visual-out/<scene>.diff.png` is one image: **expected | actual | diff** side by side (differing pixels in red), and
`visual-out/<scene>.actual.png` is the screenshot itself. `visual-out/report.md` has the table.

## What it does

- **Data.** It serves `out/` with production-like headers, plus the data that is not in git, mapped as `scripts/deploy-budgie.sh`
  publishes it (`data/tiles/grid` and `prehistory` as `/grid`, `terrain`, `habitat`, `fauna`, `humans` as `/pmtiles`). It looks for
  `data/tiles` in this checkout, then in the primary checkout of the git worktree it is in, then `--data` / `FOOTSTEPS_DATA`.
  With none it stops: baselines made with stand-in data would be worthless.
- **Elevation tiles** are the one thing the app loads from outside (AWS Terrarium). They are kept in `footsteps-web/visual-cache/`
  (not in git) on first use and served from there after, so a run is the same offline and cannot change because a tile did.
  The first run needs the network.
- **Still.** Every scene's URL has `?still=1` (`lib/still.ts`): the shader clock (fire flicker, walking feet, animals) stops at one
  instant, and the sun clock stops at noon UTC on one fixed day (`?utc=` still picks the hour), so Day/night shading and the
  "12:50 pm local sun time" line do not change with the day it is shot. Nothing else differs from what a visitor sees.
- **Settled** means all of: no request in flight and none ended for 1 s; the page's loading flag off (`main[data-loading="false"]`,
  the time bar's flag); the scene's own condition met (the empty-view note, the hover card, the person card, "Dots drawn" above 0);
  and three screenshots 0.7 s apart pixel-identical. The last one is what catches work the others cannot see (workers building
  marks, textures uploading). A scene that never holds still in 90 s is captured anyway and flagged `WARN`.
- **Compare.** The fresh PNG goes through the same lossy WebP encode as the baseline, so both sides carry the same codec noise, then
  [pixelmatch](https://github.com/mapbox/pixelmatch) with a per-pixel colour threshold of 0.1 (anti-aliasing ignored). A scene fails
  when more than **0.1 %** of its pixels differ (1,024 of 1,024,000). An unchanged tree gives 0 differing pixels
  on every scene (a few hundred is the worst seen on a loaded machine); a changed palette colour moves thousands.

Viewport 1280 × 800, device scale 1, Chromium with the GPU flags `verify-dna-evidence.mjs` uses
(`--use-angle=metal --enable-gpu --ignore-gpu-blocklist`).

## Scenes

| id | what it pins |
|---|---|
| `globe-1900` | the default zoomed-out look: glow, legend, time bar |
| `rome-1000bce-units` / `-grid` / `-dots` | the same place in each people look (`?mode=`); Dots reads the PMTiles |
| `nile-3000bce-3d` | close-up 3D at zoom 9, measured ground |
| `doggerland-10000bce-3d` | close-up 3D with the sea at its 10,000 BCE level |
| `uk-50000bce-empty` | zoom 7 over a place with no people: the empty-view note |
| `croatia-50000bce-humans` | other kinds of human (Neanderthal bands) |
| `rome-1000bce-hover` | the hover card (a real mouse move over the map) |
| `rome-1000bce-person` | a selected person at street zoom: the person card. The person is found through the deck.gl layer data and clicked at its picked pixel; the choice is the person nearest the centre, ties by id |

The table is `SCENES` in `scripts/visual-lib.mjs`; add a scene there, run `pnpm visual --update --scenes <id>`, commit the baseline.

## Update baselines on purpose

```bash
pnpm build && pnpm visual --scenes <ids>           # see what moved; read each diff sheet
pnpm visual --update --scenes <ids>                # write e2e/visual/<id>.webp for those scenes only
git add footsteps-web/e2e/visual && git commit     # with the change that caused it, and say why in the message
```

`--update` with no `--scenes` rewrites all ten: only do that when the whole look changed (a new viewport, a new encoder). Then run
`pnpm visual` twice more: both must pass with no changes between them.

## Size

Baselines are lossy WebP (quality 80), about 28–159 KiB each, **663 KiB** (680,000 bytes on disk) for the ten. Lossless PNGs of the same scenes
would be several MiB. Lossy is safe here because the fresh screenshot is encoded the same way before comparing.

## Why it is not in CI

`.github/workflows/ci.yml` runs on `ubuntu-latest`: no GPU (software GL draws different pixels and the 3D scenes take minutes), and
the data (`data/tiles`, 100+ MB of HYDE images, terrain, PMTiles) is not in git, so there is nothing real to draw. Baselines are
made on an Apple-silicon Mac with Metal; another GPU or driver anti-aliases differently and would fail every scene. So it runs on the
machine where the work is done (agents before committing). If CI ever has the data and a fixed runner, add `pnpm visual` after
`pnpm build` and keep that runner's baselines separate.

## Limits

- Baselines belong to one machine class (Apple-silicon, Metal). A different GPU, macOS or Chromium build can move pixels; if every scene
  fails the same way after an OS or Playwright update, re-baseline all and say so in the commit.
- It sees what is on screen at ten places and years. It does not test scrubbing, panning or transitions (see `scripts/verify-year-crossfade.mjs`).
- Scenes with generated art (the hover card's painted ground picture) change when `public/ground/` does: that is a real change to review.
