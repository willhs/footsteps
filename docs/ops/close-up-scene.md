---
id: ops-close-up-scene
type: ops
purpose: "How the close-up 3D ground is drawn, what ?ground=1 (biome surface detail), ?weather=1 (cloud shadows, wind in the grass), ?fields=1 (fields, gardens, paths) and ?smoke=1 (hearth smoke and night firelight) add: what is measured, modelled and imagined, how to check it"
---

# Close-up scene: the 3D ground

From zoom 8 on the flat map the ground is drawn as a 3D landscape (`footsteps-web/components/footsteps/layers/Close3DLayer.ts`,
`lib/close3d.ts`). On by default; `?close3d=0` keeps the map flat. Since 2026-11-24 it is seen from straight above at every zoom (a
right-drag still tilts it by hand): the tilt that grew with zoom made zooming onto a group hard (Will). `?tilt=1` brings that tilt back
(`pitchForZoom`, 55° from zoom 8), and `?sky=1` tilts as before, since its sky needs the horizon in frame.

Zooming on the tilted map (`?tilt=1` or `?sky=1`; `components/footsteps/views/tiltController.ts`): the zoom sets the tilt itself, holds the point where the cursor
meets the 3D ground (the loaded relief, `lib/groundHeights.ts` `heightAt`; sea level put the spot well beyond the group pointed at), and
zooming in glides that point halfway to the middle of the screen per zoom level, so a group aimed at near the horizon comes in front of
you instead of staying edge-on. One scroll (wheel events with the cursor still) keeps the same point; zooming out holds the cursor's point.

With `?sky=1` the camera is lifted (deck.gl `position[2]`) so it stands above the ground. A view the map has moved keeps the lift it was
moved with, so the camera never jumps: before 2026-11-24 a new lift was worked out for each new centre and zoom, which moved the camera and
slid the whole view by up to a few hundred pixels over mountains (the Alps at zoom 12-13: 4.8-6.3 km). About 0.9 s after the map stops
(`REANCHOR_AFTER_MS` in `FootstepsViz.tsx`), the view is described again with its target on the ground the centre looks at
(`views/liftAnchor.ts` `reanchor`): the centre slides along the line of sight and the zoom changes so the camera has not moved, and
nothing on screen moves. Not during a drag (deck drags in a plane at the lift's height), an animation (a new centre or zoom cancels it) or
a scroll (the glide counts levels from its start), and not below zoom 12, where the tilt still follows the zoom; there it stops on the
line of sight at zoom 12. The zoom number can change on that (the Alps: 13.4 → 14.7, the camera now that close to the ground in view).
`hooks/useGroundLift.ts` still gives the starting lift for a view set from the URL or the tour, and raises the camera whenever it would
stand less than its clearance above the ground under it (that one move is visible).

| Part | Source | Label |
|---|---|---|
| Relief | AWS Terrarium elevation tiles, drawn 1.6 times taller | measured |
| Water | flat at the year's sea level (`lib/climate.ts`) | modelled |
| Lake Mega-Chad (`?pastwater=1`, -9550…-3050 only) | a second water plane at 329 m on the DEM's own datum, where the shared basin-connected mask says lake and the ground is below it ([past water](past-water.md)) | modelled, experimental |
| Ground colour | the year's Earth image (`terrain_image.py`) with a baked hillshade, sand shore, rock, snow | modelled |
| Biome under each spot | Krapp2021 biome per 0.5° cell, Beyer climate ([habitat-lookup](habitat-lookup.md)) | modelled |
| Plant marks (`?plants=1`) | cones and blobs by biome, hand-placed | imagined (off: they read as toys) |
| Surface detail (`?ground=1`) | procedural pattern in the fragment shader, below | imagined |
| Weather (`?weather=1`) | cloud shadows and gusts in the same shader; cover from the place's modelled rainfall, [Weather](#weather-weather1) | rainfall modelled, the weather imagined |
| Fields, gardens, corrals, grazed grass, paths (`?fields=1`) | farmed area from HYDE cropland, layout invented, below | imagined (extent modelled) |

## How the ground streams in (2026-11-21, task 0009)

- **Tiles one zoom coarser, same vertices.** The elevation `TileLayer` uses `zoomOffset: -1` and each tile is meshed every
  `MESH_STEP` = 2 pixels (`lib/close3d.ts`), so a vertex is ~300 m apart at 46°N and zoom 10, as before (z11 tiles every 4 pixels),
  from a quarter of the requests. AWS S3 serves the tiles over HTTP/1.1, six at a time, so the request count is what the
  cold time follows (tilted zoom 10: ~110 tiles before, ~35-40 now).
- **Far tiles coarser** (`lib/demLod.ts`, `DemTileset` in `Close3DLayer.ts`): four siblings become their parent while the parent
  is no wider on screen than a tile at the screen centre, so the far ground never has fewer vertices per screen pixel than the
  middle. At the close-up's 55° few tiles qualify; it matters when the view reaches further.
- **Skirts**: every tile mesh has its edge hung down by 1% of its width, so neighbours of different zooms (and the one-pixel step
  between same-zoom neighbours) leave no crack to see the flat map through.
- **Requests start at once.** `Close3DLayer` is mounted as soon as the close-up is on; it fetches heights while the era images and
  the habitat lookup decode and draws the ground once both are in. The colour pyramid's tile for each ground tile is fetched in the
  same `getTileData` when `?terrain_tiles=1` is in the URL.
- **A frame's worth of meshing per frame.** Tiles that arrive together are meshed at most ~8 ms per frame; the rest wait a frame
  (the flat map shows under them meanwhile). A mesh is built once per tile and year and reused while the camera moves.
- The year's ground (`makeGround`, era colour, biome, temperature) is in `lib/eraGround.ts`.
- The flat colour pyramid is not drawn while the close-up is on (its tiles would be hidden under the 3D ground).

## `?ground=1`: the biome painted on the ground

Off by default until Will has looked at it on prod. The "3D:" note under the year then reads "3D: ground measured, surface imagined"
(`close3dNote` in `lib/close3d.ts`; its hover text says the biome is modelled and the pattern imagined).
No new download: everything is noise computed in the shader.

**Data shape.** Each ground vertex carries a `Cover` (`coverFor` in `lib/close3d.ts`) in the mesh's `texCoords`: two numbers that
the GPU interpolates, so both are smooth axes, never a class id.

- `dryCold`: 0 desert sand, 1 grass, 2 ice or snow. Grass sits in the middle, so a blend across a biome edge passes through a
  natural neighbour.
- `layer`: below -0.75 open water (no detail), -0.5 wet low ground, 0 bare of trees, up to 1 closed tree canopy.

| Biome (Krapp code) | Cover |
|---|---|
| 1-11 forests, 15 woodland | grass underlay, `layer` = the biome's tree share from `VEGETATION` (0.55-0.95 for forests) |
| 12, 16-18 savanna, parkland | few crowns (0.16-0.3) |
| 13-14 shrubland | 0.2 |
| 19-20 grassland, 22-26 tundra | grass, no crowns |
| 21 desert, 27 barren | sand |
| 28 land ice, or ground above the snow line | ice |
| low (under 5 m above the year's sea; desert under 3 m), flat (under 0.006 m/m) land | wet: reeds and pools, no trees |
| steeper than about 0.5 m/m (shader, from the mesh normal) | rock strata over any of the above |

Wet ground is a geometry rule: the elevation tiles carry no rivers, so a marsh shows only where land is low and flat (Mesopotamia,
Dutch coast, deltas), not along a river in higher ground.

**Shader** (`layers/groundDetail.ts`, a deck.gl `LayerExtension` injected into the ground `SimpleMeshLayer`): grass tone patches, grain
and clumps; a lumpy canopy (crowns where noise is high, dark gaps between; sparse crowns for savanna); sand megadunes, dunes,
ripples and grain; ice streaks, cooler tone and a net of cracks; reed-olive wet ground with dark pools; banded rock on steep slopes.

**Size follows the pixel.** A pixel at close-up zoom is 20-80 m, far bigger than a tuft or a crown. Every pattern is noise on the
ground's metres with a nominal size (a crown is ~14 m), but its lattice never drops below about 3 pixels: it grows with the pixel size and
cross-fades between doublings, so the texture stays visible and does not shimmer. Dunes, ripples and cracks fade out when
their wavelength falls under a few pixels. The pattern is anchored to the ground (it does not slide when you pan) but changes
look as you zoom. It is a texture, not a map of trees.

**Cost.** One fragment shader, no texture or tile. Noise is evaluated only for the families present at a pixel. Measured 2026-11-21
(production build, headed Chromium on an Apple GPU, 1440 × 900, camera wiggling, frame limit lifted; Amazon and Sahara three runs each,
the other scenes one): mean 19.9 fps off and 21.6 on at zoom 10, 15.8 off and 15.3 on at zoom 12, over nine runs each. Single runs
ranged from 10 to 48 fps either way, so the shader's cost is inside the noise: the frame is limited by the page's CPU work (settlements,
tile meshes), not by this shader.

## `?sky=1`: light from the sun clock, haze into a sky, moving water (2026-11-24, task 0015)

Off by default until Will has looked at it on prod. The "3D:" note then reads "3D: ground measured, light imagined" (its hover text:
the sun stands where the local sun clock puts it; the light's colour, haze, sky and moving water are imagined presentation).

| Part | How | Code |
|---|---|---|
| Sun | the local sun clock (`lib/sunTime.ts`, `lib/solarClock.ts`: `?utc=`, `?warp=`, frozen by `?still=1`) at the view centre (rounded to 0.1°) gives a unit vector east-north-up | `lib/sky.ts` `sunVector`, `sceneLight` |
| Light colours | one table over the sun's altitude (−90…90°): direct light, sky fill (ambient), zenith and horizon colour, glint strength, interpolated. Low sun warm, night a moon opposite the sun 35° up with a blue-grey floor so the hearths carry the scene | `lib/sky.ts` `KEYS` |
| Relief light | the mesh is built without the baked hillshade (`buildTerrainMesh(..., lit)`); the shader lights it: `albedo × (0.7 ambient + 0.8 direct × max(n·sun, 0))`, then a little more saturation | `layers/skyLight.ts` |
| Haze | `1 − exp(−d / 60 km)` in the horizon colour, ramped to full between 55% and 97% of deck.gl's far clipping plane depth (read from the projection matrix), so the ground meets the sky with no edge | `layers/skyLight.ts` |
| Draw distance | the far plane at 5 camera distances (`SKY_FAR_DISTANCES`; deck.gl's own is 10 once the horizon is in frame), set per tilt as the MapView's `farZMultiplier`; the haze ramp follows it. It also culls tiles: Rome 1000 BCE at zoom 12, 1728 × 1080 @2x, 112 elevation tiles instead of 138, 59 fps panning instead of 53 (2026-11-24, one run each) | `lib/close3d.ts` `farMultiplier`, `FootstepsViz.tsx` |
| Haze | `1 − exp(−d · density / 45 km)`, density the air's mean along the line of sight (thinning over 8 km of height), so zooming out does not fog the view: before 2026-11-24 it counted distance only (`1 − exp(−d / 60 km)`) and whited the view out from zoom ~11.5 down (the camera is ~150 km from the ground at zoom 9, nearly all through thin air). The fade into the sky at the far plane applies only where the far plane cuts the ground short of the screen's top (`farFade`) | `layers/skyLight.ts` |
| Sky | a CSS gradient behind the deck canvas (zenith → horizon colour at the horizon row): it shows wherever nothing is drawn, above the horizon and past the far plane | `lib/sky.ts` `skyBackdrop`, `views/DeckGLView.tsx` `backdrop` |
| Tilt | 55° is 16.6° short of the horizon (deck.gl's 36.9° field of view), so the flag tilts on from zoom 10 to 74° by zoom 12 (`SKY_PITCH`); the horizon then sits ~7% below the top | `lib/close3d.ts` `pitchForZoom(zoom, sky)` |
| Camera lift | deck.gl measures the camera from sea level; at 74° and zoom 13 it is ~2.2 km up, inside the Alps' drawn (×1.6) summits. The flag lifts the whole camera (`viewState.position[2]`) to the drawn ground height at the view centre, or more if the ground under the camera needs it, from one zoom-10 Terrarium tile; the elevation `TileLayer` gets the same height as `zRange` so it picks the foreground tiles | `hooks/useGroundLift.ts`, `lib/sky.ts` `cameraLift`, `Close3DLayer` `groundTop` |
| Things on the ground | fields, trees, shelters (and `?plants=1` marks) take the same light and haze (`SkyTint`): their daylight colours times the light on flat ground now over noon's (`lib/sky.ts` `overlayTint`, 1 by day, moonlit blue at night), then the ground's distance haze. Before 2026-11-28 they stayed noon-bright over a night-dark ground and stood out unhazed at the horizon; the painted ground under grazed land (`land-paint`) takes the ground's own extensions | `layers/skyLight.ts` `SkyTint`, `Close3DLayer.ts` |
| Water | wherever the mesh's cover layer says open water (sea, `?pastwater=1` lakes; `?ice=1` has no meltwater of its own, so water by the ice is sea or a past-water lake): two drifting noise layers as ripple normals (lattice ≥ 4 px so they do not shimmer), sky reflection by Fresnel, a specular glint toward the sun or moon, a lighter greener band in the shallows next to the shore, and a broken foam line where the layer crosses the shoreline (−0.75), pulsing with the shader clock | `layers/skyLight.ts` |
| Sea with no bathymetry | Terrarium is exactly 0 m over some coastal seas (the Bay of Naples at zoom 12: SRTM's fill), which the default close-up draws as land. Lit meshes count an exact 0 m patch that reaches the tile edge as sea while the sea level is within 2 m of today's | `lib/close3d.ts` `tileWater(..., zeroIsSea)` |

The light changes with the sun clock (every 20 s, or every second with `?utc=`/`?warp=`); the water moves with the shader clock, which
`?still=1` stops. Flag off: the mesh, tilt, camera and backdrop are exactly as before (`pnpm visual` passes, 2026-11-24).

**Look.** `node footsteps-web/scripts/sky-shots.mjs [--scenes ids] [--query k=v] [--only on|off] [--moving]` (after `pnpm build`) takes
flag-off and flag-on shots of Nile 3000 BCE z14 at midday, dusk and night, the Bay of Naples 100 CE z13 morning and evening, Alps
1000 BCE z13 morning and Doggerland 10,000 BCE z12, all `?still=1`.

**Cost.** `node footsteps-web/scripts/terrain-bench.mjs --scenes nile,alps --zooms 14 --modes 3d [--query sky=1]` (`--zooms` now takes
zooms outside the default list). 2026-11-24, headless, on a Mac with a 1-minute load average of 33-42 from other jobs: pan fps
(cold/warm) flag off Nile 28.4/27.5, Alps 28.1/29.6; flag on Nile 32.2/28.2, Alps 26.8/28.6. The flag's cost is inside the noise of
a loaded machine; neither reaches 45 fps under that load. A second pair at load ~8 (01:00) gave 12.1-13.0 off and 11.8-13.4 on, every run
with the same 133 ms p95 frame: headless frames were throttled to ~7.5 Hz (display asleep), so it again shows no difference and no
absolute number. Re-measure on a quiet, awake machine (headed: `HEADED=1`) before Will's review. Cold time to detail is
longer with the flag (Nile 1.6 s vs 0.65 s, Alps 2.5 s vs 0.9 s): the steeper view reaches ~10× further and needs more tiles.

**Limits.** One light for the whole view. No shadows cast by relief, clouds, stars or moon phases. People, fires, shelters and the
flat map are not lit or hazed. Where the ground lies below sea level (Doggerland), a one-pixel line of the flat era image can show at
the horizon (the era images stay drawn under the close-up as its stand-in while the ground decodes). The glint is toward the sun, and
the camera always looks north, so in the northern hemisphere it is only in frame with the sun low in the north-east or north-west.
The steeper tilt shows people and shelters more foreshortened.

## Check it

```bash
pnpm --dir footsteps-web build && python3 -m http.server -d footsteps-web/out 4600   # needs public/grid, terrain, habitat
node footsteps-web/scripts/measure-ground.mjs http://localhost:4600 /tmp/ground-out
```

It loads five scenes (Amazon 1000 CE, Sahara 1000 CE, Mongolian steppe 0 CE, Scandinavia 20,000 BCE, Mesopotamia 3000 BCE) at zoom
10 and 12, with and without `?ground=1`, saves the pairs and prints fps per run. It needs a headed browser (headless Chromium
throttles animation frames). Frame rate is limited by the page's CPU work as much as by the GPU, so repeat runs and compare means.

## Weather (`?weather=1`)

Off by default until Will has looked at it on prod; no default flips. Works with or without `?ground=1`. The "3D:" note then adds "weather imagined"
("3D: ground measured, weather imagined"; "surface and weather imagined" with both), and its hover text says what is modelled and what is not.

**What it draws** (the same fragment shader, `layers/groundDetail.ts`; no new geometry, no texture, no tile):

1. **Cloud shadows**: soft patches (noise lattice ~1.1 km, coarsened to 3 pixels like the other patterns) that darken and cool the ground, over land and
   water alike, drifting along the wind. The more of them, the cloudier the place.
2. **Wind in the grass**: grass, reeds and crops (the green axis of `Cover`, open or wet, thinned by tree cover) brighten and dim as gusts
   travel through (patches ~90 m and up), and close in (zoom 15 and nearer, where a pixel is under ~1.5 m) ripples 13 m apart run with the wind inside the gusts.
   There is no crop class in `Cover`: crops are the era image's farmland colour on the grass axis, so they sway like grass.

**Data shape** (`lib/weather.ts`, tested in `weather.test.ts`):

- `Weather = { cover, wind }` for a place. `cover` (0..1, the share of ground in cloud shadow) is `cloudCover(precipMm)`: `0.05 + 0.8 (1 − e^(−mm/700))`,
  so 34 mm (the Nile at 3000 BCE) gives 0.09, 849 mm (the Pampas at 1500 CE) 0.61, 708 mm (central England at 1000 CE) 0.56, 3,000 mm 0.84; a cell with no climate value gets 0.3.
  The rainfall is the hover card's Beyer BIO12 for the year's Krapp step, read from the habitat image (`Ground.precipAt`, `lib/eraGround.ts`).
  `wind` is a unit vector from the latitude (`windToward`): the planetary belts, easterly trades to 30°, westerlies peaking at 60°, polar easterlies beyond 75°.
  It is not a wind record. (The dunes and ice streaks in `?ground=1` keep their own fixed direction; that is left as it was so `?ground=1` does not change.)
- The place is the one at the screen centre, set by `Close3DLayer.renderLayers` on every view change and read by every ground tile each frame
  (`weatherRef`), so a pan rebuilds no mesh. One cover across the whole screen means no seam at a 0.5° cell edge or a tile edge; panning across one eases cover at 0.25/s.
- `WeatherClock`: the cover eased to the target and the distance the cloud and gust patterns have travelled, summed frame by frame in float64
  (`advanceWeather`), so a wind that bends as you pan bends the drift from then on instead of shoving the pattern, and the shader never sees a large time.
  Time-lapse: the clouds drift at 60 m/s (real clouds ~8 m/s are a few pixels a minute at this zoom) and gusts at 90 m/s; zoom 14 is then ~12 pixels a second.
- `?still=1` (`lib/still.ts`) freezes it: the target cover at once, drift 0, so the same scene gives the same pixels.
- The ground mesh carries `Cover` (the wind needs it) with `?weather=1` alone, built with its per-vertex mottling kept (`buildTerrainMesh`'s `paints` argument), so with
  the weather on and `?ground=1` off the ground looks as it did and only the weather is added. With neither flag no extension is attached and no pixel changes.

**Imagined.** Only the rainfall that sets the cover is data. The clouds' shapes, speed, the wind direction and the gusts are drawn by a formula; there is no weather record for any year.

**Checked** (2026-11-24, production build, real data, headed Chromium on an Apple GPU, 1280 × 800; `node footsteps-web/scripts/weather-shots.mjs --fps`):

| Scene (zoom 13) | Place's rainfall → cover (Beyer, read from the habitat image) | What the shots show |
|---|---|---|
| Nile 3000 BCE | 34 mm → 0.09; 25.7°N, trades | a few small shadows; most of the ground is clear |
| Britain 1000 CE | 708 mm → 0.56; 52.2°N, westerlies | broad shadows over about half the ground |
| Pampas 1500 CE | 849 mm → 0.61; 35.5°S, westerlies | broad shadows, gusts in the grass (clearer at zoom 16 and with `?ground=1`) |

Each has `_off`, `_on` (both `?still=1`), `_on_ground` (with `?ground=1`) and a 4-frame sequence 3 s apart (`_seq_0..3`); 9-41% of the pixels differ between the first and last frame.
The Pampas at zoom 16 is `pampas-1500ce-z16_*`. Flag off: `pnpm visual` passes all ten scenes (0-577 differing pixels of 1,024,000, none over the limit of 1,024; the same noise a scene with no 3D at all shows).

**Cost** (frames per second while the camera wiggles at zoom 14, three runs per scene and variant, frame limit lifted; mean over the three scenes):

| | off | `?weather=1` | `?ground=1` | `?ground=1&weather=1` |
|---|---|---|---|---|
| Nile | 138 | 134 | 165 | 127 |
| Britain | 46 | 112 | 133 | 104 |
| Pampas | 64 | 56 | 87 | 90 |

Single runs range from 19 to 188 fps within one cell, and the "off" runs came first in each scene, so tiles were still warming (Britain's 46), so the runs do not separate the
cost from the noise: on the Nile and the Pampas, where the off run is not obviously cold, the weather alone is 3% and 13% slower. The shader adds three fbm lookups per pixel (nine value-noise taps) and, like `?ground=1`, no
texture or tile; the frame is limited by the page's CPU work, not the shader. Run `weather-shots.mjs --fps` on a quiet machine to compare.

## Limits

- The pattern is the same formula everywhere a family applies: two forests with the same biome look alike up to the noise.
  Conifer and broadleaf crowns are not told apart; savanna is single crowns.
- Biome borders follow the 0.5° cells, so a change of cover is a sharp line.
- The relief colour and baked hillshade are unchanged; the shader multiplies and tints them.
- Globe view is not supported (the shader reads mesh offsets as degrees); the close-up is flat-map only.

## Fields, gardens and paths (`?fields=1`)

Off by default until Will has looked at it on prod (2026-11-24, task 0016). Around each group in view the close-up draws what its way of
life did to the land, draped on the 3D ground: the "3D:" note then reads "3D: ground measured, fields and paths imagined", and its hover text
says what is modelled and what is invented. Needs the settlement model and the close-up 3D (like `?shelters=1`; nothing on `?close3d=0`).

| What | Rule | Label |
|---|---|---|
| Farmed area of a village | HYDE cropland of its 5′ cell (`/grid/landuse_{year}.png`, the image the ways of life come from) × the group's share of the cell's people; at least 0.5 ha per villager (`SUBSISTENCE_M2_PER_PERSON`) | modelled (HYDE), floor imagined |
| How far out | packed round the village, as far as 60 % of the ring holds that area, never past 2 km; intensity falls off as 1 - (d/R)² | radius cited (Chisholm 1962; Vita-Finzi & Higgs 1970), layout imagined |
| Plots | 150 m blocks on a grid turned per village, each split into 1-3 strips with balks between, corners jittered; 20 % fallow, 10 % pasture | imagined |
| Crop colour | one of the crops the food table has round the 5° cell at the era (staples favoured): ripening cereals gold, paddies bright green, maize and roots dark green; winter look in the hemisphere's winter with `?seasons=1` | crops modelled (food.md), colour imagined |
| Terraces | farmland on a slope of 8-25° (the close-up's own Terrarium heights) becomes three beds along the contour; steeper is not farmed | imagined |
| Kitchen gardens | one beside each of a village's first households (households.ts, where its houses stand) | imagined |
| Towns and cities | gardens among the roofs, then a ring of fields beyond the last roof from the town's cell cropland | imagined |
| Herding camps | grazed, paler grass out to 200 m + 600 m × the cell's grazing share, painted into the ground's colours; a corral ring by the camp | imagined |
| Foragers | nothing planted: a trodden clearing round the hearths | imagined |
| Paths | a worn track towards the nearest fresh water (`water_distance.webp`, downhill in distance, 100 m-3 km), and to the nearest one or two neighbours within 4 km | imagined |

Two neighbouring villages split the land between them (each strip belongs to the nearer village), so their fields never lie on top of each
other. Nothing is draped where the ground is sea, past water (`?pastwater=1`) or ice (`?ice=1`).

**How it is built.** `components/footsteps/layers/fields.ts` turns the groups in view (`useGridLayer`'s `inView`, the list the shelters use,
built once per snapped view box) into a flat list of ground quads (`LandPatch`), seeded per group like households; each site's patches are
cached by its inputs and its neighbours, so a pan rebuilds only the sites whose neighbourhood changed. `hooks/useLand.ts` reads the inputs
(a window of the 5′ land-use and water-distance images, the people per cell from the year's grid, the food table). `layers/fieldsDrape.ts`
drapes them per elevation tile, once per tile and patch set under the close-up's frame budget: each patch is cut into pieces a ground cell
across, whose corners sit on the highest corner of the cell under them (so no piece dips under the ground) a few metres up; washes (grazed
grass) are painted into the ground mesh's own vertex colours and drawn as a second copy of the ground, so they follow every fold.

**How a patch looks close in** (2026-11-28, `FieldDetail` in `layers/groundDetail.ts`): each draped piece carries metres along and
across its patch and to its far sides, and the patch's kind (`fieldsDrape.ts` `DrapedMesh`, `FIELD_KIND`; texCoords and the otherwise
unused normals, since the shapes are lit flat). The fragment shader draws uneven growth and grain on every patch, crop rows ~2.2 m apart
and strips 8-14 m wide on fields, weeds on fallow, tussocks on pasture, beds in gardens, a paler worn middle on tracks, and a grassy verge
round the edge (never under about a pixel). Patterns finer than a few pixels fade out (`gFade`). With `?weather=1` the gusts run through
crops and pasture and the cloud shadows fall on the fields as on the ground; with `?sky=1` they take the sky's light and haze (`SkyTint`).
Before, every patch was one flat colour, which read as paper cut-outs from zoom 15 in. All imagined.

**Cost.** Measured 2026-11-24 (production build, headed Chromium on Apple M5 Pro, 1440 × 900, pan and wheel for ~5 s,
`CLOSE=lat,lon,year [QUERY=fields=1] HEADED=1 node footsteps-web/scripts/measure-view.mjs --serve <dir>`):

| Scene | z13 off / on | z14 off / on | z15 off / on | longest task off / on |
|---|---|---|---|---|
| Meseta 1000 CE (41.6, -4.75) | 108 / 100 | 113 / 101 | 114 / 109 | 73 / 83 ms |
| Nile 3000 BCE (29.85, 31.25) | 112 / 82 | 111 / 110 | 109 / 112 | 81 / 98 ms |
| Rome 100 CE (41.9, 12.5) | 117 / 87 | 115 / 102 | 102 / 104 | 192 / 105 ms |
| Mongolia 1000 CE (49.71, 105.96) | 114 / 83 | 114 / 98 | 114 / 105 | 53 / 94 ms |

fps while panning; at least 82 with the flag on everywhere (aim was 45). The cost is the first drape of each tile and the land of new sites
as the view box moves (cached per site): a few more long tasks under ~100 ms while panning. Before the per-site cache, one-cell pieces and
one hash per corner, the same runs showed 65-90 fps at z13 and long tasks up to 370 ms.

Two limits added 2026-11-24, after `?sky=1` (74° tilt, far more tiles in view) made fields a steady cost while panning: a new patch set in view
re-drapes a tile only when the patches touching that tile changed (`tileLandKey`, a content hash; a place always gets the same patches), and a
tile where a 150 m field block is under 1.5 screen pixels is not draped at all (`LAND_MIN_PX` in `Close3DLayer.ts`), the haze and the ground's
own colour standing in. Rome 1000 BCE at zoom 12 with sky: `drapeLand` went from ~1.2 s to ~0.3 s of CPU in a 4 s pan and wheel.

Headless Chromium on the same machine was throttled to ~14 fps for both (frames stuck at 133 ms), so measure headed.

**Check it.** `pnpm --dir footsteps-web build && node footsteps-web/scripts/fields-shots.mjs --out <dir>` loads the four scenes (Nile
3000 BCE z13, northern Meseta 1000 CE z13, Rome 100 CE z12, Mongolian steppe 1000 CE z13) with and without the flag, serving the real data
from the primary checkout; `--scene id,year,lat,lon,zoom` adds one, `--query` adds flags.

**Limits.**
- HYDE's early cropland is thin (Memphis 3000 BCE ~1 % of each 5′ cell, Rome 100 CE ~2 %), so most early villages show the subsistence floor,
  not HYDE's number.
- The terrace test uses the close-up DEM, not `site_terrain.webp`'s 2.5′ slope class (finer, and it gives the contour direction).
- A herding camp's people stand where the people layer puts them; its grazed patch is centred on the camp's spot.
- At some flat Mongolian valley floors near Ulaanbaatar (e.g. 47.95° N 106.23° E, 49.70° N 105.97° E at zoom 14-15) the close-up 3D ground
  itself is not drawn, flag on or off (`?ground=1` shows no surface there either), so nothing is draped there.
- Fields are not drawn on the flat map (`?close3d=0`) or on the globe.

## People and animals (`?figures=1`)

Opt-in until reviewed on production. At the zoom where individual footprints appear, the newest of each person's three prints becomes a small upright silhouette; the two older prints remain its trail. Adults and children differ in size. With `?routine=1`, asleep people lie down, resting people sit, and walkers carry a staff/tool or a load according to their existing `DayPlan`. Without routine, the existing walking/rest rhythm continues. Shapes, poses, equipment and positions are imagined. `footprintData`, person ids, `describePerson`, year-morph opacity, and other-human picking keep their existing contract. No second routine scheduler is introduced.

`PeopleLayer` uses the same GPU gait for both looks, with an upright camera-facing quad (or a ground-plane quad while asleep) in the newest-print slot. `?figures=0` or omitting the parameter preserves footprints. A sparse cell's group (under 15 people) is drawn as a typical group of its kind since 2026-11-24 (`nominalPeople`), so a Kalahari 1800 scene has people too.

`useAnimalsLayer` loads fauna blocks and the food model independently of hover and `?food=1`, only in the opt-in street view. `lib/animals.ts` builds at most 120 stable instances (up to 72 wild, reserving room for livestock) around the view, on an illustrative fixed geographic lattice (~550 m north–south, narrower east–west at high latitudes): plant eaters in small groups of three, predators singly. Each candidate must be in its own PHYLACINE 1° range cell at the millennium step, and outside the habitat sea/ice mask. Only the loaded 30° block is used; animals in a neighbouring block appear when the view centre enters it. The selection uses the same notable large animals as the hover card. This is a selection of species, not abundance or a reconstructed animal census.

Farmer/herder groups can have small domestic herds (cattle, sheep/goats, horses, camels, llamas/alpacas, dogs) only when the full food-model roster allows them at that cell and era; the four-food hover summary is not used. Domestic herds are placed by occupied patches near the existing people, including people at the nearer year-morph endpoint. Wild candidates stay at least 350 m from people’s home spots, domestic candidates 85 m. Bounded shader wander stays within 12 m; land checks include a 16 m margin. This avoids groups at home, not people on arbitrary routine trips. The habitat mask is coarse (0.5°); it cannot resolve a river bank or individual field.

Animals are cool grey; people retain the warm palette. Silhouettes distinguish broad body forms (quadruped, elephant/mammoth, camelid, horned ungulate), not every species' anatomy. Picking names the species and says “range modelled (PHYLACINE), this animal imagined”; domestic picking instead says “availability modelled (food spread model), this domestic animal imagined”. No PHYLACINE claim is made for livestock.

People and animals retain the existing overlay-on-terrain depth policy: they do not sample elevation and can show through a hill. Their readable pixel size is illustrative, not a measured height. Animation changes uniforms only, with no per-frame JavaScript loop over instances.

Reproduce screenshots, picking and street-zoom fps with a headed GPU browser:

```bash
node footsteps-web/scripts/measure-figures.mjs http://localhost:4444 <evidence-directory>
```

The harness uses public production data to supply this checkout's missing gitignored assets. It visits Kalahari 1800, Mongolia 1000, Ukraine 15,000 BCE and Nile 1500, day and night, plus default footprints and Grid/Dots. Its JSON report records the actual loaded layers and species, GPU picks, errors and frame rates; screenshots and report belong outside git. The script chooses a nearby populated group from the real data for the closest view when one exists. A species named in an acceptance scene is not forced into that scene if the range/spread model does not supply it.

The current food export has no dog taxon; the renderer accepts dogs if the model supplies them, but does not invent them independently.

## Trees (`?trees=1`, off until reviewed)

Shaded, alpha-tested camera-facing impostors start at zoom 11. `TreeLayer` loads only when requested in the close-up. Its atlas has three variants each of conifer, broadleaf, palm, acacia, shrub and dead trees. Regenerate without a paid service with `cd footsteps-web && node scripts/tree-atlas.mjs` (seeded procedural SVG: each crown is a few ellipsoid lumps of small leaf clusters, each cluster lit as a point on its lump's sphere by an upper-left sun and drawn back to front over a dark interior, so tops are lit, undersides shaded and edges ragged; supersampled for soft alpha; about 55 KB).

`lib/trees.ts` reuses `plantsForTile` for biome density, snowline and sea eligibility, at up to 18,000 candidates per DEM tile. It also excludes below-sea terrain, dated lake surfaces and ice (through the same `withIce` ground). Forest biome densities are much higher than savanna/grassland; these are imagined representative stems, not measured forest inventories. Household spots are computed even when roofs are hidden; each gets an 18 m minimum clearing plus crown radius. Atlas type, scale, tint and wind phase are stable per spot. Dead snags are an imagined 2.5%; palms a small fraction of tropical forest, not inferred species ranges.

The roots stand above the highest surrounding Terrarium mesh vertices, like dwellings, so steep coarse meshes cannot bury them. Height is metres, not a pixel minimum. Distance LOD has two parts. Per tile, `treeLodShare` uses the screen pixels a typical 20 m tree spans at the tile's point nearest the camera to draw every tree from 3+ pixels, a random-order prefix below that, and none under one pixel; the ground's biome colour stands in for the canopy there. In the shader, sprites fade out between one and four projected pixels, so the switch never pops. Tiles cache candidates by era and water/ice key. The prefix and the household clearings are applied on the GPU (`TreeLayer`: a per-tree rank, hidden above the share uniform; trees in a clearing get rank 2), so a tile's instance buffers are built once: before 2026-11-24 every camera move or new clearings list rebuilt them, about 3 s of CPU in a 4 s pan at zoom 12. The clearings are compared by content (`clearingsKey`), since the scene hands over a fresh list on most renders. Wind is a small vertex displacement on the shared animation clock (`still=1` freezes it). The note says “trees imagined”. `plants=1` still draws the old marks for comparison.

**From above** (2026-11-28): below a 25° camera tilt (`TOPDOWN_BELOW_PITCH` in `layers/TreeLayer.ts`; the close-up's default bird's-eye view)
a tree is drawn as its crown seen from overhead, not as the standing sprite, which from straight above lay on the map side-on like a lollipop.
The crown is a disc a share of the tree's height across (conifer 0.2, broadleaf 0.34, palm 0.3, acacia 0.44, shrub 0.36, dead 0.22 radius),
coloured from one texel of the sprite's own foliage (the kind is the atlas column), shaped in the fragment shader: soft lobes for broadleaf,
shrub and acacia, a spikier rim for conifers, a star of fronds for palms, bare branches for dead trees; leaf clumps and light from the
north-west. Tilted views (`?tilt=1`, `?sky=1`) keep the sprites.

Height references are analogs, not a species map: [RHS Norway spruce](https://www.rhs.org.uk/plants/12899/picea-abies/details) reaches 30 m (chosen conifer 25 m); [RHS oak](https://www.rhs.org.uk/plants/14294/quercus-robur/details) 20–40 m (broadleaf 24 m); [FAO oil palm](https://ecocrop.apps.fao.org/ecocrop/srv/en/cropView?id=972) 18–30 m (palm 22 m); [FAO umbrella thorn](https://ecocrop.apps.fao.org/ecocrop/srv/en/cropView?id=2712) usually 4–15 m (acacia 10 m). Shrub 3 m is a deliberately smaller representative of woody scrub ([RHS hazel](https://www.rhs.org.uk/plants/hazel) is 4–8 m); dead 18 m assumes a broken mature stem. Every size varies by 0.7–1.3; no simulated species identification or seasonal date is claimed.

Verification: from `footsteps-web`, set `FOOTSTEPS_DATA` to a root containing independent `data/tiles`, build, then run `node scripts/measure-view.mjs --trees <workspace-evidence-dir>`. It captures Alps -1000 z13/14/15, Congo 1000 z14, Sahel -3000 z14 and Canada 1800 z14 off/on/old plants, reads actual tree layer instances to check water/ice/household exclusions and records forced-render frame rates. The source records coordinates; no substitute data is fetched. Follow with `pnpm visual` and the flag sweep. Evidence and performance results live outside git in the job workspace.

Results (2026-11-24, headless Chromium on Metal, 1440x900, forced redraws for 4 s; job evidence `trees-v4/`): no tree on water, ice or inside a clearing in any scene. Trees drawn and fps with the flag off / on / old `plants=1`: Alps -1000 z13 275k trees, 32 / 27 / 34; z14 88k, 21 / 22 / 23; z15 63k, 26 / 31 / 28; Congo 1000 z14 154k, 32 / 27 / 38; Sahel -3000 z14 49k, 20 / 27 / 21; boreal Canada 1800 z14 130k, 27 / 27 / 28. Run-to-run noise on this machine is about ±6 fps, larger than the trees' cost, and even flag off stays under the 40 fps aim here, so the headless rate is a relative measure: trees cost at most about 5 fps, and before the per-tile pixel LOD the Alps z13 view drew 328k trees at 10-14 fps.

Known limits: tree spacing is capped at 18,000 candidates per DEM tile (roughly one per 1,300 m² of forest at the equator), so at z14 a rainforest reads as scattered crowns over the dark forest ground, not as a closed canopy. Boreal and Alpine conifers read as forest because higher latitudes draw them larger at the same zoom. Raising the cap is the lever if Will wants denser woods. It costs instances roughly in proportion.

## Hearth smoke and firelight (`?smoke=1`)

Opt-in until reviewed on production (no default flips). Every household of a group in view has a hearth: a thin plume of smoke, and at night
(by the local sun clock, `lib/sunTime.ts` through `lib/solarClock.ts`, so `?utc=` and `?warp=` bend it) a warm, flickering pool of light on the ground,
about a household's spacing wide, so a camp at night reads as a ring of fires. Everything about it is imagined: where a hearth is, how it burns, which way
the wind blows. The settlement note says so.

- **Data** (`lib/hearths.ts`, pure and tested): `hearthsForView` takes the groups and towns in view that `useGridLayer` already reads for dwellings and returns one `Hearth`
  per household, at the place `sheltersForGroups` / `sheltersForTown` stand a dwelling (so the smoke is over its roof when `?shelters=1` is also on; it needs no dwelling table).
  A town roof is a hearth standing for several households and its smoke is thicker (`strengthOf`, capped at 2.5). At most `MAX_HEARTHS` = 1,200 are drawn
  (thinned by seed, so a pan keeps the same ones): at most 4,800 puffs and 1,200 pools. Each hearth has `PUFFS_PER_HEARTH` = 4 puffs spaced through a 40 s cycle.
- **Wind**: one direction per 0.5° square (`windAt`, seeded by the square), swinging by up to 0.7 rad over about ten minutes.
- **Motion on the GPU** (`layers/SmokeLayer.ts`): a puff's only per-instance data is its seed (phase, wobble, size, strength) and the place's wind. The vertex shader turns the
  time uniform (`animClock`, frozen by `?still=1`) into a rise (90 m), a drift (up to 140 m with the wind), a widening and a fade, and builds the camera-facing sprite. No per-frame CPU work;
  the sun is read once every 5 s. The pool is a flat additive disc whose light is `1 - smoothstep(-0.12, 0.02, sun altitude)` at the hearth, flickering from three waves; by day its quad is sent outside the clip volume.
- **Enlarged puffs keep their real amount of smoke** (2026-11-28): a puff drawn at its minimum on-screen size, larger than its real size, has its
  alpha cut by the area ratio, so far out a village's hundreds of plumes add up to a faint haze, not the opaque white cushion they made over every
  village at zoom 12-13 before. Day smoke is a thinner blue-grey, browner near the fire.
- **Height**: the layers are drawn at z = 0, where the people's footprints are, above all the ground tiles. The brief asked for the ground height, but the close-up ground is raised
  by its height × 1.6 and the camera looks at sea level, so on high ground at close zoom the ground (and `?shelters=1` roofs) sit far up the screen from the people: at Madrid (1,076 m)
  at zoom 15 about 600 px. A hearth on the ground would be off-screen from its own people. (A layer inside a Close3D tile also cannot do it: the next tile's ground paints over it.)
  The close-up's loaded tile heights (`lib/groundHeights.ts`) are still used to drop hearths over water (ground at or below the year's sea level). The fix that would let everything stand on the ground is the camera
  and the people following the ground height; it is not part of this flag.
- **Flat map** (`?close3d=0`, or zoom under 7.5): same layers at z = 0. Smoke and light fade in over zoom 11.5-13 (`smokeOpacity`). Globe view: none.

Check it: `pnpm build && node scripts/smoke-shots.mjs --out <dir>` (real data; each scene flag off and on: Meseta 1000 CE day and night at zoom 15, East Africa 50,000 BCE night, Rome 100 CE day and night at zoom 14;
`--still 0` lets the smoke move). Frame rate: `CLOSE=1 QUERY=smoke=1 node scripts/measure-view.mjs <base-url> <dir>` (street zoom only; leave `QUERY` out for the flag off).

Measured 2026-11-24, M5 Pro, headless Chrome on Metal, one run each, Madrid village zoom 15 and Rome zoom 14, 1000 CE (4,800 puffs, 1,200 pools at most): flag off 13.6 / 13.0 fps still and 25.6 / 27.2 panning; flag on 13.8 / 13.4 still and 27.2 / 29.3 panning. No measurable cost. Both are far under 45 fps, with the flag off as well: frames
come at 133 ms steps (the close-up and the settlement scene dominate here, on a machine running other jobs), so the 45 fps aim could not be tested in this run; the cost, not the level, is the result. Repeat on a quiet machine.

## People's footprints on the close-up ground (2026-11-28)

In the close-up the footprints (PeopleLayer) and hearths (smoke) stand on the drawn 3D ground (`drawnGroundZ` in `lib/groundHeights.ts`: height × EXAGGERATION, cached, refreshed when tiles arrive), not at sea level. At sea level a tilted view slid them away from their huts, and the additive prints read as a cream "pancake" beside each village. The prints also shrink further out (`radiusScale` 0.35–1 below zoom 16), and when 3D dwellings are drawn the flat house icons in the people dots (`homes` uniform in MorphScatterplotLayer) are switched off so the village isn't drawn twice.

## Snow line, crevasses and the far plain (2026-11-28)

- **Snow line** (`lib/snowLine.ts`): each 0.5° climate cell's temperature is at the cell's mean height, now taken from one zoom-6 elevation tile (the tile holding the cell's centre). Each cell gets its own snow line (`snowLine`), and a point blends the four cells around it (sea cells drop out). Before, each ground tile used its own mean height, so the snow stopped in straight lines at tile edges (the Alps at zoom 9, 18,000 BCE) and a high tile bared its glaciers. Trees use the same line (`withSnowLine` in Close3DLayer), so none stand on glaciers. Check: Jungfrau cell (7.5–8°E, 46.5–47°N) at 1000 BCE is 5.5 °C over 1,202 m, so the line is near 3,000 m.
- **Crevasses**: the ice's "net of cracks" (one noise isoline, 420 m scale) read as contour lines or rivers from zoom 11. Now crevasse fields on steeper ice: short slots along the contours, every ~20 m of height, gone before they're under a pixel apart.
- **Fading by the pattern's own rate**: on a steep face seen head-on the horizontal metres per pixel (`gmpp`) are few while a pattern is packed tight, so fades keyed on `gmpp` let the ice streaks and the rock strata rule far faces like paper. They now fade by `fwidth` of their own coordinate. The slope per vertex is a five-vertex least-squares fit, because the upsampled elevation tiles step and a two-vertex slope flipped row to row.
- **The plain beyond the 3D tiles**: under the close-up the flat era backdrop shows past the loaded ground. From a camera lifted over the Alps it stood as a dark slab against the hazy horizon. With `?sky=1` it now takes `SkyTint` too (from the close-up module, so it isn't in the first load).
