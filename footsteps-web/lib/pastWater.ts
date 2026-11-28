// Dated past water (`?pastwater=1`, off by default until Will has reviewed it on prod): scenarios shared by every consumer, so the Earth
// picture, the groups' wet exclusion, the freshwater distance and the close-up water cannot disagree. Four scenarios, each a manifest
// in public/pastwater/ baked by footstep-generator (past_water.py, past_water_lgm.py, past_water_mesopotamia.py, past_water_texcoco.py):
//   Mega-Chad          modelled highstand lake, 11.5–5 ka BP
//   European LGM       published lake and river vectors (CRC806), one snapshot 26.5–19 ka BP
//   Mesopotamian coast three stages traced from Giosan & Goodman 2025 Fig 6, interpreted
//   Basin of Mexico    modelled lakes (Texcoco and the four others) 4 ka BP–1600 CE, before the colonial drainage
// The EPOCH is the unit: an id unique across scenarios, a mask patch, an optional freshwater-distance patch and a water level rule. A year
// has a set of active epochs; epochs that hold at the same time never reach the same cell (tested), so a cell sees at most one.
// See docs/ops/past-water.md.
import megaChadJson from '../public/pastwater/mega_chad.json';
import lgmEuropeJson from '../public/pastwater/lgm_europe.json';
import mesopotamiaJson from '../public/pastwater/mesopotamia.json';
import texcocoJson from '../public/pastwater/texcoco.json';

/** A rectangle of a grid: column and row of its north-west pixel in the full grid, and its size. */
export type Patch = { x0: number; y0: number; width: number; height: number };
type PatchFile = Patch & { file: string; bytes: number };
/** Where an epoch's water stands: a fixed plane (clipped to the DEM below it), a level per mask pixel, or the year's sea. */
export type WaterLevel = { kind: 'plane'; m: number; clip_to_dem: boolean } | { kind: 'pixel' } | { kind: 'sea' };
export type EpochMeta = {
  id: number; name: string; from_bp: number; to_bp: number; from_year: number; to_year: number;
  water: string; paint: string; level: WaterLevel; mask: PatchFile; distance: PatchFile | null;
};
export type ScenarioMeta = {
  id: string; label: string; short: string; summary: string; evidence: string; datum: string;
  epochs: EpochMeta[]; uncertainty: string[]; digest: string; terrain: { years: number[] };
};

/** Every scenario's manifest, in the order the notes list them. */
export const PAST_WATER_SCENARIOS: readonly ScenarioMeta[] = [megaChadJson, lgmEuropeJson, mesopotamiaJson, texcocoJson] as unknown as ScenarioMeta[];
const EPOCHS: readonly { scenario: ScenarioMeta; epoch: EpochMeta }[] = PAST_WATER_SCENARIOS.flatMap((scenario) => scenario.epochs.map((epoch) => ({ scenario, epoch })));

/** `?pastwater=1` turns the scenarios on. Read once per page load by the page and the grid worker. */
export function pastWaterParam(search: string): boolean {
  return new URLSearchParams(search).get('pastwater') === '1';
}

/** No epoch: the scenarios say nothing about this cell at this date. That is "geography unknown", never "dry". */
export const NO_EPOCH = 0;
/** The epochs holding at a year (ids); empty when no scenario says anything then. */
export type Epochs = readonly number[];
export const NO_EPOCHS: Epochs = [];

/** The ids of every epoch holding at a calendar year (both ends inclusive). The same rule as `past_water.active_epochs`. */
export function pastWaterEpochs(year: number): number[] {
  return EPOCHS.filter(({ epoch: e }) => year >= e.from_year && year <= e.to_year).map(({ epoch }) => epoch.id);
}

/** Years whose Earth picture differs under the flag (`/terrain/pastwater/earth_{year}.webp`); every other year uses the ordinary image. */
const TERRAIN_YEARS = new Set(PAST_WATER_SCENARIOS.flatMap((s) => s.terrain.years));
export function pastWaterTerrainYear(year: number): boolean {
  return TERRAIN_YEARS.has(year);
}

/** An epoch's water on the 2.5′ world grid (8640 × 4320, row 0 north, column 0 180 W), cropped to `Patch`: `wet` 1 where water;
 * `level` metres per pixel when the epoch's level is per pixel. */
export type LakeMask = Patch & { wet: Uint8Array; level?: Int32Array };
/** Freshwater distance codes (water_distance.json's encoding) on the HYDE 5′ grid, cropped to `Patch`; outside it the static image holds. */
export type WaterPatch = Patch & { code: Uint8Array };
export type EpochLayers = { id: number; lake: LakeMask; water: WaterPatch | null; level: WaterLevel };
export type PastWaterLayers = { epochs: EpochLayers[] };

const PIXELS_ACROSS = 8640;
const PIXELS_DOWN = 4320;
const LEVEL_OFFSET = 32768; // a 'pixel' level mask: metres = green * 256 + blue - LEVEL_OFFSET

/** The pixels of a small image, exactly as stored (no colour management, no premultiplication): RGBA. */
async function readImage(url: string): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Past water ${url}: HTTP ${response.status}`);
  const bmp = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const { width, height } = bmp;
  const ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bmp.close();
    throw new Error('Past water needs a 2D canvas');
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

/** One epoch's layers from its decoded images (RGBA), checked against the manifest. Shared by the browser loader and the Node measure. */
export function epochLayersFrom(epoch: EpochMeta, mask: { width: number; height: number; data: ArrayLike<number> }, distance: { width: number; height: number; data: ArrayLike<number> } | null): EpochLayers {
  const m = epoch.mask;
  const d = epoch.distance;
  if (mask.width !== m.width || mask.height !== m.height || (d && (!distance || distance.width !== d.width || distance.height !== d.height))) {
    throw new Error(`Past water epoch ${epoch.id}: patches do not match their manifest`);
  }
  const n = m.width * m.height;
  const wet = new Uint8Array(n);
  for (let i = 0; i < n; i++) wet[i] = mask.data[i * 4] > 127 ? 1 : 0;
  let level: Int32Array | undefined;
  if (epoch.level.kind === 'pixel') {
    level = new Int32Array(n);
    for (let i = 0; i < n; i++) level[i] = mask.data[i * 4 + 1] * 256 + mask.data[i * 4 + 2] - LEVEL_OFFSET;
  }
  let water: WaterPatch | null = null;
  if (d && distance) {
    const code = new Uint8Array(d.width * d.height);
    for (let i = 0; i < code.length; i++) code[i] = distance.data[i * 4];
    water = { x0: d.x0, y0: d.y0, width: d.width, height: d.height, code };
  }
  return { id: epoch.id, lake: { x0: m.x0, y0: m.y0, width: m.width, height: m.height, wet, level }, water, level: epoch.level };
}

let layers: Promise<PastWaterLayers> | undefined;
/** Every epoch's patches (about 105 KB together, most of it the LGM distance patch), fetched once per page and thread; a failed fetch is
 * retried by the next caller. */
export function loadPastWater(): Promise<PastWaterLayers> {
  if (!layers) {
    layers = Promise.all(EPOCHS.map(async ({ epoch }) => {
      const [mask, distance] = await Promise.all([
        readImage(`/pastwater/${epoch.mask.file}`),
        epoch.distance ? readImage(`/pastwater/${epoch.distance.file}`) : null,
      ]);
      return epochLayersFrom(epoch, mask, distance);
    }))
      .then((epochs) => ({ epochs }))
      .catch((error) => { layers = undefined; throw error; });
  }
  return layers;
}

/** Water share (0..1) around a point: the bilinear mix of the four 2.5′ pixel centres. 0 outside the patch. */
export function lakeShareAt(lake: LakeMask, lon: number, lat: number): number {
  const px = ((lon + 180) / 360) * PIXELS_ACROSS - 0.5;
  const py = ((90 - lat) / 180) * PIXELS_DOWN - 0.5;
  const fx0 = Math.floor(px);
  const fy0 = Math.floor(py);
  const fx = px - fx0;
  const fy = py - fy0;
  const at = (x: number, y: number) => {
    const c = x - lake.x0;
    const r = y - lake.y0;
    return c >= 0 && r >= 0 && c < lake.width && r < lake.height ? lake.wet[r * lake.width + c] : 0;
  };
  return at(fx0, fy0) * (1 - fx) * (1 - fy) + at(fx0 + 1, fy0) * fx * (1 - fy) + at(fx0, fy0 + 1) * (1 - fx) * fy + at(fx0 + 1, fy0 + 1) * fx * fy;
}

/** The level (metres) of the wet pixel nearest a point among the four around it: a lake's own level, never a blend of two lakes'. */
function pixelLevelAt(lake: LakeMask, lon: number, lat: number): number | null {
  if (!lake.level) return null;
  const px = ((lon + 180) / 360) * PIXELS_ACROSS - 0.5;
  const py = ((90 - lat) / 180) * PIXELS_DOWN - 0.5;
  let best = Infinity;
  let level: number | null = null;
  for (let dy = 0; dy <= 1; dy++)
    for (let dx = 0; dx <= 1; dx++) {
      const x = Math.floor(px) + dx;
      const y = Math.floor(py) + dy;
      const c = x - lake.x0;
      const r = y - lake.y0;
      if (c < 0 || r < 0 || c >= lake.width || r >= lake.height || !lake.wet[r * lake.width + c]) continue;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < best) { best = d; level = lake.level[r * lake.width + c]; }
    }
  return level;
}

/** What the close-up needs to draw past water: for a vertex (lon, lat) whose DEM height is `h`, the level its water stands at, or null when
 * it is not past water. `key` changes with the active epochs (and the sea, when an epoch's water is the sea), so meshes are rebuilt. */
export type LakePlane = { key: string; levelAt: (lon: number, lat: number, h: number) => number | null };

/** The water of every epoch holding at a year, or null when none does or the flag is off. `seaLevel` is the year's (metres, for marine epochs). */
export function lakePlaneFor(layers: PastWaterLayers | null, year: number, seaLevel: number): LakePlane | null {
  if (!layers) return null;
  const ids = pastWaterEpochs(year);
  const active = layers.epochs.filter((e) => ids.includes(e.id));
  if (!active.length) return null;
  const digest = (id: number) => EPOCHS.find(({ epoch }) => epoch.id === id)!.scenario.digest;
  const sea = active.some((e) => e.level.kind === 'sea');
  return {
    key: active.map((e) => `${digest(e.id)}#${e.id}`).join('+') + (sea ? `@sea${seaLevel.toFixed(1)}` : ''),
    levelAt(lon, lat, h) {
      for (const e of active) {
        if (lakeShareAt(e.lake, lon, lat) < 0.5) continue;
        const level = e.level;
        if (level.kind === 'plane') return !level.clip_to_dem || h < level.m ? level.m : null;
        if (level.kind === 'sea') return seaLevel;
        return pixelLevelAt(e.lake, lon, lat);
      }
      return null;
    },
  };
}

export type PeopleMode = 'units' | 'grid' | 'dots';
export type Unresolved = { groups: number; people: number };

const ka = (bp: number) => `${+(bp / 1000).toFixed(1)}`;
/** When an epoch holds, in words: the scenario's single window, or the stage's own name. */
function when(scenario: ScenarioMeta, e: EpochMeta): string {
  return scenario.epochs.length === 1 ? `${ka(e.from_bp)}–${ka(e.to_bp)} ka BP` : e.name;
}
/** Every scenario's windows, for "outside" notes. */
const windows = PAST_WATER_SCENARIOS.map((s) => `${s.short} ${s.epochs.map((e) => when(s, e)).join(', ')} (app years ${s.epochs.map((e) => `${e.from_year} to ${e.to_year}`).join(', ')})`).join('; ');

/** The note shown with the flag on: what the scenarios say at this date, in the mode being drawn, and what they could not place. */
export function pastWaterNote(year: number, mode: PeopleMode, unresolved: Unresolved | undefined): { label: string; title: string } {
  const ids = pastWaterEpochs(year);
  const active = EPOCHS.filter(({ epoch }) => ids.includes(epoch.id));
  const describe = active.map(({ scenario, epoch }) => `${scenario.summary} Now: ${when(scenario, epoch)}; ${epoch.water}. ${scenario.uncertainty[1]}`).join(' ');
  const basis = `Experimental (?pastwater=1). Scenarios: ${windows}. Outside its window a scenario says nothing: geography unknown, not dry.`;
  if (mode === 'dots') {
    return { label: 'Past water: not applied to Dots', title: `Dots is a static archive: its positions do not follow the experimental past-water scenarios. ${basis}` };
  }
  if (!active.length) {
    return {
      label: 'Past water: no scenario at this date (geography unknown, not dry)',
      title: `No scenario holds at this date, so they say nothing about it: not wet, not dry lakebed. People and ground are drawn as without the flag. ${basis}`,
    };
  }
  const placed = mode === 'grid'
    ? 'Grid shows people per cell and places nobody, so cells inside modelled water keep their people on the map.'
    : !unresolved
      ? 'Groups are not being kept out of the modelled water yet: still loading, or the settlement model or ranked sites are off, so they sit where they would without the flag.'
    : unresolved.groups > 0
      ? `${unresolved.groups.toLocaleString()} group${unresolved.groups === 1 ? '' : 's'} (${Math.round(unresolved.people).toLocaleString()} people) sit in cells that are all water: not drawn, still counted in the totals.`
      : 'Every group is placed on dry ground; none is in modelled water.';
  const names = active.map(({ scenario, epoch }) => `${scenario.short}, ${when(scenario, epoch)}`).join(' + ');
  const tail = mode === 'grid' || !unresolved ? '' : unresolved.groups ? `. ${unresolved.groups.toLocaleString()} groups unplaced (all water)` : '. groups kept off the water';
  return { label: `Past water (experimental): ${names}${tail}`, title: `${placed} ${describe} ${basis}` };
}
