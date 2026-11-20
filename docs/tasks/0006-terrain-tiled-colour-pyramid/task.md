---
id: task-0006
type: spec
purpose: "Give the terrain colour a tiled zoom pyramid so close views are not one 20 km/px era image stretched."
tags: ["terrain", "tiles", "close3d", "benchmark"]
related: ["../../ops/terrain-images.md", "../../ops/terrain-bench.md", "../0002-terrain-per-era-earth-images/task.md"]
created: 2026-11-21
updated: 2026-11-21
---

# Terrain: a tiled colour pyramid so close views aren't 20 km/px

## Goal

Close views (zoom 5 to 12) get terrain colour from a tiled zoom pyramid instead of one 2048 × 1024 era
image (~19.6 km per pixel), measured with `scripts/terrain-bench` (texel size and time to detail) before and after,
without an fps regression, and without inventing detail the inputs don't have.

## Context

Will saw the UK at 50,000 BCE, zoom 7, look unfinished: the era image is one 2048 × 1024 picture per terrain year,
stretched at close zoom (64 screen px per texel at zoom 8, 256 at zoom 10, `docs/ops/terrain-bench.md`).
The goal "Footsteps: detailed terrain, sharp and fast at every zoom" asks for a colour texel ≤ 2 screen px at every
zoom up to 12, and lists "tiled colour pyramid (modern imagery recoloured by era masks)" as an idea to try.
Vision alignment: On a new endeavour — Want to reach my potential with software.

`terrain_image.py` already paints land as `Blue Marble × (smoothed era colour ÷ smoothed Blue Marble)`: the fine
detail is the modern photo and only the broad colour is the era's. So the era image divided by the same Blue Marble
at 2048 × 1024 is a smooth per-year "recolour ratio", and a finer Blue Marble times that ratio is the same picture
with finer detail. NASA publishes Blue Marble Next Generation at 500 m (86,400 × 43,200, eight 21,600² tiles),
four times finer than the 5,400 × 2,700 file used today and about one texel per screen pixel at zoom 8.

## Scope

### Must Do
- Generate a tiled pyramid (256 px WebP, Web Mercator XYZ) to about zoom 8 from the inputs terrain_image.py uses,
  measure bytes per year and the total for `TERRAIN_YEARS`, and bound storage (write the trade-off down).
- Draw it with a deck.gl `TileLayer` that keeps the cross-fade between terrain years.
- Feed the close-up 3D ground the tile colour in place of the era image.
- Say in `docs/ops/terrain-images.md` where an input is coarser than the tile (Krapp 0.5°, HYDE 5′, ETOPO 4′)
  and don't invent detail; label sharp modern detail on past eras as imagined.
- Benchmark before/after (`--compare`), screenshots at UK 50,000 BCE z7, Nile 3000 BCE z8 and the globe.
- Flag-free only if no regression; otherwise behind `?terrain_tiles=1` with the reason recorded.

### Might Do
- Count the pyramid's requests and bytes as terrain in the benchmark.

### Won't Do
- Sources finer than 500 m (Sentinel-2 or similar): the goal's z10–12 texel target stays open, written down.
- Per-year deep pyramids (see Assumptions).
- Publishing to budgie and the prod smoke (after merge, home network).

## Constraints

- Static files served by Caddy under `/terrain/` (already cached a day, Cloudflare in front).
- Inputs gitignored under `data/raw/`; generated files not committed.
- Every scrub between terrain years must stay cheap (no burst of new tile requests per year).

## References

- `docs/ops/terrain-images.md`, `docs/ops/terrain-bench.md`, `footstep-generator/terrain_image.py`
- `footsteps-web/components/footsteps/hooks/useTerrainLayers.ts`, `layers/TerrainReliefLayer.ts`, `layers/Close3DLayer.ts`
- Steady task: 99d03a3d-b478-40c7-abd2-9dfa46d6ac82

## Success Criteria

- [ ] Pyramid generated, bytes measured and written down (per year and total)
- [ ] TileLayer draws it with the year cross-fade; close-up 3D ground uses the tile colour
- [ ] Benchmark: close-view texel size and time to detail before/after with numbers; no fps regression
- [ ] Screenshots before/after: UK 50,000 BCE z7, Nile 3000 BCE z8, globe
- [ ] Rollout decision (flag-free or `?terrain_tiles=1`) recorded with the reason
- [ ] (after merge) Tiles published to budgie, smoke passes on prod

## Assumptions

- **One year-independent detail pyramid, recoloured per year on the GPU**, instead of a pyramid per year. The per-year
  part is the existing era image pair (already cross-faded); the pyramid is the modern 500 m photo plus a 2048 × 1024
  reference, and the shader computes `detail × era ÷ reference`. A per-year z8 pyramid would be ~120 × the bytes
  (tens of GB) and would refetch every tile on every scrub. This satisfies "build deep zooms for fewer years" in the
  limit (one set) and is what the goal's idea list calls "modern imagery recoloured by era masks".
- Pyramid zooms 3 to 8: below 3 the era image is already ≤ 2 px per texel; 8 is where 500 m runs out.
- Tiles that are all open ocean in the photo are not written; a small manifest says which tiles exist (no 404s).
