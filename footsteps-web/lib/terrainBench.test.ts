// Pins the pure parts of scripts/terrain-bench.mjs (docs/ops/terrain-bench.md): the scene table, the texel maths,
// how browser samples become timings, the goal checks and --compare. The browser run itself is the script.
import {
  GOAL,
  compareResults,
  demSamplePx,
  demTileZoom,
  expectsDem,
  frameStats,
  goalChecks,
  longTaskStats,
  longTasksOverlapping,
  streamingStart,
  metersPerPixel,
  modesFor,
  netTotals,
  renderCompare,
  renderMarkdown,
  resourceKind,
  sceneUrl,
  texelOf,
  detailTileZoom,
  timeToDetail,
  variants,
  webpSize,
} from '../scripts/terrain-bench-lib.mjs';
import { metersPerPixel as appMetersPerPixel, CLOSE3D_ZOOM } from './close3d';

const era = { kind: 'era-image', width: 2048, height: 1024 };

describe('scene table', () => {
  it('runs 3D only from the zoom the app tilts at', () => {
    expect(modesFor(6)).toEqual(['flat']);
    expect(modesFor(CLOSE3D_ZOOM)).toEqual(['flat', '3d']);
    // 5 scenes x (zoom 4, 6 flat; zoom 8, 10, 12 flat + 3d)
    expect(variants()).toHaveLength(5 * (2 + 3 * 2));
    expect(new Set(variants().map((v: { id: string }) => v.id)).size).toBe(40);
  });

  it('filters by scene, zoom and mode', () => {
    const v = variants({ scenes: ['alps'], zooms: [10], modes: ['3d'] });
    expect(v.map((x: { id: string }) => x.id)).toEqual(['alps-z10-3d']);
  });

  it('builds a URL that only sets the camera, the year and, for flat, close3d=0', () => {
    const [flat, tilted] = variants({ scenes: ['nile'], zooms: [10] });
    expect(sceneUrl('http://x:1/', flat)).toBe('http://x:1/?lat=25.7&lon=32.6&zoom=10&year=1500&close3d=0');
    expect(sceneUrl('http://x:1', tilted)).toBe('http://x:1/?lat=25.7&lon=32.6&zoom=10&year=1500');
    expect(sceneUrl('http://x:1', tilted, 'terrain_tiles=0')).toBe('http://x:1/?lat=25.7&lon=32.6&zoom=10&year=1500&terrain_tiles=0');
  });
});

describe('texel size', () => {
  it("agrees with the app's metres per pixel", () => {
    expect(metersPerPixel(7, 46.5)).toBeCloseTo(appMetersPerPixel(7, 46.5), 6);
  });

  it('is 256 screen px at zoom 10 for a 2048-wide image, and taller than wide away from the equator', () => {
    const t = texelOf(era, 10, 0);
    expect(t.eastWestPx).toBeCloseTo(256, 1);
    expect(t.northSouthPx).toBeCloseTo(256, 1);
    expect(t.eastWestM).toBe(19_568);
    const high = texelOf(era, 10, 60);
    expect(high.eastWestPx).toBeCloseTo(256, 1); // as wide on screen at any latitude (Web Mercator)
    expect(high.northSouthPx).toBeCloseTo(512, 1); // 1 / cos(60°) times as tall
  });

  it("meets the goal's 2 px only when the colour source has pixels to spare", () => {
    expect(texelOf(era, 4, 46).eastWestPx).toBeCloseTo(4, 1);
    expect(texelOf({ kind: 'era-image', width: 2048 * 2 ** 9, height: 1024 * 2 ** 9 }, 12, 0).eastWestPx).toBeLessThanOrEqual(GOAL.texelPx);
  });

  it('reads the colour pyramid at the tile deck.gl picks, never finer than its 500 m photo', () => {
    const pyramid = { kind: 'tile-pyramid', maxZoom: 8 };
    // deck.gl draws 256 px tiles at zoom round(zoom + 1): zoom 6 uses z7 tiles, one texel per screen px at the equator.
    expect(texelOf(pyramid, 6, 0).eastWestPx).toBeCloseTo(1, 1);
    expect(texelOf(pyramid, 6, 0).source).toBe('tile-pyramid z7/8');
    // From zoom 8 the z8 tiles are stretched: 2 px at 8, 8 at 10, 32 at 12 (the era image: 64, 256, 1024).
    expect(texelOf(pyramid, 8, 0).eastWestPx).toBeCloseTo(2, 1);
    expect(texelOf(pyramid, 10, 0).eastWestPx).toBeCloseTo(8, 1);
    expect(texelOf(pyramid, 12, 0).eastWestPx).toBeCloseTo(32, 1);
    // At 60°N a z8 tile pixel (306 m) is finer than the photo's 464 m rows: the photo sets the height.
    expect(texelOf(pyramid, 8, 60).northSouthM).toBe(464);
    // Below zoom 4.5 the app takes one zoom coarser: zoom 4 draws z4 tiles, 2 px per texel.
    expect(texelOf(pyramid, 4, 0).source).toBe('tile-pyramid z4/8');
    expect(texelOf(pyramid, 4, 0).eastWestPx).toBeCloseTo(2, 1);
  });

  it('rejects a colour source it does not know', () => {
    expect(() => texelOf({ kind: 'mystery' }, 10, 0)).toThrow(/unknown colour source/);
  });

  it('gives elevation sample spacing from the tile zoom', () => {
    expect(demSamplePx(10, 11)).toBe(1);
    expect(demSamplePx(12, 11)).toBe(4);
    expect(demTileZoom('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/11/1/2.png')).toBe(11);
    expect(demTileZoom('https://elevation-tiles-prod.s3.amazonaws.com/terrarium/10/1/2.png')).toBe(10);
    expect(demTileZoom('https://x/y.png')).toBeNull();
  });
});

describe('reading a WebP', () => {
  const riff = (kind: string, body: Buffer) => {
    const b = Buffer.alloc(30);
    b.write('RIFF', 0, 'ascii');
    b.write('WEBP', 8, 'ascii');
    b.write(kind, 12, 'ascii');
    body.copy(b, 20);
    return b;
  };
  it('reads lossy, lossless and extended headers', () => {
    const lossy = Buffer.alloc(10);
    lossy.writeUInt16LE(2048, 6);
    lossy.writeUInt16LE(1024, 8);
    expect(webpSize(riff('VP8 ', lossy))).toEqual({ width: 2048, height: 1024 });
    const ll = Buffer.alloc(10);
    ll.writeUInt32LE(2047 | (1023 << 14), 1);
    expect(webpSize(riff('VP8L', ll))).toEqual({ width: 2048, height: 1024 });
    const x = riff('VP8X', Buffer.alloc(10));
    x.writeUIntLE(4095, 24, 3);
    x.writeUIntLE(2047, 27, 3);
    expect(webpSize(x)).toEqual({ width: 4096, height: 2048 });
  });
  it('returns null for anything else', () => {
    expect(webpSize(Buffer.from('not a webp file, just some text bytes....'))).toBeNull();
  });
});

describe('request kinds', () => {
  it('names the terrain loads', () => {
    expect(resourceKind('http://h/terrain/earth_-10000.webp?v=3')).toBe('era-image');
    expect(resourceKind('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/11/1/2.png')).toBe('dem');
    expect(resourceKind('http://h/habitat/h_1.webp')).toBe('habitat');
    expect(resourceKind('http://h/terrain/detail/7/63/41.webp?v=1')).toBe('detail-tile');
    expect(resourceKind('http://h/terrain/detail/manifest.png?v=1')).toBe('detail-tile');
    expect(detailTileZoom('http://h/terrain/detail/7/63/41.webp?v=1')).toBe(7);
    expect(detailTileZoom('http://h/terrain/detail/ref.webp')).toBeNull();
    expect(resourceKind('http://h/grid/humans_1000.webp')).toBe('other');
  });
  it('expects elevation tiles where the app streams them', () => {
    expect(expectsDem(4)).toBe(false);
    expect(expectsDem(6)).toBe(true);
  });
});

describe('time to detail', () => {
  const tracked = [
    { kind: 'era-image', responseEnd: 700 },
    { kind: 'dem', responseEnd: 1900 },
    { kind: 'dem', responseEnd: 2400 },
  ];
  it('is the second frame after the last tracked response', () => {
    const frames = [100, 700, 1500, 2399, 2410, 2430, 2450];
    expect(timeToDetail(tracked, frames)).toEqual({ eraImageEndMs: 700, lastTileEndMs: 2400, doneMs: 2430 });
  });
  it('is null until two frames have followed the last response, and for no loads at all', () => {
    expect(timeToDetail(tracked, [100, 2410])?.doneMs).toBeNull();
    expect(timeToDetail([], [1, 2, 3])).toBeNull();
  });
});

describe('frame and long-task stats', () => {
  it('computes fps and gaps inside the window only', () => {
    const frames = [0, 500, 1000, 1010, 1020, 1030, 1040, 1100, 2000]; // 1000..1100: 6 frames
    const s = frameStats(frames, 1000, 1100);
    expect(s.frames).toBe(6);
    expect(s.fps).toBe(+(5 / 0.1).toFixed(1));
    expect(s.maxFrameMs).toBe(60);
  });
  it('reports zero fps for a window without frames rather than dividing by zero', () => {
    expect(frameStats([0, 1000], 100, 200).fps).toBe(0);
  });
  it('counts long tasks by start time', () => {
    const tasks = [
      { startTime: 100, duration: 80 },
      { startTime: 900, duration: 300 },
      { startTime: 1500, duration: 60 },
    ];
    expect(longTaskStats(tasks, 0, 1000)).toEqual({ count: 2, maxMs: 300 });
    expect(longTaskStats(tasks, 2000, 3000)).toEqual({ count: 0, maxMs: 0 });
  });
  it('counts the long tasks running while tiles stream, not the app boot before them', () => {
    const res = [
      { name: 'http://x/terrain/earth_1000.webp', startTime: 50 },
      { name: 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/10/1/2.png', startTime: 400 },
      { name: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/10/1/3.png', startTime: 300 },
    ];
    expect(streamingStart(res)).toBe(300);
    expect(streamingStart(res.slice(0, 1))).toBeNull();
    const tasks = [
      { startTime: 0, duration: 250 }, // boot, ends before streaming
      { startTime: 280, duration: 60 }, // starts just before, runs into it
      { startTime: 2000, duration: 120 }, // after time to detail
    ];
    expect(longTasksOverlapping(tasks, 300, 1500)).toEqual({ count: 1, maxMs: 60 });
    expect(longTasksOverlapping(tasks, null, 1500)).toEqual({ count: 0, maxMs: 0 });
  });
});

type Run = {
  timing: { doneMs: number | null };
  pan: { fps: number };
  longTasks: { load: { count: number; maxMs: number }; pan: { count: number; maxMs: number } };
  net: Record<'load' | 'pan', { requests: number; bytes: number; terrainRequests: number; terrainBytes: number; demRequests: number }>;
  timedOut: boolean;
};
const run = (doneMs: number, fps: number, longMs: number, terrainBytes: number): Run => ({
  timing: { doneMs },
  pan: { fps },
  longTasks: { load: { count: 1, maxMs: longMs }, pan: { count: 0, maxMs: 0 } },
  net: {
    load: { requests: 10, bytes: terrainBytes * 2, terrainRequests: 5, terrainBytes, demRequests: 4 },
    pan: { requests: 2, bytes: 1000, terrainRequests: 1, terrainBytes: 1000, demRequests: 1 },
  },
  timedOut: false,
});
const result = (id: string, zoom: number, mode: string, cold: Run, warm: Run | null, texelPx = 4) => ({
  id,
  scene: 'alps',
  sceneLabel: 'Alps',
  zoom,
  mode,
  year: 1000,
  lat: 46.55,
  lon: 8,
  loadavg: 2.5,
  texel: { eastWestPx: texelPx, northSouthPx: texelPx, eastWestM: 1, northSouthM: 1, source: 'era-image 2048x1024', demSamplePx: null },
  cold,
  warm,
});
const meta = {
  date: '2026-11-21',
  commit: 'abc1234',
  dirty: false,
  base: 'http://x',
  label: null,
  viewport: { width: 1440, height: 900 },
  headless: false,
  renderer: 'GPU',
  loadavg: [1, 1],
};

describe('goal checks', () => {
  it('judges the zoom 10 tilted scenes on their worst scene and the texel on every zoom up to 12', () => {
    const results = [
      result('a-z10-3d', 10, '3d', run(2500, 60, 40, 1e6), run(1000, 62, 30, 1e3), 1.5),
      result('b-z10-3d', 10, '3d', run(3500, 55, 40, 1e6), run(1400, 58, 30, 1e3), 1.5),
      result('a-z6-flat', 6, 'flat', run(900, 60, 10, 1e5), null, 1),
    ];
    const byName = Object.fromEntries(
      goalChecks(results).map((g: { name: string; value: number | null; ok: boolean | null }) => [g.name.split(':')[1]?.trim() ?? g.name, g]),
    );
    expect(byName['full detail, cold (worst scene)'].value).toBe(3500);
    expect(byName['full detail, cold (worst scene)'].ok).toBe(false);
    expect(byName['full detail, warm (worst scene)'].ok).toBe(true);
    expect(byName['fps panning (worst scene)'].value).toBe(58);
    expect(byName['longest main-thread task while streaming'].ok).toBe(true);
    expect(goalChecks(results).slice(-1)[0]).toMatchObject({ value: 1.5, ok: true });
  });
  it('says "not measured" rather than passing when a scene was not run', () => {
    const rows = goalChecks([result('a-z6-flat', 6, 'flat', run(900, 60, 10, 1e5), null)]);
    expect(rows[0].ok).toBeNull();
  });
});

describe('report and compare', () => {
  const oldFile = { meta, results: [result('alps-z10-3d', 10, '3d', run(9000, 9, 700, 24e6), run(5900, 7, 600, 1e5), 256)] };
  const newFile = {
    meta: { ...meta, commit: 'def5678' },
    results: [result('alps-z10-3d', 10, '3d', run(3000, 55, 40, 8e6), run(1200, 60, 30, 1e5), 2), result('alps-z12-3d', 12, '3d', run(1, 1, 1, 1), null)],
  };

  it('totals load and pan', () => {
    expect(netTotals(oldFile.results[0].cold)).toMatchObject({ requests: 12, terrainRequests: 6 });
    expect(netTotals(null)).toBeNull();
  });

  it("joins on id and marks better and worse by the metric's direction", () => {
    const c = compareResults(oldFile, newFile);
    expect(c.rows).toHaveLength(1);
    expect(c.onlyNew).toEqual(['alps-z12-3d']);
    expect(c.rows[0].metrics.coldS).toMatchObject({ before: 9, after: 3, delta: -6, better: true });
    expect(c.rows[0].metrics.fps).toMatchObject({ before: 7, after: 60, better: true });
    const worse = compareResults(newFile, oldFile);
    expect(worse.rows[0].metrics.fps.better).toBe(false);
  });

  it('prints the deltas', () => {
    const text = renderCompare(oldFile, newFile);
    expect(text).toContain('abc1234');
    expect(text).toContain('def5678');
    expect(text).toMatch(/alps-z10-3d \| 9\.00 -> 3\.00 \(-6\.00\) \(better\)/);
  });

  it('renders one table row per variant, then the goal checks', () => {
    const md = renderMarkdown(oldFile);
    expect(md).toContain('| Alps 1000 CE | 10 | 3d | 2.5 | 9.00 | 5.90 | 7 |');
    expect(md).toContain('## Goal checks');
    expect(md).toContain('FAIL');
  });
});
