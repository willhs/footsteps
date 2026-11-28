// Where farming and herding were possible at all: the first HYDE era any crop, and any herd animal, had reached each 1° cell,
// from the food table's dated claims (footstep-generator/food/gate.py; research 0008). HYDE's land use is allocated from
// population by per-capita rules, so it has grazing land in Australia before 1788 and cropland in the Americas at 10,000 BCE;
// lib/waysOfLife.ts uses this gate so a cell is not called farmers before a crop, or herders before a herd animal, is there.
import gate from './domesticatesGate.json';

type Gate = { version: number; eras: number[]; crop: string[]; herd: string[] };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
const NEVER = 255;

function decode(rows: string[]): Uint8Array {
  const out = new Uint8Array(360 * 180).fill(NEVER);
  rows.forEach((row, r) => {
    let c = 0;
    let n = '';
    for (const ch of row) {
      if (ch >= '0' && ch <= '9') { n += ch; continue; }
      const count = Number(n);
      n = '';
      const era = ch === '.' ? NEVER : LETTERS.indexOf(ch);
      out.fill(era, r * 360 + c, r * 360 + c + count);
      c += count;
    }
  });
  return out;
}

let decoded: { crop: Uint8Array; herd: Uint8Array } | null = null;
const tables = () => (decoded ??= { crop: decode((gate as Gate).crop), herd: decode((gate as Gate).herd) });

/** Index of a year in the food table's eras (the 30 HYDE years), or -1 before them (the modelled deep past: nothing domesticated). */
export function gateEra(year: number): number {
  const eras = (gate as Gate).eras;
  if (year < eras[0]) return -1;
  let i = 0;
  while (i + 1 < eras.length && eras[i + 1] <= year) i++;
  return i;
}

function cellIndex(lon: number, lat: number): number {
  const col = Math.min(359, Math.max(0, Math.floor(lon + 180)));
  const row = Math.min(179, Math.max(0, Math.floor(90 - lat)));
  return row * 360 + col;
}

export const CROPS = 1;
export const HERDS = 2;

/** `CROPS | HERDS` bits: whether any crop / any herd animal had reached the 1° cell holding a point by an era (from
 * `gateEra`). A number, not an object, because the grid decoder asks once per populated cell. */
export function domesticatesBits(lon: number, lat: number, era: number): number {
  if (era < 0) return 0;
  const t = tables();
  const i = cellIndex(lon, lat);
  return (t.crop[i] <= era ? CROPS : 0) | (t.herd[i] <= era ? HERDS : 0);
}

/** Whether any crop / any herd animal had reached the 1° cell holding a point by an era (from `gateEra`). */
export function domesticatesAt(lon: number, lat: number, era: number): { crops: boolean; herds: boolean } {
  const bits = domesticatesBits(lon, lat, era);
  return { crops: (bits & CROPS) !== 0, herds: (bits & HERDS) !== 0 };
}

/** HYDE's land use as farming and herding: cropland where no crop had arrived, or grazing where no herd animal had, reads as
 * none (the hover card's way of life; the map's is `classifyCell`). */
export function gatedLandUse<T extends { crop: number; grazing: number }>(use: T, lon: number, lat: number, year: number): T {
  const bits = domesticatesBits(lon, lat, gateEra(year));
  if (bits === (CROPS | HERDS)) return use;
  return { ...use, crop: bits & CROPS ? use.crop : 0, grazing: bits & HERDS ? use.grazing : 0 };
}
