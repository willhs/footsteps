'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getTilesBaseUrl } from '@/lib/tilesConfig';

/**
 * Subtle, global network activity indicator for tile downloads.
 *
 * Design:
 * - Thin 2px bar at top, animated shimmer, fades in/out gently.
 * - No blocking; respects reduced motion.
 * - Only activates for tile requests (MVT .pbf under configured tiles base).
 */
export default function NetworkIndicator() {
  const base = useMemo(() => getTilesBaseUrl(), []);
  const pendingCount = useRef(0);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const isTileRequest = (input: RequestInfo | URL) => {
      try {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
        // Match .pbf or the configured tiles base URL
        return url.includes('.pbf') || url.startsWith(base);
      } catch {
        return false;
      }
    };

    const scheduleShow = () => {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (active) return;
      if (showTimer.current) return;
      showTimer.current = window.setTimeout(() => {
        setActive(true);
        showTimer.current = null;
      }, 80); // slightly quicker to notice, still avoids flicker
    };

    const scheduleHide = () => {
      if (showTimer.current) {
        window.clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (hideTimer.current) return;
      hideTimer.current = window.setTimeout(() => {
        setActive(false);
        hideTimer.current = null;
      }, 450); // linger a bit longer to be more noticeable
    };

    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const watch = isTileRequest(args[0]);
      if (watch) {
        pendingCount.current += 1;
        scheduleShow();
      }
      try {
        const res = await origFetch(...args);
        return res;
      } finally {
        if (watch) {
          pendingCount.current = Math.max(0, pendingCount.current - 1);
          if (pendingCount.current === 0) scheduleHide();
        }
      }
    };

    // Also patch XHR for libraries that may use it internally
    const OrigXHR = window.XMLHttpRequest;
    function PatchedXHR(this: XMLHttpRequest) {
      const xhr = new OrigXHR();
      let watched = false;
      const origOpen = xhr.open.bind(xhr);
      xhr.open = function (method: string, url: string, ...rest: unknown[]) {
        try {
          if (isTileRequest(url)) {
            watched = true;
            pendingCount.current += 1;
            scheduleShow();
          }
        } catch {}
        return origOpen(method, url, ...rest as [boolean, string?, string?]);
      };
      xhr.addEventListener('loadend', () => {
        if (watched) {
          pendingCount.current = Math.max(0, pendingCount.current - 1);
          if (pendingCount.current === 0) scheduleHide();
        }
      });
      return xhr;
    }
    window.XMLHttpRequest = PatchedXHR as unknown as typeof XMLHttpRequest;

    return () => {
      // Best-effort: restore fetch; XHR restore is not critical in SPA
      window.fetch = origFetch;
      window.XMLHttpRequest = OrigXHR;
      if (showTimer.current) window.clearTimeout(showTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [active, base]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={`loading-bar ${active ? 'loading-bar-active' : ''}`}
      role="status"
    >
      <span className="sr-only">Loading map tiles…</span>
    </div>
  );
}
