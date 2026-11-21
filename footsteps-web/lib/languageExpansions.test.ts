import fs from 'node:fs';
import path from 'node:path';
import {
  EXPANSIONS_FLOOR_YEAR, expansionLine, expansionsHere, langsDeepEnabled, startWords, type ExpansionData, type ExpansionRow,
} from './languageExpansions';
import { hoverCardRows } from './hoverCard';
import type { HabitatCell } from './habitat';

// The committed asset, as the browser gets it (footstep-generator/anthropology/languages_expansions.py).
const data: ExpansionData = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/languages/expansions.json'), 'utf8'));
const ids = (lon: number, lat: number, year: number) => expansionsHere(data, lon, lat, year).map((r) => r.id);

const OAXACA = [-97.5, 17.5] as const;
const CONGO = [17.5, -2.5] as const;
const ANATOLIA = [33, 39] as const;

test('only langs=deep opts in', () => {
  for (const query of ['', '?langs=1', '?langs=Deep', '?lang=deep']) expect(langsDeepEnabled(query)).toBe(false);
  expect(langsDeepEnabled('?mode=units&langs=deep')).toBe(true);
});

test('a cell and year: Spanish in Mexico from 1519, not before', () => {
  expect(ids(...OAXACA, 1700)).toEqual(['spanish-mexico']);
  expect(ids(...OAXACA, 1519)).toEqual(['spanish-mexico']);
  expect(ids(...OAXACA, 1518)).toEqual([]);
});

test('central Africa in 1000 BCE: Bantu, from the older end of its range', () => {
  expect(ids(...CONGO, -1000)).toEqual(['bantu-west-central']);
  expect(ids(...CONGO, 1950 - 5000)).toEqual(['bantu-west-central']);
  expect(ids(...CONGO, 1950 - 5001)).toEqual([]);
});

test('Anatolia in 1200 CE: Turkic from 1071; Arabic is not there', () => {
  expect(ids(...ANATOLIA, 1200)).toEqual(['turkic-anatolia']);
  expect(ids(...ANATOLIA, 1000)).toEqual([]);
});

test('the 5 ka floor: nothing before 3050 BCE, even for rows whose range is older', () => {
  expect(EXPANSIONS_FLOOR_YEAR).toBe(-3050);
  expect(data.floor_year).toBe(EXPANSIONS_FLOOR_YEAR);
  expect(Math.min(...data.rows.map((r) => r.from_year))).toBe(EXPANSIONS_FLOOR_YEAR);
  const taiwan = [121, 23.5] as const; // Austronesian origin ~5,230 BP, older than the floor
  expect(ids(...taiwan, -3050)).toEqual(['austronesian-taiwan']);
  expect(ids(...taiwan, -3051)).toEqual([]);
  // A row that claims an older start is still refused before the floor.
  const old: ExpansionRow = { ...data.rows[0], id: 'old', from_year: -20000, boxes: [[0, 0, 5, 5]] };
  const rigged = { ...data, rows: [old] };
  expect(expansionsHere(rigged, 2, 2, -10000)).toEqual([]);
  expect(expansionsHere(rigged, 2, 2, -3000).map((r) => r.id)).toEqual(['old']);
  for (const year of [-100000, -10000, -5000, -3051]) {
    for (const row of data.rows) {
      const [s, w] = row.boxes[0];
      expect(expansionsHere(data, w + 2.5, s + 2.5, year)).toEqual([]);
    }
  }
});

test('boxes are half-open on the 5° grid', () => {
  // spanish-mexico is [15, -110, 30, -85]
  expect(ids(-110, 15, 1700)).toContain('spanish-mexico');
  expect(ids(-85, 20, 1700)).not.toContain('spanish-mexico');
  expect(ids(-100, 30, 1700)).not.toContain('spanish-mexico');
});

test('overlapping rows are all listed, oldest first', () => {
  // New Zealand: Polynesian settlers (~1190-1290 CE), then English from 1840.
  expect(ids(175, -40, 1900)).toEqual(['austronesian-east-polynesia', 'english-new-zealand']);
});

test('disputed rows with no area are never in the asset', () => {
  const families = new Set(data.rows.map((r) => r.family));
  for (const f of ['Indo-European', 'Afro-Asiatic', 'Uto-Aztecan']) expect(families.has(f)).toBe(false);
});

test('start wording: CE year, CE range, years-ago range rounded to 100, single value', () => {
  expect(startWords({ start_year: 1519 })).toBe('from 1519 CE');
  expect(startWords({ range_bp: [660, 760] })).toBe('from about 1190-1290 CE');
  expect(startWords({ range_bp: [4040, 5000] })).toBe('from about 4,000-5,000 years ago');
  expect(startWords({ range_bp: [5230, 5230] })).toBe('from about 5,200 years ago');
});

test('the line names family, range, source, and disputed / not verified where they apply', () => {
  const bantu = data.rows.find((r) => r.id === 'bantu-west-central')!;
  expect(expansionLine([bantu]).text).toBe('Languages spreading here: Bantu (from about 4,000-5,000 years ago; Koile et al. 2022)');
  const aymara = data.rows.find((r) => r.id === 'aymara-early-horizon')!;
  expect(expansionLine([aymara]).text).toBe(
    'Languages spreading here: Aymaran (from about 2,200-2,900 years ago; Beresford-Jones & Heggarty 2012; disputed, not verified)',
  );
  const spanish = data.rows.find((r) => r.id === 'spanish-mexico')!;
  expect(expansionLine([spanish]).text).toContain('Spanish (from 1519 CE; Spanish conquest of the Aztec Empire, Wikipedia; not verified)');
});

describe('hover card row', () => {
  const land: HabitatCell = { surface: 'land', biome: 'Tropical forest', tempC: 25, precipMm: 1800 };
  const at = (time: number, expansions: ExpansionRow[] | null, habitat: HabitatCell = land) =>
    hoverCardRows({ time, habitat, today: null, people: null, landUse: null, expansions });

  test('shown on land with rows, labelled modelled', () => {
    const row = at(-1000, expansionsHere(data, ...CONGO, -1000)).find((r) => r.id === 'spread');
    expect(row?.text).toMatch(/^Languages spreading here: Bantu/);
    expect(row?.evidence).toBe('modelled');
  });

  test('absent without the flag (no input), with no rows, at sea, or before the floor', () => {
    const rows = expansionsHere(data, ...CONGO, -1000);
    expect(at(-1000, null).some((r) => r.id === 'spread')).toBe(false);
    expect(at(-1000, []).some((r) => r.id === 'spread')).toBe(false);
    expect(at(-1000, rows, { ...land, surface: 'sea' }).some((r) => r.id === 'spread')).toBe(false);
    expect(at(-4000, rows).some((r) => r.id === 'spread')).toBe(false);
  });
});
