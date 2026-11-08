# Grounding facts in Units mode

Click the globe in Units mode to open **What we know here**. The selection follows
the slider year; while that year's population image is unavailable, the panel
shows a loading message instead of attributing the preceding year's counts to it.

`groundingFacts` reads the already decoded, row-major sparse HYDE grid. It sums
the clicked cell and its eight neighbours, wrapping longitude and clipping at
the poles. Counts use the `grid_image.py` inverse log encoding, not the invented
unit placements or nominal band/village sizes. Display counts are rounded.
The density class uses the same 600 and 40,000 head-count thresholds as Units;
it is a display class, not evidence of a particular way of life. Empty image
pixels do not distinguish ocean, missing evidence and estimated zero population.

No request is made by the lookup or panel. The frontend currently loads neither
land-use images nor the Reba gazetteer, so those optional facts are omitted.
Era notes describe uncertainty rather than claiming precise local observations.
