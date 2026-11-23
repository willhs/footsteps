// Fields, gardens and paths (`?fields=1`): what each group's way of life did to the land round it, as low ground-hugging quads the
// close-up drapes on its 3D ground (fieldsDrape.ts). The layout is IMAGINED; how much is farmed follows HYDE's cropland share of
// the 0.5° cell (MODELLED), out to a farmed radius from site-catchment work (CITED):
//   - Chisholm, M. (1962) Rural Settlement and Land Use: most cultivated land lies within about 1 km of the farmstead, little beyond 2-3 km.
//   - Vita-Finzi, C. & Higgs, E. S. (1970) Proc. Prehist. Soc. 36: 1-37: a 5 km (one hour's walk) catchment for farmers.
// Everything is a pure function of the groups in view (seeded by `groupSeed`, as households are), so a place always draws the same land.
import { HOUSEHOLD_SPACING_M, householdsOf, offsetByMetres } from './households';
import { groupSeed } from './people';
import { nominalPeople, townRadius, townRoofs, type TownInView } from './shelters';
import { UnitKind } from './units';

/** Off by default until Will has looked at it on prod: `?fields=1` draws fields, gardens and paths in the close-up. */
export function fieldsParam(search: string): boolean {
  return new URLSearchParams(search).get('fields') === '1';
}

type Rgb = [number, number, number];
export type Corner = [number, number];

/** What a patch of land is. A `wash` patch (grass grazed paler) is painted into the ground's own colours, not laid on it as a shape; it is
 * one spoke of a fan round its first corner, strongest there and fading out to the rim. */
export type AreaKind = 'field' | 'fallow' | 'pasture' | 'garden' | 'corral' | 'grazed' | 'clearing';
export type LandKind = AreaKind | 'terrace' | 'path';
/** A ground quad, corners in order round it (lon, lat). */
export type AreaPatch = { kind: AreaKind; corners: [Corner, Corner, Corner, Corner]; rgb: Rgb; wash: boolean };
/** A stretch of worn track from `line[0]` to `line[1]`; its width is set when it is draped (a pixel or two on screen). */
export type PathPatch = { kind: 'path'; line: [Corner, Corner]; rgb: Rgb; wash: false };
export type LandPatch = AreaPatch | PathPatch;

/** Distance to the nearest fresh water (water_distance.webp) and the way towards it (unit vector east, north), or null dir when flat. */
export type WaterHere = { metres: number; dir: [number, number] | null };
/** A group in view and what the land round it says. `crop`, `grazing`: HYDE shares of its 0.5° cell (0..1). */
export type LandGroup = {
  lon: number;
  lat: number;
  kind: number;
  people: number;
  crop: number;
  grazing: number;
  /** The group's share of its 5′ cell's people (0..1]: the cell's cropland is farmed by its groups in proportion to their people. */
  cellShare: number;
  water: WaterHere | null;
};
export type LandTown = TownInView & { crop: number; cellShare: number; water: WaterHere | null };
export type Season = 'off' | 'june' | 'december';
export type LandContext = {
  season: Season;
  /** Crop ids around a place at the year (lib/food.ts `cropsAround`); empty when unknown. */
  crops: (lon: number, lat: number) => readonly string[];
};

/** Farmed radius, metres (Chisholm 1962; see the header): no field lies further out. Intensity falls off as 1 - (d / R)². */
export const FARM_RADIUS_M = 2000;
/** Share of the farmed ring a village's own fields fill: its fields are packed round it, reaching only as far as its share of the cell's
 * cropland needs (up to FARM_RADIUS_M). Imagined. */
export const FARM_FILL = 0.6;
const CELL_DEG = 1 / 12;

/** A farming village farms at least this much per person (m²; 0.5 ha), wherever HYDE records less cropland in its cell: early HYDE cells
 * are often counted farmer by head count alone (lib/waysOfLife.ts SETTLED_MIN_CELL) with almost no cropland, and a village still eats.
 * Imagined floor, inside the 0.2-1 ha per person that Kaplan, Krumhardt & Zimmermann (2009, Quat. Sci. Rev. 28: 3016) use for
 * pre-industrial land use. */
export const SUBSISTENCE_M2_PER_PERSON = 5000;

/** A group's farmed area in m²: the HYDE cropland of its 5′ cell (share × cell area), times the group's share of the cell's people. */
export function farmedArea(crop: number, lat: number, cellShare: number): number {
  const cell = (CELL_DEG * M_PER_DEG_LAT) ** 2 * Math.cos((lat * Math.PI) / 180);
  return Math.max(0, crop) * cell * Math.min(1, Math.max(0, cellShare));
}
/** Side of a field block, metres; a block is split into 1-3 strips. */
export const BLOCK_M = 150;
/** Gap left between strips (a balk or hedge line), metres. */
const BALK_M = 6;
export const FALLOW_SHARE = 0.2;
export const PASTURE_SHARE = 0.1;
/** Paths to water are drawn when it is at least this far, and at most this long. */
export const WATER_PATH_MIN_M = 100;
export const WATER_PATH_MAX_M = 3000;
/** Neighbouring groups closer than this are joined by a path. */
export const NEIGHBOUR_PATH_M = 4000;
const GARDEN_M: [number, number] = [18, 13];
const MAX_GARDENS = 60;

// --- Colours -------------------------------------------------------------------------------------------------------

/** A crop's look in its growing season and out of it. */
type Look = { grow: Rgb; rest: Rgb };
const CEREAL: Look = { grow: [212, 178, 92], rest: [132, 142, 84] };
const MILLET: Look = { grow: [188, 154, 86], rest: [146, 120, 88] };
const PADDY: Look = { grow: [112, 176, 74], rest: [118, 140, 132] };
const MAIZE: Look = { grow: [86, 136, 52], rest: [158, 132, 94] };
const PULSE: Look = { grow: [128, 156, 64], rest: [140, 114, 82] };
const ROOT: Look = { grow: [72, 118, 56], rest: [128, 104, 78] };
const TALL: Look = { grow: [64, 124, 54], rest: [96, 118, 64] };
export const CROP_LOOK: Record<string, Look> = {
  wheat: CEREAL,
  barley: { grow: [222, 196, 116], rest: CEREAL.rest },
  ne_pulses: PULSE,
  rice: PADDY,
  african_rice: PADDY,
  millets_ne_asia: MILLET,
  sorghum: { grow: [176, 128, 78], rest: MILLET.rest },
  pearl_millet: MILLET,
  maize: MAIZE,
  potato: ROOT,
  cassava: ROOT,
  sweet_potato: ROOT,
  yam: ROOT,
  taro: { grow: [70, 128, 76], rest: ROOT.rest },
  squash: { grow: [112, 144, 60], rest: ROOT.rest },
  common_bean: PULSE,
  soybean: PULSE,
  banana: TALL,
  sugarcane: TALL,
};
const GENERIC: Look = { grow: [160, 156, 84], rest: [134, 114, 84] };
const LOOKS: Record<Exclude<AreaKind, 'field'> | 'path', Look> = {
  fallow: { grow: [156, 136, 98], rest: [142, 120, 90] },
  pasture: { grow: [118, 152, 78], rest: [134, 136, 96] },
  garden: { grow: [78, 126, 58], rest: [112, 96, 70] },
  corral: { grow: [112, 92, 70], rest: [112, 92, 70] },
  grazed: { grow: [206, 198, 140], rest: [196, 188, 142] },
  clearing: { grow: [176, 150, 112], rest: [176, 150, 112] },
  path: { grow: [172, 148, 110], rest: [164, 140, 106] },
};

/** Growing season at a latitude: the tropics always; elsewhere the hemisphere's summer, unless `?seasons=1` picks the other. */
export function growing(season: Season, lat: number): boolean {
  if (season === 'off' || Math.abs(lat) < 15) return true;
  return (season === 'june') === (lat >= 0);
}

// --- Seeded numbers -----------------------------------------------------------------------------------------------

/** Hash of integers to [0, 1). */
function hash(a: number, b: number, c = 0): number {
  return hash32(a, b, c) / 4294967296;
}

/** Hash of integers to an unsigned 32-bit integer (kept in int32 range throughout, so it stays fast). */
function hash32(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}
/** The low or high 16 bits of a hash as [0, 1): two numbers from one hash. */
const lo16 = (h: number) => (h & 0xffff) / 65536;
const hi16 = (h: number) => (h >>> 16) / 65536;

const shade = (rgb: Rgb, k: number): Rgb => [Math.min(255, rgb[0] * k), Math.min(255, rgb[1] * k), Math.min(255, rgb[2] * k)];

// --- Geometry helpers ---------------------------------------------------------------------------------------------

const M_PER_DEG_LAT = 111_320;
const mPerDegLon = (lat: number) => M_PER_DEG_LAT * Math.max(0.2, Math.cos((lat * Math.PI) / 180));

/** Area of a patch in square metres (shoelace on a local metre frame). */
export function patchArea(p: AreaPatch): number {
  const [lon0, lat0] = p.corners[0];
  const k = mPerDegLon(lat0);
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = p.corners[i];
    const [x2, y2] = p.corners[(i + 1) % 4];
    a += (x1 - lon0) * k * (y2 - lat0) * M_PER_DEG_LAT - (x2 - lon0) * k * (y1 - lat0) * M_PER_DEG_LAT;
  }
  return Math.abs(a) / 2;
}

/** Where a group's land ends and a neighbour's begins: each point belongs to the nearest group (a Voronoi split), so the fields of two
 * villages never lie on top of each other. `others` are the neighbours' offsets in metres from this group. */
function ownsPoint(x: number, y: number, others: readonly [number, number][]): boolean {
  const mine = x * x + y * y;
  for (const [ox, oy] of others) if ((x - ox) ** 2 + (y - oy) ** 2 < mine) return false;
  return true;
}

type Site = { lon: number; lat: number; seed: number; kind: number };

/** Each site's neighbours within `reach` metres, as metre offsets, nearest first. O(n²): a view holds at most a few hundred groups. */
function neighbours(sites: readonly Site[], reach: number): Near[][] {
  const reachLat = reach / M_PER_DEG_LAT;
  return sites.map((s, i) => {
    const near: Near[] = [];
    const k = mPerDegLon(s.lat);
    sites.forEach((t, j) => {
      if (i === j || Math.abs(t.lat - s.lat) > reachLat) return;
      const offset: [number, number] = [(t.lon - s.lon) * k, (t.lat - s.lat) * M_PER_DEG_LAT];
      const d = Math.hypot(offset[0], offset[1]);
      if (d < reach) near.push({ offset, index: j, d });
    });
    return near.sort((a, b) => a.d - b.d);
  });
}

// --- Generators ---------------------------------------------------------------------------------------------------

/** Field blocks round a site, from `inner` metres out, about `area` m² of them in expectation: the ring reaches as far as FARM_FILL of it
 * holds the area (never past `outerMax`), and a block is kept with probability ∝ 1 - (d / outer)², normalised over the ring's blocks so the
 * expected kept area is `area` (until blocks near the centre saturate). Each kept block is split into 1-3 strips along one of its sides; a
 * strip is fallow, pasture or a field of one of the crops around. */
function farmland(
  out: LandPatch[], site: Site, area: number, inner: number, outerMax: number, others: readonly [number, number][], ctx: LandContext, grow: boolean,
) {
  if (area <= 0) return;
  const { seed } = site;
  const theta = hash(seed, 1) * Math.PI;
  const [cos, sin] = [Math.cos(theta), Math.sin(theta)];
  const shift = [hash(seed, 2) * BLOCK_M, hash(seed, 3) * BLOCK_M];
  const crops = ctx.crops(site.lon, site.lat);
  const lonPerM = 1 / mPerDegLon(site.lat);
  const latPerM = 1 / M_PER_DEG_LAT;
  const outer = Math.min(outerMax, Math.max(inner + 2 * BLOCK_M, Math.sqrt(inner * inner + area / (Math.PI * FARM_FILL))));
  const cells = Math.ceil(outer / BLOCK_M) + 1;
  const weight = (i: number, j: number) => {
    const d = Math.hypot(i * BLOCK_M + shift[0], j * BLOCK_M + shift[1]);
    // A block lies wholly inside the ring: its centre is half a diagonal from its far corner.
    return d + BLOCK_M * Math.SQRT1_2 > outer || d < inner ? 0 : 1 - (d / outer) ** 2;
  };
  let total = 0;
  for (let j = -cells; j < cells; j++) for (let i = -cells; i < cells; i++) total += weight(i, j);
  if (total <= 0) return;
  const scale = area / (total * BLOCK_M * BLOCK_M);
  // A corner (u, v) of the rotated block grid to lon/lat, jittered by a hash of the grid corner so neighbouring strips share their wobble.
  const toWorld = (u: number, v: number, ju: number, jv: number): Corner => {
    const jitter = BLOCK_M * 0.06;
    const h = hash32(seed, ju, jv * 3 + 7);
    const du = (lo16(h) - 0.5) * 2 * jitter;
    const dv = (hi16(h) - 0.5) * 2 * jitter;
    const uu = u + du;
    const vv = v + dv;
    // offsetByMetres, with the site's metres per degree worked out once.
    return [site.lon + (uu * cos - vv * sin) * lonPerM, site.lat + (uu * sin + vv * cos) * latPerM];
  };
  for (let j = -cells; j < cells; j++) {
    for (let i = -cells; i < cells; i++) {
      const u0 = i * BLOCK_M + shift[0] - BLOCK_M / 2;
      const v0 = j * BLOCK_M + shift[1] - BLOCK_M / 2;
      const w = weight(i, j);
      if (w <= 0) continue;
      const p = Math.min(1, scale * w);
      const cellKey = (i + 4096) * 8192 + (j + 4096);
      if (hash(seed, cellKey, 11) >= p) continue;
      const hb = hash32(seed, cellKey, 12);
      const strips = 1 + Math.floor(lo16(hb) * 3);
      const alongU = hi16(hb) < 0.5;
      for (let s = 0; s < strips; s++) {
        const a = (s / strips) * BLOCK_M + BALK_M / 2;
        const b = ((s + 1) / strips) * BLOCK_M - BALK_M / 2;
        const lo = BALK_M / 2;
        const hi = BLOCK_M - BALK_M / 2;
        // Corners in block-local metres, then jittered by the grid corner they sit nearest, so strips of a block share edges' wobble.
        const box: [number, number][] = alongU ? [[a, lo], [b, lo], [b, hi], [a, hi]] : [[lo, a], [hi, a], [hi, b], [lo, b]];
        const [su, sv] = [u0 + (box[0][0] + box[2][0]) / 2, v0 + (box[0][1] + box[2][1]) / 2];
        if (!ownsPoint(su * cos - sv * sin, su * sin + sv * cos, others)) continue;
        const corners = box.map(([bu, bv]) => toWorld(u0 + bu, v0 + bv, i * 4 + Math.round((bu / BLOCK_M) * 3), j * 4 + Math.round((bv / BLOCK_M) * 3))) as AreaPatch['corners'];
        const hs = hash32(seed, cellKey * 4 + s, 14);
        const roll = lo16(hs);
        const k = 0.92 + 0.16 * hi16(hs);
        if (roll < FALLOW_SHARE) out.push({ kind: 'fallow', corners, rgb: shade(grow ? LOOKS.fallow.grow : LOOKS.fallow.rest, k), wash: false });
        else if (roll < FALLOW_SHARE + PASTURE_SHARE) out.push({ kind: 'pasture', corners, rgb: shade(grow ? LOOKS.pasture.grow : LOOKS.pasture.rest, k), wash: false });
        else {
          // The first crops listed are the region's staples: favour them.
          const pick = crops.length ? crops[Math.floor(hash(seed, cellKey * 4 + s, 16) ** 1.7 * crops.length)] : null;
          const look = (pick && CROP_LOOK[pick]) || GENERIC;
          out.push({ kind: 'field', corners, rgb: shade(grow ? look.grow : look.rest, k), wash: false });
        }
      }
    }
  }
}

/** A small rectangle `w` × `h` metres centred `x`, `y` metres from a site, turned by `theta`. */
function rect(lon: number, lat: number, x: number, y: number, w: number, h: number, theta: number): AreaPatch['corners'] {
  const [c, s] = [Math.cos(theta), Math.sin(theta)];
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as const).map(([u, v]) =>
    offsetByMetres(lon, lat, x + u * c - v * s, y + u * s + v * c),
  ) as AreaPatch['corners'];
}

/** A ragged disk (or a ring, `inner` > 0) round a point as `spokes` quads; radii wobble by ±`wobble` per spoke. */
function disk(out: LandPatch[], site: Site, kind: AreaKind, rgb: Rgb, wash: boolean, inner: number, outer: number, spokes: number, wobble: number, salt: number) {
  const r = (k: number, base: number) => base * (1 + (hash(site.seed, k % spokes, salt) - 0.5) * 2 * wobble);
  const at = (k: number, radius: number): Corner => {
    const a = (k / spokes) * Math.PI * 2;
    return offsetByMetres(site.lon, site.lat, Math.cos(a) * radius, Math.sin(a) * radius);
  };
  for (let k = 0; k < spokes; k++) {
    const corners: AreaPatch['corners'] = inner > 0
      ? [at(k, r(k, inner)), at(k + 1, r(k + 1, inner)), at(k + 1, r(k + 1, outer)), at(k, r(k, outer))]
      : [at(k, 0), at(k + 1, 0), at(k + 1, r(k + 1, outer)), at(k, r(k, outer))];
    out.push({ kind, corners, rgb, wash });
  }
}

/** A worn track from a to b (metre offsets from `site`), bent twice by a seeded sideways wobble and cut into stretches of at most ~250 m so
 * the drape follows the ground. */
function track(out: LandPatch[], site: Site, to: [number, number], salt: number, grow: boolean) {
  const len = Math.hypot(to[0], to[1]);
  if (len < 1) return;
  const [nx, ny] = [-to[1] / len, to[0] / len];
  const bends = [0, 0.33, 0.66, 1].map((t, k) => {
    const off = k === 0 || k === 3 ? 0 : (hash(site.seed, salt, k) - 0.5) * 0.16 * len;
    return [to[0] * t + nx * off, to[1] * t + ny * off] as [number, number];
  });
  const rgb = grow ? LOOKS.path.grow : LOOKS.path.rest;
  for (let k = 0; k < 3; k++) {
    const [a, b] = [bends[k], bends[k + 1]];
    const pieces = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 250));
    for (let p = 0; p < pieces; p++) {
      const s = p / pieces;
      const e = (p + 1) / pieces;
      out.push({
        kind: 'path',
        line: [
          offsetByMetres(site.lon, site.lat, a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s),
          offsetByMetres(site.lon, site.lat, a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e),
        ],
        rgb,
        wash: false,
      });
    }
  }
}

/** Kitchen gardens beside the first households of a village (households.ts: the same places its houses stand). */
function gardens(out: LandPatch[], site: Site, people: number, grow: boolean) {
  const homes = Math.min(MAX_GARDENS, Math.ceil(nominalPeople(site.kind, people) / 4.5));
  const theta = hash(site.seed, 21) * Math.PI;
  let n = 0;
  for (const home of householdsOf(site.seed, HOUSEHOLD_SPACING_M.village)) {
    if (n++ >= homes) break;
    const a = hash(site.seed, home.index, 22) * Math.PI * 2;
    const k = 0.9 + 0.2 * hash(site.seed, home.index, 23);
    const corners = rect(site.lon, site.lat, home.x + Math.cos(a) * 14, home.y + Math.sin(a) * 14, GARDEN_M[0], GARDEN_M[1], theta);
    out.push({ kind: 'garden', corners, rgb: shade(grow ? LOOKS.garden.grow : LOOKS.garden.rest, k), wash: false });
  }
  return homes;
}

/** Radius of a village's houses (households.ts' sunflower), metres: fields start beyond it. */
const villageCore = (homes: number) => (HOUSEHOLD_SPACING_M.village / 1.9) * Math.sqrt(homes) + 30;

/** Each site's own land, by everything it depends on (its inputs and its neighbours'), so a pan or a new view box rebuilds only the sites
 * whose neighbourhood changed. Patches are never mutated, so a cached list is shared. Cleared when it grows past CACHE_MAX. */
const cache = new Map<string, LandPatch[]>();
const CACHE_MAX = 6000;

type Near = { offset: [number, number]; index: number; d: number };

/** Everything drawn on the land round the groups and towns in view. */
export function landPatches(groups: readonly LandGroup[], towns: readonly LandTown[], ctx: LandContext): LandPatch[] {
  const sites: Site[] = [
    ...groups.map((g) => ({ lon: g.lon, lat: g.lat, seed: groupSeed(g.lon, g.lat), kind: g.kind })),
    ...towns.map((t) => ({ lon: t.lon, lat: t.lat, seed: groupSeed(t.lon, t.lat), kind: UnitKind.Glow })),
  ];
  const near = neighbours(sites, Math.max(2 * (FARM_RADIUS_M + 3000), NEIGHBOUR_PATH_M));
  if (cache.size > CACHE_MAX) cache.clear();
  const out: LandPatch[] = [];
  sites.forEach((site, i) => {
    const g = i < groups.length ? groups[i] : null;
    const town = g ? null : towns[i - groups.length];
    // Only farmers and towns claim land in the Voronoi split, and only a neighbour within twice this site's farmed reach can take any of it.
    const reach = 2 * (town ? townRadius(town.people) + FARM_RADIUS_M : FARM_RADIUS_M);
    const claimants = site.kind === UnitKind.Village || site.kind === UnitKind.Glow
      ? near[i].filter((n) => n.d < reach && (sites[n.index].kind === UnitKind.Village || sites[n.index].kind === UnitKind.Glow))
      : [];
    // Tracks to the nearest neighbour (and the second, when it is close); a pair's track is drawn by the site with the smaller seed.
    const joins = near[i].slice(0, 2).filter((n, rank) => n.d <= (rank === 0 ? NEIGHBOUR_PATH_M : NEIGHBOUR_PATH_M * 0.6) && site.seed < sites[n.index].seed);
    const crops = ctx.crops(site.lon, site.lat);
    const water = g ? g.water : town!.water;
    const key = [
      site.seed, site.kind, g ? `${Math.round(g.people)}/${g.crop.toFixed(4)}/${g.grazing.toFixed(3)}/${g.cellShare.toFixed(4)}` : `${Math.round(town!.people)}/${town!.crop.toFixed(4)}/${town!.cellShare.toFixed(4)}`,
      water ? `${Math.round(water.metres)}/${water.dir?.map((v) => v.toFixed(3)).join(',')}` : '-', ctx.season, crops.join(','),
      claimants.map((n) => sites[n.index].seed).join(','), joins.map((n) => sites[n.index].seed).join(','),
    ].join('|');
    let mine = cache.get(key);
    if (!mine) {
      mine = siteLand(site, g, town, claimants, joins, sites, { ...ctx, crops: () => crops });
      cache.set(key, mine);
    }
    for (const p of mine) out.push(p);
  });
  return out;
}

/** One site's land: what its way of life does round it, its track to water and its tracks to neighbours. */
function siteLand(
  site: Site, g: LandGroup | null, town: LandTown | null, claimants: readonly Near[], joins: readonly Near[], sites: readonly Site[], ctx: LandContext,
): LandPatch[] {
  const out: LandPatch[] = [];
  const grow = growing(ctx.season, site.lat);
  const claims = claimants.map((n) => n.offset);
  if (site.kind === UnitKind.Village && g) {
    const homes = gardens(out, site, g.people, grow);
    const area = Math.max(farmedArea(g.crop, g.lat, g.cellShare), nominalPeople(g.kind, g.people) * SUBSISTENCE_M2_PER_PERSON);
    farmland(out, site, area, villageCore(homes), FARM_RADIUS_M, claims, ctx, grow);
  } else if (site.kind === UnitKind.Glow && town) {
    // Gardens among the roofs: a sunflower out of phase with the roofs' (shelters.ts), then a ring of fields beyond the last roof.
    const radius = townRadius(town.people);
    const n = Math.round(townRoofs(town.people) * 0.6);
    const theta = hash(site.seed, 31) * Math.PI;
    for (let k = 0; k < n; k++) {
      const r = radius * Math.sqrt((k + 0.5) / n);
      const a = k * 2.399963229728653 + 1.3 + hash(site.seed, 32) * Math.PI * 2;
      const w = 14 + 12 * hash(site.seed, k, 33);
      const corners = rect(site.lon, site.lat, Math.cos(a) * r, Math.sin(a) * r, w, w * 0.7, theta);
      out.push({ kind: 'garden', corners, rgb: shade(grow ? LOOKS.garden.grow : LOOKS.garden.rest, 0.9 + 0.2 * hash(site.seed, k, 34)), wash: false });
    }
    farmland(out, site, farmedArea(town.crop, town.lat, town.cellShare), radius + 40, radius + FARM_RADIUS_M, claims, ctx, grow);
  } else if (site.kind === UnitKind.Camp && g) {
    // Grazed, paler grass round the camp (out further where more of the cell is grazed), and a corral ring a little off its centre.
    const grazed = 200 + 600 * Math.min(1, Math.max(0, g.grazing));
    disk(out, site, 'grazed', grow ? LOOKS.grazed.grow : LOOKS.grazed.rest, true, 0, grazed, 24, 0.3, 41);
    const ring = 18 + 12 * Math.min(1, nominalPeople(g.kind, g.people) / 120);
    const a = hash(site.seed, 42) * Math.PI * 2;
    const corral: Site = { ...site, ...lonLat(offsetByMetres(site.lon, site.lat, Math.cos(a) * 45, Math.sin(a) * 45)) };
    disk(out, corral, 'corral', LOOKS.corral.grow, false, ring - 5, ring, 14, 0.04, 43);
  } else if (site.kind === UnitKind.Band && g) {
    // Foragers plant nothing: a trodden clearing round the hearths.
    disk(out, site, 'clearing', LOOKS.clearing.grow, false, 0, 25 + 3 * Math.sqrt(nominalPeople(g.kind, g.people)), 10, 0.2, 51);
  }
  // A worn track towards the nearest fresh water.
  const water = g ? g.water : town!.water;
  if (water?.dir && water.metres >= WATER_PATH_MIN_M) {
    const len = Math.min(WATER_PATH_MAX_M, water.metres);
    track(out, site, [water.dir[0] * len, water.dir[1] * len], 61, grow);
  }
  for (const n of joins) track(out, site, n.offset, 70 + (sites[n.index].seed & 0xffff), grow);
  return out;
}

const lonLat = ([lon, lat]: Corner) => ({ lon, lat });

/** A window of the fresh-water distance image (water_distance.webp: 5′ cells, row 0 at 90°N, column 0 at 180°W; metres = 2,000 km ×
 * (code / 255)², measured to cell centres). */
export type WaterWindow = { col0: number; row0: number; width: number; height: number; code: Uint8Array };
export const WATER_CELL_DEG = 1 / 12;
const waterMetres = (code: number) => 2_000_000 * (code / 255) ** 2;

/** Distance to fresh water at a point, bilinear between cell centres, and the way it falls fastest (towards the water); null outside the
 * window. A gradient under 2 % (distance barely changing) gives no direction. */
export function waterHere(w: WaterWindow, lon: number, lat: number): WaterHere | null {
  const at = (fx: number, fy: number): number | null => {
    const c = Math.floor(fx);
    const r = Math.floor(fy);
    if (c < w.col0 || r < w.row0 || c + 1 >= w.col0 + w.width || r + 1 >= w.row0 + w.height) return null;
    const [tx, ty] = [fx - c, fy - r];
    const v = (cc: number, rr: number) => waterMetres(w.code[(rr - w.row0) * w.width + (cc - w.col0)]);
    return (v(c, r) * (1 - tx) + v(c + 1, r) * tx) * (1 - ty) + (v(c, r + 1) * (1 - tx) + v(c + 1, r + 1) * tx) * ty;
  };
  const fx = (lon + 180) / WATER_CELL_DEG - 0.5;
  const fy = (90 - lat) / WATER_CELL_DEG - 0.5;
  const metres = at(fx, fy);
  if (metres === null) return null;
  const step = 0.25;
  const [e, wst, n, s] = [at(fx + step, fy), at(fx - step, fy), at(fx, fy - step), at(fx, fy + step)];
  if (e === null || wst === null || n === null || s === null) return { metres, dir: null };
  const gx = (e - wst) / (2 * step * WATER_CELL_DEG * mPerDegLon(lat));
  const gy = (n - s) / (2 * step * WATER_CELL_DEG * M_PER_DEG_LAT);
  const g = Math.hypot(gx, gy);
  return { metres, dir: g < 0.02 ? null : [-gx / g, -gy / g] };
}
