const path = require('path');

// The real (ESM-only) TinySDF, resolved from deck.gl's own dependencies (pnpm does not hoist it).
const TINY_SDF = require.resolve('@mapbox/tiny-sdf', { paths: [path.dirname(require.resolve('@deck.gl/layers'))] });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export for CDN hosting
  output: 'export',
  // Removed experimental.esmExternals as recommended by Next.js
  webpack: (config) => {
    // Handle deck.gl dependencies
    config.resolve.alias = {
      ...config.resolve.alias,
      '@deck.gl/core': require.resolve('@deck.gl/core'),
      '@deck.gl/layers': require.resolve('@deck.gl/layers'),
      '@deck.gl/react': require.resolve('@deck.gl/react'),
      // One copy of luma.gl's shader assembler: an ESM-loaded deck.gl package gets an assembler
      // without deck.gl's DECKGL_FILTER_* hooks and its shaders fail to compile.
      '@deck.gl/mesh-layers': require.resolve('@deck.gl/mesh-layers'),
      // TextLayer's font atlas: see lib/shims/tinySdf.cjs.
      '@mapbox/tiny-sdf$': path.resolve(__dirname, 'lib/shims/tinySdf.cjs'),
      'tiny-sdf-esm$': TINY_SDF,
    };

    return config;
  },
  // No rewrites needed in static export mode
};

module.exports = nextConfig;
