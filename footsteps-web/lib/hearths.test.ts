// Generation only; the layer classes need WebGL and are not imported here.
jest.mock('@deck.gl/layers', () => ({ ScatterplotLayer: class {} }));
import { UnitKind } from '@/components/footsteps/layers/units';
import { groupSeed } from '@/components/footsteps/layers/people';
import { HOUSEHOLD_SPACING_M, householdsOf } from '@/components/footsteps/layers/households';
import { sheltersForGroups } from '@/components/footsteps/layers/shelters';
import {
  MAX_HEARTHS, MAX_STRENGTH, PUFFS_PER_HEARTH, SMOKE_ZOOM, capHearths, hearthsForView, hearthSeed, poolOf, poolRadiusOf, puffsOf, smokeOpacity,
  smokeParam, strengthOf, windAt, type Hearth,
} from './hearths';

const band = { lon: 20.5, lat: -20.2, kind: UnitKind.Band, people: 30, society: 0 };
const village = { lon: -3.7, lat: 40.4, kind: UnitKind.Village, people: 180, society: -1 };
const hearth = (over: Partial<Hearth> = {}): Hearth => ({ lon: -3.7, lat: 40.4, seed: hearthSeed(-3.7, 40.4), kind: 'village', homes: 1, ...over });

describe('flag', () => {
  it('is on unless ?smoke=0', () => {
    expect(smokeParam('')).toBe(true);
    expect(smokeParam('?year=-3000&smoke=1')).toBe(true);
    expect(smokeParam('?smoke=0')).toBe(false);
  });
});

describe('hearths of the groups in view', () => {
  it('stand at the households of a group, the same places its dwellings do, with no dwelling table', () => {
    const hearths = hearthsForView([band], [], 1900);
    const dwellings = sheltersForGroups([band], 1900, null);
    expect(hearths.map((h) => [h.lon, h.lat])).toEqual(dwellings.map((d) => d.position));
    const sizes: number[] = [];
    for (const home of householdsOf(groupSeed(band.lon, band.lat), HOUSEHOLD_SPACING_M.camp)) {
      sizes.push(home.size);
      if (sizes.length === hearths.length) break;
    }
    expect(sizes.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(band.people);
  });

  it('is a function of the place alone: the same view gives the same hearths, in the same order', () => {
    expect(hearthsForView([village, band], [], 1000)).toEqual(hearthsForView([village, band], [], 1000));
  });

  it('puts a roof-hearth on each roof of a town, thicker than a camp household, and none for a group with no people', () => {
    const town = { lon: 12.5, lat: 41.9, people: 400_000 };
    const hearths = hearthsForView([{ ...band, people: 0 }], [town], 100);
    expect(hearths.length).toBeGreaterThan(100);
    expect(hearths.every((h) => h.kind === 'town')).toBe(true);
    expect(strengthOf(hearths[0])).toBeGreaterThan(strengthOf(hearth({ kind: 'camp' })));
  });
});

describe('count caps', () => {
  it('keeps every hearth under the cap, and at most MAX_HEARTHS of a very big view', () => {
    const few = Array.from({ length: 10 }, (_, i) => hearth({ seed: hearthSeed(i, i) }));
    expect(capHearths(few)).toHaveLength(10);
    const many = Array.from({ length: MAX_HEARTHS + 700 }, (_, i) => hearth({ lon: i / 1000, seed: hearthSeed(i / 1000, 0) }));
    expect(capHearths(many)).toHaveLength(MAX_HEARTHS);
  });

  it('thins the same hearths however the view is ordered, so a pan never swaps which survive', () => {
    const many = Array.from({ length: MAX_HEARTHS + 300 }, (_, i) => hearth({ lon: i / 1000, seed: hearthSeed(i / 1000, 0) }));
    const a = capHearths(many).map((h) => h.seed).sort();
    const b = capHearths([...many].reverse()).map((h) => h.seed).sort();
    expect(a).toEqual(b);
  });

  it('draws at most MAX_HEARTHS × PUFFS_PER_HEARTH puffs and MAX_HEARTHS pools for a city', () => {
    const city = { lon: 12.5, lat: 41.9, people: 5_000_000 };
    const hearths = hearthsForView([], [city], 100);
    expect(hearths.length).toBeLessThanOrEqual(MAX_HEARTHS);
    const standing = hearths.map((h) => ({ ...h, z: 0 }));
    expect(standing.flatMap(puffsOf).length).toBe(hearths.length * PUFFS_PER_HEARTH);
    expect(standing.map(poolOf).length).toBe(hearths.length);
  });

  it('caps a town hearth\'s strength', () => {
    expect(strengthOf(hearth({ kind: 'town', homes: 1e9 }))).toBe(MAX_STRENGTH);
    expect(strengthOf(hearth({ kind: 'town', homes: 1 }))).toBe(1);
  });
});

describe('plume seeding', () => {
  const standing = { ...hearth(), z: 12 };

  it('gives each hearth PUFFS_PER_HEARTH puffs at its place and height, the same every time', () => {
    const puffs = puffsOf(standing);
    expect(puffs).toHaveLength(PUFFS_PER_HEARTH);
    expect(puffs.every((p) => p.position[0] === standing.lon && p.position[1] === standing.lat && p.position[2] === 12)).toBe(true);
    expect(puffsOf({ ...standing })).toEqual(puffs);
  });

  it('spreads the puffs round the whole cycle, so the plume is never empty', () => {
    const phases = puffsOf(standing).map((p) => p.phase).sort((a, b) => a - b);
    for (const p of phases) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
    const gaps = phases.map((p, i) => (i === 0 ? p + 1 - phases[phases.length - 1] : p - phases[i - 1]));
    // an even spacing is 1/n; the jitter and the wrap keep every gap near it
    for (const g of gaps) expect(g).toBeLessThan(2 / PUFFS_PER_HEARTH);
  });

  it('does not breathe in step with a neighbour', () => {
    const other = puffsOf({ ...hearth({ lon: -3.7001, seed: hearthSeed(-3.7001, 40.4) }), z: 12 });
    expect(other[0].phase).not.toBeCloseTo(puffsOf(standing)[0].phase, 3);
  });

  it('carries the place\'s wind, one per half-degree square', () => {
    const w = windAt(-3.7, 40.4);
    expect(puffsOf(standing).every((p) => p.wind[0] === w.angle && p.wind[1] === w.phase)).toBe(true);
    expect(windAt(-3.71, 40.41)).toEqual(w); // the same square
    expect(windAt(-3.7, 41.4)).not.toEqual(w);
    expect(w.angle).toBeGreaterThanOrEqual(0);
    expect(w.angle).toBeLessThan(Math.PI * 2);
  });
});

describe('pools of light', () => {
  it('are about the households\' spacing wide', () => {
    expect(poolRadiusOf({ kind: 'camp' }) * 2).toBeGreaterThan(HOUSEHOLD_SPACING_M.camp * 0.9);
    expect(poolRadiusOf({ kind: 'village' }) * 2).toBeGreaterThan(HOUSEHOLD_SPACING_M.village * 0.9);
    expect(poolOf({ ...hearth(), z: 3 }).position).toEqual([-3.7, 40.4, 3]);
  });
});

describe('zoom fade', () => {
  it('is 0 far out, 1 close in, and rises in between', () => {
    expect(smokeOpacity(SMOKE_ZOOM.from - 1)).toBe(0);
    expect(smokeOpacity(SMOKE_ZOOM.full)).toBe(1);
    expect(smokeOpacity(15)).toBe(1);
    const mid = smokeOpacity((SMOKE_ZOOM.from + SMOKE_ZOOM.full) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
