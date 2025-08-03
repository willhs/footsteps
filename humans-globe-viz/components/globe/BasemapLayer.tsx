import { GeoJsonLayer } from '@deck.gl/layers';

interface BasemapLayerProps {
  data: any;
  basemapError: boolean;
}

export function createBasemapLayer({ data, basemapError }: BasemapLayerProps) {
  return new GeoJsonLayer({
    id: 'land-layer',
    data: data || { type: 'FeatureCollection', features: [] },
    filled: true,
    // Disable stroke so internal country borders are not drawn
    stroked: false,
    getFillColor: basemapError ? [60, 80, 100, 120] : [40, 60, 80, 180],
    pickable: false,
    opacity: 1.0,
    updateTriggers: {
      data: data,
      getFillColor: basemapError
    }
  });
}
