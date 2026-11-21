// Pure parts of the terrain benchmark (scripts/terrain-bench.mjs): the scene table, the texel maths,
// how raw browser samples become numbers, the markdown table, the goal checks and --compare.
// No browser and no I/O here, so lib/terrainBench.test.ts can pin them. See docs/ops/terrain-bench.md.
//
// The data shape (one file per run, `terrain-bench.json`):
//   { meta, results: Result[] }
//   Result = { id, scene, zoom, mode: 'flat' | '3d', year, lat, lon, texel: Texel, cold: Run, warm: Run | null }
//   Run    = timing (ms from navigation start), fps over the pan, long tasks (load / pan), network (load / pan)
// A Result id is `<scene>-z<zoom>-<mode>`; --compare joins two files on it.

/** Camera positions chosen for relief and edges: mountains, a desert valley, a flooded shelf, rainforest, steppe. */
export const SCENES = [
  { name: 'alps', label: 'Alps', year: 1000, lat: 46.55, lon: 8.0 },
  { name: 'nile', label: 'Nile', year: 1500, lat: 25.7, lon: 32.6 },
  { name: 'doggerland', label: 'Doggerland', year: -10000, lat: 54.8, lon: 2.0 },
  { name: 'amazon', label: 'Amazon', year: 1000, lat: -3.1, lon: -60.0 },
  { name: 'steppe', label: 'Mongolian steppe', year: 0, lat: 47.2, lon: 102.8 },
];
export const ZOOMS = [4, 6, 8, 10, 12];
/** The app tilts into the 3D landscape from here (CLOSE3D_ZOOM in lib/close3d.ts). */
export const CLOSE3D_ZOOM = 8;
/** The era images the app draws are 2048 x 1024 until a pyramid replaces them; the run reads the real size. */
export const ERA_IMAGE_FALLBACK = { width: 2048, height: 1024 };

/** The acceptance numbers of goal "Footsteps: detailed terrain, sharp and fast at every zoom". */
export const GOAL = { coldMs: 3000, warmMs: 1500, fps: 50, longTaskMs: 50, texelPx: 2, texelMaxZoom: 12, speedZoom: 10 };

/** Flat everywhere; the tilted 3D landscape only where the app switches it on. */
export function modesFor(zoom) {
  return zoom >= CLOSE3D_ZOOM ? ['flat', '3d'] : ['flat'];
}

export const variantId = (scene, zoom, mode) => `${scene}-z${zoom}-${mode}`;

/** Every (scene, zoom, mode) to run, in a stable order. `filter` = { scenes, zooms, modes } (arrays or undefined). */
export function variants(filter = {}) {
  const out = [];
  for (const scene of SCENES) {
    if (filter.scenes && !filter.scenes.includes(scene.name)) continue;
    for (const zoom of ZOOMS) {
      if (filter.zooms && !filter.zooms.includes(zoom)) continue;
      for (const mode of modesFor(zoom)) {
        if (filter.modes && !filter.modes.includes(mode)) continue;
        out.push({ id: variantId(scene.name, zoom, mode), scene, zoom, mode });
      }
    }
  }
  return out;
}

/** The URL that puts the camera there. Flat = `close3d=0`; 3D is the app's default from zoom 8. `extra` (from --query,
 * e.g. `terrain_tiles=0`) is appended so two runs of one build can compare a flag; nothing else is touched. */
export function sceneUrl(base, { scene, zoom, mode }, extra = '') {
  const q = new URLSearchParams({ lat: String(scene.lat), lon: String(scene.lon), zoom: String(zoom), year: String(scene.year) });
  if (mode === 'flat') q.set('close3d', '0');
  for (const [k, v] of new URLSearchParams(extra)) q.set(k, v);
  return `${base.replace(/\/$/, '')}/?${q}`;
}

/** Width and height of a WebP file (VP8 lossy, VP8L lossless or VP8X extended), or null if it is not one. */
export function webpSize(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  return null;
}

/** Metres per screen pixel at a zoom and latitude (deck.gl's 512 px world; same as lib/close3d.ts metersPerPixel). */
export function metersPerPixel(zoom, lat) {
  return (40_075_016 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** The colour pyramid's source: Blue Marble 500 m, 1/240 degree per pixel (footstep-generator/terrain_tiles.py). */
export const PYRAMID_SOURCE_DEG = 1 / 240;

/**
 * Size of one texel of the terrain colour source, in screen pixels at the screen centre, nadir (tilt makes the foreground coarser).
 * `source` describes the colour: one equirectangular era image `{ kind: 'era-image', width, height }`, or the colour
 * pyramid `{ kind: 'tile-pyramid', maxZoom }` (256 px Web Mercator tiles). deck.gl's TileLayer picks tile zoom
 * round(zoom + 1) for 256 px tiles in its 512 px world (one less below zoom 4.5, as the app asks), capped at the pyramid's top; a texel is the larger of that tile's
 * pixel and the source photo's own pixel (1/240 degree), so the number never claims more than the photo has.
 */
export function texelOf(source, zoom, lat) {
  if (source.kind !== 'era-image' && source.kind !== 'tile-pyramid') throw new Error(`unknown colour source ${source.kind}`);
  const mpp = metersPerPixel(zoom, lat);
  const cos = Math.cos((lat * Math.PI) / 180);
  let eastWestM;
  let northSouthM;
  let label;
  if (source.kind === 'era-image') {
    eastWestM = (40_075_016 * cos) / source.width;
    northSouthM = 20_037_508 / source.height; // half the Web Mercator world over the rows: a row is the same ground height at any latitude
    label = `${source.kind} ${source.width}x${source.height}`;
  } else {
    // Below zoom 4.5 the app draws one zoom coarser (detailZoomOffset in lib/terrainDetail.ts): 2 px per texel from a quarter of the tiles.
    const tileZoom = Math.min(source.maxZoom, Math.max(0, Math.round(zoom + 1) + (zoom < 4.5 ? -1 : 0)));
    const tileM = (40_075_016 * cos) / (256 * 2 ** tileZoom);
    const photoM = (PYRAMID_SOURCE_DEG * 40_075_016) / 360;
    eastWestM = Math.max(tileM, photoM * cos);
    northSouthM = Math.max(tileM, photoM);
    label = `${source.kind} z${tileZoom}/${source.maxZoom}`;
  }
  return {
    source: label,
    eastWestM: Math.round(eastWestM),
    northSouthM: Math.round(northSouthM),
    // Web Mercator keeps shapes, so a screen pixel is mpp metres both ways; a texel is a fixed ground height but a narrowing ground width,
    // so away from the equator it is the same number of px wide and 1/cos(lat) times as many tall.
    eastWestPx: +(eastWestM / mpp).toFixed(2),
    northSouthPx: +(northSouthM / mpp).toFixed(2),
  };
}

/** Screen pixels between two samples of an elevation tile at `tileZoom` (256 samples per tile) seen at `zoom`. */
export function demSamplePx(zoom, tileZoom) {
  return +(2 * 2 ** (zoom - tileZoom)).toFixed(2);
}

/** Terrarium tile zoom from an elevation tile URL, or null. */
export function demTileZoom(url) {
  // Either of the bucket's two hostnames (lib/close3d.ts DEM_TILE_URLS).
  const m = /elevation-tiles-prod(?:\.s3\.amazonaws\.com)?\/terrarium\/(\d+)\//.exec(url);
  return m ? Number(m[1]) : null;
}

/** What a request is, for the tracked-resource rule and the byte breakdown. */
export function resourceKind(url) {
  if (/\/terrain\/earth_-?\d+\.webp/.test(url)) return 'era-image';
  if (/\/terrain\/detail\//.test(url)) return 'detail-tile';
  if (/elevation-tiles-prod/.test(url)) return 'dem';
  if (/\/habitat\//.test(url)) return 'habitat';
  return 'other';
}
/** Colour-pyramid tile zoom from a detail tile URL (`/terrain/detail/{z}/{x}/{y}.webp`), or null (manifest, ref). */
export function detailTileZoom(url) {
  const m = /\/terrain\/detail\/(\d+)\/\d+\/\d+\.webp/.exec(url);
  return m ? Number(m[1]) : null;
}

/** The loads that make the terrain "all there": the era image(s), the colour pyramid, the elevation tiles and the habitat lookup. */
export const isTracked = (url) => resourceKind(url) !== 'other';

/**
 * When the terrain is loaded and drawn, in ms from navigation start.
 * `tracked` = resource timing entries { kind, responseEnd }; `frames` = requestAnimationFrame timestamps.
 * lastTileEndMs is the last tracked response; doneMs is the second animation frame after it (the first frame builds
 * the meshes and uploads textures, the second shows them). Null while no tracked load was seen.
 */
export function timeToDetail(tracked, frames) {
  if (!tracked.length) return null;
  const lastTileEndMs = Math.max(...tracked.map((t) => t.responseEnd));
  const eraEnds = tracked.filter((t) => t.kind === 'era-image').map((t) => t.responseEnd);
  const after = frames.filter((t) => t >= lastTileEndMs);
  return {
    eraImageEndMs: eraEnds.length ? Math.round(Math.max(...eraEnds)) : null,
    lastTileEndMs: Math.round(lastTileEndMs),
    doneMs: after.length >= 2 ? Math.round(after[1]) : null,
  };
}

/** fps and frame-gap stats from requestAnimationFrame timestamps inside [from, to]. */
export function frameStats(frames, from, to) {
  const f = frames.filter((t) => t >= from && t <= to);
  if (f.length < 3) return { fps: 0, frames: f.length, p95FrameMs: null, maxFrameMs: null };
  const gaps = f
    .slice(1)
    .map((t, i) => t - f[i])
    .sort((a, b) => a - b);
  const seconds = (f[f.length - 1] - f[0]) / 1000;
  return {
    fps: +((f.length - 1) / seconds).toFixed(1),
    frames: f.length,
    p95FrameMs: +gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.95))].toFixed(1),
    maxFrameMs: +gaps[gaps.length - 1].toFixed(1),
  };
}

/** Count and longest of the main-thread long tasks (> 50 ms) that started in [from, to). */
export function longTaskStats(tasks, from, to) {
  const inside = tasks.filter((t) => t.startTime >= from && t.startTime < to);
  return { count: inside.length, maxMs: Math.round(Math.max(0, ...inside.map((t) => t.duration))) };
}

/** When the tiles start streaming: the first elevation or colour-pyramid tile request, ms from navigation (null: none). */
export function streamingStart(resources) {
  const starts = resources.filter((e) => ['dem', 'detail-tile'].includes(resourceKind(e.name))).map((e) => e.startTime);
  return starts.length ? Math.min(...starts) : null;
}

/** Long tasks that overlap [from, to): the ones running while tiles stream, even if they started a little before. App boot
 * (React hydration, before any tile is asked for) is left out, so this is the goal's "no task > 50 ms while tiles stream". */
export function longTasksOverlapping(tasks, from, to) {
  if (from === null || to === null || to <= from) return { count: 0, maxMs: 0 };
  const inside = tasks.filter((t) => t.startTime < to && t.startTime + t.duration > from);
  return { count: inside.length, maxMs: Math.round(Math.max(0, ...inside.map((t) => t.duration))) };
}

const mb = (bytes) => +(bytes / 1e6).toFixed(2);
const sec = (ms) => (ms === null || ms === undefined ? '-' : (ms / 1000).toFixed(2));

/** A network tally: every request, and the terrain's own (era image, elevation tiles, habitat lookup). Bytes are on the wire. */
export const emptyTally = () => ({ requests: 0, bytes: 0, terrainRequests: 0, terrainBytes: 0, demRequests: 0 });

/** Load plus pan, in MB and request counts. The pan streams more tiles, so the total is what the scene costs to look around. */
export function netTotals(run) {
  if (!run) return null;
  const sum = (k) => run.net.load[k] + run.net.pan[k];
  return { requests: sum('requests'), mb: mb(sum('bytes')), terrainRequests: sum('terrainRequests'), terrainMb: mb(sum('terrainBytes')) };
}

/** Whether the scene streams elevation tiles: the flat relief from zoom 5 (TerrainReliefLayer) and the 3D ground (Close3DLayer). */
export const expectsDem = (zoom) => zoom >= 5;

/** Pass/fail against the goal's acceptance numbers, for what this benchmark can measure. */
export function goalChecks(results) {
  const rows = [];
  const speed = results.filter((r) => r.zoom === GOAL.speedZoom && r.mode === '3d');
  const worst = (xs) => (xs.length ? Math.max(...xs) : null);
  const worstLow = (xs) => (xs.length ? Math.min(...xs) : null);
  const check = (name, value, ok, unit, target) => rows.push({ name, value, unit, target, ok: value === null ? null : ok(value) });
  const cold = worst(speed.map((r) => r.cold?.timing?.doneMs).filter((x) => typeof x === 'number'));
  const warm = worst(speed.map((r) => r.warm?.timing?.doneMs).filter((x) => typeof x === 'number'));
  const fps = worstLow(speed.map((r) => r.warm?.pan?.fps ?? r.cold?.pan?.fps).filter((x) => typeof x === 'number' && x > 0));
  const long = worst(
    speed
      .flatMap((r) => [r.cold, r.warm])
      .filter(Boolean)
      // While streaming: from the first tile request to time to detail (older results without it: the whole load), and the pan.
      .flatMap((run) => [(run.longTasks.streaming ?? run.longTasks.load).maxMs, run.longTasks.pan.maxMs]),
  );
  const texel = worst(results.filter((r) => r.zoom <= GOAL.texelMaxZoom).map((r) => Math.max(r.texel.eastWestPx, r.texel.northSouthPx)));
  check(`zoom ${GOAL.speedZoom} tilted: full detail, cold (worst scene)`, cold, (v) => v <= GOAL.coldMs, 'ms', `<= ${GOAL.coldMs}`);
  check(`zoom ${GOAL.speedZoom} tilted: full detail, warm (worst scene)`, warm, (v) => v <= GOAL.warmMs, 'ms', `<= ${GOAL.warmMs}`);
  check(`zoom ${GOAL.speedZoom} tilted: fps panning (worst scene)`, fps, (v) => v >= GOAL.fps, 'fps', `>= ${GOAL.fps}`);
  check(`zoom ${GOAL.speedZoom} tilted: longest main-thread task while streaming`, long, (v) => v <= GOAL.longTaskMs, 'ms', `<= ${GOAL.longTaskMs}`);
  check(`colour texel up to zoom ${GOAL.texelMaxZoom} (worst scene and zoom)`, texel, (v) => v <= GOAL.texelPx, 'px', `<= ${GOAL.texelPx}`);
  return rows;
}

const cell = (v) => (v === null || v === undefined ? '-' : String(v));

/** The short markdown report: one row per variant, then the goal checks. */
export function renderMarkdown(file) {
  const { meta, results } = file;
  const lines = [
    `# Terrain benchmark ${meta.label ? `(${meta.label}) ` : ''}${meta.date}`,
    '',
    `Commit \`${meta.commit}\`${meta.dirty ? ' (dirty tree)' : ''}, load average ${meta.loadavg ? meta.loadavg.join(' / ') : '?'} (start / end), ${meta.base}, ${meta.viewport.width}x${meta.viewport.height}, ${meta.headless ? 'headless' : 'headed'}, GPU: ${meta.renderer ?? 'unknown'}.`,
    'Times are seconds from navigation start to the terrain loaded and drawn. fps and long tasks come from a fixed 600 px drag. Texel = one colour texel in screen px (east-west x north-south) at the screen centre.',
    '',
    '| scene | zoom | mode | load | cold s | warm s | fps (warm) | long tasks cold (n / max ms) | terrain MB cold | terrain MB warm | terrain req cold | total MB cold | texel px |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of results) {
    const c = r.cold;
    const w = r.warm;
    const longs = c ? `${c.longTasks.load.count + c.longTasks.pan.count} / ${Math.max(c.longTasks.load.maxMs, c.longTasks.pan.maxMs)}` : '-';
    lines.push(
      `| ${r.sceneLabel} ${r.year < 0 ? `${-r.year} BCE` : `${r.year} CE`} | ${r.zoom} | ${r.mode} | ${cell(r.loadavg)} | ${r.error ? `FAILED: ${r.error} ` : ''}${sec(c?.timing?.doneMs)}${c?.timedOut ? ' (timeout)' : ''} | ${sec(w?.timing?.doneMs)} | ${cell(w?.pan?.fps ?? c?.pan?.fps)} | ${longs} | ${cell(netTotals(c)?.terrainMb)} | ${cell(netTotals(w)?.terrainMb)} | ${cell(netTotals(c)?.terrainRequests)} | ${cell(netTotals(c)?.mb)} | ${r.texel.eastWestPx} x ${r.texel.northSouthPx} |`,
    );
  }
  lines.push('', '## Goal checks', '', '| check | target | measured | |', '|---|---|---|---|');
  for (const g of goalChecks(results))
    lines.push(
      `| ${g.name} | ${g.target} ${g.unit} | ${g.value === null ? 'not measured' : `${g.value} ${g.unit}`} | ${g.ok === null ? '' : g.ok ? 'pass' : 'FAIL'} |`,
    );
  return `${lines.join('\n')}\n`;
}

/** Deltas between two result files, joined on result id. Metric values come from a result; missing ones are null. */
export const COMPARE_METRICS = [
  { key: 'coldS', label: 'cold s', get: (r) => ((r.cold?.timing?.doneMs ?? null) === null ? null : r.cold.timing.doneMs / 1000), lowerBetter: true, digits: 2 },
  { key: 'warmS', label: 'warm s', get: (r) => ((r.warm?.timing?.doneMs ?? null) === null ? null : r.warm.timing.doneMs / 1000), lowerBetter: true, digits: 2 },
  { key: 'fps', label: 'fps', get: (r) => r.warm?.pan?.fps ?? r.cold?.pan?.fps ?? null, lowerBetter: false, digits: 1 },
  {
    key: 'longMs',
    label: 'longest task ms',
    get: (r) => (r.cold ? Math.max(r.cold.longTasks.load.maxMs, r.cold.longTasks.pan.maxMs) : null),
    lowerBetter: true,
    digits: 0,
  },
  {
    key: 'streamMs',
    label: 'longest task while streaming ms',
    get: (r) => (r.cold?.longTasks?.streaming ? Math.max(r.cold.longTasks.streaming.maxMs, r.warm?.longTasks?.streaming?.maxMs ?? 0) : null),
    lowerBetter: true,
    digits: 0,
  },
  { key: 'mbCold', label: 'terrain MB cold', get: (r) => netTotals(r.cold)?.terrainMb ?? null, lowerBetter: true, digits: 2 },
  { key: 'texelPx', label: 'texel px', get: (r) => Math.max(r.texel.eastWestPx, r.texel.northSouthPx), lowerBetter: true, digits: 2 },
];

export function compareResults(oldFile, newFile) {
  const oldById = new Map(oldFile.results.map((r) => [r.id, r]));
  const rows = [];
  for (const n of newFile.results) {
    const o = oldById.get(n.id);
    if (!o) continue;
    /** @type {Record<string, any>} */
    const metrics = {};
    for (const m of COMPARE_METRICS) {
      const before = m.get(o);
      const after = m.get(n);
      const delta = before === null || after === null ? null : after - before;
      const better = delta === null || delta === 0 ? null : m.lowerBetter ? delta < 0 : delta > 0;
      metrics[m.key] = { before, after, delta, better };
    }
    rows.push({ id: n.id, metrics });
  }
  return {
    rows,
    onlyOld: oldFile.results.filter((r) => !rows.some((x) => x.id === r.id)).map((r) => r.id),
    onlyNew: newFile.results.filter((r) => !oldById.has(r.id)).map((r) => r.id),
  };
}

const fmt = (v, digits) => (v === null ? '-' : v.toFixed(digits));
function cmpCell(c, digits) {
  if (c.before === null && c.after === null) return '-';
  if (c.delta === null) return `${fmt(c.before, digits)} -> ${fmt(c.after, digits)}`;
  const sign = c.delta > 0 ? '+' : '';
  const mark = c.better === null ? '' : c.better ? ' (better)' : ' (worse)';
  return `${fmt(c.before, digits)} -> ${fmt(c.after, digits)} (${sign}${c.delta.toFixed(digits)})${mark}`;
}

export function renderCompare(oldFile, newFile) {
  const { rows, onlyOld, onlyNew } = compareResults(oldFile, newFile);
  const lines = [
    `# Terrain benchmark compare: ${oldFile.meta.commit} (${oldFile.meta.date}) -> ${newFile.meta.commit} (${newFile.meta.date})`,
    '',
    `| variant | ${COMPARE_METRICS.map((m) => m.label).join(' | ')} |`,
    `|---|${COMPARE_METRICS.map(() => '---').join('|')}|`,
  ];
  for (const r of rows) lines.push(`| ${r.id} | ${COMPARE_METRICS.map((m) => cmpCell(r.metrics[m.key], m.digits)).join(' | ')} |`);
  if (onlyOld.length) lines.push('', `Only in old: ${onlyOld.join(', ')}`);
  if (onlyNew.length) lines.push('', `Only in new: ${onlyNew.join(', ')}`);
  return `${lines.join('\n')}\n`;
}
