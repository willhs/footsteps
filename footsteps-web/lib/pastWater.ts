// Dated past water (`?pastwater=1`, off by default until Will has reviewed it on prod): a modelled Mega-Chad highstand shared by every
// consumer, so the Earth picture, the groups' wet exclusion, the freshwater distance and the close-up lake plane cannot disagree.
// The scenario (epochs, level, datum, two small patch images) is baked by footstep-generator/past_water.py into public/pastwater/
// and described by its manifest; this file reads it. See docs/ops/past-water.md.
import manifestJson from '../public/pastwater/mega_chad.json';

/** The baked scenario's manifest: epochs, level and datum, patch windows and the words that label it. */
export const PAST_WATER = manifestJson;

/** `?pastwater=1` turns the model on. Read once per page load by the page and the grid worker. */
export function pastWaterParam(search: string): boolean {
  return new URLSearchParams(search).get('pastwater') === '1';
}

/** Epoch 0: the scenario says nothing about this date. That is "geography unknown", never "dry lakebed". */
export const NO_EPOCH = 0;

/** The scenario epoch a calendar year falls in (both ends inclusive), or NO_EPOCH. The same rule as `past_water.epoch_at`. */
export function pastWaterEpoch(year: number): number {
  for (const e of PAST_WATER.epochs) if (year >= e.from_year && year <= e.to_year) return e.id;
  return NO_EPOCH;
}

/** Years whose Earth picture differs under the flag (`/terrain/pastwater/earth_{year}.webp`); every other year uses the ordinary image. */
export function pastWaterTerrainYear(year: number): boolean {
  return PAST_WATER.terrain.years.includes(year);
}

/** A rectangle of a grid: column and row of its north-west pixel in the full grid, and its size. */
export type Patch = { x0: number; y0: number; width: number; height: number };
/** The lake on the 2.5' world grid (8640 × 4320, row 0 north, column 0 180 W), cropped to `Patch`: 1 where lake. */
export type LakeMask = Patch & { wet: Uint8Array };
/** Freshwater distance codes (water_distance.json's encoding) on the HYDE 5' grid, cropped to `Patch`; outside it the static image holds. */
export type WaterPatch = Patch & { code: Uint8Array };
export type PastWaterLayers = { lake: LakeMask; water: WaterPatch };

const PIXELS_ACROSS = 8640;
const PIXELS_DOWN = 4320;

/** The red channel of a small image, exactly as stored (no colour management, no premultiplication). */
async function readRed(url: string): Promise<{ width: number; height: number; red: Uint8Array }> {
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
  const { data } = ctx.getImageData(0, 0, width, height);
  const red = new Uint8Array(width * height);
  for (let i = 0; i < red.length; i++) red[i] = data[i * 4];
  return { width, height, red };
}

let layers: Promise<PastWaterLayers> | undefined;
/** The mask and the distance patch (about 9 KB together), fetched once per page and thread; a failed fetch is retried by the next caller. */
export function loadPastWater(): Promise<PastWaterLayers> {
  if (!layers) {
    const { mask, distance } = PAST_WATER;
    layers = Promise.all([readRed(`/pastwater/${mask.file}`), readRed(`/pastwater/${distance.file}`)])
      .then(([m, d]) => {
        if (m.width !== mask.width || m.height !== mask.height || d.width !== distance.width || d.height !== distance.height) {
          throw new Error('Past water patches do not match their manifest');
        }
        const wet = m.red.map((v) => (v > 127 ? 1 : 0));
        return {
          lake: { x0: mask.x0, y0: mask.y0, width: m.width, height: m.height, wet },
          water: { x0: distance.x0, y0: distance.y0, width: d.width, height: d.height, code: d.red },
        };
      })
      .catch((error) => { layers = undefined; throw error; });
  }
  return layers;
}

/** Lake share (0..1) around a point: the bilinear mix of the four 2.5' pixel centres. 0 outside the patch. */
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

/** What the close-up needs to draw the lake: the level of its plane (metres on the DEM's own datum, not the year's ocean) and where it is. */
export type LakePlane = { level: number; key: string; wetAt: (lon: number, lat: number) => boolean };

/** The lake plane for a year, or null when the scenario is inactive then or the flag is off. `key` changes with the scenario's digest, so
 * meshes built for another geometry or level are rebuilt. */
export function lakePlaneFor(layers: PastWaterLayers | null, year: number): LakePlane | null {
  if (!layers || pastWaterEpoch(year) === NO_EPOCH) return null;
  const { lake } = layers;
  return { level: PAST_WATER.level_m, key: `${PAST_WATER.digest}@${PAST_WATER.level_m}`, wetAt: (lon, lat) => lakeShareAt(lake, lon, lat) >= 0.5 };
}

export type PeopleMode = 'units' | 'grid' | 'dots';
export type Unresolved = { groups: number; people: number };

/** The note shown with the flag on: what the scenario says at this date, in the mode being drawn, and what it could not place. */
export function pastWaterNote(year: number, mode: PeopleMode, unresolved: Unresolved | undefined): { label: string; title: string } {
  const epoch = pastWaterEpoch(year);
  const e = PAST_WATER.epochs[0];
  const when = `${(e.from_bp / 1000).toFixed(1)}–${(e.to_bp / 1000).toFixed(0)} ka BP`;
  const basis = `Modelled, experimental (?pastwater=1): Lake Mega-Chad at ${PAST_WATER.level_m} m (${PAST_WATER.datum}), highstand ${when} (calendar years BP from 1950), `
    + `the basin-connected ${PAST_WATER.level_m} m contour of a modern DEM; its water is assumed fresh. ${PAST_WATER.uncertainty[1]}`;
  if (mode === 'dots') {
    return { label: 'Past water: not applied to Dots', title: `Dots is a static archive: its positions do not follow the experimental Mega-Chad model. ${basis}` };
  }
  if (epoch === NO_EPOCH) {
    return {
      label: 'Mega-Chad: scenario inactive here (geography unknown, not dry)',
      title: `The scenario holds from ${e.from_year} to ${e.to_year} (app years); this date is outside it, so it says nothing about Lake Chad's basin: not wet, not dry lakebed. People and ground are drawn as without the flag. ${basis}`,
    };
  }
  const placed = mode === 'grid'
    ? 'Grid shows people per cell and places nobody, so cells inside the lake keep their people on the map.'
    : !unresolved
      ? 'Groups are not being kept out of the lake yet: still loading, or the settlement model or ranked sites are off, so they sit where they would without the flag.'
    : unresolved.groups > 0
      ? `${unresolved.groups.toLocaleString()} group${unresolved.groups === 1 ? '' : 's'} (${Math.round(unresolved.people).toLocaleString()} people) sit in cells that are all lake: not drawn, still counted in the totals.`
      : 'Every group is placed on dry ground; none is in the lake.';
  return {
    label: `Mega-Chad lake (experimental): modelled, ${when}${mode === 'grid' || !unresolved ? '' : unresolved.groups ? `. ${unresolved.groups.toLocaleString()} groups unplaced (all lake)` : '. groups kept off the water'}`,
    title: `${placed} ${basis}`,
  };
}
