#!/usr/bin/env node
// Real-data check of the modelled age structure (research 0006): a forager band and a farming village at street
// zoom, the ages of everyone drawn, and the person card with its "Modelled age structure" label.
// node footsteps-web/scripts/verify-ages.mjs http://localhost:4444 <absolute-evidence-dir>
// Needs the gitignored grid/habitat data under public/ (symlink or copy it); headed Chromium for GPU picking.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const [base = 'http://localhost:4444', out = 'ages-evidence'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

async function connect() {
  await page.waitForFunction(() => {
    for (const el of document.querySelectorAll('canvas')) {
      let f = el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
      for (; f; f = f.return) for (let h = f.memoizedState; h; h = h.next) if (h.memoizedState?.current?.deck?.layerManager) { window.__deck = h.memoizedState.current.deck; return true; }
    }
    return false;
  }, { timeout: 30000 });
}
const peopleLayerReady = () => page.waitForFunction(() => window.__deck.props.layers.flat(Infinity).some((l) => l?.id?.startsWith('people') && l.props.data.length), null, { timeout: 120000 });
const BINS = [[0, 5], [5, 15], [15, 30], [30, 50], [50, 200]];
const results = [];

const scenes = [
  { name: 'forager-band', note: 'Kalahari, 1800: HYDE says foraging', lon: 22, lat: -23, year: 1800, kind: 0, expect: 'forager' },
  { name: 'farming-village-nile', note: 'Nile, 1500 CE: farming for millennia', lon: 31.1, lat: 29.9, year: 1500, kind: 1, expect: 'agrarian' },
  { name: 'early-farming-village-levant', note: 'Levant, 7000 BCE: within 2,000 years of local crop onset (8000 BCE)', lon: 35.5, lat: 32.5, year: -7000, kind: 1, expect: 'early_farmer' },
];
try {
  for (const scene of scenes) {
    // Find a real unit of the wanted kind near the scene from the units layer (wide view), then go to street zoom on it.
    await page.goto(`${base}/?year=${scene.year}&lat=${scene.lat}&lon=${scene.lon}&zoom=8.5&tags=0`);
    await connect();
    await page.waitForFunction(() => window.__deck.props.layers.flat(Infinity).some((l) => l?.id?.startsWith('units') && l.props.data?.info?.kind?.length), null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const anchor = await page.evaluate(([lon, lat, kind]) => {
      const layer = window.__deck.props.layers.flat(Infinity).find((l) => l?.id?.startsWith('units') && l.props.data?.info?.kind?.length);
      const pos = layer.props.data.attributes.getPosition.value;
      const { kind: kinds, people } = layer.props.data.info;
      let best = null;
      for (let i = 0; i < kinds.length; i++) {
        if (kinds[i] !== kind || people[i] < (kind === 0 ? 20 : 150)) continue;
        const d = Math.hypot(pos[i * 2] - lon, pos[i * 2 + 1] - lat);
        if (!best || d < best.d) best = { d, at: [pos[i * 2], pos[i * 2 + 1]] };
      }
      return best?.at ?? null;
    }, [scene.lon, scene.lat, scene.kind]);
    assert.ok(anchor, `${scene.name}: no group of kind ${scene.kind} near ${scene.lon},${scene.lat}`);
    await page.goto(`${base}/?year=${scene.year}&lat=${anchor[1]}&lon=${anchor[0]}&zoom=17&tags=0`);
    await connect();
    await peopleLayerReady();
    await page.waitForTimeout(1500);
    // Everyone drawn in this group (the layer holds the whole view; this group's people are the nearest).
    const stats = await page.evaluate(([lon, lat, kind]) => {
      const data = [...new Map(window.__deck.props.layers.flat(Infinity).filter((l) => l?.id?.startsWith('people')).flatMap((l) => Array.from(l.props.data)).map((p) => [p.id, p])).values()]
        .filter((p) => p.groupKind === kind && Math.abs(p.position[0] - lon) < 0.01 && Math.abs(p.position[1] - lat) < 0.01);
      return { n: data.length, ages: data.map((p) => p.age), structures: [...new Set(data.map((p) => p.ageStructure))] };
    }, [anchor[0], anchor[1], scene.kind]);
    const counts = BINS.map(([lo, hi]) => stats.ages.filter((a) => a >= lo && a < hi).length);
    assert.deepEqual(stats.structures, [scene.expect], `${scene.name}: age structure`);
    // Click an adult to open the card.
    let card = '';
    for (let tries = 0; tries < 40 && !card; tries++) {
      const hit = await page.evaluate(([lon, lat, kind, skip]) => {
        const d = window.__deck;
        const vp = d.getViewports()[0];
        const people = d.props.layers.flat(Infinity).filter((l) => l?.id?.startsWith('people')).flatMap((l) => Array.from(l.props.data))
          .filter((p) => p.groupKind === kind && p.age >= 18 && Math.abs(p.position[0] - lon) < 0.01);
        const p = people[skip % people.length];
        const [x, y] = vp.project(p.position);
        return { x, y };
      }, [anchor[0], anchor[1], scene.kind, tries * 3]);
      if (hit.x < 420 || hit.x > 1400 || hit.y < 80 || hit.y > 850) continue;
      await page.mouse.click(hit.x, hit.y);
      await page.waitForTimeout(400);
      const t = await page.getByText(/Modelled age structure; individual speculative/).first().innerText({ timeout: 1500 }).catch(() => '');
      if (t) card = t;
    }
    await page.screenshot({ path: path.join(out, `${scene.name}.png`) });
    results.push({ scene: scene.name, note: scene.note, people: stats.n, structure: stats.structures[0], binCounts: counts, binShares: counts.map((c) => +(c / stats.n).toFixed(3)), oldest: Math.max(...stats.ages), card });
    assert.ok(card, `${scene.name}: person card with the age label did not open`);
  }
  assert.deepEqual(errors, []);
} finally {
  fs.writeFileSync(path.join(out, 'ages-browser.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
