// Sums the served people images in boxes, per year: node measure.js BOXES_JSON YEARS_JSON
// BOXES_JSON maps a name to [west, south, east, north]; needs Playwright and footsteps.willhs.me. Used by research 0019.
const { chromium } = require('playwright');
const [,, boxesJson, yearsJson] = process.argv;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('https://footsteps.willhs.me/favicon.ico').catch(()=>{});
  const out = await p.evaluate(async ([BOXES, YEARS]) => {
    const read = async (url) => { const r = await fetch(url); if (!r.ok) return null;
      const bmp = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(bmp, 0, 0); return g.getImageData(0, 0, bmp.width, bmp.height); };
    const LOG = Math.log1p(5e6); const rows = ['year\tbox\tpeople\tcells\tkm2\tdens/km2\tcropcells'];
    for (const y of YEARS) {
      const [pop, lu] = await Promise.all([read(`/grid/humans_${y}.webp`), read(`/grid/landuse_${y}.png`)]);
      if (!pop) { rows.push(`${y}\tnoimg`); continue; }
      const W = pop.width, H = pop.height, d = 360 / W;
      for (const [name, [x0, y0, x1, y1]] of Object.entries(BOXES)) {
        let people = 0, cells = 0, km2 = 0, crop = 0;
        const c0 = Math.floor((x0 + 180) / d), c1 = Math.ceil((x1 + 180) / d), r0 = Math.floor((90 - y1) / d), r1 = Math.ceil((90 - y0) / d);
        for (let r = r0; r < Math.min(H, r1); r++) for (let c = c0; c < Math.min(W, c1); c++) {
          const i = (r * W + c) * 4; const q = (pop.data[i] << 8) | pop.data[i + 1]; if (!q) continue;
          const lat = 90 - (r + 0.5) * d; cells++; people += Math.expm1((q / 1023) * LOG);
          km2 += (111.32 * d) ** 2 * Math.cos(lat * Math.PI / 180);
          if (lu && lu.data[i] / 255 >= 0.02) crop++;
        }
        rows.push(`${y}\t${name}\t${Math.round(people)}\t${cells}\t${Math.round(km2)}\t${(people / km2).toFixed(3)}\t${crop}`);
      }
    }
    return rows.join('\n');
  }, [JSON.parse(boxesJson), JSON.parse(yearsJson)]);
  console.log(out); await b.close();
})();
