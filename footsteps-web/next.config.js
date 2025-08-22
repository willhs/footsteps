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
      '@deck.gl/react': require.resolve('@deck.gl/react')
    };
    
    return config;
  }
};

module.exports = nextConfig;
