---
id: plan-0004
type: spec
purpose: "Implementation plan for the one-bar time navigator."
tags: ["plan", "ui", "time"]
related: ["./task.md"]
---

# One time bar: implementation plan

## Overview

Replace the overview + detail strips with a single fixed, non-linear track (`TimeBar`). Rough
seeking is the default (the needle follows the finger); precision comes from slowing the drag,
arrow keys, or typing a year into the year label.

**Primary goal**: one bar; 100k BCE → 1900 in one drag; any exact year by typing; smooth fine
scrubbing at 10,000 BCE, on desktop and at 375 px.

**Approach**: pure scale / step / parse / drag logic in `lib/timeScale.ts` (unit tested), a new
canvas component `components/ui/TimeBar.tsx`, `page.tsx` picks the bar by `?bar=old`.

## Current State Analysis

- `components/ui/TimeNavigator.tsx:22-30`: two strips. Overview: log of years-ago with
  `OFFSET = 30` (`:43`, `:67-70`), so 1000–1900 CE takes ~30% of the width. Detail: linear tape,
  wheel zoom (`ZOOM_*`), momentum, double-click jump.
- Header row (`:384-434`): ago label, calendar label, sea level, people, loading/modelled/data chip.
  Moment note (`:435-443`). These stay as they are.
- `--ov-timeline-h` publication (`:162-180`) used by `FootstepsViz.tsx:226`.
- `e2e/grounding.spec.ts:37-38` focuses `getByRole('slider')` and presses Home: must stay valid
  (exactly one slider, Home → `TIME_MIN`).
- `app/page.tsx` owns `time`, `?year=` and passes `loading`.
- History (`git show 1a58490`, `fdc716d`): a fisheye lens bar was tried and replaced within two
  days. The new track's scale must not change under the pointer.

## Design options

| Option | Rough seek | Precision | Verdict |
|---|---|---|---|
| A. Fixed non-linear track + velocity-gain drag + keys + typed year | one drag, absolute | slow drag (gain down to ~0.06), keys, typing | **chosen**: one scale, nothing moves but the needle |
| B. Fixed track + magnifier popup while dragging slowly | same | a transient linear tape above the bar | rejected: brings back a second bar moving at another speed, which is the complaint |
| C. Fisheye lens around the needle (`1a58490`) | ok | lens | rejected: tried and replaced; the scale shifts under the finger |

Scale: `pos = 1 - (ln(ago + K) - ln(agoMin + K)) / (ln(agoMax + K) - ln(agoMin + K))`, years-ago
log with `K = 400` (old overview used 30). K = 400 puts 10k BCE at ~39%, 1 CE at ~69%, 1000 CE at
~79%: deep past compressed, history roomy, but not the 30% the old scale spent on 1000–1900.

## Core data shape (`lib/timeScale.ts`)

```ts
/** Fixed bar scale: a time <-> position in [0, 1]. Never changes at runtime. */
export function posAt(time: number): number;
export function timeAt(pos: number): number;           // clamped to [TIME_MIN, TIME_MAX]
export function yearsPerPos(time: number): number;      // local derivative dt/dpos (> 0)
/** Round key step (1/2/5 x 10^k years) near `time`, ~0.25% of the bar; `big` = 10x. */
export function keyStep(time: number, big: boolean): number;
/** The next round year in `dir`, snapped to multiples of keyStep. */
export function stepTime(time: number, dir: 1 | -1, big: boolean): number;
/** "1347", "1347 CE", "-500", "500 BC", "10,000 BCE", "12k BCE", "12000 years ago" -> slider year, or null. */
export function parseYear(text: string): number | null;
/** Drag: a pointer moving at `speed` px/ms moves the needle `gain` x the finger. */
export type Drag = { pos: number; x: number; t: number; speed: number };
export function dragStart(time: number, x: number, t: number): Drag;
export function dragMove(d: Drag, x: number, t: number, width: number, fingerPos: number): Drag;
export const BAR_LABELS: { time: number; text: string }[]; // 100k BCE, 50k, 20k, 10k, 0, 1000, 1900
```

Invariants: `timeAt(posAt(t)) ≈ t`; `posAt` is monotonic increasing; drag pos stays in [0, 1];
fast drag converges to the finger (needle under finger), slow drag moves ≤ 0.1× the finger.

## Desired end state

`/` shows one bar under the readout; `/?bar=old` shows the old navigator. Unit tests cover the
scale, steps, parsing and drag gain. Screenshots in the workspace `evidence/`.

## What we're NOT doing

- Deleting `TimeNavigator.tsx` (after Will compares).
- Changing the header readout or moments data.
- Magnifier / second strip.

## Assumptions

- K = 400 (tunable constant) gives the right balance; verified by screenshot at 375 px.
- Precision by drag speed (no vertical-offset "scrub speed" like iOS): it needs no explanation.
- A plain click jumps; a click within 8 px of a moment marker snaps to the moment and pins its note
  (same as the old overview).
- Wheel / trackpad over the bar nudges time (finer than drag) instead of zooming; there is no zoom.
- Clicking the calendar label (or pressing Enter on the focused bar) opens an inline input;
  Enter commits, Escape or blur cancels; invalid text shakes nothing, it just stays open with a
  dim hint.
- Data-year ticks are drawn only where neighbours are ≥ 4 px apart, so the 90 modelled years
  don't become a solid band at phone width.

---

## Phase 1: Scale and logic (`lib/timeScale.ts`)

### Tasks
- [ ] Create `footsteps-web/lib/timeScale.ts` with the API above
- [ ] Create `footsteps-web/lib/timeScale.test.ts`: round trip, monotonic, labels in order;
      `stepTime` snaps to round years and moves both ways, clamps at ends; `parseYear` forms and
      rejects garbage; drag: fast move puts needle under finger, slow move moves ≤ 0.1×

### Success Criteria
- [ ] Run: `pnpm --dir footsteps-web test -- --runInBand lib/timeScale` — passes

## Phase 2: `TimeBar` component and `?bar=old`

### Tasks
- [ ] Create `footsteps-web/components/ui/TimeBar.tsx`: same header + moment note as the old
      navigator (shared via a `TimeReadout` extracted from `TimeNavigator.tsx`), one canvas track:
      rounded track, faint population curve (paler before HYDE), boundary hairline at 10k BCE,
      data-year ticks, moment triangles, labels below, needle with knob (dashed cyan while loading),
      hover ghost line on mouse
- [ ] Pointer: down = jump (or moment snap), move = `dragMove`, capture pointer; wheel nudge
- [ ] Keys: ←/→ `stepTime`, Shift = big, PageUp/PageDown = big, Home/End, Enter = edit year
- [ ] Year editor: click calendar label → input, `parseYear`, Enter/Escape/blur
- [ ] `role="slider"`, `aria-valuetext`, publish `--ov-timeline-h`
- [ ] `app/page.tsx`: `?bar=old` renders `TimeNavigator`, else `TimeBar`

### Success Criteria
- [ ] Run: `pnpm --dir footsteps-web exec tsc --noEmit` — clean
- [ ] Run: `pnpm --dir footsteps-web lint` — clean

## Phase 3: Prove it in the browser

- [ ] Playwright script (workspace `evidence/`): desktop 1440 and 375 px; before (`?bar=old`)
      and after screenshots; one drag 100k → 1900 reads 1900 CE; type 1347 → 1347 CE; slow drag
      near 10k BCE changes the year by small steps; Home key → 100,000 BCE
- [ ] Look at the screenshots; tune K / sizes if labels collide

## Phase 4: Wrap (commit & finalize)

- [ ] Update `footsteps-web/AGENTS.md` (time navigation line) to name `TimeBar` / `lib/timeScale.ts`
- [ ] Run: `pnpm --dir footsteps-web test -- --runInBand` — passes
- [ ] Commit (Manager job: commit only, no merge/push)

## Final Checklist

- [ ] All phases complete
- [ ] [HUMAN] Will compares `/` and `/?bar=old` on footsteps.willhs.me and says keep / change

## References

- Task: `docs/tasks/0004-simpler-elegant-time-bar/task.md`
