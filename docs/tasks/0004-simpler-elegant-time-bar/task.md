---
id: task-0004
type: spec
purpose: "Replace the two-strip time navigator with one quiet, non-linear bar: rough by default, precise on demand."
tags: ["ui", "time", "slider", "footsteps-web"]
related: ["../../philosophy/vision.md"]
created: 2026-11-14
updated: 2026-11-14
---

# Footsteps: simpler, elegant time bar (one bar, rough by default, precise when needed)

## Goal

One time bar that feels obvious: drag or click anywhere for a rough jump across 100,000 BCE–1900,
and get precision only when asked for (slow drag, arrow keys, typing a year).

## Context

Will (2026-11-14): "It's still too complicated. There are two different bars that scroll in
different durations. Let's just try to make it really simple and look elegant, and somehow give
precision where needed, but it usually should be rough. We should allow quick seeking between
large amounts of time if wanted."

Premise check (main `d0d245f`): true. `footsteps-web/components/ui/TimeNavigator.tsx` draws a
log-scale overview strip (named moments, window box) and a linear detail tape under a fixed
needle (drag with momentum, wheel zoom, double-click to jump). Two strips that move at different
speeds is the confusing part.

History: `1a58490` (2026-11-10) tried one log bar with a fisheye lens around the current moment;
`fdc716d` (2026-11-12) replaced it with overview + detail when the range grew to 100,000 BCE. A
lens that rescales the bar under your finger is the thing to avoid repeating: the new bar's scale
must stay fixed.

## Scope

### Must Do
- One fixed non-linear track: deep past compressed, recent history roomier; few labels
  (100k, 50k, 20k, 10k BCE, 0, 1000, 1900). Click or drag anywhere for a rough jump.
- Precision on demand: slow drag gives fine control; arrow keys step (Shift for bigger);
  clicking the year label lets you type an exact year.
- Keep, quietly: faint population curve, data-year ticks, the modelled/measured boundary at
  10,000 BCE, the named moments (`lib/moments.ts`) with their notes, the sea-level readout.
- Touch (375 px) and keyboard; `role="slider"` with `aria-valuetext`.
- Keep the loading chip and dashed loading needle, `--ov-timeline-h`, and `?year=`.
- Keep the old bar at `?bar=old` for one round.

### Might Do
- Mouse hover shows where a click would land.

### Won't Do
- A persistent second strip or zoomable tape.
- A lens that rescales the track while you drag.
- Deleting the old bar (after Will compares).

## Constraints

- Elegant, minimal, few labels; people (amber) the only warm colour.
- Scrubbing stays smooth (vision: "smooth and quick, with no pops or waits").

## References

- docs/philosophy/vision.md
- footsteps-web/lib/time.ts, footsteps-web/lib/moments.ts
- Steady task: e599bf27-f59f-4c57-a146-b77a35953c19

## Success Criteria

- [ ] In a browser at desktop and 375 px: seek 100k BCE → 1900 in one gesture
- [ ] Set an exact year such as 1347 (typed)
- [ ] Scrub smoothly around 10,000 BCE
- [ ] `?bar=old` shows the old navigator
- [ ] Before/after screenshots attached
- [ ] [HUMAN] Will tries the new bar on footsteps.willhs.me (vs ?bar=old) and says keep / change

## Assumptions

- "Rough by default" means the needle follows the finger 1:1 at normal speed; precision comes
  from slowing down, keys, or typing, not from a second visible scale.
