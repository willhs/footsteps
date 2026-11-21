---
id: task-0010
type: spec
purpose: "A guided tour behind ?tour=1: nine stops through 100,000 years, each a camera move, a year and two sentences whose numbers come from the app's own data."
tags: ["tour", "storytelling", "ui"]
related: ["../../ops/tour.md", "../../philosophy/vision.md", "../../ops/other-humans.md", "../../ops/prehistory-population.md"]
created: 2026-11-21
updated: 2026-11-21
---

# Guided tour behind ?tour=1

## Goal

With `?tour=1`, a first-time visitor is walked through 8-10 stops from 100,000 BCE to 1900 CE. Each stop flies the
camera (lat, lon, zoom, pitch), sets the year on the slider and shows two short sentences that say what the screen
shows and where the number comes from, labelled measured, modelled or imagined. Without the flag nothing changes.

## Context

The vision (docs/philosophy/vision.md) is clear quantitative storytelling, but a first-time visitor does not know where
to look. A short tour points at the moments the data shows best.

## Scope

### Must do

- `footsteps-web/lib/tour.ts`: the stop data and the tour's pure logic (step, fly path, key mapping, URL flag).
- Every number in the wording is computed from the app's data at build time (`PEOPLE_TOTALS`, `OTHER_HUMANS`,
  `seaLevelAt`) or pinned by a test against its source (`arrivals.yaml`).
- A panel in the left column's flow, like the other docked panels; FootstepsViz changes stay a small mount point.
- Controls: Next, Back, Exit, keyboard arrows (and Esc). A user's drag, wheel or WASD stops a flight in progress.
- Uses the existing view-state setter (`useGlobeViewState`'s `onViewStateChange`) and year setter (`setTime`).

### Won't do

- No entry point without the flag (no "Take the tour" button yet).
- No narration, autoplay or regional head counts that would need the gitignored grid images at build time.

## Success Criteria

- [ ] Unit tests for the stop data: every number matches its source, years within the slider range.
- [ ] A Playwright run steps through every stop with no console errors and a screenshot per stop (a few committed, the rest out of git).
- [ ] Without the flag nothing changes (`pnpm visual` passes).
- [ ] tsc, lint, tests and build pass.
- [ ] `docs/ops/tour.md` (wording listed as a first draft for Will to edit) and a log entry.

## Assumptions

- Stops sit on people-image years (multiples of 1,000 before HYDE, HYDE years after) so the counter shows an exact data year.
- "Rome 1 CE" uses year 0 (HYDE's "0 AD" data year); "Americas around 16,000 BCE" uses the model's 16 ka BP = 14,050 BCE, shown as 14,000 BCE.
- "Leaving Africa around 60,000 BCE": the model's only region outside Africa then is mainland Southeast Asia (70 ka); the wording says so rather than invent an exit.

## References

- `footsteps-web/lib/time.ts`, `lib/otherHumans.ts`, `lib/climate.ts`, `footstep-generator/prehistory/arrivals.yaml`
- Steady task: f5d97713-3c39-454c-86b2-8f2fdf314dd5
