## [2026-11-28] fix | No firelight on past lakes

Will saw fires on the open water of Lake Mega-Chad at 5000 BCE, zoomed out. The groups were already kept off past water, but the
far-out firelight is built straight from the grid's cells (`buildFireMarks`), which knew nothing of it. A mark that would land on
an active epoch's water is now drawn again in its cell, and a cell wholly under water has its marks on the nearest shore, so no
one is lost (`pastWaterWetAt` in `lib/pastWater.ts`; off with `?pastwater=0`).
