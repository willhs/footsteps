---
id: research-0018-strategic-overview-2026-11
type: research
purpose: "Ranked memo after about 90 jobs in two weeks: what Footsteps is now, the five next directions with a first task each, the three biggest debts, and what to stop"
date: 2026-11-28
tags: [research, strategy, planning]
related: ["philosophy/vision.md", "ops/flags.md", "ops/first-load.md", "ops/visual-regression.md", "research/0015-world-model-audit/research.md"]
---

# Footsteps: what next (November 2026)

**Status:** memo, 2026-11-28, read at commit `3f8d757`. Nothing here is built. The five first tasks are in Steady's idea lane, not dispatched.

**The short version.** In two weeks the app went from "where people were" to a full close-up world, and on 28 Nov Will turned
15 of those features on by default. The building is ahead of the checking: the new default view has never been measured, and
a stranger still gets no help on arrival. So: measure first, then make it showable, then go back to the anthropology.

Confidence words: **checked** = I ran a command or read the file today; **inferred** = follows from dates or docs, not run;
**not checked** = said so.

## 1. What the project is now

1. A globe of everyone alive at a chosen year, 100,000 BCE to 2025: measured-ish from HYDE for 10,000 BCE-1900, a labelled
   model before that, and a rough scaling of the 1900 map after it (`footsteps-web/lib/constants.ts` `MODERN_YEARS`).
2. Zoom in and it becomes a 3D place: relief, past water and ice, trees, fields, shelters, hearth smoke, people who follow a
   daily routine, and a 3D person in period dress. All on by default since `72546d4` (28 Nov).
3. Behind it sit about ten sourced datasets (D-PLACE analogs, Glottolog, fauna, food, ice, past water, radiocarbon, ancient
   DNA) and a small API that writes a grounded, labelled "imagine their day".
4. Size: 25,500 lines of TypeScript in 290 files with 98 test files; 15,800 lines of Python with 521 tests; 185 commits since
   13 Nov; 94 Manager jobs in 15 days, about 85 landed (checked: `wc`, `git log`, `manager_list_jobs`).
5. It is still Will's own exploring tool (`docs/philosophy/vision.md`: "Me, mostly"). It has one live site, no About page,
   no share preview and no phone status.

## The task's premise, checked

| Claim in the task | Finding |
|---|---|
| "About 60 jobs landed" | Low. 94 jobs in 15 days, about 85 completed (checked). |
| "The Steady board is now empty" | False. Ten open tasks. Six in the week lane are finished work waiting on a "Will looks on prod" tick, and Will did that review on 28 Nov. One of them is for `?figures=1`, which he removed. See section 4. |
| "Many URL flags never promoted to default" | Out of date. Will reviewed them on 28 Nov: 15 kept and on by default, 7 removed (`docs/ops/flags.md`). Only `?explain=1` and `?rivers=0` are unreviewed. The debt has moved: see debt 1. |
| "Flag parsing scattered" | True (checked: 27 non-test files touch `URLSearchParams`). Already filed as task `495cf454`. |
| "Stale visual baselines" | True (inferred). Baselines last changed 24 Nov; `72546d4` changed 101 files and no baseline; 16 commits touched `components/` or `lib/` since. I did not run `pnpm visual`. |
| "Broken AGENTS.md test ladder" | True (checked). `AGENTS.md` has a "Verification" list by file type but no ladder by phase, which is what Manager's prompts ask jobs to read. Main has since fixed the jest command in it (`914c68e`). |

## 2. Five next directions, ranked

Ranked by value to Will first and to a first outside viewer second. Each has one first task, filed in Steady's idea lane.

| # | Direction | For Will | For a first viewer | First task (Steady id) |
|---|---|---|---|---|
| 1 | **Prove the new default view.** Measure speed, frame rate and looks with everything on. | High: the vision says "smooth and quick, no pops or waits", and nobody knows if that still holds | High: a slow first load is the first thing they meet | Measure first load, headed fps and the flag sweep on prod data; refresh baselines. `c0b6d97d`, M, headless, goal: close-up scene |
| 2 | **A first minute for a stranger.** Share card, a short About and sources page, a good opening view. | Medium: also serves the Horizon vision "Have an online presence" | Highest: today they get a bare globe titled "footsteps" | `64206dc6`, M, headless with a PR preview for Will's wording. No goal fits; a new goal "showable to someone who has never seen it" is suggested |
| 3 | **Back to how people lived.** Groups, belief, trade and conflict are still not shown at all. | Highest: this is the anthropology motive | Medium | Ingest the D-PLACE columns every exploration named as step one; build a "their group" block on the person card. `adba6331`, M, headless, goal: constants of human life |
| 4 | **A true map of today.** 1950-2025 are the 1900 pattern scaled up. | Medium | High: today is the one year a visitor can check, and Lagos and Shenzhen are missing | Pick an open gridded source, then build the years. `1e9c9fd5`, L, headless, goal: extend the timeline to today |
| 5 | **The phone.** No doc says it works. | Low | High: shared links open on phones, and the app leans on hover and a left column | Five scenes at phone size with touch; list, fix the small things. `e7e8cca7`, M, headless, goal: lean, low-bandwidth and tidy |

Why this order:

- **1 before everything.** `docs/ops/first-load.md` is dated 22 Nov (0.74 s to first people). Since then the close-up gained
  sky, trees, fields, smoke, weather, rivers and a three.js person, all now default. The last flag sweep (22 Nov) ran four
  flags on their fallback path because the data was missing. Two jobs wrote that the 45 fps aim was "untested" because
  headless Chrome gave about 14 fps. Directions 2 and 5 show the app to other people; do not do that on unmeasured ground.
- **2 before 3** only because it is small and unblocks sharing. It must not be a tour: Will removed the tour on 28 Nov and
  no reason is written down (looked in `docs/log.md`, `docs/ops/flags.md`, commit `72546d4`; not found). The About page
  also closes a real gap: most sources are CC BY and the app credits them only in scattered hover lines (checked: no
  credits page under `footsteps-web/app`).
- **3 is the direction that matters most to Will over months.** Food, animals, habitat, ages, shelters and routine are
  built. Ritual, conflict and trade were put on hold as one "evidence layer" that was to share a design with the dated-site
  marks (`docs/design/explorations/index.md`), and those marks were removed on 28 Nov. So the plan for them needs redoing,
  starting from the data.
- **4 and 5** matter mainly once someone else is looking.

Considered and left out of the five: smooth movement of people between data years (`research/interpolation/`, big, and the
cross-fade is good enough); polity names (waits on the Seshat licence, research 0012); more past water and ice relief
(research 0014 ranks 2 and 5); the rest of the world-model audit (research 0015 and 0016 open items, e.g. no Philippines
row, Siberia at 1800, Greenland at 800 CE). The audit items are worth doing as small fixes but are not a direction.

## 3. Top three risks or debts

1. **What agents are told no longer matches the code.** `AGENTS.md` is 2,650 words; a 28 Nov paragraph says the features
   are on by default while eight later phrases still say "off until reviewed" and it still names `?evidence=1` and
   `?plants=1` (checked: `grep -c "off until" AGENTS.md`). It has no test ladder. `.manager.toml` still says "there is no
   docs/index.md". `docs/index.md` lacks research 0015 and 0016. Every job starts by reading this, so every job pays.
   Fix: cut the architecture section to a map that points at `docs/ops/`, and add the ladder (docs-only: `git diff --check`;
   web: lint, tsc, jest; Python: pytest; visual changes: `pnpm visual`).
2. **Nothing checks the default view automatically.** `pnpm visual` and the flag sweep need a GPU and data, so CI runs
   neither (`docs/ops/visual-regression.md`). They ran when jobs remembered, and the baselines are now stale (inferred).
   One real break already got through: `?sky=1` with `?ground=1` failed to compile on prod and the sweep missed it, because
   its close-up scene sat at zoom 10 (log, 24 Nov). Both are now default. Part of this is data: `food.json` and the
   adjusted spread wait on a hand-run rebuild on budgie (log, 28 Nov), so prod can differ from main with no alarm. Fix after
   direction 1: one command a job must run for any change under `layers/` or `hooks/`, a zoom-14 scene in the sweep, and a
   smoke check that covers every published dataset (today: grid, terrain, habitat only).
3. **The flag scaffolding outlived its job.** Flags were how Will reviewed work on prod. Per-PR previews now do that
   (`5be7db7`), and the review is done. What is left: 27 files that read the URL, an 878-line `FootstepsViz.tsx`, a
   Features menu with 16 checkboxes, and code from removed features still in the tree (`lib/seasons.ts` is still imported
   by the grid worker; `lib/evidence.ts` feeds `EvidenceNearby`; not checked whether either is still reachable). Task
   `495cf454` covers the parsing. Note it has a pending Manager job (`585db1f2`) although its notes say "NOT YET APPROVED".

A smaller fourth: sourcing. `languages_expansions.yaml` has 57 unverified marks to 13 checked, `wardrobe.ts` 14 unverified,
and every figure in `time_use.yaml` is from a secondary source (checked by `grep`; counts are of marker words, not rows).
The labels are honest about it, so this is slow debt, not a risk.

## 4. What to stop or fold away

- **Stop adding close-up layers** until direction 1 has numbers. The close-up took about 15 jobs in a week; the next one
  buys less than a measurement does.
- **Stop using URL flags for review.** New looks go in a PR preview. Keep only the debug and camera parameters.
- **Close the stale board.** The six week-lane tasks whose only open step is "Will looks on prod" were answered by the
  28 Nov review (`b5e37458`, `0db83375`, `f6739de8`, `284ac663`, `91d467b0`, and `d92449f9` for the removed figures).
  `33fe4184` in the idea lane is the same. Close `86000e12` (sceptical review) in favour of the new measuring task.
- **Finish or archive the goals.** Ten parked goals have every task done. Mark them complete or archive them, so the two
  that are really open (close-up scene, ways of life) stand out.
- **Retire Dots.** It is a debug-only mode with its own pipeline (`hyde_tile_processor.py`, `tile_generator.py`,
  `dot_generator.py`: about 1,700 lines), a GCP upload workflow (`upload-pmtiles.yml`) and PMTiles on budgie. The "smooth
  rendering" goal asked for this decision and it was never made. This is Will's call.
- **Delete the GCP leftovers.** `iac/` was last touched in September 2025 and CI still runs a Terraform validate job
  (`ci.yml:113`). The "lean and tidy" goal listed this and was parked with it undone.
- **Delete the code of the seven removed features** once the flags module lands, in one sweep.
- **Do not rebuild the tour or the population chart.** Will removed both. If the reason is worth keeping, one line in
  `docs/ops/flags.md` would save the next agent from proposing them again.

## What I did not do

- Did not run the app, `pnpm visual`, the flag sweep or any test suite. Claims about speed and stale baselines are
  inferred from dates and docs. Direction 1 is the task that checks them.
- Two of three reading agents died on the 5-hour quota, so the code and pipeline facts here come from my own `grep`,
  `wc` and `git log` runs, not a file-by-file read. The docs survey did finish.
- Main moved while I read (`a4562ff` raises Australia, `914c68e` fixes the jest line, and a research 0017 exists there).
  Not folded in.
- Quota: the 5-hour window stood at 69% used when I started (7-day 50%), hit its limit partway, and reset at 10:20 UTC;
  near the end it read 2% (7-day 53%). The window is shared with other jobs, so this job's own share is not visible.
