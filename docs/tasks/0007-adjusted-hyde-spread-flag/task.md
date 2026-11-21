---
id: task-0007
type: spec
purpose: "Show the climate-adjusted HYDE spread (Green Sahara, exposed shelves) behind ?spread=1, labelled adjusted spread."
tags: ["grid", "hyde", "climate", "flag", "units"]
related: ["../../ops/hyde-climate-spread.md", "../../ops/grid-images.md", "../../ops/past-water.md"]
created: 2026-11-21
updated: 2026-11-21
---

# Show the adjusted HYDE spread behind `?spread=1`

Vision alignment: Footsteps: how people lived (ways-of-life layer)

## Goal

With `?spread=1`, people show in the Green Sahara and on the exposed shelves (Doggerland, Sundaland, Beringia,
Sahul) at 10,000–4,000 BCE, labelled "Adjusted spread (modelled on HYDE)"; without the flag nothing changes, and
the world total is the same either way.

## Context

HYDE 3.5 spreads early people with today's land suitability, so the Sahara stays nearly empty in 10,000–4,000 BCE
while the terrain images paint it green, and the shelves are dry land with nobody on them.
`footstep-generator/hyde_climate_spread.py` already writes an adjusted copy (regional totals kept) to
`data/tiles/grid_adjusted/` in `grid_image.py`'s encoding; nothing reads it (`docs/ops/hyde-climate-spread.md`
"Wiring it in (not done)"). Goal context: show how people lived, not just where; putting people where the climate
then let them live is part of that.

## Scope

### Must do

- The grid pipeline (Units, Grid, the worker, the empty-view note, the cell totals) reads the adjusted image for
  the years it covers when `?spread=1`; every other year, and every year without the flag, is unchanged.
- Say "Adjusted spread (modelled on HYDE)" where the measured label would show: the counter's note, the
  notes toggle and data notes, the hover card's people row and the empty-view note.
- The counter's world total does not change; assert the adjusted totals match HYDE's.
- Dots (static PMTiles) says the adjustment does not apply there.
- The -4000 → -3000 step: check for a jump; reuse the year cross-fade / unit morph.
- `scripts/deploy-budgie.sh` rsyncs the adjusted images (never deletes); `scripts/smoke.sh` warns while they are
  unpublished.
- Build the data with `hyde_climate_spread.py --verify`.
- Real-data screenshots: Sahara 6000 BCE and Doggerland 8000 BCE, flag on and off, Units and Grid.
- Docs (`docs/ops/hyde-climate-spread.md`, AGENTS.md architecture line) and the log fragment.

### Won't do

- Make the adjusted spread the default (Will's call after review).
- Change the generator's method or strength.
- Rebuild Dots PMTiles from the adjusted set.
- Publish to budgie from this job (after merge, home network).

## Success Criteria

- [ ] With the flag, people show in the Green Sahara and on exposed shelves at 8,000 BCE
- [ ] Without the flag nothing changes (`pnpm visual` passes)
- [ ] World totals identical with and without the flag (asserted)
- [ ] The "Adjusted spread (modelled on HYDE)" label shows with the flag
- [ ] Real-data screenshots: Sahara 6000 BCE and Doggerland 8000 BCE, flag on/off, Units and Grid
- [ ] Frontend + Python checks and build pass
- [ ] Docs and log updated
- [ ] (after merge) Published with `GRID_ONLY=1 scripts/deploy-budgie.sh` and prod smoke passes

## Assumptions

- **URL `/grid/adjusted/humans_{year}.webp`, not `/grid_adjusted/`.** budgie mounts `./app/grid` and Caddy caches
  `/grid/*`; a subfolder needs no compose or Caddyfile change and no container recreate, so `GRID_ONLY=1` publishes it.
  The local folder stays `data/tiles/grid_adjusted/`.
- The counter already shows `populationAt(time)` (HYDE's world totals) in Units and Grid, so it cannot change; the
  assertion is on the decoded adjusted image's total against `HYDE_TOTALS` (decoder-side guard) and a real-data test.
- The time bar's "measured" label spans all of HYDE (10,000 BCE–1900); it stays, and the counter note is where the
  year's label changes.

## References

- `docs/ops/hyde-climate-spread.md`, `docs/ops/grid-images.md`, `docs/ops/past-water.md` (the `?pastwater=1` precedent)
- Steady task: 91d467b0-c9e5-4db0-8b07-dec97559f455
