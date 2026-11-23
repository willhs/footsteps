import {
  CLOSE3D_PITCH,
  COVER_WATER,
  SKY_PITCH,
  COVER_WET,
  EXAGGERATION,
  MESH_STEP,
  buildTerrainMesh,
  close3dNote,
  close3dParam,
  coverFor,
  groundParam,
  openWater,
  groundColour,
  pitchForZoom,
  plantsForTile,
  snowLine,
  terrariumHeights,
  withIce,
  type Ground,
} from './close3d';

const flat = (biome = 4, temp = 10): Ground => ({
  colourAt: () => [100, 120, 80],
  biomeAt: () => biome,
  tempAt: () => temp,
  precipAt: () => 800,
});
const bbox = { west: 0, south: 0, east: 0.35, north: 0.35 };
const heightsOf = (f: (x: number, y: number) => number) => {
  const h = new Float32Array(256 * 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) h[y * 256 + x] = f(x, y);
  return h;
};

test('the flag and the tilt', () => {
  expect(close3dParam('')).toBe(true);
  expect(close3dParam('?close3d=1')).toBe(true);
  expect(close3dParam('?close3d=0')).toBe(false);
  expect(pitchForZoom(6)).toBe(0);
  expect(pitchForZoom(8)).toBe(0);
  expect(pitchForZoom(12)).toBe(CLOSE3D_PITCH);
  expect(pitchForZoom(9)).toBeGreaterThan(0);
  expect(pitchForZoom(9)).toBeLessThan(CLOSE3D_PITCH);
  // ?sky=1 tilts on toward the horizon only from zoom 10; below that, and without the flag, nothing changes.
  for (const z of [6, 8, 9, 10]) expect(pitchForZoom(z, true)).toBe(pitchForZoom(z));
  expect(pitchForZoom(12, true)).toBe(SKY_PITCH);
  expect(pitchForZoom(14)).toBe(CLOSE3D_PITCH);
  expect(pitchForZoom(14, true)).toBe(SKY_PITCH);
  expect(pitchForZoom(11.7, true)).toBeGreaterThan(CLOSE3D_PITCH);
});

test('a lit mesh (?sky=1) carries no baked hillshade and marks its water; the unlit mesh is unchanged by the option', () => {
  // A ridge (the hillshade would darken one side) east of a sea.
  const heights = heightsOf((x, y) => (x < 64 ? -40 : 30 + 2000 * Math.abs(Math.sin(x / 20)) + y * 0.1));
  const plain = buildTerrainMesh(heights, bbox, 0, flat(), 4);
  const unlit = buildTerrainMesh(heights, bbox, 0, flat(), 4, false, null, null, false);
  expect(unlit.colors).toEqual(plain.colors);
  expect(plain.texCoords).toBeUndefined();
  const lit = buildTerrainMesh(heights, bbox, 0, flat(), 4, false, null, null, true);
  expect(lit.positions).toEqual(plain.positions);
  expect(lit.normals).toEqual(plain.normals);
  const n = 256 / 4 + 1;
  // Land: the year's colour times the small mottling only (0.92..1.08), whatever the slope; the unlit ridge spans a wider range.
  const ratios = (m: typeof lit) => Array.from({ length: n }, (_, i) => 32 * n + i).filter((v) => v % n > 20).map((v) => m.colors[v * 3 + 1] * 255 / 120);
  for (const r of ratios(lit)) {
    expect(r).toBeGreaterThanOrEqual(0.919);
    expect(r).toBeLessThanOrEqual(1.081);
  }
  expect(Math.max(...ratios(plain)) - Math.min(...ratios(plain))).toBeGreaterThan(0.3);
  // Water vertices say so in the layer; land is 0.
  expect(lit.texCoords![(n - 1) * 2 + 1]).toBe(0);
  // A DEM with no bathymetry (sea filled with exactly 0 m) is sea in a lit mesh while the sea is near today's, land otherwise.
  const filled = heightsOf((x) => (x < 128 ? 0 : 25));
  const litFilled = buildTerrainMesh(filled, bbox, -0.4, flat(), 4, false, null, null, true);
  expect(litFilled.texCoords![1]).toBe(COVER_WATER);
  expect(buildTerrainMesh(filled, bbox, -0.4, flat(), 4).colors).toEqual(buildTerrainMesh(filled, bbox, -0.4, flat(), 4, false, null, null, false).colors);
  expect(buildTerrainMesh(filled, bbox, -40, flat(), 4, false, null, null, true).texCoords![1]).toBe(0);
  expect(lit.texCoords![1]).toBe(COVER_WATER);
  expect(lit.texCoords![(n - 1) * 2 + 1]).toBe(0);
});

test('Terrarium pixels decode to metres', () => {
  // 32768 + 1000.5 m = 131 * 256 + 232 + 128 / 256
  const h = terrariumHeights(Uint8ClampedArray.of(131, 232, 128, 255));
  expect(h[0]).toBeCloseTo(1000.5);
});

test('water is flat at the sea level and land keeps its height', () => {
  // West half below a -50 m sea, east half above it.
  const heights = heightsOf((x) => (x < 128 ? -80 : 20));
  const mesh = buildTerrainMesh(heights, bbox, -50, flat());
  const n = 256 / 4 + 1;
  expect(mesh.positions[2]).toBeCloseTo(-50 * EXAGGERATION); // first vertex: west, in the sea
  expect(mesh.positions[(n - 1) * 3 + 2]).toBeCloseTo(20 * EXAGGERATION); // last of the row: east, land
  // Water is blue, land keeps the year's colour.
  expect(mesh.colors[2]).toBeGreaterThan(mesh.colors[0]);
  // The grid's two triangles per cell, then two per edge segment of the skirt round the tile.
  expect(mesh.indices.length).toBe(((n - 1) * (n - 1) + 4 * (n - 1)) * 6);
});

test('a skirt hangs under every tile edge, below the edge vertex it copies', () => {
  const heights = heightsOf((x, y) => x + y);
  const n = 256 / MESH_STEP + 1;
  const mesh = buildTerrainMesh(heights, bbox, -1000, flat(), MESH_STEP);
  expect(mesh.positions.length / 3).toBe(n * n + 4 * (n - 1) + 1);
  // The first skirt vertex copies the north-west corner (vertex 0), lowered; the one after the north row copies the north-east corner.
  const skirt = (e: number) => (n * n + e) * 3;
  expect(mesh.positions[skirt(0)]).toBe(mesh.positions[0]);
  expect(mesh.positions[skirt(0) + 2]).toBeLessThan(mesh.positions[2]);
  expect(mesh.positions[skirt(n - 1)]).toBe(mesh.positions[(n - 1) * 3]);
  expect(mesh.colors.length).toBe(mesh.positions.length);
  expect(Math.max(...mesh.indices)).toBe(mesh.positions.length / 3 - 1);
});

test('a tile one zoom coarser at MESH_STEP keeps the vertex spacing of the finer tile at step 4', () => {
  // A z10 tile's bbox is twice a z11 tile's each way: 128 cells over twice the width = 64 cells over the width.
  const fine = { west: 8, south: 46, east: 8.17578125, north: 46.12 };
  const coarse = { west: 8, south: 46, east: 8 + 2 * 0.17578125, north: 46.24 };
  const flatHeights = heightsOf(() => 100);
  const spacing = (mesh: ReturnType<typeof buildTerrainMesh>) => mesh.positions[3] - mesh.positions[0];
  expect(spacing(buildTerrainMesh(flatHeights, coarse, 0, flat(), MESH_STEP))).toBeCloseTo(spacing(buildTerrainMesh(flatHeights, fine, 0, flat(), 4)), 9);
});

test('the snow line rises with temperature and the ground under it', () => {
  expect(snowLine(20, 0, 1000)).toBeGreaterThan(snowLine(0, 0, 1000));
  expect(snowLine(10, 0, 2000)).toBe(snowLine(10, 0, 0) + 2000);
  const g = flat(4, -10);
  expect(groundColour(5000, 0, 0, 0, 0, g)[2]).toBeGreaterThan(220); // snow
  expect(groundColour(-10, 0, 0, 0, 0, g)[2]).toBeGreaterThan(groundColour(-10, 0, 0, 0, 0, g)[0]); // sea
});

test('plants follow the biome: forest dense, desert bare, none in the sea', () => {
  const land = heightsOf(() => 100);
  const forest = plantsForTile(land, bbox, [1, 2, 10], 0, flat(4));
  const desert = plantsForTile(land, bbox, [1, 2, 10], 0, flat(21));
  const ice = plantsForTile(land, bbox, [1, 2, 10], 0, flat(28));
  expect(forest.length).toBeGreaterThan(500);
  expect(desert.length).toBeLessThan(forest.length / 20);
  expect(ice.length).toBe(0);
  expect(plantsForTile(heightsOf(() => -10), bbox, [1, 2, 10], 0, flat(4))).toHaveLength(0);
  // Stable per tile.
  expect(plantsForTile(land, bbox, [1, 2, 10], 0, flat(4))).toEqual(forest);
});

test('a small inland dip below sea level stays land, with no beach', () => {
  // Land at 3 m everywhere except a 3 × 3 pixel dip to -2 m in the middle, far from any sea.
  const heights = heightsOf((x, y) => (Math.abs(x - 128) <= 4 && Math.abs(y - 128) <= 4 ? -2 : 3));
  const mesh = buildTerrainMesh(heights, bbox, 0, flat());
  const n = 256 / 4 + 1;
  const mid = (32 * n + 32) * 3;
  expect(mesh.positions[mid + 2]).toBeCloseTo(-2 * EXAGGERATION); // drawn at its own height, not as water
  // Same colour family as the surrounding land (green-ish), not sand or water.
  expect(mesh.colors[mid + 1]).toBeGreaterThan(mesh.colors[mid + 2]);
  expect(plantsForTile(heights, bbox, [3, 3, 10], 0, flat(4)).length).toBeGreaterThan(500);
});

test('low ground beside open water is beach; the same height inland is not', () => {
  // Sea in the west quarter, land at 2 m elsewhere.
  const heights = heightsOf((x) => (x < 64 ? -30 : 2));
  const mesh = buildTerrainMesh(heights, bbox, 0, flat());
  const n = 256 / 4 + 1;
  const shore = (32 * n + 17) * 3; // just east of the water's edge (x = 68 px)
  const inland = (32 * n + 50) * 3; // x = 200 px
  const sandiness = (o: number) => mesh.colors[o] - mesh.colors[o + 1]; // sand is red over green
  expect(sandiness(shore)).toBeGreaterThan(sandiness(inland) + 0.05);
});

test('open water: patches reaching the edge or big enough; specks are not', () => {
  const n = 20;
  const below = new Uint8Array(n * n);
  below[10 * n + 10] = 1; // a lone speck in the middle
  for (let j = 0; j < n; j++) below[j * n] = 1; // a strip along the west edge
  const water = openWater(below, n);
  expect(water[10 * n + 10]).toBe(0);
  expect(water[5 * n]).toBe(1);
});

test('?ground=1 is the only thing that turns the ground detail on', () => {
  expect(groundParam('')).toBe(false);
  expect(groundParam('?ground=0')).toBe(false);
  expect(groundParam('?plants=1')).toBe(false);
  expect(groundParam('?ground=1')).toBe(true);
});

test('cover follows the biome: forest crowns, grass, sand, ice', () => {
  expect(coverFor(1, 0, false).layer).toBeGreaterThan(0.9); // tropical evergreen forest: closed canopy
  expect(coverFor(1, 0, false).dryCold).toBe(1);
  expect(coverFor(4, 0, false).layer).toBeGreaterThan(coverFor(12, 0, false).layer); // forest over savanna
  expect(coverFor(12, 0, false).layer).toBeGreaterThan(0); // savanna keeps a few crowns
  expect(coverFor(20, 0, false).layer).toBeLessThan(0.1); // grassland: almost none
  expect(coverFor(23, 0, false)).toEqual({ dryCold: 1, layer: 0 }); // tundra: grass, no crowns
  expect(coverFor(21, 0, false)).toEqual({ dryCold: 0, layer: 0 }); // desert: sand
  expect(coverFor(28, 0, false)).toEqual({ dryCold: 2, layer: 0 }); // land ice
});

test('snow takes the trees, wet ground takes the trees, water has its own marker', () => {
  expect(coverFor(4, 0.5, false)).toEqual({ dryCold: 2, layer: 0 }); // above the snow line
  expect(coverFor(4, 0.3, false).layer).toBeLessThan(coverFor(4, 0, false).layer);
  expect(coverFor(4, 0, true)).toEqual({ dryCold: 1, layer: COVER_WET });
  expect(coverFor(21, 0, true)).toEqual({ dryCold: 0, layer: COVER_WET }); // coastal salt flat
  expect(coverFor(27, 0, true).layer).toBeGreaterThanOrEqual(0); // barren rock is never wet
  expect(COVER_WATER).toBeLessThan(-0.75);
  expect(COVER_WET).toBeGreaterThan(-0.75);
});

test('a mesh built with cover carries one [dryCold, layer] pair per vertex; without it, none', () => {
  const heights = heightsOf((x) => (x < 128 ? -80 : 20 + (x % 7))); // sea on the west, bumpy land
  const n = 256 / 4 + 1;
  expect(buildTerrainMesh(heights, bbox, -50, flat(4)).texCoords).toBeUndefined();
  const mesh = buildTerrainMesh(heights, bbox, -50, flat(4), 4, true);
  expect(mesh.texCoords!.length).toBe((n * n + 4 * (n - 1) + 1) * 2); // grid, then skirt
  expect(mesh.texCoords![1]).toBe(COVER_WATER); // first vertex: in the sea
  const last = (n - 1) * 2; // last of the first row: land, deciduous forest
  expect(mesh.texCoords![last]).toBe(1);
  expect(mesh.texCoords![last + 1]).toBeGreaterThan(0.5);
});

test('low flat ground by the sea is wet, higher ground and a desert above 3 m are not', () => {
  const coast = heightsOf((x) => (x < 100 ? -80 : 2)); // 2 m above a sea at 0, flat
  const n = 256 / 4 + 1;
  const row = (mesh: ReturnType<typeof buildTerrainMesh>, i: number) => mesh.texCoords![i * 2 + 1];
  const forest = buildTerrainMesh(coast, bbox, 0, flat(4), 4, true);
  expect(row(forest, n - 3)).toBe(COVER_WET); // flat low land, whatever the biome
  const highland = buildTerrainMesh(heightsOf((x) => (x < 100 ? -80 : 60)), bbox, 0, flat(4), 4, true);
  expect(row(highland, n - 3)).toBeGreaterThan(0); // 60 m up: forest
  const lowDesert = buildTerrainMesh(heightsOf(() => 2), bbox, 0, flat(21), 4, true);
  expect(row(lowDesert, 5 * n + 5)).toBe(COVER_WET); // a salt flat 2 m above the sea
  const dryDesert = buildTerrainMesh(heightsOf(() => 4), bbox, 0, flat(21), 4, true);
  expect(row(dryDesert, 5 * n + 5)).toBe(0); // 4 m up: bare sand
});

test('the note says the surface is imagined only when ?ground=1 is on', () => {
  expect(close3dNote(false, false).label).toBe('3D: ground measured');
  expect(close3dNote(false, true).label).toBe('3D: ground measured, surface imagined');
  expect(close3dNote(true, false).label).toBe('3D: ground measured, plants imagined');
  expect(close3dNote(true, true).label).toBe('3D: ground measured, surface and plants imagined');
  expect(close3dNote(false, true).title).toMatch(/modelled/);
  expect(close3dNote(false, true).title).toMatch(/imagined/);
  expect(close3dNote(false, false).title).not.toMatch(/imagined/);
  expect(close3dNote(false, false, true).label).toBe('3D: ground measured, fields and paths imagined');
  expect(close3dNote(false, true, true).label).toBe('3D: ground measured, surface and fields and paths imagined');
  expect(close3dNote(false, false, true).title).toMatch(/HYDE's cropland in the cell/);
});

test('the note says the weather is imagined only when ?weather=1 is on', () => {
  expect(close3dNote(false, false, false).label).toBe('3D: ground measured');
  expect(close3dNote(false, false, true).label).toBe('3D: ground measured, weather imagined');
  expect(close3dNote(false, true, true).label).toBe('3D: ground measured, surface and weather imagined');
  expect(close3dNote(false, false, true).title).toMatch(/Cloud shadows and wind are imagined/);
  expect(close3dNote(false, false, true).title).toMatch(/rainfall/);
});

test('with the weather on and the ground off the mesh carries its cover and keeps the per-vertex mottling', () => {
  const n = 129;
  const h = heightsOf(() => 50);
  const withCover = buildTerrainMesh(h, bbox, 0, flat(4), 2, true, null, null, false, false);
  const plain = buildTerrainMesh(h, bbox, 0, flat(4), 2);
  const painted = buildTerrainMesh(h, bbox, 0, flat(4), 2, true);
  expect(withCover.texCoords).toBeDefined();
  expect(Array.from(withCover.colors.slice(0, n * 3))).toEqual(Array.from(plain.colors.slice(0, n * 3))); // same look as no flags
  expect(Array.from(painted.colors.slice(0, n * 3))).not.toEqual(Array.from(plain.colors.slice(0, n * 3)));
});

// --- ?pastwater=1: the modelled lake plane -----------------------------------------------------------------------------------

test('a modelled lake is water flat at its own level, not the sea\'s, only where the mask says and the ground is below the plane', () => {
  // Ground at 320 m in the west half (a basin), 340 m in the east; sea level 0. The mask covers the whole tile.
  const heights = heightsOf((x) => (x < 128 ? 320 : 340));
  const plane = (wet: (lon: number) => boolean) => ({ key: 'k', levelAt: (lon: number, _lat: number, h: number) => (wet(lon) && h < 329 ? 329 : null) });
  const lake = plane(() => true);
  const mesh = buildTerrainMesh(heights, bbox, 0, flat(), 4, false, lake);
  const n = 256 / 4 + 1;
  expect(mesh.positions[2]).toBeCloseTo(329 * EXAGGERATION); // west: lake surface at 329 m, not 0 and not the ground's 320
  expect(mesh.positions[(n - 1) * 3 + 2]).toBeCloseTo(340 * EXAGGERATION); // east: above the plane, land
  expect(mesh.colors[2]).toBeGreaterThan(mesh.colors[0]); // water is blue
  // outside the mask the same low ground is dry basin, drawn at its own height
  const dry = buildTerrainMesh(heights, bbox, 0, flat(), 4, false, plane(() => false));
  expect(dry.positions[2]).toBeCloseTo(320 * EXAGGERATION);
  // with no lake at all the tile is what it was
  expect(buildTerrainMesh(heights, bbox, 0, flat(), 4, false, null).positions).toEqual(buildTerrainMesh(heights, bbox, 0, flat()).positions);
});

test('the lake does not move the sea: ocean water in the same tile stays at the year\'s sea level', () => {
  const heights = heightsOf((x) => (x < 64 ? -30 : x < 160 ? 320 : 340));
  const mesh = buildTerrainMesh(heights, bbox, -10, flat(), 4, false, { key: 'k', levelAt: (lon: number, _lat: number, h: number) => (lon > 0.1 && h < 329 ? 329 : null) });
  expect(mesh.positions[2]).toBeCloseTo(-10 * EXAGGERATION); // west: sea
  const n = 256 / 4 + 1;
  expect(mesh.positions[(n - 1) * 3 + 2]).toBeCloseTo(340 * EXAGGERATION);
  expect(mesh.positions[(30 * 3) + 2]).toBeCloseTo(329 * EXAGGERATION); // x = 120 px: in the mask and below 329
});

test('past water with a level per place is flat at each lake\'s own level, wherever its outline says, even above the ground', () => {
  // two lakes side by side (an outline-traced scenario): west at 100 m, east at 150 m; the ground is 120 m everywhere
  const heights = heightsOf(() => 120);
  const mesh = buildTerrainMesh(heights, bbox, 0, flat(), 4, false, { key: 'k', levelAt: (lon: number) => (lon < 0.17 ? 100 : 150) });
  const n = 256 / 4 + 1;
  expect(mesh.positions[2]).toBeCloseTo(100 * EXAGGERATION);
  expect(mesh.positions[(n - 1) * 3 + 2]).toBeCloseTo(150 * EXAGGERATION);
});

// --- ?ice=1: the dated ice sheet on the ground ---------------------------------------------------------------------------------

test('under the ice the ground is white ice, never sea, flat at sea level where the bed is below it; off the ice nothing changes', () => {
  // West half of the tile 60 m below the year's sea (grounded marine ice), east half land at 100 m. The ice covers the west 0.2 degrees.
  const heights = heightsOf((x) => (x < 128 ? -60 : 100));
  const ice = { key: 'ice20000', shareAt: (lon: number) => (lon < 0.2 ? 1 : 0) };
  const n = 256 / 4 + 1;
  const bare = buildTerrainMesh(heights, bbox, 0, flat(), 4, true);
  const iced = buildTerrainMesh(heights, bbox, 0, withIce(flat(), ice), 4, true, null, ice);
  expect(bare.positions[2]).toBeCloseTo(0); // sea surface
  expect(bare.texCoords![1]).toBe(COVER_WATER);
  expect(iced.positions[2]).toBeCloseTo(0); // ice at sea level, not the -60 m bed
  expect(iced.texCoords![0]).toBe(2); // the shader's ice
  expect(iced.texCoords![1]).not.toBe(COVER_WATER);
  const rgb = (m: typeof iced, v: number) => [m.colors[v * 3], m.colors[v * 3 + 1], m.colors[v * 3 + 2]];
  const [r, g, b] = rgb(iced, 0);
  expect(Math.min(r, g, b)).toBeGreaterThan(0.6); // white, not sea blue or green land
  // east of the ice: the same as without it
  const east = n - 1;
  expect(rgb(iced, east)).toEqual(rgb(bare, east));
  expect(iced.positions[east * 3 + 2]).toBe(bare.positions[east * 3 + 2]);
  // no ice cover at all: the tile is what it was
  expect(buildTerrainMesh(heights, bbox, 0, flat(), 4, true, null, null).positions).toEqual(bare.positions);
});
