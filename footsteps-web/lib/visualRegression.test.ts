/** @jest-environment node */
// Pins the pure parts of scripts/visual.mjs (docs/ops/visual-regression.md): the scene table, the URLs, and the image comparison
// (identical passes, a changed colour fails and makes a diff sheet, a missing baseline is new). The browser run itself is the script.
import sharp from 'sharp';
import { MAX_DIFF_RATIO, SCENES, VIEWPORT, compareToBaseline, dataRoots, sceneUrl, toBaseline } from '../scripts/visual-lib.mjs';

/** A 320 x 200 picture: a dark ground with a lit disc, standing in for a screenshot. */
async function picture(disc: [number, number, number] = [255, 220, 160]): Promise<Buffer> {
  const { width, height } = { width: 320, height: 200 };
  const px = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inDisc = (x - 160) ** 2 + (y - 100) ** 2 < 60 ** 2;
      const [r, g, b] = inDisc ? disc : [20, 30, 40 + (x >> 3)];
      px.set([r, g, b], (y * width + x) * 3);
    }
  return sharp(px, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe('scene table', () => {
  it('has about ten scenes, each with its own id', () => {
    const ids = SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(9);
    expect(ids.length).toBeLessThanOrEqual(12);
  });

  it('puts every scene at one fixed year, view and still clock', () => {
    for (const s of SCENES) {
      const url = new URL(sceneUrl('http://x/', s));
      expect(url.searchParams.get('still')).toBe('1');
      expect(Number(url.searchParams.get('year'))).toBe(s.year);
      if (s.lat !== undefined) expect(Number(url.searchParams.get('zoom'))).toBe(s.zoom);
    }
  });

  it('covers every look of the people and the 3D landscape', () => {
    const modes = SCENES.map((s) => s.query?.mode);
    expect(modes).toEqual(expect.arrayContaining(['units', 'grid', 'dots']));
    expect(SCENES.some((s) => (s.zoom ?? 0) >= 8 && !s.query)).toBe(true);
    expect(SCENES.map((s) => s.interact)).toEqual(expect.arrayContaining(['hover', 'person']));
  });

  it('keeps the viewport the baselines were made at', () => {
    expect(VIEWPORT).toEqual({ width: 1280, height: 800 });
  });
});

describe('data roots', () => {
  it('maps the folders that are not in git as the deploy script publishes them', () => {
    const roots = dataRoots('/repo');
    expect(roots).toContainEqual({ prefix: '/grid', dir: '/repo/data/tiles/grid' });
    expect(roots).toContainEqual({ prefix: '/pmtiles', dir: '/repo/data/tiles/humans' });
    expect(roots).toContainEqual({ prefix: '/terrain', dir: '/repo/data/tiles/terrain' });
  });
});

describe('comparison', () => {
  it('passes an unchanged picture with no differing pixel', async () => {
    const baseline = await toBaseline(await picture());
    const v = await compareToBaseline(baseline, await picture());
    expect(v.status).toBe('pass');
    expect(v.diffPixels).toBe(0);
    expect((v as { sheet?: Buffer }).sheet).toBeUndefined();
  });

  it('fails a changed colour and returns an expected | actual | diff sheet', async () => {
    const baseline = await toBaseline(await picture());
    const v = await compareToBaseline(baseline, await picture([255, 80, 160]));
    expect(v.status).toBe('fail');
    expect(v.ratio).toBeGreaterThan(MAX_DIFF_RATIO);
    const sheet = await sharp((v as { sheet?: Buffer }).sheet).metadata();
    expect(sheet.width).toBe(320 * 3 + 20);
    expect(sheet.height).toBe(200);
  });

  it('lets a few stray pixels through, not a patch', async () => {
    const baseline = await toBaseline(await picture());
    const { data, info } = await sharp(await picture()).raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < 10; i++) data.set([255, 0, 0], (5 * info.width + 5 + i * 3) * info.channels);
    const few = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
    expect((await compareToBaseline(baseline, few)).status).toBe('pass');
  });

  it('fails a picture of another size', async () => {
    const baseline = await toBaseline(await picture());
    const small = await sharp(await picture()).resize(160, 100).png().toBuffer();
    expect((await compareToBaseline(baseline, small)).status).toBe('fail');
  });

  it('calls a scene with no baseline new, and hands back the bytes to commit', async () => {
    const v = await compareToBaseline(null, await picture());
    expect(v.status).toBe('new');
    expect((v.actualWebp as Buffer).subarray(8, 12).toString()).toBe('WEBP');
  });
});
