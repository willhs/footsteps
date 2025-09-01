'use client';

import { useEffect } from 'react';
import { isServiceWorkerEnabled, isDebugEnabled } from '@/lib/env';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Opt-in via env to avoid interfering with browser HTTP cache.
    // Default: do NOT register, so tiles use normal browser/disk cache.
    const enabled = isServiceWorkerEnabled();
    if (!enabled) {
      // If a SW was registered previously, proactively unregister it so
      // requests go straight to the network + HTTP cache.
      try {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => {
            for (const reg of regs) {
              reg.unregister().catch(() => {});
            }
          })
          .catch(() => {});
      } catch {}
      return;
    }

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });
        if (isDebugEnabled()) {
          console.debug('[SW] registered', reg.scope);
        }
      } catch (err) {
        if (isDebugEnabled()) {
          console.warn('[SW] registration failed', err);
        }
      }
    };

    register();
  }, []);

  return null;
}
