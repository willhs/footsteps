---
id: task-0014
type: spec
purpose: "Measure a cold first visit (bytes, first globe, first people, long tasks; desktop and fast 4G) and cut the time to first people without changing what is drawn."
tags: ["performance", "first-load", "bundle"]
related: ["../../ops/first-load.md", "../../ops/visual-regression.md", "../../ops/close-up-scene.md"]
created: 2026-11-22
updated: 2026-11-22
---

# First load: measure and cut time to first people on a cold visit

Vision alignment: On a new endeavour — Want to reach my potential with software (goal: Footsteps smooth, scale-aware rendering).

## Goal

A before/after table in `docs/ops/first-load.md` (JS bytes, time to first globe frame, time to first people, long tasks,
desktop and a throttled fast-4G profile, local static export and prod) produced by `footsteps-web/scripts/first-load.mjs`,
and a smaller, faster default first load: close-up 3D and opt-in features load only when used, the default year's people
and Earth images start downloading with the HTML, and the grid worker starts early. Nothing drawn changes.

## Context

Nobody has measured a cold first visit since the app grew (close-up 3D, shelters, figures, routine, other humans, evidence,
tour, chart). Most of that code only matters at high zoom or behind flags. `scripts/measure-first-load.mjs` (task b45fc5c,
2026-11-09) only totals bytes on a local server; it has no timing, no throttling and no prod mode.

## Scope

### Must do

- `footsteps-web/scripts/first-load.mjs`: cold cache; desktop and throttled fast 4G; local `out/` (served like prod) and prod;
  JS bytes (transferred and parsed), time to first globe frame, time to first people drawn (an app signal), long tasks.
- An app signal for "first globe frame" and "first people drawn" (performance marks).
- Dynamic-import the close-up 3D layer and every opt-in feature's code so it loads only when used.
- Check deck.gl/luma imports are tree-shaken; fix what can be fixed safely.
- Preload the default year's grid WebP and terrain image; start the grid worker early.

### Won't do

- No default changes; no change to what is drawn (`pnpm visual` must pass unchanged).
- No data format changes (image sizes are out of scope).

## Success Criteria

- [x] Before/after table in docs/ops/first-load.md (bytes, first globe, first people, both profiles), biggest remaining costs named
- [x] `pnpm visual` passes (nothing looks different)
- [x] Each opt-in flag still loads its code (flag sweep or quick check)
- [x] tsc, lint, tests, build pass
- [x] docs/log.md entry (via docs/log.d fragment)

## References

- `footsteps-web/scripts/measure-first-load.mjs` (superseded)
- `docs/ops/visual-regression.md`
- Steady task: 26bda2d1-cdeb-4183-b9f3-40f2df2c31cb

## Assumptions

- "Fast 4G" = 9 Mbps down, 1.5 Mbps up, 150 ms RTT, 4× CPU slowdown (DevTools' Fast 4G network numbers with Lighthouse's
  mobile CPU factor), on the same desktop GPU.
- Prod cannot show the new marks until this lands; for prod "before", the script reports bytes and the time the first
  people image finished downloading as a proxy, and says so.
