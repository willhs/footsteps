import type { Metadata } from 'next';
import './globals.css';
import NetworkIndicator from '../components/ui/NetworkIndicator';
import ServiceWorkerRegistrar from '../components/ui/ServiceWorkerRegistrar';
import TileCacheIndicator from '../components/ui/TileCacheIndicator';

export const metadata: Metadata = {
  title: 'footsteps',
  description: 'Watch humanity spread across Earth from 100,000 BCE to today',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cdn = (process.env.NEXT_PUBLIC_CDN_HOST || 'https://pmtiles.willhs.me').replace(/\/$/, '');
  return (
    <html lang="en">
      <head>
        {/* Reduce connection setup latency for tiles CDN */}
        <link rel="preconnect" href={cdn} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={cdn} />
      </head>
      <body>
        {children}
        {/* Global, subtle network activity indicator */}
        <NetworkIndicator />
        {/* Subtle cache indicator (memory/LRU) */}
        <TileCacheIndicator />
        {/* Register Service Worker for persistent tile block caching */}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
