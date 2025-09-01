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
    // If an absolute origin is provided, rewrite /pmtiles/* to that origin.
    // Otherwise, do NOT rewrite so that /pmtiles/* is served from Next public/pmtiles.
    const envBase = process.env.NEXT_PUBLIC_CDN_HOST || '';
    const originFromEnv = process.env.PMTILES_ORIGIN;
    const isAbs = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

    if (isAbs(originFromEnv)) {
      const trimmed = originFromEnv.replace(/\/+$/, '');
      return [{ source: '/pmtiles/:path*', destination: `${trimmed}/:path*` }];
    }
    if (isAbs(envBase)) {
      const trimmed = envBase.replace(/\/+$/, '');
      return [{ source: '/pmtiles/:path*', destination: `${trimmed}/:path*` }];
    }
    // No rewrites -> serve from public/pmtiles
    return [];
  },
};

module.exports = nextConfig;
