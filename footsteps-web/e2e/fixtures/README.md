# Population image fixture

`humans_-1000.png` was generated with `footstep-generator/grid_image.py:encode`
using an in-memory 360×180 ASC grid (one-degree cells), header `cellsize=1`,
`yllcorner=-90`. All densities are zero except rows 88–90, columns 179–181,
whose density is `1000 / cell_areas_km2(180, 1, -90)[row]`.

The source total is 9,000.000193 people (float32 density). The decoded image
total is 9,000.450064; each occupied cell decodes to 1,000.050007 people.
The small difference is the expected 16-bit log-encoding quantisation.
The browser test checks rounded cell/neighbourhood totals at (0.5°, 0.5°).
This fixture is synthetic, not historical evidence.
