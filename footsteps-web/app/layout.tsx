import type { Metadata } from 'next';
import './globals.css';
import NetworkIndicator from '@/components/ui/NetworkIndicator';
import ServiceWorkerRegistrar from '@/components/ui/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: 'footsteps',
  description: 'Watch humanity spread across Earth from 100,000 BCE to today',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Preconnect to the tiles CDN. If NEXT_PUBLIC_CDN_HOST is absolute, use it; otherwise
  // default to the public CDN domain. Avoid relying on a server-side proxy in prod.
  const host = (process.env.NEXT_PUBLIC_CDN_HOST || '').replace(/\/$/, '');
  const preconnectOrigin = /^https?:\/\//i.test(host) ? host : 'https://pmtiles.willhs.me';
  return (
    <html lang="en">
      <head>
        {/* Reduce connection setup latency for tiles CDN */}
        <link rel="preconnect" href={preconnectOrigin} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={preconnectOrigin} />
      </head>
      <body>
        {children}
        {/* Global, subtle network activity indicator */}
        <NetworkIndicator />
        {/* Register Service Worker for persistent tile block caching */}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
