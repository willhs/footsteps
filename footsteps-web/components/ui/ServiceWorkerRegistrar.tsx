'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Register only in production; allow localhost for dev
    const isLocalhost = typeof window !== 'undefined' && /^localhost$|^127\.|^\[::1\]$/.test(window.location.hostname);
    const isProd = process.env.NODE_ENV === 'production' || isLocalhost;
    if (!isProd) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if ((process.env.NEXT_PUBLIC_DEBUG_LOGS || 'false') === 'true') {
          console.debug('[SW] registered', reg.scope);
        }
      } catch (err) {
        if ((process.env.NEXT_PUBLIC_DEBUG_LOGS || 'false') === 'true') {
          console.warn('[SW] registration failed', err);
        }
      }
    };

    register();
  }, []);

  return null;
}
