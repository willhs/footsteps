import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

export interface HumanDot {
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    population: number;
    year: number;
    type: string;
  };
}

export const DOT_LIMIT = 5000000;
export const MAX_RENDER_DOTS = 35000;

export default function useHumanDotsData(
  year: number,
  zoom: number,
  viewportBounds: number[] | null
) {
  const [humanDotsData, setHumanDotsData] = useState<HumanDot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataCache = useRef<Map<string, HumanDot[]>>(new Map());
  const activeRequests = useRef<Set<string>>(new Set());
  const [renderMetrics, setRenderMetrics] = useState({
    loadTime: 0,
    processTime: 0,
    renderTime: 0,
    lastUpdate: 0
  });

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const getLODLevel = (zoomValue: number): number => {
    if (zoomValue < 4) return 1;
    if (zoomValue < 6) return 2;
    return 3;
  };

  const getCacheKey = useCallback((
    yearValue: number,
    zoomValue: number,
    bounds?: number[]
  ): string => {
    const lodLevel = getLODLevel(zoomValue);
    const boundsKey = bounds
      ? `-${bounds.map(b => Math.round(b * 2) / 2).join(',')}`
      : '';
    return `${yearValue}-lod${lodLevel}${boundsKey}`;
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const loadData = async () => {
        const cacheKey = getCacheKey(year, zoom, viewportBounds || undefined);

        try {
          if (dataCache.current.has(cacheKey)) {
            const cached = dataCache.current.get(cacheKey)!;
            setHumanDotsData(cached);
            setLoading(false);
            setError(null);
            return;
          }

          if (activeRequests.current.has(cacheKey)) {
            return;
          }

          activeRequests.current.add(cacheKey);
          setLoading(true);
          const startTime = performance.now();

          let boundsQuery = '';
          if (viewportBounds) {
            const [minLon, minLat, maxLon, maxLat] = viewportBounds;
            boundsQuery = `&minLon=${minLon}&maxLon=${maxLon}&minLat=${minLat}&maxLat=${maxLat}`;
          }

          const response = await fetch(
            `/api/human-dots?year=${year}&limit=${DOT_LIMIT}&zoom=${zoom}${boundsQuery}`
          );
          if (!response.ok) {
            throw new Error('Failed to load human dots data');
          }

          const loadEndTime = performance.now();
          const data = await response.json();
          const features = data.features || [];
          const processEndTime = performance.now();

          dataCache.current.set(cacheKey, features);
          setHumanDotsData(features);
          setError(null);
          setLoading(false);

          setRenderMetrics({
            loadTime: loadEndTime - startTime,
            processTime: processEndTime - loadEndTime,
            renderTime: 0,
            lastUpdate: Date.now()
          });
        } catch {
          setError('No processed data found. Run the data processing pipeline first.');
          setHumanDotsData([]);
          setLoading(false);
        } finally {
          activeRequests.current.delete(cacheKey);
        }
      };

      loadData();
  }, 150);
  }, [year, zoom, viewportBounds, getCacheKey]);

  const currentHumanDots = useMemo(() => {
    try {
      if (!Array.isArray(humanDotsData) || humanDotsData.length === 0) {
        return [] as HumanDot[];
      }

      const validDots = humanDotsData.filter(dot => {
        if (!dot || !dot.properties || !dot.geometry || !dot.geometry.coordinates) {
          return false;
        }
        const coords = dot.geometry.coordinates;
        if (!Array.isArray(coords) || coords.length !== 2) {
          return false;
        }
        const [lon, lat] = coords;
        if (
          typeof lon !== 'number' ||
          typeof lat !== 'number' ||
          !isFinite(lon) ||
          !isFinite(lat) ||
          Math.abs(lon) > 180 ||
          Math.abs(lat) > 90
        ) {
          return false;
        }
        return true;
      });

      return validDots.sort(
        (a, b) => (b.properties?.population || 0) - (a.properties?.population || 0)
      );
    } catch (err) {
      console.error('Error processing human dots data:', err);
      return [] as HumanDot[];
    }
  }, [humanDotsData]);

  const samplingRate = useMemo(() => {
    if (humanDotsData.length === 0) return 100;
    return (currentHumanDots.length / humanDotsData.length) * 100;
  }, [humanDotsData, currentHumanDots]);

  const visibleHumanDots = useMemo(() => {
    if (currentHumanDots.length === 0) return [] as HumanDot[];
    return currentHumanDots.slice(0, MAX_RENDER_DOTS);
  }, [currentHumanDots]);

  return {
    humanDotsData,
    loading,
    error,
    dataCache: dataCache.current,
    visibleHumanDots,
    samplingRate,
    renderMetrics
  };
}
