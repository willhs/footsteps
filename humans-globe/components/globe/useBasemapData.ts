import { useEffect, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import basemapFallback from './basemapData';

interface BasemapHook {
  basemapData: FeatureCollection;
  basemapError: boolean;
}

export default function useBasemapData(): BasemapHook {
  const [basemapData, setBasemapData] = useState<FeatureCollection>(basemapFallback);
  const [basemapError, setBasemapError] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      const sources = [
        'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/physical/ne_50m_land.json',
        'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/110m/physical/ne_110m_land.json',
        'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson',
        'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'
      ];

      const tryLoadSource = (index = 0): void => {
        if (index >= sources.length || controller.signal.aborted) {
          return;
        }

        fetch(sources[index], { signal: controller.signal })
          .then(res => {
            if (!res.ok) throw new Error('Failed to load');
            return res.json();
          })
          .then((data: FeatureCollection) => {
            setBasemapData(data);
            setBasemapError(false);
          })
          .catch(() => {
            tryLoadSource(index + 1);
          });
      };

      tryLoadSource();
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  return { basemapData, basemapError };
}
