## [2026-11-28] fix | Square holes in the adjusted spread

The climate-adjusted spread emptied whole 0.5° blocks in central and southern Africa around 5000 BCE (45% of cells
between 20°S and 20°N, 5-45°E were empty, against 15% in HYDE). `climate_shift` subtracted each cell's lost share of the
capacity, which exceeded HYDE's people wherever HYDE was sparser than the capacity model, once the Green Sahara pulled
capacity north. Losses are now proportional (`hyde × share_then / share_now`), gains stay additive. Needs
`hyde_climate_spread.py --verify` and `GRID_ONLY=1 scripts/deploy-budgie.sh` on budgie.
