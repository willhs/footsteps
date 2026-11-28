// deck.gl's mergeShaders joins every extension's injection for a hook as text, in extension order. An injection written as
// `{ order, injection }` only works while it is alone on its hook; beside another it becomes "[object Object]" in the shader
// and the layer fails to compile (2026-11-24: ?sky=1 with ?ground=1 or ?weather=1 on the close-up). Keep them strings.
import SkyLight, { SkyTint } from './skyLight';
import NightExtension from './NightExtension';
import GroundDetail from './groundDetail';

describe('shader extensions', () => {
  it.each([
    ['skyLight', new SkyLight()],
    ['SkyTint', new SkyTint()],
    ['NightExtension', new NightExtension()],
    ['groundDetail', new GroundDetail()],
  ])('%s injects plain strings only, so it can share a hook with another extension', (_name, ext) => {
    const shaders = (ext as unknown as { getShaders: (this: unknown) => { inject?: Record<string, unknown> } }).getShaders.call({ props: {}, opts: {} });
    for (const [hook, code] of Object.entries(shaders.inject ?? {})) expect([hook, typeof code]).toEqual([hook, 'string']);
  });
});
