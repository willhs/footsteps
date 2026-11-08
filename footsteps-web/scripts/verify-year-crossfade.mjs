// Run against a local app serving all 30 real /grid/humans_<year>.png files:
// CROSSFADE_EVIDENCE=/absolute/evidence node scripts/verify-year-crossfade.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const evidence = process.env.CROSSFADE_EVIDENCE;
assert(evidence, 'Set CROSSFADE_EVIDENCE to an evidence directory outside git');
await mkdir(evidence, { recursive: true });
const years = [
  -10000, -9000, -8000, -7000, -6000, -5000, -4000, -3000, -2000, -1000, 0, 100,
  200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500,
  1600, 1700, 1800, 1900,
];
const browser = await chromium.launch({
  headless: process.env.HEADLESS === 'true',
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo:
    process.env.CROSSFADE_VIDEO === 'true'
      ? { dir: evidence, size: { width: 1440, height: 1000 } }
      : undefined,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (message) => {
  if (
    /GL_INVALID|Vertex buffer is not big enough|Error rendering layer/i.test(
      message.text(),
    )
  )
    errors.push(message.text());
});
const pixelSamples = [];
async function checkPopulationPixels(year) {
  const count = await page.evaluate(() => {
    window.__verifyDeck.redraw('verify population pixels', true);
    const gl = document.querySelector('canvas').getContext('webgl2');
    const pixels = new Uint8Array(
      gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
    );
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    if (gl.getError() !== gl.NO_ERROR)
      throw new Error('Population draw produced a WebGL error');
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      if (
        (r > 80 && g > 40 && r > g * 1.15) ||
        (g > 100 && b > 100 && r < g * 0.8)
      )
        count++;
    }
    // readPixels synchronizes GPU/CPU solely for this assertion. Its pause is
    // verification overhead, not a user frame; omit that one following sample.
    window.__skipPixelProbeSample = true;
    return count;
  });
  pixelSamples.push({ year, populationPixels: count });
  assert(count > 20, `No population pixels rendered for ${year}`);
}
try {
  await page.goto(process.env.CROSSFADE_URL || 'http://localhost:4444', {
    timeout: 120000,
  });
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      let fiber =
        canvas[
          Object.keys(canvas).find((key) => key.startsWith('__reactFiber'))
        ];
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook) {
          if (hook.memoizedState?.current?.deck) {
            window.__verifyDeck = hook.memoizedState.current.deck;
            return window.__verifyDeck.props.layers.some((l) =>
              l?.id?.startsWith('units-'),
            );
          }
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      return false;
    },
    { timeout: 30000 },
  );
  const slider = page.getByRole('slider');
  await page.evaluate(() => {
    window.__visibleUnits = () => {
      const years = new Map();
      for (const layer of window.__verifyDeck.props.layers) {
        if (!layer?.id?.startsWith('units-') || layer.props.visible === false)
          continue;
        const progress = Math.pow(layer.props.opacity, 1 / 2.2);
        const endpoints =
          layer.props.morph &&
          layer.props.fromYear !== layer.props.year &&
          progress < 1
            ? [
                [layer.props.fromYear, 1 - progress],
                [layer.props.year, progress],
              ]
            : [[layer.props.year, 1]];
        for (const [year, weight] of endpoints) {
          const id = `units-${year}`;
          years.set(id, {
            id,
            props: {
              opacity: Math.pow(weight, 2.2),
              data: { length: layer.props.data.length },
            },
          });
        }
      }
      return [...years.values()];
    };
  });
  await slider.focus();
  await slider.press('Home');
  await page.waitForFunction(() =>
    window.__verifyDeck.props.layers.some(
      (l) =>
        l?.id === 'units--10000' &&
        l.props.visible !== false &&
        l.props.opacity === 1,
    ),
  );
  await checkPopulationPixels(-10000);
  await page.screenshot({ path: path.join(evidence, 'crossfade-start.png') });
  await page.evaluate(() => {
    window.__fadeSamples = [];
    window.__sampleFrames = true;
    let previous = performance.now();
    const sample = (now) => {
      if (!window.__sampleFrames) return;
      if (window.__skipPixelProbeSample) {
        window.__skipPixelProbeSample = false;
        previous = now;
        requestAnimationFrame(sample);
        return;
      }
      const layers = window.__visibleUnits();
      window.__fadeSamples.push({
        now,
        gap: now - previous,
        layers: layers.map((l) => ({
          id: l.id,
          weight: Math.pow(l.props.opacity, 1 / 2.2),
          count: l.props.data.length,
        })),
      });
      previous = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  for (const year of years.slice(1)) {
    await slider.press('ArrowRight');
    await page.waitForFunction(
      (y) => {
        const layers = window.__visibleUnits();
        return (
          layers.length === 1 &&
          layers[0].id === `units-${y}` &&
          layers[0].props.opacity === 1
        );
      },
      year,
      { timeout: 15000 },
    );
    console.log('Settled Units', year);
    await checkPopulationPixels(year);
  }
  await page.screenshot({ path: path.join(evidence, 'crossfade-1900.png') });
  // Reverse rapidly while animations are in flight, then settle at the latest request.
  for (let i = 0; i < 10; i++) {
    await slider.press('ArrowLeft');
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => {
    const layers = window.__visibleUnits();
    return layers.length === 1 && layers[0].id === 'units-900';
  });
  const samples = await page.evaluate(() => {
    window.__sampleFrames = false;
    return window.__fadeSamples;
  });
  await writeFile(
    path.join(evidence, 'crossfade-samples.json'),
    JSON.stringify(samples),
  );
  const blends = samples.filter(
    (s) =>
      s.layers.length === 2 &&
      s.layers.every((l) => l.weight > 0 && l.weight < 1),
  );
  assert(blends.length > 0, 'No intermediate fade frames observed');
  assert(
    samples.every((s) => s.layers.length >= 1 && s.layers.length <= 2),
    'Blank frame or more than two snapshots',
  );
  assert(
    samples.every(
      (s) =>
        Math.abs(s.layers.reduce((sum, l) => sum + l.weight, 0) - 1) < 1e-6,
    ),
    'Brightness weights do not sum to one',
  );
  const seen = new Set(
    samples.flatMap((s) => s.layers.map((l) => Number(l.id.slice(6)))),
  );
  assert(
    years.every((y) => seen.has(y)),
    'Not all 30 years rendered',
  );
  const gaps = samples.map((s) => s.gap).sort((a, b) => a - b);
  const report = {
    years: years.length,
    samples: samples.length,
    blendFrames: blends.length,
    blankFrames: 0,
    maxLayers: 2,
    medianFrameMs: gaps[Math.floor(gaps.length * 0.5)],
    p95FrameMs: gaps[Math.floor(gaps.length * 0.95)],
    maxFrameMs: gaps.at(-1),
    gpu: await page.evaluate(() => {
      const gl = document.querySelector('canvas').getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
    }),
    errors,
    minPopulationPixels: Math.min(
      ...pixelSamples.map((sample) => sample.populationPixels),
    ),
    timingExcludes:
      'The frame immediately following each explicit readPixels verification probe',
    videoCapture: process.env.CROSSFADE_VIDEO === 'true',
  };
  assert.deepEqual(errors, [], 'Browser runtime errors');
  await writeFile(
    path.join(evidence, 'crossfade-samples.json'),
    JSON.stringify(samples),
  );
  await writeFile(
    path.join(evidence, 'crossfade-report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await writeFile(
    path.join(evidence, 'crossfade-pixels.json'),
    JSON.stringify(pixelSamples, null, 2),
  );
  // Stress test: steps through every year back to back. Frames over ~100 ms
  // cluster in years with 3M+ units (GPU draw/upload cost); median is ~8 ms.
  assert(
    report.medianFrameMs < 20 && report.p95FrameMs < 125,
    'Scrubbing exceeds the frame budget (median < 20 ms, p95 < 125 ms)',
  );
  // Check the adjacent Grid path still renders, and the retained Dots path mounts.
  await page.getByRole('button', { name: 'Units', exact: true }).click();
  await page.waitForFunction(() =>
    window.__verifyDeck.props.layers.some((l) => l?.id === 'grid-900'),
  );
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await page.waitForFunction(() =>
    window.__verifyDeck.props.layers.some((l) =>
      l?.id?.startsWith('human-layer-current-'),
    ),
  );
  await page.getByRole('button', { name: 'Dots', exact: true }).click();
  await page.waitForFunction(() => {
    const layers = window.__visibleUnits();
    return (
      layers.length === 1 &&
      layers[0].id === 'units-900' &&
      layers[0].props.opacity === 1
    );
  });
  await page.screenshot({
    path: path.join(evidence, 'crossfade-after-mode-switch.png'),
  });
  console.log('Grid / Dots / Units mode switching passed');
  const workers = page.workers();
  assert(workers.length > 0, 'The grid decoder worker did not start');
  for (const worker of workers) {
    await worker.evaluate(() => {
      const nativeFetch = self.fetch.bind(self);
      self.__delayedFetch = false;
      self.fetch = async (...args) => {
        if (String(args[0]).includes('/humans_-10000.png')) {
          self.__delayedFetch = true;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        return nativeFetch(...args);
      };
    });
  }
  await slider.focus();
  await slider.press('Home');
  await page.waitForTimeout(200);
  const delayed = await Promise.all(
    workers.map((worker) => worker.evaluate(() => self.__delayedFetch)),
  );
  assert(delayed.some(Boolean), 'The delayed worker fetch did not start');
  assert(
    await page.evaluate(() =>
      window.__verifyDeck.props.layers.some(
        (l) => l?.id === 'units-900' && l.props.opacity === 1,
      ),
    ),
    'Previous year disappeared during a delayed fetch',
  );
  await page.screenshot({
    path: path.join(evidence, 'crossfade-delayed-fetch.png'),
  });
  await page.waitForFunction(() => {
    const layers = window.__visibleUnits();
    return layers.length === 1 && layers[0].id === 'units--10000';
  });
  console.log('Previous snapshot remains visible through a delayed PNG fetch');
  assert.deepEqual(errors, [], 'Browser runtime or WebGL errors');
  report.modeSwitching = true;
  report.delayedFetchRetention = true;
  await writeFile(
    path.join(evidence, 'crossfade-report.json'),
    JSON.stringify(report, null, 2),
  );
} finally {
  await context.close();
  await browser.close();
}
