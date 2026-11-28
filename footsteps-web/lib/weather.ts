// Imagined weather in the close-up ground shader (`?weather=1`, docs/ops/close-up-scene.md "Weather"): cloud shadows drifting over
// the ground and gusts running through grass, reeds and crops. The shader (layers/groundDetail.ts) takes three numbers from here:
//
//   Weather = { cover, wind }
//   - cover: 0..1, the share of ground a cloud shadow covers, from the place's modelled rainfall (Beyer BIO12, the hover card's number).
//   - wind:  unit vector (east, north) the wind blows toward, from the place's latitude (the planetary wind belts).
//
// The rainfall is data; everything drawn from it (cloud shapes, how they move, gusts) is imagined, and the note says so.

/** `?weather=1` turns the weather on; off until Will has looked at it on prod. */
export function weatherParam(search: string): boolean {
  return new URLSearchParams(search).get('weather') !== '0';
}

export type Weather = {
  /** Share of the ground under a cloud shadow, 0..1. */
  cover: number;
  /** Unit vector (east, north) the wind blows toward. */
  wind: [number, number];
};

/** Cloud cover of a place with `precipMm` of rain a year: 0.05 with none, 0.65 at 1,000 mm (Britain), 0.8 at 2,000 mm.
 * Rain only saturates, so it is an exponential approach, not a line. A cell with no climate value gets 0.3, a mild guess. */
export function cloudCover(precipMm: number | null): number {
  if (precipMm === null || !Number.isFinite(precipMm)) return 0.3;
  return 0.05 + 0.8 * (1 - Math.exp(-Math.max(0, precipMm) / 700));
}

/** Where the wind blows toward at a latitude, by the planetary belts: trades (to 30°) and polar easterlies (beyond 75°) blow toward the west and the
 * equator, the mid-latitude westerlies (peaking at 60°) toward the east and the pole. A smooth stand-in for the belts, not a wind record. */
export function windToward(lat: number): [number, number] {
  const a = Math.abs(lat);
  const zonal = a <= 60 ? -Math.cos((3 * a * Math.PI) / 180) : Math.cos(((a - 60) * Math.PI) / 30); // east-west: -1 at 0°, 0 at 30°, +1 at 60°, 0 at 75°, -1 at 90°
  const merid = 0.35 * Math.sign(lat) * zonal; // toward the pole with the westerlies, toward the equator with the easterlies
  const len = Math.hypot(zonal, merid);
  // At the belt boundaries (30°, 75°) there is no zonal wind and so no direction: a light wind from the west.
  return len < 1e-6 ? [1, 0] : [zonal / len, merid / len];
}

/** The weather at a place: its rainfall (null when unknown) and latitude. */
export function weatherFor(precipMm: number | null, lat: number): Weather {
  return { cover: cloudCover(precipMm), wind: windToward(lat) };
}

/** How fast the clouds' pattern drifts, in ground metres per second. Real clouds do ~8 m/s, a few pixels a minute at close-up zoom, so
 * the drift is sped up (a time-lapse) to be seen: at zoom 14 this is about 12 pixels a second. */
export const CLOUD_MPS = 60;
/** How fast gusts travel through the grass: faster than the clouds, same direction. */
export const GUST_MPS = 90;
/** Cover shown to the shader moves toward the place's cover at this rate (per second), so panning over a cell edge fades clouds in and out. */
export const COVER_EASE_PER_S = 0.25;

/** What the shader draws this frame, the place's `Weather` run through time:
 * - cover eased toward the place's cover (above);
 * - `cloud` and `gust`: how far (metres east, north) the two patterns have travelled, added up frame by frame in float64, so a wind that bends
 *   as you pan north or south bends the drift from there on instead of shoving the whole pattern, and a long session never loses precision. */
export type WeatherClock = { cover: number; cloud: [number, number]; gust: [number, number]; at: number | null };

export const newWeatherClock = (): WeatherClock => ({ cover: 0, cloud: [0, 0], gust: [0, 0], at: null });

/** Move the clock to `nowSec` toward `target`. A still page (`?still=1`) takes the target cover at once and never moves, so its pixels repeat. */
export function advanceWeather(clock: WeatherClock, target: Weather, nowSec: number, still: boolean): WeatherClock {
  if (clock.at === null || still) clock.cover = target.cover;
  else {
    const dt = Math.max(0, nowSec - clock.at);
    const step = COVER_EASE_PER_S * dt;
    clock.cover += Math.max(-step, Math.min(step, target.cover - clock.cover));
    clock.cloud = [clock.cloud[0] + target.wind[0] * CLOUD_MPS * dt, clock.cloud[1] + target.wind[1] * CLOUD_MPS * dt];
    clock.gust = [clock.gust[0] + target.wind[0] * GUST_MPS * dt, clock.gust[1] + target.wind[1] * GUST_MPS * dt];
  }
  clock.at = nowSec;
  return clock;
}
