const path = require('path');

// The real (ESM-only) TinySDF, resolved from deck.gl's own dependencies (pnpm does not hoist it).
const TINY_SDF = require.resolve('@mapbox/tiny-sdf', { paths: [path.dirname(require.resolve('@deck.gl/layers'))] });

/** Writes { chunkFile: { initial, modules: { path: bytes } } } for the client build; off unless BUNDLE_REPORT is set. */
class BundleReport {
  constructor(file) {
    this.file = path.resolve(file);
  }
  apply(compiler) {
    compiler.hooks.afterEmit.tap('BundleReport', (compilation) => {
      const out = {};
      for (const chunk of compilation.chunks) {
        const modules = {};
        for (const m of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
          const inner = m.modules ?? [m]; // concatenated modules list their parts
          for (const part of inner) {
            const name = (part.resource ?? part.identifier()).replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, '').replace(__dirname + '/', '');
            modules[name] = (modules[name] ?? 0) + part.size();
          }
        }
        for (const file of chunk.files) if (file.endsWith('.js')) out[file] = { initial: chunk.canBeInitial(), modules };
      }
      require('fs').writeFileSync(this.file, JSON.stringify(out));
    });
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export for CDN hosting
  output: 'export',
  // Removed experimental.esmExternals as recommended by Next.js
  webpack: (config, { isServer }) => {
    // deck.gl and luma.gl resolve to their ES module builds, so webpack shakes out what the app does not use
    // (docs/ops/first-load.md). They used to be aliased to the CommonJS builds, which ship whole: @deck.gl/mesh-layers alone
    // pulled in the glTF, Draco and KTX loaders and apache-arrow. Keep every deck.gl package on the same build: a mix
    // (one CJS, one ESM) gives two luma.gl shader assemblers and the ESM one's shaders lose deck.gl's DECKGL_FILTER_* hooks.
    config.resolve.alias = {
      ...config.resolve.alias,
      // TextLayer's font atlas: see lib/shims/tinySdf.cjs.
      '@mapbox/tiny-sdf$': path.resolve(__dirname, 'lib/shims/tinySdf.cjs'),
      'tiny-sdf-esm$': TINY_SDF,
    };

    // BUNDLE_REPORT=file.json: which modules each client chunk carries (scripts/first-load.mjs reads it; docs/ops/first-load.md).
    if (process.env.BUNDLE_REPORT && !isServer) config.plugins.push(new BundleReport(process.env.BUNDLE_REPORT));
    return config;
  },
  // No rewrites needed in static export mode
};

module.exports = nextConfig;
