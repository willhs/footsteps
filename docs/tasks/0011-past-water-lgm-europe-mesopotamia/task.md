---
id: task-0011
type: spec
purpose: "Add two dated past-water scenarios behind ?pastwater=1: a European LGM lake and river snapshot (CRC806, CC-BY) and Mesopotamian coast stages (Giosan & Goodman 2025, CC BY 4.0), in the machinery Mega-Chad uses."
tags: ["terrain", "freshwater", "placement", "close-up", "modelled", "experimental"]
related: ["../../ops/past-water.md", "../../research/0014-past-terrain/research.md"]
created: 2026-11-21
updated: 2026-11-21
---

# Past water: European LGM lakes and rivers snapshot and Mesopotamian coast stages

## Goal

`?pastwater=1` carries three dated scenarios (Mega-Chad, European LGM, Mesopotamian coast stages) that every consumer
(group placement, freshwater distance, close-up water, Earth picture) reads from one manifest per scenario; with the
flag off nothing changes.

## Context

`?pastwater=1` has one scenario, the Lake Mega-Chad highstand (`docs/ops/past-water.md`, `footstep-generator/past_water.py`).
Research 0014 ranks next: (3) a European Last Glacial Maximum lake and river snapshot from small published vectors,
shown only in its dated window and never interpolated through the Holocene; (4) Mesopotamian coast and delta stages,
labelled as interpreted and bounded to the region. The research left licence and payload unverified.

Verified 2026-11-21 (this job):
- CRC806 "LGM major inland waters of Europe" (Verheul, Zickel, Becker, Willmes 2015, doi:10.5880/SFB806.14): dataset page
  licence "Attribution required, commercial use, derivations allowed"; the metadata PDF says CC-BY (version not stated).
  Payload: `LGM_Lakes.zip` 227,113 B (80 polygons), `LGM_River.zip` 77,498 B (94 lines), WGS84. Interval 26,500–19,000 yBP.
  It has **no Black Sea**: the Black Sea example in the Steady task cannot show a change from this source.
- Giosan & Goodman 2025, PLOS ONE 20: e0329084, CC BY 4.0. Its SI tables (DOCX) are geochemistry and radiocarbon dates,
  **not coastline geometry**. The coast stages exist only as Fig 6 (three map panels on a 2° graticule, "~8000 / ~6000 /
  ~4000 BP" on the panels, "7,000, 6,000 and 4,000 years ago" in the caption). Geometry must be traced from the figure;
  CC BY 4.0 allows that with attribution.

Vision alignment: Footsteps: the close-up scene (what you'd see standing there) — goal context; past water decides where
the close-up's water and people are.

## Scope

### Must Do
- Confirm licence and payload of each source (done above), pin their bytes by sha256 in the build scripts.
- Generalise the Mega-Chad machinery to several scenarios, each with its own manifest (datum, dates, validity,
  uncertainty, licence), epochs with globally unique ids, and per-epoch patches; caches keyed by epoch.
- European LGM scenario: lakes are wet (exclusion) and, where fresh, water for the freshwater distance; rivers feed the
  freshwater distance only. One epoch, 26,500–19,000 BP, nowhere else.
- Mesopotamian scenario: three interpreted stages traced from Fig 6, bounded to the head of the Gulf; the water is sea
  (wet exclusion, not fresh).
- Groups with no dry spot are counted `unresolved`, never forced in or dropped. Outside a scenario's window: "geography
  unknown", not dry.
- Close-up water for every scenario; Earth image paint for every scenario's years.
- `past_water_check.py` and the real-data placement test cover every scenario.
- Docs: `docs/ops/past-water.md`, log fragment.

### Won't Do
- Change any default, deploy, or regenerate HYDE/prehistory population images.
- Black Sea levels (not in the CRC806 data; research 0014 found only competing levels).
- Remove modern Natural Earth water in any window.
- Interpolate between stages or through the Holocene.

## Success Criteria
- [ ] `past_water_check.py` passes for each scenario: no group in modelled water, totals unchanged, nothing changes outside the region
- [ ] Flag off changes nothing (`pnpm visual` passes)
- [ ] Real-data screenshots flag on and off: Po plain / Caspian at 20,000 BCE, Basra 4000 BCE (Black Sea: no data, documented)
- [ ] Sizes measured
- [ ] Frontend (lint, tsc, jest) + Python tests and build pass
- [ ] `docs/ops/past-water.md` and the log updated

## Assumptions
- Calendar BP from 1950 as Mega-Chad (app year = 1950 − BP).
- LGM freshness: Caspian, Aral, Sarygamysh and Lisan are not fresh (brackish to hypersaline); every other lake (ice-dammed,
  Alpine, North Sea ice lake, Russian) is assumed fresh. Rivers are fresh.
- Mesopotamian stage windows are each snapshot ±500 years; stage a spans 8,000–6,501 BP to cover both the panel's
  "~8000" and the caption's "7,000". 5,500–4,500 BP falls between stages: geography unknown.

## References
- `docs/ops/past-water.md`, `docs/research/0014-past-terrain/research.md` ("Recommendations" ranks 3-4)
- https://crc806db.uni-koeln.de/dataset/show/lgm-major-inland-waters-of-europe--gis-dataset1449846174
- https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0329084 (Fig 6)
- Steady task: 85059183-edd6-47bc-ae5b-fddee51d74f4
