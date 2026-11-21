---
id: plan-0007
type: spec
purpose: "Implementation plan for showing the climate-adjusted HYDE spread behind ?spread=1."
tags: ["plan", "grid", "hyde", "flag"]
related: ["./task.md", "../../ops/hyde-climate-spread.md"]
---

# Adjusted HYDE spread behind `?spread=1`: implementation plan

Vision alignment: Footsteps: how people lived (ways-of-life layer)

## Overview

**Primary goal**: with `?spread=1` the grid pipeline reads `/grid/adjusted/humans_{year}.webp` for 10,000–4,000 BCE
and every screen that shows those people says "Adjusted spread (modelled on HYDE)"; without the flag, byte-for-byte
the same app.

**Approach**: follow the `?pastwater=1` precedent (one `lib/` module owns the flag, its years and its words; the
grid worker is configured once per page; a note under the counter says what applies in this mode and year).
The decoded grid records which source it actually read, so every label is derived from what is on screen,
not from the flag.

## Current state analysis

- `gridData.ts:62` `gridUrl(year)` → `/grid/humans_${year}.webp`; `decodeYearGrid` (`gridData.ts:296`) reads it.
- The worker gets `{settlements, sites, pastWater}` once (`gridWorkerClient.ts`), then year requests; caches are
  year-keyed, which stays right because the flag is fixed per page.
- The counter shows `populationAt(time)` (static `HYDE_TOTALS`, `lib/time.ts:22`) in Units and Grid
  (`FootstepsViz.tsx:410`), so it cannot change with the source. `snapshot.data.total` feeds the Dots-only path.
- Labels: `SupportingText.tsx` (counter notes), `FootstepsViz.tsx:549` (notes toggle + data notes),
  `lib/emptyView.ts:43` (empty-view note), `layers/grounding.ts` + `lib/hoverCard.ts` (hover card people row).
- Cross-fade: Grid uses `useYearCrossfade`; Units in continuous time morph between `loadGrid(y0)` and `loadGrid(y1)`
  (`useGridLayer.ts:141`). Both take any two decoded grids, so -4000 (adjusted) → -3000 (HYDE) morphs as is.
- budgie: `./app/grid` is mounted and `/grid/*` routed (`deploy/budgie/Caddyfile`, `docker-compose.yml`).
- `scripts/visual-lib.mjs` `dataRoots` maps `/grid` to `data/tiles/grid` for the static server.

## Data shape

```ts
// lib/adjustedSpread.ts
export const ADJUSTED_SPREAD_YEARS: readonly number[];   // -10000 … -4000, the generator's default YEARS
export const ADJUSTED_SPREAD_LABEL = 'Adjusted spread (modelled on HYDE)';
export function spreadParam(search: string): boolean;     // ?spread=1
export function adjustedSpreadYear(year: number): boolean; // is there an adjusted image for this year
export function spreadTotalOk(total: number, year: number): boolean; // within SPREAD_TOTAL_RTOL of HYDE_TOTALS[year]
export function spreadNote(year: number, mode: PeopleMode, adjusted: boolean | undefined): { label: string; title: string } | null;
// GridData gains `adjusted?: true` — set only when the cells came from the adjusted image.
```

Invariants: `adjusted` ⇒ flag on ∧ year ∈ ADJUSTED_SPREAD_YEARS ∧ the image decoded ∧ its total within tolerance of
HYDE's. Any failure (fetch, total) falls back to HYDE's image with a warning, and the label then says the
adjustment is not applied, so a label never claims what the screen does not show.

## Assumptions

- URL `/grid/adjusted/` (see task.md): no compose/Caddy change; local copy in `public/grid/adjusted/`.
- `SPREAD_TOTAL_RTOL` = 1%: `HYDE_TOTALS` is rounded to 3 significant figures (≤0.5%); the generator keeps totals to
  `TOTAL_RTOL` (3e-4). A failed check means a wrong file, not rounding.
- The hover card's people row reads "modelled" with "adjusted spread (modelled on HYDE)" in its detail; the way-of-life
  row still uses HYDE land use (the cell's land use is HYDE's; adjusted people on cells with no farmland class as foragers).
- The time bar's whole-HYDE "measured" label stays (task.md).
- Dots: the note says "Adjusted spread: not applied to Dots" (static archives).

## What we're NOT doing

Default-on, generator changes, Dots rebuild, publishing from this job.

---

## Phase 1: Flag module and decoder

- [x] Create `lib/adjustedSpread.ts` (shape above) with `lib/adjustedSpread.test.ts` (years, param, total check, notes per mode/year/state)
- [x] `gridData.ts`: `gridUrl(year, adjusted = false)`; `decodeYearGrid(…, spread = false)` reads the adjusted image when `spread && adjustedSpreadYear(year)`, checks `spreadTotalOk`, falls back to HYDE on any failure; `GridData.adjusted`
- [x] Worker + client: pass `spread: spreadParam(search)` in the config message, through to `decodeYearGrid`
- [x] Tests: `gridData.test.ts` for the adjusted URL, the fallback on 404 and on a bad total
- [x] Run: `pnpm --dir footsteps-web test -- --runInBand adjustedSpread gridData` — pass

## Phase 2: Labels

- [x] `SupportingText`: `spread` prop rendered as an `ov-note` (`data-testid="spread-note"`) under the counter
- [x] `FootstepsViz`: read the flag once; pass `spreadNote(year, mode, grid?.data.adjusted)`; notes toggle strong label + data-note sentence when the grid on screen is adjusted
- [x] `emptyView.ts`: source `'model' | 'hyde' | 'adjusted'` instead of `modelled: boolean`; update callers and tests
- [x] Hover card: `groundingFacts` sets an adjusted confidence; `hoverCardRows` people row says adjusted (`people.adjusted`)
- [x] Run: `pnpm --dir footsteps-web test -- --runInBand` — pass; lint and tsc clean

## Phase 3: Totals assertion on real data

- [x] `components/footsteps/hooks/adjustedSpread.real.test.ts` (skipped unless `FOOTSTEPS_SPREAD_REAL=1`): decode each year's HYDE and adjusted images through `gridDataFrom`; totals equal within `TOTAL_RTOL × 3`; Sahara box and North Sea floor have more people adjusted at -8000; write counts to `FOOTSTEPS_SPREAD_OUT`
- [x] Run it on the built data — pass, counts saved to evidence

## Phase 4: Publishing and smoke

- [x] `scripts/deploy-budgie.sh`: rsync `data/tiles/grid_adjusted/humans_*.webp` to `app/grid/adjusted/` (no `--delete`), warn when not built
- [x] `scripts/smoke.sh`: check `/grid/adjusted/humans_-8000.webp`; WARN when absent, FAIL when present but not a lossless WebP
- [x] `scripts/visual-lib.mjs` `dataRoots`: `/grid/adjusted` → `data/tiles/grid_adjusted` (before `/grid`)
- [x] Run: `bash -n` both scripts; `scripts/smoke.sh` against prod — WARN for adjusted, rest ok

## Phase 5: Prove it in the browser

- [x] Build; serve with a scratch data root (primary checkout's tiles + this worktree's `grid_adjusted`)
- [x] Screenshots: Sahara 6000 BCE and Doggerland 8000 BCE × flag on/off × Units/Grid; Dots with flag (note); -4000/-3500/-3000 with flag (transition); label visible
- [x] Record grid totals with and without the flag at -8000 (page state) — equal
- [x] Run: `pnpm visual` — 7/10 pass; Rome grid, dots, person fail with identical pixels on main's own build (stale baselines), so no change from this work

## Phase 6: Docs

- [x] `docs/ops/hyde-climate-spread.md`: replace "Wiring it in (not done)" with how it is wired, the flag, the URL, publishing
- [x] `AGENTS.md`: the architecture line says it is behind `?spread=1`
- [x] `docs/log.d/<job>.md` fragment (no index fragment: the repo has no docs/index.md)

## Phase 7: Wrap (commit & finalize)

- [x] Run: frontend lint, tsc, jest; `pnpm build`; `poetry run pytest footstep-generator/tests/ -q`
- [x] Commit (no merge, no push: Manager lands it)

## Final checklist

- [x] All phases complete; decisions.tsv committed
- [ ] [after merge] `GRID_ONLY=1 scripts/deploy-budgie.sh` from the home network, then `scripts/smoke.sh` on prod

## References

- Task: `docs/tasks/0007-adjusted-hyde-spread-flag/task.md`
- `docs/ops/hyde-climate-spread.md` (2026-11), `docs/ops/past-water.md` (flag precedent)
