---
id: plan-0010
type: spec
purpose: "Implementation plan for the ?tour=1 guided tour."
tags: ["plan", "tour"]
related: ["./task.md"]
---

# Guided tour: implementation plan

## Overview

**Primary Goal**: `?tour=1` steps through nine sourced stops; without it the app is pixel-identical (`pnpm visual`).

**Approach**: one data module (`lib/tour.ts`) whose stop text is built from imported data, a hook
(`hooks/useTour.ts`) that drives the existing setters, a panel (`overlays/TourPanel.tsx`) at the top of the left column,
and a headless Playwright script (`scripts/tour-shots.mjs`) that steps through every stop.

## Current State Analysis

- Time lives in `app/page.tsx` (`useState(-1000)`, `setTime`); FootstepsViz only receives `time` (`FootstepsViz.tsx:99`).
- View state lives in `useGlobeViewState` (`hooks/useGlobeViewState.ts`); `onViewStateChange` normalises and is what WASD pan calls directly.
- In the flat map with close-up 3D on, pitch is derived from zoom (`deckViewState`, `FootstepsViz.tsx:~158`), so a stop's pitch only matters below `CLOSE3D_ZOOM`, where it is 0.
- The time bar's arrow keys are bound on the slider element only (`TimeBar.tsx:298`), so window-level arrows are free unless the slider (or an input) has focus.
- Sources: `PEOPLE_TOTALS` (`lib/time.ts`, from `prehistory_totals.json` and `HYDE_TOTALS`), `OTHER_HUMANS[].lastKa` (`lib/otherHumans.ts`, already kept in step with `arrivals.yaml` by `otherHumans.test.ts`), `seaLevelAt` (`lib/climate.ts`), region arrival dates in `footstep-generator/prehistory/arrivals.yaml` (not importable in the web build; pinned by a regex test like `otherHumans.test.ts:58`).

## Data shape

```ts
type TourEvidence = 'measured' | 'modelled' | 'imagined';
type TourStop = {
  id: string; title: string;
  view: { latitude: number; longitude: number; zoom: number; pitch: number };
  year: number;               // a PEOPLE_YEARS entry, within [TIME_MIN, TIME_MAX]
  evidence: TourEvidence;     // must equal evidenceAt(year) for people; 'imagined' allowed for a stop about imagined detail
  text: [string, string];     // two sentences, numbers interpolated from data
  source: string;             // where the number comes from, short
};
type TourState = { index: number } | null;   // null = no tour / exited
```

Invariants: 8-10 stops, years ascending, each year a people-image year, evidence consistent with `evidenceAt`.

## Design options

| Option | Shape | Verdict |
|---|---|---|
| A. deck.gl `FlyToInterpolator` transitions | pass `transitionDuration` through the controlled view state | Rejected: GlobeView + our normalising wrapper; harder to cancel and test |
| B. own rAF tween calling `onViewStateChange` | pure `flyFrame(from, to, t)` in lib, hook runs frames, cancels on pointerdown/wheel/other keys | **Chosen**: testable, same path WASD uses |
| C. tour lives in `page.tsx` | page owns time; would need view state lifted | Rejected: bigger change; mount in FootstepsViz with an `onTimeChange` prop instead |

## Assumptions

- `FootstepsViz` gets one optional prop `onTimeChange` (page passes `setTime`); no prop, no tour.
- The tour sets the year at the start of each flight (one data load), it does not tween the year.
- Exit removes `tour` from the URL with `history.replaceState`.
- Arrow keys step the tour only when focus is not in the slider, a text field or a button-free control; Esc exits.
- Screenshots: all go to the workspace evidence dir; three are committed as small WebPs under `docs/ops/tour/`.

---

## Phase 1: Stop data and logic

- [ ] Create `footsteps-web/lib/tour.ts`: `TOUR_STOPS`, `ARRIVAL_KA`, `tourParam`, `stepTour`, `flyFrame`, `tourKeyAction`, `FLY_MS`.
- [ ] Create `footsteps-web/lib/tour.test.ts`: stop count, years in range and on people years, ascending, evidence vs `evidenceAt`, two sentences each, every number in the text equals its source (totals, other-human dates, sea level, arrival dates read from `arrivals.yaml`), `flyFrame` endpoints and shortest longitude, key mapping.
- [ ] Run: `pnpm --dir footsteps-web test -- --runInBand lib/tour` — green.

## Phase 2: Hook, panel, mount

- [ ] Create `components/footsteps/hooks/useTour.ts`.
- [ ] Create `components/footsteps/overlays/TourPanel.tsx`.
- [ ] Mount in `FootstepsViz.tsx` (prop, hook call, panel in the column) and pass `setTime` from `app/page.tsx`.
- [ ] Run: tsc and lint — clean.

## Phase 3: Prove it

- [ ] Create `footsteps-web/scripts/tour-shots.mjs`: serve `out/` + real data, open `?tour=1&still=1`, step with ArrowRight, screenshot each stop, fail on console errors.
- [ ] Run: `pnpm --dir footsteps-web build` then `node scripts/tour-shots.mjs <evidence dir>` — 9 shots, 0 console errors.
- [ ] Run: `pnpm visual` — every scene passes (no flag, nothing changed).

## Phase 4: Docs and wrap

- [ ] Write `docs/ops/tour.md` (stops, sources, wording as a first draft for Will) with three committed shots.
- [ ] Write `docs/log.d/3ec5bbd3-9ea1-4010-87db-fd3af1b79eda.md`; add a line to `footsteps-web/AGENTS.md`.
- [ ] Run full frontend checks (lint, tsc, test, build); commit.

## References

- Task: `docs/tasks/0010-guided-tour/task.md`
