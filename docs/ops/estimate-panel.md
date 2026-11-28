---
id: estimate-panel
type: ops
purpose: "The ?explain=1 'How we estimate this' panel: what it says, where its words come from, and how to add a line"
updated: 2026-11-28
---

# How we estimate this (`?explain=1`)

A prototype, off by default, for one way of answering "how sure is this?": instead of drawing uncertainty on the map, a
quiet "How is this estimated?" link under the counter opens a panel in the left column. For the year on the slider and the
place under the cursor (else the clicked spot, else the map centre) it lists what each part of the map is built from, in
the order the map is built: people, which cells hold them, the gap between data years, way of life, groups close in, land
and sea, climate. Each line has its source, the method in a sentence, and one confidence word.

Will has not decided how, or whether, uncertainty is shown (2026-11-28); this is for trying, not a decision. It draws
nothing on the map.

## Where the words come from

`footsteps-web/lib/estimate.ts` is pure and tested (`lib/estimate.test.ts`); `components/footsteps/overlays/EstimatePanel.tsx` lays it out.

| Line | Source | Confidence from |
|---|---|---|
| People | HYDE 3.5 from 10,000 BCE; the pre-HYDE model ([prehistory-population.md](prehistory-population.md)) before | spread of published world totals for the year (`lib/population_estimates.json`, research 0005): high/low under 1.5 fair, under 3 rough, else very rough. Before HYDE always very rough, with the model's low–high |
| Which cells | HYDE allocation weights | one step below the world total; notes modern borders before 1 CE and the doubtful continental split before 4000 BCE (research 0015, the human-timeline thread) |
| Between data years | the two people images either side | rough, very rough when they are over 500 years apart; hidden on a data year |
| Way of life | HYDE cropland and grazing, the domesticates gate | very rough before 1500 (land use is per-capita allocation), rough after |
| Groups close in | settlement model ([settlements.md](settlements.md)) | always "Illustrative" |
| Land and sea | Spratt & Lisiecki 2025 (with its 1σ), Krapp 2021, Terrain Tiles | rough while the sea is over 5 m from today's, fair after |
| Climate | Beyer, Krapp & Manica 2020 | rough |

"Here, at this time" lists known problems with HYDE at the place (`HYDE_CAVEATS`: Australia before 1788, Siberia 1700–1900,
Greenland 500–1300, from research 0015) and, once wired, the corrections PR 155's tables make there (`EstimateInput.corrections`;
`unsettledAt`, `citiesBy`, `biomeNoteAt` and friends are pure `(lon, lat, year)` lookups, so each can add a `PlaceCaveat`).

## Adding a line or a caveat

Add a row to `HYDE_CAVEATS` (a rough box and years, the text, the source), or a function to `estimateLines`, and a test.
Keep the panel text-only: no bars, colours or numbers for confidence.

Screenshots (1280 × 800, prod data through a local build): [1000 CE, first line open](estimate-panel/rome-1000.webp), [20,000 BCE](estimate-panel/lgm-20000bce.webp), [Australia 1500 CE with a place caveat](estimate-panel/australia-1500.webp).
