---
id: research-0018-strategic-overview-2026-11
type: research
purpose: "Ranked memo after about 90 jobs in two weeks: what Footsteps is now, the five next directions with a first task each, the three biggest debts, and what to stop"
date: 2026-11-28
tags: [research, strategy, planning]
related: ["philosophy/vision.md", "ops/flags.md", "ops/first-load.md", "ops/visual-regression.md", "research/0015-world-model-audit/research.md"]
---

# Footsteps: what next (November 2026)

**Status:** memo, 2026-11-28, read at commit `3f8d757`; claims re-checked in review against main at `9bd8879`. Nothing here is
built. The five first tasks are in Steady's idea lane, not dispatched.

**The short version.** In two weeks the app went from "where people were" to a full close-up world, and on 28 Nov Will turned
15 of those features on by default. The building is ahead of the checking: the new default view has not been measured as a
whole, and a stranger still gets no help on arrival. So: measure first, then make it showable, then go back to the
anthropology.

Confidence words: **checked** = I ran a command or read the file; **inferred** = follows from dates or docs, not run;
**not checked** = said so.

## 1. What the project is now

1. A globe of everyone alive at a chosen year, 100,000 BCE to 2025: HYDE's estimates for 10,000 BCE-1900, a labelled model
   before that, and a rough scaling of the 1900 map after it (`footsteps-web/lib/constants.ts` `MODERN_YEARS`).
2. Zoom in and it becomes a 3D place: relief, past water and ice, trees, fields, shelters, hearth smoke, people who follow a
   daily routine, and a 3D person in period dress. All on by default since `72546d4` (28 Nov).
3. Behind it sit about ten sourced datasets (D-PLACE analogs, Glottolog, fauna, food, ice, past water, radiocarbon, ancient
   DNA) and a small API that writes a grounded, labelled "imagine their day".
4. Size: about 25,500 lines of TypeScript in about 190 source files, plus about 100 test files; 15,800 lines of Python with
   521 tests; 185 commits since 13 Nov; 94 Manager jobs in 15 days, about 85 completed (checked: `wc`, `git log`,
   `manager_list_jobs`).
5. It is still Will's own exploring tool (`docs/philosophy/vision.md`: "Me, mostly"). It has one live site, no About page,
   no share preview and no stated phone support.

## The task's premise, checked

| Claim in the task | Finding |
|---|---|
| "About 60 jobs landed" | Low. 94 jobs in 15 days, about 85 completed (checked). |
| "The Steady board is now empty" | False. Ten open tasks, counting this one, when first listed. Five in the week lane wait only on a "Will looks on prod" tick. See section 4. |
| "Many URL flags never promoted to default" | Out of date. Will reviewed them on 28 Nov: 15 kept and on by default, 7 removed (`docs/ops/flags.md`). Only `?explain=1` and `?rivers=0` are unreviewed. |
| "Flag parsing scattered" | True when read (27 files under `lib/`, `components/` and `app/` used `URLSearchParams`). Fixed on main during this job by `9bd8879`: one file now (checked: `git grep`). |
| "Stale visual baselines" | True (inferred). Baselines last changed 24 Nov; `72546d4` changed 101 files and no baseline. I did not run `pnpm visual`. |
| "Broken AGENTS.md test ladder" | True (checked). `AGENTS.md` has a "Verification" list by file type but no ladder by phase, which is what Manager's prompts ask jobs to read. |

## 2. Five next directions, ranked

Ranked by value to Will first and to a first outside viewer second. Each has one first task, filed in Steady's idea lane.

| # | Direction | For Will | For a first viewer | First task (Steady id) |
|---|---|---|---|---|
| 1 | **Prove the new default view.** Measure speed, frame rate and looks with everything on. | High: the vision says "smooth and quick, with no pops or waits", and nobody knows if that still holds | High: a slow or broken first view is the first thing they meet | Measure first load, headed fps and the flag sweep on prod data; refresh baselines. `c0b6d97d`, M, headless, goal: close-up scene |
| 2 | **A first minute for a stranger.** Share card, a short About and sources page, a good opening view. | Medium: also serves the Horizon vision "Have an online presence" | Highest: today they get no introduction, under a page titled "footsteps" | `64206dc6`, M, headless with a PR preview for Will's wording. No goal fits; a new goal "showable to someone who has never seen it" is suggested |
| 3 | **Back to how people lived.** Groups, belief, trade and conflict are still not shown. | Highest: this is the anthropology motive | Medium | Ingest more Ethnographic Atlas columns; build a "their group" block on the person card. `adba6331`, M, headless, goal: constants of human life |
| 4 | **A true map of today.** 1950-2025 are the 1900 pattern scaled up. | Medium | High: today is the one year a visitor can check | Pick an open gridded source, then build the years. `1e9c9fd5`, L, headless, goal: extend the timeline to today |
| 5 | **The phone.** No doc says it works. | Low | High: shared links open on phones, and the app leans on hover and a left column (inferred) | Five scenes at phone size with touch; list, fix the small things. `e7e8cca7`, M, headless, goal: lean, low-bandwidth and tidy |

Why this order:

- **1 before everything.** `docs/ops/first-load.md` is dated 22 Nov (0.74 s to first people). The flip commit `72546d4` fixed
  several draw and panning costs and quotes spot numbers, but did not redo that table, a full frame-rate pass or the
  baselines. A 24 Nov run on prod (last entry of `docs/log.md`) found 45-60 fps by default and named trees and fields, with
  sky, as the costly ones (18-19 fps at zoom 12; 26-45 after a fix, with a game also using the GPU). All three are now
  default. Directions 2 and 5 show the app to other people; do not do that on unmeasured ground.
  A sceptical review of the 20-23 Nov features (`86000e12`, job `39841913`, size L) was filed while this memo was being
  written and is queued. It checks that each feature does what it claimed; `c0b6d97d` measures the default view as a whole.
  Run the review first and cut from `c0b6d97d` what it already covered.
- **2 before 3** only because it is small and unblocks sharing. It must not be a tour: Will removed the tour on 28 Nov and
  no reason is written down (looked in `docs/log.md`, `docs/ops/flags.md`, commit `72546d4`; not found). The About page
  also closes a real gap: many sources are CC BY and the app credits them only in scattered legend notes and hover lines
  (checked: no credits page under `footsteps-web/app`).
- **3 is the direction that matters most to Will over months.** Food, animals, habitat, ages, shelters and routine are
  built. Ritual, conflict and trade were put on hold as one "evidence layer" that was to share a design with the dated-site
  map marks (`docs/design/explorations/index.md`), and those marks were removed on 28 Nov. So the plan for them needs
  redoing, starting from the data.
- **4 and 5** matter mainly once someone else is looking. For 4, the city catalogue also has no figure after 1900, so no
  city is named or placed in 1950-2025 (checked: `public/settlements.json`, `cityPopulation` in `lib/settlements.ts`).

Considered and left out of the five: smooth movement of people between data years (`research/interpolation/`, big, and the
cross-fade is good enough); polity names (waits on the Seshat licence, research 0012); more past water and ice relief
(research 0014 ranks 2 and 5); the rest of the world-model audit (research 0015 open items, e.g. Siberia at 1800 and
Greenland at 800 CE). The audit items are worth doing as small fixes but are not a direction.

## 3. Top three risks or debts

1. **What agents are told no longer matches the code.** `AGENTS.md` is 2,650 words; a 28 Nov paragraph says the features
   are on by default while eight later phrases still say "off until ..." and it still names `?evidence=1` and `?plants=1`.
   It says it is a link to `.gent/rules.md`, but the two are separate files that have diverged: `AGENTS.md` lacks the
   island-settlement, domesticates-gate and continental-share entries, and `.gent/rules.md` lacks the jest command fix
   (checked: `git diff main:.gent/rules.md main:AGENTS.md`). It has no test ladder. `.manager.toml` still says "there is no
   docs/index.md", and `docs/index.md` lacks research 0015-0017. Every job starts by reading this, so every job pays.
   Fix: make one file the link again, cut the architecture section to a map that points at `docs/ops/`, and add the ladder
   (docs-only: `git diff --check`; web: lint, tsc, jest; Python: pytest; visual changes: `pnpm visual`).
2. **Nothing checks the default view automatically.** `pnpm visual` and the flag sweep need a GPU and data, so CI runs
   neither (`docs/ops/visual-regression.md`). They ran when jobs remembered, and the baselines are now stale (inferred).
   The last full sweep (22 Nov) ran three features on their fallback path because their data was missing. One real break
   already got through: `?sky=1` with `?ground=1` failed to compile on prod and the sweep missed it, because its close-up
   scene sat at zoom 10 (log, 24 Nov). Both are now default. Part of this is data: `food.json`, the adjusted spread and the
   Philippines row (research 0017) wait on a hand-run rebuild on budgie, so prod can differ from main with no alarm.
   Fix after direction 1: one command a job must run for any change under `layers/` or `hooks/`, a zoom-14 scene in the
   sweep, and a smoke check for every published dataset (today it covers the app, one API call, PMTiles, grid, terrain and
   habitat; not fauna, food or evidence).
3. **The flag scaffolding outlived its job.** Flags were how Will reviewed work on prod. Per-PR previews now do that
   (`5be7db7`), and the review is done. Parsing is now in one place (`9bd8879`). What is left: an 867-line
   `FootstepsViz.tsx`, a Features menu with 16 checkboxes, an off switch to keep working for every feature, and the seasons
   code, switched off by a constant (`FootstepsViz.tsx:129` on main: `season = 'off'`).

A smaller fourth: sourcing. 21 of 33 rows in `languages_expansions.yaml` are `checked: false`; `wardrobe.ts` (28 rows) rests
partly on unverified sources; no figure in `time_use.yaml` is marked as read in the source paper (5 secondary, 1 recalled,
6 with no figure). The labels are honest about it, so this is slow debt, not a risk.

## 4. What to stop or fold away

- **Stop adding close-up layers** until direction 1 has numbers. The close-up took about 15 jobs in a week; the next one
  buys less than a measurement does.
- **Stop using URL flags for review.** New looks go in a PR preview. Keep the debug and camera parameters.
- **Close the stale board.** Five week-lane tasks whose only open step is "Will looks on prod" have been answered
  (`0db83375`, `f6739de8`, `284ac663` by the 28 Nov review; `b5e37458` when settlements became the default;
  `d92449f9` because the figures were removed). `33fe4184` in the idea lane is the same. A sixth, `91d467b0`, waits on a
  publish step: the 24 Nov log says it was done, but the 28 Nov spread fix needs publishing again, so close it after that.
- **Finish or archive the goals.** Eleven goals were parked with every task done. Three of them now hold the new tasks for
  directions 3-5 (Steady shows them as backlog). Close or archive the other eight, so the open ones stand out.
- **Retire Dots.** It is a debug-only mode with its own pipeline (`hyde_tile_processor.py`, `tile_generator.py`,
  `dot_generator.py`: about 1,700 lines), a Google Cloud upload workflow (`upload-pmtiles.yml`) and PMTiles on budgie.
  The "smooth rendering" goal asked for this decision and I found no record that it was made. This is Will's call.
- **Delete the Google Cloud leftovers.** `iac/` was last touched in September 2025 and CI still runs a Terraform validate
  job (`ci.yml:113`). The "lean and tidy" goal listed this and it is still undone.
- **Delete what is left of the removed features.** `72546d4` already deleted most of it; the seasons code is left. Keep
  `lib/evidence.ts`: it is not a leftover, it feeds the "sources nearby" list in the details panel.
- **Do not rebuild the tour or the population chart.** Will removed both. If the reason is worth keeping, one line in
  `docs/ops/flags.md` would save the next agent from proposing them again.

## What I did not do

- Did not run the app, `pnpm visual`, the flag sweep or any test suite. Claims about speed and stale baselines come from
  dates and docs. Direction 1 is the task that checks them.
- Did not read the code file by file. Two of three reading agents died on the 5-hour quota, so the code and pipeline facts
  come from targeted `grep`, `wc` and `git log` runs. The docs survey did finish. Review corrected several errors in the
  first draft (`decisions.tsv`).
- Main moved while this was written (`a4562ff` Australia and research 0017, `914c68e` jest command, `9bd8879` flags).
  Only the points above were updated for it.
- Quota: the 5-hour window stood at 69% used when I started (7-day 50%), hit its limit partway, and reset at 10:20 UTC;
  near the end of writing it read 2% (7-day 53%). The window is shared with other jobs, so this job's own share is not
  visible.
