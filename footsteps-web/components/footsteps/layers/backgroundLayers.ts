import { GeoJsonLayer } from '@deck.gl/layers';
import { COORDINATE_SYSTEM } from '@deck.gl/core';

// Create basemap layer
export function createBasemapLayer(data: unknown, basemapError: boolean) {
  return new GeoJsonLayer({
    id: 'land-layer',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: (data as any) || ({ type: 'FeatureCollection', features: [] } as any),
    filled: true,
    // Disable stroke so internal country borders are not drawn
    stroked: false,
    getFillColor: basemapError ? [60, 80, 100, 120] : [40, 60, 80, 140], // Increased alpha for better coverage
    pickable: false,
    opacity: 1.0,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    parameters: {
      depthTest: true, // Enable depth testing for proper layering
      depthMask: false, // Don't write to depth buffer
      blend: true, // Enable blending with underlying layers
    },
    updateTriggers: {
      data: data,
      getFillColor: basemapError,
    },
  });
}

// Create a solid earth sphere for 3D globe mode to prevent transparency
export function createEarthSphereLayer() {
  // Create a solid earth sphere that completely covers the globe
  return new GeoJsonLayer({
    id: 'earth-sphere',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-180, -90],
                [180, -90],
                [180, 90],
                [-180, 90],
                [-180, -90],
              ],
            ],
          },
        },
      ],
    },
    filled: true,
    stroked: false,
    getFillColor: [20, 30, 50, 255], // Solid dark blue for earth base
    pickable: false,
    opacity: 1.0, // Fully opaque to prevent seeing through
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    parameters: {
      depthTest: true, // Enable depth testing for proper 3D rendering
      depthMask: true, // Write to depth buffer
      blend: false, // No blending needed for solid base layer
    },
  });
}
