/** The URL contract, shared by the browser and Node verification scripts. */
export const FLAGS = /** @type {const} */ ([
  // Opt-in: the look is off until the flag is set. Order is the order the sweep turns them on together.
  { name: 'trees', kind: 'off-switch', on: '0', default: 'on', what: 'Shaded biome tree impostors, household clearings and distance LOD; trees imagined', doc: 'close-up-scene.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'ground', kind: 'off-switch', on: '0', default: 'on', what: 'Biome surface detail (grass, canopy, sand ripples, cracked ice, reeds, rock) in the close-up ground shader; the note says "surface imagined"', doc: 'close-up-scene.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'weather', kind: 'off-switch', on: '0', default: 'on', what: 'Imagined weather in the close-up ground shader: cloud shadows drifting by the place\'s rainfall, gusts through grass and reeds; works with or without ground=1; the note says "weather imagined"', doc: 'close-up-scene.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'shelters', kind: 'off-switch', on: '0', default: 'on', what: 'One dwelling per household in the close-up, typed from the analog society\'s house codes', doc: 'settlements.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'fields', kind: 'off-switch', on: '0', default: 'on', what: 'Imagined fields, gardens, terraces, corrals, grazed grass and worn paths round each group in the close-up; farmed share from HYDE cropland', doc: 'close-up-scene.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'smoke', kind: 'off-switch', on: '0', default: 'on', what: 'A smoke plume from each household\'s hearth, drifting with the wind, and warm light pools on the ground at night (all imagined)', doc: 'close-up-scene.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'routine', kind: 'off-switch', on: '0', default: 'on', what: 'Each person at street zoom follows a daily routine for the local sun time (asleep, hearth, play, trip)', doc: 'routine.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'avatar', kind: 'off-switch', on: '0', default: 'on', what: 'The person card shows a rigged, animated 3D figure (CC0 Quaternius body; clothes, hair and ornaments by era, place and way of life from a cited table; a tool and work loop by role; drag to turn) instead of the drawing', doc: 'avatar.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'pastwater', kind: 'off-switch', on: '0', default: 'on', what: 'Dated past-water scenarios (Lake Mega-Chad, European LGM lakes and rivers, Mesopotamian coast) in the Earth image, the site ranker and the close-up lake plane', doc: 'past-water.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'terrain_tiles', kind: 'off-switch', on: '0', default: 'on', what: 'The 500 m photo pyramid recoloured per year on the GPU, zoom 3-8 and the close-up ground colours', doc: 'terrain-images.md, terrain-bench.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'food', kind: 'off-switch', on: '0', default: 'on', what: 'Hover card row: crops and animals around, and forager staples (modelled)', doc: 'food.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'explain', kind: 'opt-in', on: '1', default: 'off', what: '"How is this estimated?" link under the counter: a panel naming the sources, methods and a confidence word for the place and year', doc: 'estimate-panel.md', reviewed: 'no' },
  { name: 'coast', kind: 'opt-in', on: '1', default: 'off', what: 'Draws the modern coastline (Natural Earth 110m) over the terrain image', doc: 'terrain-images.md', reviewed: 'n/a (debug overlay)' },
  { name: 'spread', kind: 'off-switch', on: '0', default: 'on', what: 'HYDE people moved by climate-then-vs-now within continent regions, 10,000-4,000 BCE ("Adjusted spread (modelled on HYDE)")', doc: 'hyde-climate-spread.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'ice', kind: 'off-switch', on: '0', default: 'on', what: 'Dated ice-sheet margins (PaleoMIST 1.0, nearest 2.5 ka epoch, 0-80 ka): white overlay, close-up ice surface, groups kept off the ice, hover row', doc: 'ice-sheets.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'langs', kind: 'off-switch', on: '0', default: 'on', what: '"Languages spreading here" hover line from cited expansion boxes (never before 3050 BCE)', doc: 'languages.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'sky', kind: 'off-switch', on: '0', default: 'on', what: 'Close-up light from the local sun clock, distance haze into a sky at the horizon, animated water with glint, shallows and shore foam', doc: 'close-up-scene.md', reviewed: 'yes (2026-11-28, kept on)' },
  // Off switches: on by default, `=0` turns it off (compare, or a fallback).
  { name: 'settlements', kind: 'off-switch', on: '0', default: 'on', what: 'The settlement model (group sizes and layouts from ethnographic analogs); `=0` gives even groups at random spots ', doc: 'settlements.md', reviewed: 'n/a (default)' },
  { name: 'sites', kind: 'off-switch', on: '0', default: 'on', what: 'Spot ranking inside each cell (flat, near fresh water, off the sea); `=0` keeps the old random positions', doc: 'site-terrain.md', reviewed: 'n/a (default)' },
  { name: 'humans', kind: 'off-switch', on: '0', default: 'on', what: 'Other kinds of human (Neanderthals, Denisovans, floresiensis, luzonensis)', doc: 'other-humans.md', reviewed: 'n/a (default)' },
  { name: 'rivers', kind: 'off-switch', on: '0', default: 'on', what: "Today's rivers (Natural Earth 10m, `public/water/rivers.json`) draped on the close-up ground as paths; courses that moved are drawn where they run now; none under the sea, ice or past water", doc: 'close-up-scene.md', reviewed: 'no' },
  { name: 'close3d', kind: 'off-switch', on: '0', default: 'on', what: 'The 3D landscape from zoom 8, seen from straight above; `=0` keeps the map flat', doc: 'close-up-scene.md', reviewed: 'n/a (default)' },
  { name: 'hover', kind: 'off-switch', on: '0', default: 'on', what: 'The hover card (habitat, climate, people, way of life under the cursor)', doc: 'habitat-lookup.md', reviewed: 'n/a (default)' },
  { name: 'tags', kind: 'off-switch', on: '0', default: 'on', what: 'Name tags on people at street zoom', doc: '../../footsteps-web/AGENTS.md (no ops doc)', reviewed: 'n/a (default)' },
  // A value picks a look.
  { name: 'mode', kind: 'choice', default: 'units (people view chosen by zoom)', what: '`units`, `grid` or `dots` forces one people look and shows the mode button', doc: 'grid-images.md', reviewed: 'n/a (debug)' },
  { name: 'bar', kind: 'choice', default: 'new time bar', what: '`old` shows the previous two-strip time navigator for comparison', doc: '../../footsteps-web/AGENTS.md (no ops doc)', reviewed: 'n/a (debug)' },
  // Debug.
  { name: 'still', kind: 'debug', on: '1', default: 'off', what: 'Stops time-based animation so the same scene gives the same pixels (visual regression)', doc: 'visual-regression.md', reviewed: 'n/a (debug)' },
  { name: 'utc', kind: 'debug', default: 'now', what: 'Start the sun clock at this UTC hour (e.g. 6.5)', doc: 'routine.md', reviewed: 'n/a (debug)' },
  { name: 'warp', kind: 'debug', default: '1', what: 'Run the sun clock this many times faster than real time', doc: 'routine.md', reviewed: 'n/a (debug)' },
  // Where the camera starts.
  { name: 'year', kind: 'view', default: 'the app\'s start year', what: 'Start year (negative = BCE)', doc: 'visual-regression.md', reviewed: 'n/a (view)' },
  { name: 'lat', kind: 'view', default: 'globe', what: 'Start latitude', doc: 'visual-regression.md', reviewed: 'n/a (view)' },
  { name: 'lon', kind: 'view', default: 'globe', what: 'Start longitude', doc: 'visual-regression.md', reviewed: 'n/a (view)', aliases: ['lng'] },
  { name: 'zoom', kind: 'view', default: 'globe', what: 'Start zoom', doc: 'visual-regression.md', reviewed: 'n/a (view)', aliases: ['z'] },
  { name: 'hour', kind: 'view', default: '10.5', what: 'Start the time-of-day dial at this local sun hour (e.g. 22)', doc: 'routine.md', reviewed: 'n/a (view)' },
]);

/** Every name a flag can be spelled as in the URL. */
export const FLAG_NAMES = FLAGS.flatMap((f) => [f.name, ...(f.aliases ?? [])]);

