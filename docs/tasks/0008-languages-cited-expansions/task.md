---
id: task-0008
type: spec
purpose: "A cited table of language expansions (colonial 1500-1900 and deep-time families, research 0007 steps 2-3) shown as one hover-card line behind ?langs=deep."
tags: ["languages", "hover-card", "research-0007", "anthropology"]
related: ["../../ops/languages.md", "../../research/0007-languages-over-time/research.md", "../../ops/food.md"]
created: 2026-11-21
updated: 2026-11-21
---

# Languages over time: cited expansions table in the hover card behind ?langs=deep

## Goal

A hand-written, source-checked `languages_expansions.yaml` holds every row of research 0007 steps 2 and 3, and the hover card
says, for the cell and year under the cursor and only with `?langs=deep`, which families were spreading there, from when and
on whose authority: "Languages spreading here: Bantu (from about 4,000-5,000 years ago; Koile et al. 2022)".

## Context

Step 1 (Glottolog baseline for about 1500 CE) shipped in `9331154` (`docs/ops/languages.md`). Its limits say the 1500-1900 rows do
not follow colonial replacement and nothing is said before 1500. Research 0007's plan fills that with two small tables:

- **Step 2:** colonial and historical movements: Spanish and Portuguese in the Americas, English in North America and Australasia,
  Arabic in North Africa, Turkic in Anatolia and Central Asia. One cited row each: family, area (cells), start year, source.
- **Step 3:** deep-time expansions from Findings §2: family, Glottolog id, start range (lo..hi BP), cells, source, disputed or not.
  Indo-European, Afro-Asiatic and Uto-Aztecan stay disputed rows with no cells.

Every source is checked against its DOI or publisher page (fetched, not from memory), or the row says `unverified` and why,
like `food.md`'s `checked`/`unverified`. The research's rules hold: no family colours on the globe, nothing before 5 ka.

Vision alignment: Footsteps: how people lived (ways-of-life layer). Who spoke what is part of how people lived; this adds it as a
labelled, cited line without drawing anything on the globe.

## Scope

### Must Do
- `footstep-generator/anthropology/languages_expansions.yaml`: every row of steps 2-3, each with `checked: true` and a DOI/URL in
  `source`, or `checked: false` and an `unverified` reason.
- A compiler + validator that writes a small static asset the web app reads; measure its size.
- Hover-card line behind `?langs=deep` only: families spreading in the cell at the slider year, with the range, the short source and
  "disputed" where a row is.
- Tests: cell/year lookup, the 5 ka floor (nothing before 3050 BCE), the flag, and the YAML rules (Python).
- Browser screenshots with the flag on and off: Mexico 1700, central Africa 1000 BCE, Anatolia 1200 CE.
- `docs/ops/languages.md` and the log fragment updated.

### Won't Do
- Family colours or hatching on the globe (research rule; a later step may draw it).
- Anything before 5 ka (5,000 BP = 3050 BCE).
- Cells for Indo-European, Afro-Asiatic, Uto-Aztecan (disputed until a model is chosen).
- Changing the step-1 baseline line, the atlas record or the API.
- Normalising Seshat family strings.

## Success Criteria
- [ ] The YAML has every row of steps 2-3 with checked or unverified sources
- [ ] Tests cover the cell/year lookup and the 5 ka floor
- [ ] A small static asset carries it, size measured
- [ ] Screenshots: Mexico 1700, central Africa 1000 BCE, Anatolia 1200 CE, flag on and off
- [ ] Python + frontend checks and build pass
- [ ] `languages.md` and the docs log updated

## Assumptions
- "The record or a small static asset": a static asset (`public/languages/expansions.json`), because deep rows answer for years
  before 1500 where the hover card makes no atlas request, and it needs no API or data deploy.
- "Area (cells)" is written as 5° boxes (south, west, north, east, multiples of 5) that expand to the atlas's 5° cells; listing
  hundreds of cell keys by hand for the Americas would be error-prone.
- A row shows from the older end of its start range (the spread may have begun then), clamped to the 5 ka floor, until 1900.
- Sources that refused automated fetches (Britannica, Te Ara, NMA) are not "checked"; a date read only on Wikipedia is
  `unverified` with that reason.

## References
- Research: `docs/research/0007-languages-over-time/research.md` (2026-11-14), Findings §2, "Recommendation and data plan".
- Step 1: `docs/ops/languages.md`, `footsteps-web/lib/languages.ts`.
- Pattern for checked/unverified: `docs/ops/food.md`.
- Steady task: e383d3ae-41bd-42da-a140-e2318a4948f2
