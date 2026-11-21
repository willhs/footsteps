---
id: plan-0008
type: spec
purpose: "Implementation plan for the cited language expansions table and its ?langs=deep hover line (research 0007 steps 2-3)."
tags: ["plan", "languages", "hover-card"]
related: ["./task.md"]
---

# Language expansions table + ?langs=deep hover line: implementation plan

## Overview

**Primary goal:** with `?langs=deep`, hovering Mexico in 1700 says Spanish was spreading there from 1519, central Africa in
1000 BCE says Bantu from about 4,000-5,000 years ago, Anatolia in 1200 says Turkic from 1071, each with its source; nothing is said
before 3050 BCE (5 ka), and without the flag the card is unchanged.

**Approach:** one hand-written YAML (the cited table) → a small Python compiler/validator → one static JSON in
`footsteps-web/public/languages/` → a pure TS lookup (`lib/languageExpansions.ts`) → one more hover-card row.
Vision alignment: Footsteps: how people lived (ways-of-life layer).

## Current State Analysis

- Step 1 shipped in `9331154`: `footsteps-web/lib/languages.ts` words the Glottolog baseline; `hooks/useLanguages.ts` fetches it from
  `/api/anthropology?...&fill=0` only from `LANGUAGES_FROM = 1500`; `lib/hoverCard.ts:124` adds row `languages`.
- Flags precedent: `lib/food.ts:13` `foodEnabled(search)`, `hooks/useFood.ts` fetches `/food/food.json` once, only when flagged and
  hovering; `hoverCard.ts` shows the food row only on land.
- Table precedent: `footstep-generator/anthropology/time_use.yaml` + `time_use.py` (YAML → JSON export, rules in the header);
  `docs/ops/food.md` `checked`/`unverified` (a test enforces that a checked claim has a DOI/URL and an unchecked one a reason).
- The atlas key is 5° cells by south-west corner (`useAnthropology.ts:43`), so 5° boxes on the same grid map 1:1 to atlas cells.
- Research 0007 (2026-11-14) Findings §2 lists the deep rows and flags every number as secondary; this job re-reads them.

### Source check done before planning (evidence in the workspace `evidence/sources/`)
- Read from abstracts (Crossref + Europe PMC): Grollemund 2015 (~5,000 y), Koile 2022 (4,420; 4,040-5,000 BP), Gray 2009 (Taiwan
  ~5,230), Zhang 2019 (4,200-7,800, mean ~5,900 BP), Sagart 2019 (~7,200 BP), Kitchen 2009 (Semitic ~5,750), Merrill 2009 (PUA split
  ~6900 cal BC, Great Basin), Heggarty 2023 (~8,120 BP), Wilmshurst 2011 (Society Is. CE ~1025-1120, rest CE ~1190-1290),
  Beresford-Jones & Heggarty 2012 (Wari → Quechua, Early Horizon → Aymara; no years in the abstract).
- Read in open full text: Russell, Silva & Steele 2014 PLoS ONE (eastern Africa by 3000 BP, Urewe Great Lakes from ~2500 BP,
  southern Africa 3000-2000 BP, NE South Africa by 1500 BP).
- Not readable: Pama-Nyungan (Bouckaert 2018) and Uralic (Honkola 2013) figures are not in the abstracts and the papers are paywalled.
- Historical dates: NPS (Jamestown 1607) and history.state.gov (Louisiana Purchase 1803) loaded. Britannica, Te Ara, NMA, NZHistory
  return 403 to automated fetches; those dates were read on Wikipedia only.

## Data shape (the invariant)

```
YAML row = {id, family, glottocode, kind: historical|deep,
            start_year (historical, CE) | start_bp: [lo, hi] (deep, years before 1950),
            boxes: [[south, west, north, east], ...]   # multiples of 5; [] only for disputed rows
            disputed: bool, cite (short), source (full, with doi:/URL), checked: bool, unverified: str, note}
asset row = {id, family, from_year, start_year? | range_bp?, boxes, disputed, cite, checked}   # rows with boxes only
```

- `from_year` = `start_year`, or `max(1950 - hi, FLOOR_YEAR)`; `FLOOR_YEAR = -3050` (5,000 BP). The TS lookup also refuses any
  year before the floor, so the floor holds even if a row is wrong.
- `checked: true` ⇒ `source` has a `doi:` or `http` and `unverified` is empty; `checked: false` ⇒ `unverified` says why.
- A cell × year is "spreading" when the point is inside one of the row's boxes (half-open: south ≤ lat < north, west ≤ lon < east)
  and `year ≥ from_year`.

## Design options

| Option | Exposes | Verdict |
|---|---|---|
| A. Atlas record field (`fields.languages.expansions`) | API change, record rebuild + data deploy; the hover card asks the atlas only from 1500 | No: deep rows need years before 1500 |
| **B. Static asset fetched with the flag** (like `?food=1`) | one JSON, one hook, one pure function | **Chosen**: no API or deploy step, ~6 KB, the lookup is testable without a server |
| C. Import the JSON into the bundle | bundle grows for every visitor | No: flag-only feature |

## What we're NOT doing
See task.md Won't Do: no globe drawing, nothing before 5 ka, no cells for IE / Afro-Asiatic / Uto-Aztecan, no change to step 1.

## Assumptions
- Static asset, not the record (option B), because the deep rows answer for years with no atlas request.
- Areas are 5° boxes on the atlas grid; overlaps between rows are allowed (both are listed).
- A row shows from the older end of its range (clamped to the floor) with the whole range in words; no end year (the atlas ends at 1900).
- Ranges whose recent end is after 1 CE are worded in calendar years ("from about 1190-1290 CE"); older ones in years ago, rounded to
  100 ("from about 4,000-5,000 years ago"); a single value reads "about 5,200 years ago".
- The row's evidence label is `modelled` always: even a dated conquest is turned into a spreading area by hand-drawn boxes.
- Only on land (like food), so open sea inside a box says nothing.
- Wikipedia-only dates are `checked: false`, reason given; Bantu rows use Glottolog's Narrow Bantu `narr1281`.

---

## Phase 1: The table and its compiler

- [x] Write `footstep-generator/anthropology/languages_expansions.yaml` (header with the rules; step-2 rows: Spanish Caribbean,
      Mexico, Central America, Andes, Chile, Río de la Plata; Portuguese Brazil; English eastern and interior North America, Australia,
      New Zealand; Arabic Egypt, Maghreb; Turkic Anatolia, Central Asia. Step-3 rows: Bantu forest, east, south; Austronesian Taiwan,
      island SE Asia, West Polynesia, Madagascar, Society Islands, rest of East Polynesia; Pama-Nyungan; Sino-Tibetan; Uralic; Quechua
      (Wari, Inca); Aymara; Indo-European, Afro-Asiatic, Uto-Aztecan disputed with no boxes)
- [x] Write `footstep-generator/anthropology/languages_expansions.py`: `load()`, `validate(rows)` (raises on a broken rule),
      `export(rows)` → dict, `main()` writes `footsteps-web/public/languages/expansions.json` and prints its size
- [x] Write `footstep-generator/tests/test_languages_expansions.py`: rules (checked/unverified, grid, disputed rows, required families),
      `from_year` and the floor, the committed asset equals a fresh export
- [x] Run: `poetry run python footstep-generator/anthropology/languages_expansions.py` — writes the asset, prints bytes
- [x] Run: `poetry run pytest footstep-generator/tests/test_languages_expansions.py -q` — pass

## Phase 2: Lookup, hook and card row

- [x] `footsteps-web/lib/languageExpansions.ts`: types, `EXPANSIONS_FLOOR_YEAR`, `langsDeepEnabled`, `expansionsHere`, `expansionLine`
- [x] `footsteps-web/components/footsteps/hooks/useLanguageExpansions.ts`: fetch the asset once, only with the flag and while hovering
- [x] `lib/hoverCard.ts`: input `expansions`, row id `spread` after `languages`, land only, floor re-checked
- [x] `overlays/HoverCard.tsx`: pass `expansionsHere(...)` into `hoverCardRows`
- [x] `lib/languageExpansions.test.ts`: lookup by cell and year, the floor, box edges, wording (range, CE, disputed, not verified),
      the flag, the card row only with input on land
- [x] Run: `pnpm --dir footsteps-web test -- --runInBand languageExpansions hoverCard` — pass

## Phase 3: Prove it in the browser

- [x] `footsteps-web/scripts/verify-language-expansions.mjs`: Mexico 1700, central Africa 1000 BCE, Anatolia 1200, plus 4000 BCE
      (floor), each with `?langs=deep` and without; asserts the line and its absence; screenshots + JSON into the evidence dir
- [x] Run it against `pnpm --dir footsteps-web dev` on a free port (and the local day API for the step-1 line)

## Phase 4: Docs and checks

- [x] `docs/ops/languages.md`: steps 2-3 section (table, rules, asset size, card line, limits); update the step-2/3 "not built" text
- [x] `docs/log.d/<job>.md`, `docs/index.d/<job>.md` (if a new doc), AGENTS.md architecture line for languages
- [x] Run: `poetry run pytest footstep-generator/tests/ -q`, `pnpm --dir footsteps-web lint`, `exec tsc --noEmit`,
      `test -- --runInBand`, `build`, `git diff --check`

## Phase 5: Wrap
- [x] Commit (stage named paths only); write the envelope

## References
- Task: `docs/tasks/0008-languages-cited-expansions/task.md`
- Research: `docs/research/0007-languages-over-time/research.md` (2026-11-14)
