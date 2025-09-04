---
title: Fix mobile TimeSlider label overlap
status: done
created: 2025-09-04
updated: 2025-09-04
owner: agent
---

Context
- On small screens, TimeSlider labels at the left side were overlapping.
- Goal: Render as many labels as fit without overlap, prioritizing milestones.

Changes
- Implemented greedy, spacing-aware label selection prioritizing milestones.
- Increased minimum spacing on narrow widths to avoid collisions.
- Ensured marks are single-line (`white-space: nowrap`).

Files
- `footsteps-web/components/ui/hooks/useSliderMarks.ts`
- `footsteps-web/app/globals.css`

Verification
- Build passes: `pnpm -C footsteps-web build`.
- Manual: open app on 375×812 viewport and scrub; labels should no longer overlap.

Open Questions
- If extreme localization requires different label widths, consider measuring text widths and adapting spacing dynamically.

Change Log
- 2025-09-04: Initial fix and spacing heuristics for mobile.

