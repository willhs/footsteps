---
id: task-0002
type: spec
purpose: "Per-era Earth images (Krapp2021 biomes + Blue Marble colours + HYDE farmland) under the people layer."
tags: ["terrain", "rendering", "data", "pipeline"]
---

# Footsteps: terrain v1 - per-era Earth images from Krapp2021 biomes + Blue Marble colours

Vision alignment: On a new endeavour — Want to reach my potential with software
(goal: Footsteps: Earth from space across history (terrain))

## Goal

Terrain mode shows a plausible Earth for the slider year: 10,000 BCE shows Doggerland,
the Bering land bridge and ice over Canada/Scandinavia; 1900 shows farmed
Europe/India/China; each image is at most ~400 KB; the smoke test is green and the build
is live on footsteps.willhs.me.

## Context

Terrain mode today draws Esri World Imagery tiles (`backgroundLayers.ts`
`createTerrainLayer`, desaturate 0.1, tint 215): a modern Earth at every year, from a
third-party tile server. People are drawn over it as night lights (`GlowLayer.ts`,
`LIGHTS` blend). The plain map (terrain off) keeps the flat sea + `world-simple.geojson`
land and the additive glow.

Time is continuous (`lib/time.ts` `bracket`); the terrain must follow it the same way,
cross-fading the two nearest terrain steps.

Decided with Will (goal grill, 2026-11-09): dimmed realistic day colours; moving
coastlines, ice sheets, biomes and the human footprint (farmland tan by HYDE
cropland/pasture share); one ~2048x1024 image per era, no tiles; a faint modern
coastline; a one-line source note in the legend; terrain back to ~100,000 BCE.
Green Sahara: hand-made overlay for ~9000–3500 BCE from the African Humid Period
literature, eased in and out, and credited as literature in the legend. Between steps:
blend. Antarctica: Krapp2021 is global.

## Scope

Must do:
- `footstep-generator/terrain_image.py`: Krapp2021 biomes + land/ice/sea (pastclim
  Zenodo 8415273, CC-BY 4.0), NASA Blue Marble NG July colours, HYDE land use
  (the published `landuse_{year}.png`), writes `data/tiles/terrain/earth_{year}.webp`
  (2048x1024, lossy WebP) for 1 ka steps to 100,000 BCE plus every HYDE year.
- Green Sahara overlay with Mega-Chad.
- Client: replace the Esri tiles with the per-era images, cross-faded by `time`;
  faint modern coastline; one-line source note in the legend.
- Night lights stay readable on deserts and ice.
- Deploy (`scripts/deploy-budgie.sh` syncs the new folder; `scripts/smoke.sh` checks it).
- Before/after screenshots: 10,000 BCE, 6000 BCE, 1000 CE, 1900; world + Europe/N Africa.

Won't do:
- Extend the slider before 10,000 BCE (older images are built and published only).
- Tiles or higher-resolution imagery; sharper ice from ICE-6G/PaleoMIST.

## Success Criteria

- [ ] 10,000 BCE image shows Doggerland, Beringia and ice sheets over Canada and Scandinavia
- [ ] 1900 image shows farmed Europe, India and China
- [ ] Every image <= ~400 KB
- [ ] 6000 BCE shows a green Sahara with Mega-Chad; 1000 CE does not
- [ ] Terrain cross-fades between steps while scrubbing (no flash, no blank frames)
- [ ] Smoke test green against footsteps.willhs.me after deploy

## References

- Goal description (Steady): Footsteps: Earth from space across history (terrain)
- `docs/ops/grid-images.md` (land-use encoding)
- Steady task: 932b7518-91be-4489-ae19-6f4814a74d2a

## Assumptions

- Coastline detail comes from ETOPO1 (NOAA, public domain, 4 arc-min via ERDDAP) inside
  Krapp's 0.5° coastal band; Krapp stays authoritative away from coasts.
- Farmland uses the already-published HYDE land-use PNGs, not the raw ASCs.
