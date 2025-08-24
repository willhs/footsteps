'use client';

import { useEffect, useState } from 'react';
const DEBUG = process.env.NEXT_PUBLIC_DEBUG_LOGS === '1';

export interface RenderMetrics {
  loadTime: number;
  processTime: number;
  renderTime: number;
  lastUpdate: number;
}

/**
 * Hook to track and log render performance metrics.
 *
 * @param dotCount Number of dots currently rendered on the globe
 * @param zoom Current zoom level of the globe view state
 */
export default function useRenderMetrics(dotCount: number, zoom: number) {
  const [renderMetrics, setRenderMetrics] = useState<RenderMetrics>({
    loadTime: 0,
    processTime: 0,
    renderTime: 0,
    lastUpdate: 0
  });

  // Log render timings via requestAnimationFrame
  useEffect(() => {
    const renderStart = performance.now();
    requestAnimationFrame(() => {
      const renderEnd = performance.now();
      const renderTime = renderEnd - renderStart;

      // Only log noticeable frame drops
      if (DEBUG && renderTime > 16) {
        console.log(
          `⚡ Render: ${renderTime.toFixed(1)}ms with ${dotCount} dots at zoom ${zoom.toFixed(
            2
          )}`
        );
      }

      setRenderMetrics(prev => ({ ...prev, renderTime }));
    });
  }, [dotCount, zoom]);

  // Update metrics after data loads
  const updateMetrics = (loadTime: number, processTime: number) => {
    setRenderMetrics(prev => ({
      ...prev,
      loadTime,
      processTime,
      lastUpdate: Date.now()
    }));
  };

  return { renderMetrics, updateMetrics };
}