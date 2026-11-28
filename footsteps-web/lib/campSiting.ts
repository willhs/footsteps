// Close in, a camp stands somewhere for a reason. The settlement model already ranks spots inside each 5′ cell by flat ground, nearness to
// fresh water and the coast (components/footsteps/layers/siteRanking.ts), but its water layer is good to only ~4.6 km, so at zoom 15 a band
// could sit a kilometre from the river drawn beside it. This moves a camp or village that has a mapped river (lib/rivers.ts, Natural Earth
// 10m) within reach onto that river's bank, on the side it was already on, a short walk back from the water.
//
// Why the bank: hunter-gatherer residential camps sit close to drinking water, typically within a few hundred metres (Binford 2001,
// Constructing Frames of Reference, ch. 7; Kelly 2013, The Lifeways of Hunter-Gatherers, ch. 4), and on the drier ground just above it
// rather than at the water's edge. Modelled rule, imagined spot. Only rivers Natural Earth maps are known: streams too small for a
// 1:10 million map are not, so most camps keep the ranked spot.
import { RIVER_WIDTH_M, type Rivers } from './rivers';

/** A camp this far or nearer from a mapped river moves to its bank, metres. */
export const RIVER_REACH_M = 1500;
/** Metres back from the river's edge a camp stands (dry ground, out of the reeds and the flood line). Imagined. */
export const BANK_STANDOFF_M = 70;

const M_PER_DEG_LAT = 110_540;
const mPerDegLon = (lat: number) => 111_320 * Math.max(0.05, Math.cos((lat * Math.PI) / 180));
const binKey = (lon: number, lat: number) => (Math.floor(lat) + 90) * 360 + (Math.floor(lon) + 180);

/** The nearest point on any mapped river within `reach` metres: where it is, how far, the river's half width, and the unit vector (metres
 * east, north) from it towards the place. Null when no river is that near. */
export function nearestRiver(rivers: Rivers, lon: number, lat: number, reach = RIVER_REACH_M) {
  const kx = mPerDegLon(lat);
  const ids = new Set<number>();
  for (const dlat of [-1, 0, 1]) for (const dlon of [-1, 0, 1]) for (const id of rivers.bins.get(binKey(lon + dlon, lat + dlat)) ?? []) ids.add(id);
  let best: { x: number; y: number; d: number; halfWidth: number } | null = null;
  for (const id of ids) {
    const line = rivers.lines[id];
    const [padLat, padLon] = [reach / M_PER_DEG_LAT, reach / kx];
    if (lat < line.south - padLat || lat > line.north + padLat || lon < line.west - padLon || lon > line.east + padLon) continue;
    const c = line.coords;
    for (let i = 0; i + 3 < c.length; i += 2) {
      // Segment a→b in metres from the place.
      const ax = (c[i] - lon) * kx, ay = (c[i + 1] - lat) * M_PER_DEG_LAT;
      const bx = (c[i + 2] - lon) * kx, by = (c[i + 3] - lat) * M_PER_DEG_LAT;
      const [ex, ey] = [bx - ax, by - ay];
      const len2 = ex * ex + ey * ey;
      const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * ex + ay * ey) / len2)) : 0;
      const [px, py] = [ax + ex * t, ay + ey * t];
      const d = Math.hypot(px, py);
      if (d <= reach && (!best || d < best.d)) best = { x: px, y: py, d, halfWidth: RIVER_WIDTH_M[Math.min(RIVER_WIDTH_M.length - 1, Math.max(0, line.rank))] / 2 };
    }
  }
  if (!best) return null;
  // From the river towards the place; a place right on the line takes a side from its position's hash.
  const away = best.d > 1 ? [-best.x / best.d, -best.y / best.d] : [Math.cos(lon * 977 + lat * 131), Math.sin(lon * 977 + lat * 131)];
  return { lon: lon + best.x / kx, lat: lat + best.y / M_PER_DEG_LAT, metres: best.d, halfWidth: best.halfWidth, away: away as [number, number] };
}

/** A camp already this near its river's edge (and not in it) stays where it is, metres. */
const ON_THE_BANK_M = 20;

/** Where a camp or village at (lon, lat) stands close in: on the bank of a mapped river within RIVER_REACH_M, on the side it was on, its
 * middle BANK_STANDOFF_M back from the water; one already on the bank (between ON_THE_BANK_M and that from the edge) stays; otherwise
 * where it was. */
export function siteByWater(rivers: Rivers | null, lon: number, lat: number): [number, number] {
  if (!rivers) return [lon, lat];
  const river = nearestRiver(rivers, lon, lat);
  if (!river) return [lon, lat];
  const back = river.halfWidth + BANK_STANDOFF_M;
  if (river.metres >= river.halfWidth + ON_THE_BANK_M && river.metres <= back) return [lon, lat];
  return [river.lon + (river.away[0] * back) / mPerDegLon(lat), river.lat + (river.away[1] * back) / M_PER_DEG_LAT];
}
