#!/usr/bin/env node
// Real-data screenshots, GPU picking and street-zoom frame rate. Headed Chromium required for fps.
// node footsteps-web/scripts/measure-figures.mjs http://localhost:4444 <evidence-dir>
// Missing gitignored data is fetched from public production by the browser test harness only.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const [base = 'http://localhost:4444', out = 'figures-evidence'] =
  process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const cache = new Map();
await context.route(
  /\/(grid|terrain|habitat|fauna|food|pmtiles)\//,
  async (route) => {
    const request = route.request();
    const u = new URL(request.url());
    if (u.origin !== new URL(base).origin) return route.continue();
    const key = u.pathname + u.search + (request.headers().range ?? '');
    if (!cache.has(key)) {
      const response = await route.fetch({
        url: `https://footsteps.willhs.me${u.pathname}${u.search}`,
      });
      cache.set(key, {
        status: response.status(),
        headers: response.headers(),
        body: await response.body(),
      });
    }
    await route.fulfill(cache.get(key));
  },
);
const page = await context.newPage();
const errors = [];
const logs = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (/\[grid\]|\[food\]|\[fauna\]/.test(m.text())) logs.push(m.text());
  if (m.type() === 'error' && /shader|GLSL|Error|attribute/i.test(m.text()))
    errors.push(m.text());
});
// Read the real Deck reference from React's existing ref, without adding an application QA API.
async function connect() {
  await page.waitForFunction(
    () => {
      for (const el of document.querySelectorAll('canvas')) {
        let f = el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
        for (; f; f = f.return)
          for (let h = f.memoizedState; h; h = h.next) {
            if (h.memoizedState?.current?.deck?.layerManager) {
              window.__deck = h.memoizedState.current.deck;
              return true;
            }
          }
      }
      return false;
    },
    { timeout: 30000 },
  );
}
const scenes = [
  { name: 'kalahari', lon: 22, lat: -23, year: 1800 },
  { name: 'mongolia', lon: 103.5, lat: 47.6, year: 1000, preferredKind: 3 },
  { name: 'ukraine', lon: 32, lat: 49, year: -15000 },
  { name: 'nile', lon: 31.1, lat: 29.9, year: 1500 },
].filter((s) => !process.env.SCENE || s.name === process.env.SCENE);
async function pickAnimal(preferred = null) {
  return page.evaluate((preferred) => {
    const d = window.__deck;
    const vp = d.getViewports()[0];
    const layer = d.props.layers
      .flat(Infinity)
      .find((l) => l?.id === 'animals');
    for (const a of layer?.props.data ?? []) {
      if (preferred && a.name !== preferred.name) continue;
      const t = ((performance.now() / 1000) % 100000) * 0.018 + a.seed * 6.283;
      const x =
        a.position[0] +
        (Math.sin(t) * 12) /
          (111320 * Math.cos((a.position[1] * Math.PI) / 180));
      const y = a.position[1] + (Math.cos(t * 0.7) * 12) / 111320;
      const [px, py] = vp.project([x, y, 0]);
      if (px < 390 || px > 1400 || py < 170 || py > 760) continue;
      const p = d.pickObject({
        x: px,
        y: py - 3,
        radius: 8,
        layerIds: ['animals'],
      });
      if (p?.object) return { x: px, y: py - 3, name: p.object.name };
    }
    return null;
  }, preferred);
}
const report = [];
let defaultAnchor = null;
try {
  for (const scene of scenes) {
    // First find a real group's location near the requested landscape, then inspect its street view.
    let anchor = scene;
    await page.goto(
      `${base}/?figures=1&routine=1&year=${scene.year}&lat=${scene.lat}&lon=${scene.lon}&zoom=12.8&utc=9&tags=0`,
    );
    await connect();
    await page.waitForFunction(
      () =>
        window.__deck.props.layers
          .flat(Infinity)
          .some((l) => l?.id === 'people'),
      null,
      { timeout: 120000 },
    );
    await page.waitForTimeout(1000);
    const person = await page.evaluate((preferredKind) => {
      const layers = window.__deck.props.layers.flat(Infinity).filter(Boolean);
      const data = layers
        .filter((l) => l.id === 'people')
        .flatMap((l) => Array.from(l.props.data));
      const preferred = data.filter((p) => p.groupKind === preferredKind);
      const selected = preferred.length ? preferred : data;
      return selected.length
        ? selected.reduce((a, b) => (b.groupPeople > a.groupPeople ? b : a))
            .position
        : null;
    }, scene.preferredKind);
    if (person) {
      anchor = { ...scene, lon: person[0], lat: person[1] };
      defaultAnchor = anchor;
    }
    for (const night of [false, true]) {
      // Noon/midnight in local solar time; the historical year does not set today's sun clock.
      const utc = ((night ? 0 : 12) - anchor.lon / 15 + 24) % 24;
      await page.goto(
        `${base}/?figures=1&routine=1&year=${scene.year}&lat=${anchor.lat}&lon=${anchor.lon}&zoom=17.5&utc=${utc}&tags=0`,
      );
      await connect();
      await page.waitForFunction(
        () =>
          window.__deck.props.layers
            .flat(Infinity)
            .some((l) => l?.id === 'people'),
        null,
        { timeout: 120000 },
      );
      await page.waitForTimeout(1500);
      if (night) {
        const toggle = page.getByRole('button', {
          name: 'Day/night shading',
          exact: true,
        });
        // The View panel toggle may be collapsed. Routine night is still verified by local sun time.
        if (await toggle.isVisible()) await toggle.click();
      }
      const state = await page.evaluate(() => {
        const d = window.__deck;
        const layers = d.props.layers.flat(Infinity).filter(Boolean);
        return {
          people: layers
            .filter((l) => l.id === 'people')
            .map((l) => ({
              instances: l.props.data.length,
              figures: l.props.figures,
              routine: l.props.routine,
            })),
          animals: layers
            .filter((l) => l.id === 'animals')
            .flatMap((l) => l.props.data)
            .map((a) => ({
              name: a.name,
              source: a.source,
              position: a.position,
            })),
          view: d.props.viewState,
        };
      });
      const fps = await page.evaluate(
        () =>
          new Promise((resolve) => {
            let first,
              last,
              n = 0;
            const tick = (t) => {
              first ??= t;
              last = t;
              n++;
              if (t - first < 2000) requestAnimationFrame(tick);
              else resolve(((n - 1) * 1000) / (last - first));
            };
            requestAnimationFrame(tick);
          }),
      );
      const file = path.join(
        out,
        `${scene.name}-${night ? 'night' : 'day'}.png`,
      );
      await page.screenshot({ path: file });
      // GPU pick visible animal pixels, then use the normal click handler and inspect its card.
      const target =
        scene.name === 'ukraine'
          ? state.animals.find((a) => /mammoth/i.test(a.name))
          : scene.name === 'mongolia'
            ? state.animals.find(
                (a) => a.source === 'domestic' && /horse/i.test(a.name),
              )
            : scene.name === 'nile'
              ? state.animals.find(
                  (a) => a.source === 'domestic' && /cattle/i.test(a.name),
                )
              : null;
      let picked = await pickAnimal(target);
      if (!picked && target) {
        // Move the actual controlled map to a model-supplied animal, without changing any data.
        await page.evaluate((position) => {
          const d = window.__deck;
          d.props.onViewStateChange({
            viewState: {
              ...d.props.viewState,
              longitude: position[0],
              latitude: position[1],
            },
          });
        }, target.position);
        await page.waitForTimeout(2000);
        picked = await pickAnimal(target);
        await page.screenshot({
          path: path.join(
            out,
            `${scene.name}-${night ? 'night' : 'day'}-animal-focus.png`,
          ),
        });
      }
      let animalCard = null;
      if (picked) {
        await page.mouse.click(picked.x, picked.y);
        await page.waitForTimeout(300);
        animalCard = await page
          .getByLabel('Animal details', { exact: true })
          .innerText({ timeout: 1000 })
          .catch(() => null);
        await page.screenshot({
          path: path.join(
            out,
            `${scene.name}-${night ? 'night' : 'day'}-picked.png`,
          ),
        });
      }
      const personPick = await page.evaluate(() => {
        const d = window.__deck,
          vp = d.getViewports()[0];
        const layer = d.props.layers
          .flat(Infinity)
          .find((l) => l?.id === 'people');
        for (let i = 0; i < (layer?.props.data.length ?? 0); i += 3) {
          const person = layer.props.data[i],
            [px, py] = vp.project([...person.position, 0]);
          if (px < 410 || px > 1380 || py < 200 || py > 720) continue;
          for (let dy = -40; dy <= 40; dy += 8)
            for (let dx = -40; dx <= 40; dx += 8) {
              const p = d.pickObject({
                x: px + dx,
                y: py + dy,
                radius: 4,
                layerIds: ['people'],
              });
              if (p?.object)
                return {
                  x: px + dx,
                  y: py + dy,
                  id: p.object.id,
                  age: p.object.age,
                  role: p.object.role,
                };
            }
        }
        return null;
      });
      let personCard = null;
      if (personPick) {
        await page.mouse.click(personPick.x, personPick.y);
        await page.waitForTimeout(300);
        personCard = await page
          .getByLabel('What we know here', { exact: true })
          .innerText({ timeout: 1000 })
          .catch(() => null);
        await page.screenshot({
          path: path.join(
            out,
            `${scene.name}-${night ? 'night' : 'day'}-person.png`,
          ),
        });
      }
      report.push({
        scene: scene.name,
        night,
        anchor,
        personFound: !!person,
        focusedAnimal: target,
        fps,
        state,
        picked,
        animalCard,
        personPick,
        personCard,
        screenshot: file,
      });
      console.log(
        scene.name,
        night ? 'night' : 'day',
        fps.toFixed(1),
        'fps',
        state.people,
        'animal instances',
        state.animals.length,
        'picked',
        picked?.name,
      );
    }
  }
  for (const mode of ['grid', 'dots']) {
    await page.goto(
      `${base}/?figures=1&mode=${mode}&year=1500&lat=29.9&lon=31.1&zoom=7`,
    );
    await connect();
    if (mode === 'grid')
      await page.waitForFunction(
        () =>
          window.__deck.props.layers
            .flat(Infinity)
            .some((l) => l?.id?.startsWith('grid-') && l.props.visible),
        null,
        { timeout: 120000 },
      );
    else await page.waitForTimeout(5000);
    const ids = await page.evaluate(() =>
      window.__deck.props.layers
        .flat(Infinity)
        .filter(Boolean)
        .map((l) => l.id),
    );
    await page.screenshot({ path: path.join(out, `mode-${mode}.png`) });
    report.push({ mode, ids });
  }
  // Default remains footprints, without loading fauna/food for the scene.
  if (!defaultAnchor)
    throw new Error(
      'No populated group found for default-footprint verification',
    );
  await page.goto(
    `${base}/?year=${defaultAnchor.year}&lat=${defaultAnchor.lat}&lon=${defaultAnchor.lon}&zoom=17.5&tags=0`,
  );
  await connect();
  await page.waitForFunction(
    () =>
      window.__deck.props.layers.flat(Infinity).some((l) => l?.id === 'people'),
    null,
    { timeout: 120000 },
  );
  const defaultFps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let first,
          n = 0;
        const tick = (t) => {
          first ??= t;
          n++;
          if (t - first < 2000) requestAnimationFrame(tick);
          else resolve(((n - 1) * 1000) / (t - first));
        };
        requestAnimationFrame(tick);
      }),
  );
  report.push({
    defaultFps,
    defaultLayers: await page.evaluate(() =>
      window.__deck.props.layers
        .flat(Infinity)
        .filter(Boolean)
        .filter((l) => l.id.startsWith('people') || l.id === 'animals')
        .map((l) => ({
          id: l.id,
          figures: l.props.figures,
          instances: l.props.data.length,
        })),
    ),
  });
  await page.screenshot({ path: path.join(out, 'default-footprints.png') });
} finally {
  fs.writeFileSync(
    path.join(out, 'report.json'),
    JSON.stringify({ report, errors, logs }, null, 2),
  );
  await browser.close();
}
const failures = [];
for (const mode of report.filter((r) => r.mode)) {
  if (mode.ids.some((id) => id === 'animals' || id.startsWith('people')))
    failures.push(`${mode.mode}: opt-in street layers leaked into debug mode`);
  if (mode.mode === 'grid' && !mode.ids.some((id) => id.startsWith('grid-')))
    failures.push('Grid data not loaded');
  if (
    mode.mode === 'dots' &&
    !mode.ids.some((id) => id.startsWith('human-layer'))
  )
    failures.push('Dots layer not loaded');
}
const baseline = report.find((r) => r.defaultLayers);
if (
  !baseline?.defaultLayers.some(
    (l) => l.id === 'people' && l.figures === false && l.instances > 0,
  ) ||
  baseline.defaultLayers.some((l) => l.id === 'animals')
)
  failures.push('Default footprints contract failed');
for (const row of report.filter((r) => r.scene)) {
  if (!row.state.people.every((p) => p.figures && p.routine))
    failures.push(`${row.scene}: figures/routine missing`);
  if (
    row.picked &&
    !row.animalCard?.includes('this animal imagined') &&
    !row.animalCard?.includes('this domestic animal imagined')
  )
    failures.push(`${row.scene}: animal pick card missing`);
  if (
    row.personPick &&
    !row.personCard?.includes(`about ${row.personPick.age}`)
  )
    failures.push(`${row.scene}: original person picking contract failed`);
}
fs.writeFileSync(
  path.join(out, 'checks.json'),
  JSON.stringify({ failures }, null, 2),
);
if (errors.length || failures.length) {
  console.error(errors, failures);
  process.exitCode = 1;
}
