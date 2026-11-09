---
id: task-0001
type: spec
purpose: "Choose the people view by zoom and make 1900 smooth to pan and zoom."
tags: ["rendering", "performance", "units", "grid"]
---

# Footsteps: pick the people view by zoom level, and make 1900 smooth

Vision alignment: Footsteps: smooth, scale-aware rendering (goal)

## Goal

Panning and zooming at 1900 stays smooth (50+ fps in a scripted browser pan on Will's
MacBook), the look follows zoom instead of a mode button, scrubbing years does not
freeze the page, the smoke test is green and the build is deployed to budgie.

## Context

Units draws every band, village and city glow for the whole world at every zoom:
5.1M marks at 1900, most of them sub-pixel at world zoom. Baseline measured on this
MacBook (M5 Pro, Metal, 1440×900, headed, `scripts/measure-view.mjs`): world pan
17.9 fps (p95 frame 281 ms); zoomed pans ~100 fps with 84–180 ms hitches; worst
scrub frame 176 ms.

Premise check against main (`e1a77f3`):
- False: "getRadius/getFillColor are per-mark JS accessors recomputed on the main
  thread". Units are already built in a Web Worker as binary attributes and uploaded in
  chunks (`hooks/gridWorker.ts`, `layers/GridYearLayer.ts`). Do item 3 is already done.
- True in effect: a zoom-bucket change rebuilds and re-uploads all ~5M marks (alpha and
  min size are baked per bucket in `hooks/unitMorph.ts`).
- True: every mark is drawn at every zoom; no viewport culling; no GPU density image.

## Scope

Must do:
- World zoom: draw the population image on the GPU (one texture per year, colour ramp
  in the shader), constant cost per year.
- Mid zoom: draw units only for cells in the viewport plus a margin.
- Close zoom: units become distinct, clickable marks (a click names the group).
- Cross-fade between the zoom regimes; zoom-dependent brightness/size via uniforms and
  props, never a per-mark rebuild.
- Mode button only as a debug option (`?mode=units|grid|dots`); default is by zoom.
- Keep exact totals and the illustrative-placement legend.

Won't do:
- Retire Dots or its tiles (separate decision on the goal).
- Change the data encoding or the generator.

## Success Criteria

- [ ] Scripted pan/zoom at 1900 (world, Europe, close) ≥ 50 fps on this MacBook
- [ ] Scrubbing all 30 years: no long task over ~100 ms
- [ ] Before/after screenshots at 10,000 BCE, 1000 CE, 1900 (world + Europe)
- [ ] lint, tsc, jest green; static build succeeds
- [ ] Deployed with `scripts/deploy-budgie.sh`; `scripts/smoke.sh` green

## References

- Steady task: 4b09e5b7-8f75-438a-b8e0-5044e2e3041c
- `footsteps-web/components/footsteps/hooks/useGridLayer.ts`, `layers/units.ts`

## Assumptions

- "Units" in the done-criteria means the default people view (now chosen by zoom).
