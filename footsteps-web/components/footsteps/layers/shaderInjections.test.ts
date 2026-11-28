// deck.gl's mergeShaders joins every extension's injection for a hook as text, in extension order. An injection written as
// `{ order, injection }` only works while it is alone on its hook; beside another it becomes "[object Object]" in the shader
// and the layer fails to compile (2026-11-24: ?sky=1 with ?ground=1 or ?weather=1 on the close-up). Keep them strings.
import SkyLight, { SkyTint } from './skyLight';
import NightExtension from './NightExtension';
import GroundDetail, { FieldDetail } from './groundDetail';

describe('shader extensions', () => {
  it.each([
    ['skyLight', new SkyLight()],
    ['SkyTint', new SkyTint()],
    ['NightExtension', new NightExtension()],
    ['groundDetail', new GroundDetail()],
    ['FieldDetail', new FieldDetail()],
  ])('%s injects plain strings only, so it can share a hook with another extension', (_name, ext) => {
    const shaders = (ext as unknown as { getShaders: (this: unknown) => { inject?: Record<string, unknown> } }).getShaders.call({ props: {}, opts: {} });
    for (const [hook, code] of Object.entries(shaders.inject ?? {})) expect([hook, typeof code]).toEqual([hook, 'string']);
  });
});

// A layer whose `fs:#main-end` writes fragColor replaces the colour the extensions already filtered, so the night shading
// (NightExtension) vanished on the terrain detail and relief layers from zoom 3 (2026-11-28). Such a layer must filter again.
describe('layers that rewrite the colour at the end of main', () => {
  const fs = jest.requireActual<typeof import('fs')>('fs');
  const path = jest.requireActual<typeof import('path')>('path');
  const files = fs.readdirSync(__dirname).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f));
  const rewriters = files.filter((f) => /'fs:#main-end':\s*`[^`]*fragColor\s*=/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')));

  it('finds the terrain layers', () => {
    expect(rewriters).toEqual(expect.arrayContaining(['TerrainDetailLayer.ts', 'TerrainReliefLayer.ts']));
  });

  it.each(rewriters)('%s runs DECKGL_FILTER_COLOR after it writes fragColor', (file) => {
    const block = /'fs:#main-end':\s*`([^`]*)`/.exec(fs.readFileSync(path.join(__dirname, file), 'utf8'))![1];
    expect(block.lastIndexOf('DECKGL_FILTER_COLOR(fragColor')).toBeGreaterThan(block.lastIndexOf('fragColor ='));
  });
});
