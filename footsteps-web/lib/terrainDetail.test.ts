import {
  detailTileFor,
  hasDetailTile,
  manifestFrom,
  mercatorY,
  photoWeight,
  recolour,
  sampleDetail,
  terrainTilesParam,
  RECOLOUR_GLSL,
} from './terrainDetail';

type Rgb = [number, number, number];
const c = (r: number, g: number, b: number): Rgb => [r / 255, g / 255, b / 255];
const close = (a: number[], b: number[], eps = 1e-6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], -Math.log10(eps)));

describe('recolour', () => {
  const forest = c(40, 60, 25);
  const ocean = c(2, 5, 20);
  const land = (rgb: Rgb, a = 1): [number, number, number, number] => [...rgb, a];
  // The callers' weight: photoWeight at the point (they average it over five taps).
  const at = (era: Rgb, ref: Rgb, detail: [number, number, number, number], sea: number) =>
    recolour(era, ref, detail, sea, photoWeight(era, ref));

  it('is the photo itself where the era image is the photo (1900: era = ref)', () => {
    close(at(forest, forest, land(c(55, 70, 30)), 0), c(55, 70, 30));
  });

  it('keeps the era change in colour and adds the photo detail', () => {
    // terrain_image.py: era = ref x ratio; here a browner era (ratio 1.5, 1.2, 1.4).
    const era = c(60, 72, 35);
    close(at(era, forest, land(c(50, 50, 30)), 0), [(50 / 255) * 1.5, (50 / 255) * 1.2, (30 / 255) * 1.4], 1e-3);
  });

  it("leaves painted pixels alone: an ice sheet over today's forest", () => {
    const ice = c(235, 238, 242);
    expect(photoWeight(ice, forest)).toBe(0);
    close(at(ice, forest, land(c(30, 50, 20)), -120), ice);
  });

  it("keeps today's ice texture under era ice (Greenland)", () => {
    const ice = c(235, 238, 242);
    close(at(ice, ice, land(c(220, 225, 230)), -120), c(220, 225, 230), 1e-3);
  });

  it("does not draw today's sea or shore on an exposed shelf", () => {
    const era = c(46, 56, 30); // era land, photo-derived (ratio in range) at a mixed coast pixel
    const ref = c(30, 35, 20);
    close(at(era, ref, [...ocean, 0], -60), era); // today's sea
    const half = at(era, ref, land(c(40, 50, 20), 0.5), -60); // the inland ramp: half way to the photo
    expect(half[0]).toBeGreaterThan(era[0] * 0.99);
    expect(half[0]).toBeLessThan((40 / 255) * (46 / 30));
  });

  it("draws today's fine coast when the sea is at today's level", () => {
    const era = c(30, 35, 30);
    close(at(era, era, [...ocean, 0], 0), ocean, 1e-3);
  });

  it("keeps the era sea over today's land at a coarse era coast", () => {
    const eraSea = c(4, 8, 30);
    close(at(eraSea, forest, land(c(45, 60, 28)), -20), eraSea);
  });

  it('has a GLSL twin with the same constants', () => {
    for (const k of ['0.18', '0.25', '2.5', '3.2', '-1.5', '2.0 / 255.0', 'detail.a']) expect(RECOLOUR_GLSL).toContain(k);
  });
});

describe('manifest', () => {
  const z8 = new Uint8Array(256 * 256);
  z8[200 * 256 + 13] = 1;
  const m = manifestFrom(z8);

  it('marks a tile and every ancestor, nothing else', () => {
    expect(hasDetailTile(m, 8, 13, 200)).toBe(true);
    expect(hasDetailTile(m, 7, 6, 100)).toBe(true);
    expect(hasDetailTile(m, 3, 0, 6)).toBe(true);
    expect(hasDetailTile(m, 3, 1, 6)).toBe(false);
    expect(hasDetailTile(m, 8, 14, 200)).toBe(false);
    expect(hasDetailTile(m, 9, 26, 400)).toBe(false); // beyond the pyramid: ask detailTileFor
    expect(hasDetailTile(m, 8, -1, 0)).toBe(false);
  });

  it('maps deeper tiles to their pyramid ancestor', () => {
    expect(detailTileFor(11, 1000, 700)).toEqual([8, 125, 87]);
    expect(detailTileFor(6, 10, 20)).toEqual([6, 10, 20]);
  });
});

describe('sampleDetail', () => {
  it('reads the pixel under a point', () => {
    const rgba = new Uint8ClampedArray(256 * 256 * 4);
    // Tile z1 (1, 0): 0..180E, 0..85N. Paint pixel (64, 200) red.
    rgba[(200 * 256 + 64) * 4] = 255;
    const tile = { z: 1, x: 1, y: 0, rgba };
    const lon = ((1 + 64.5 / 256) / 2) * 360 - 180;
    const y = (200.5 / 256) / 2;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
    expect(mercatorY(lat)).toBeCloseTo(y, 9);
    expect(sampleDetail(tile, lon, lat)[0]).toBeCloseTo(1, 5);
  });
});

describe('terrainTilesParam', () => {
  it('is on unless ?terrain_tiles=0', () => {
    expect(terrainTilesParam('')).toBe(true);
    expect(terrainTilesParam('?year=-3000&terrain_tiles=1')).toBe(true);
    expect(terrainTilesParam('?terrain_tiles=0')).toBe(false);
  });
});
