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
    };

    return config;
  },
  // No rewrites needed in static export mode
};

module.exports = nextConfig;
