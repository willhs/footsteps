/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone output for Docker deployment
  output: 'standalone',
  // Disable ESLint during build for initial deployment
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable TypeScript checking during build for initial deployment
  typescript: {
    ignoreBuildErrors: true,
  },
  // Removed experimental.esmExternals as recommended by Next.js
  webpack: (config) => {
    // Handle deck.gl dependencies
    config.resolve.alias = {
      ...config.resolve.alias,
      '@deck.gl/core': require.resolve('@deck.gl/core'),
      '@deck.gl/layers': require.resolve('@deck.gl/layers'),
      '@deck.gl/react': require.resolve('@deck.gl/react'),
    };

    return config;
  },
  async rewrites() {
    // Use absolute origin for rewrite destination. If NEXT_PUBLIC_CDN_HOST is
    // a relative path in dev (e.g. '/pmtiles'), fall back to default origin.
    const envBase = process.env.NEXT_PUBLIC_CDN_HOST || 'https://pmtiles.willhs.me';
    const isAbsolute = /^https?:\/\//i.test(envBase);
    const origin = (process.env.PMTILES_ORIGIN && /^https?:\/\//i.test(process.env.PMTILES_ORIGIN))
      ? process.env.PMTILES_ORIGIN
      : (isAbsolute ? envBase : 'https://pmtiles.willhs.me');
    const trimmed = origin.replace(/\/+$/, '');
    return [
      {
        source: '/pmtiles/:path*',
        destination: `${trimmed}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
