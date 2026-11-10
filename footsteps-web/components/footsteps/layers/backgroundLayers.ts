import { GeoJsonLayer, PolygonLayer } from '@deck.gl/layers';
import { COORDINATE_SYSTEM } from '@deck.gl/core';

// Create sea layer factory function
export function createSeaLayer() {
  // Use PolygonLayer directly to avoid GeoJSON tesselation edge-cases.
  const ring: [number, number][] = [
    [-179, -85],
    [179, -85],
    [179, 85],
    [-179, 85],
    [-179, -85],
  ];
  const data = [{ id: 'sea', polygon: ring }];

  return new PolygonLayer({
    id: 'plain-sea',
    data,
    getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
    filled: true,
    stroked: false,
    getFillColor: [20, 30, 45, 255],
    pickable: false,
    opacity: 1.0,
    wrapLongitude: true,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    parameters: {
      depthTest: false,
      depthMask: false,
      blend: true,
      blendFunc: [770, 771],
    },
  });
}

function sanitizeGeoJSON<LayerDataT = unknown>(
  raw: unknown,
  _previousData?: LayerDataT,
): LayerDataT {
  try {
    const gj = raw as { type?: string; features?: any[] };
    if (!gj || gj.type !== 'FeatureCollection' || !Array.isArray(gj.features)) {
      return { type: 'FeatureCollection', features: [] } as unknown as LayerDataT;
    }
    const clean = gj.features.filter((f) => {
      try {
        const geom = f?.geometry;
        if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return false;
        const coords = geom.coordinates;
        const validNum = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
        const inRangeLng = (n: number) => n >= -180 && n <= 180;
        const inRangeLat = (n: number) => n >= -85 && n <= 85; // avoid poles

        const validateRing = (ring: any[]) =>
          Array.isArray(ring) &&
          ring.length >= 4 &&
          ring.every((p) => Array.isArray(p) && validNum(p[0]) && validNum(p[1]) && inRangeLng(p[0]) && inRangeLat(p[1]));

        if (geom.type === 'Polygon') return validateRing(coords?.[0] || []);
        if (geom.type === 'MultiPolygon') {
          return Array.isArray(coords) && coords.some((poly: any[]) => validateRing(poly?.[0] || []));
        }
        return false;
      } catch {
        return false;
      }
    });
    return { type: 'FeatureCollection', features: clean } as unknown as LayerDataT;
  } catch {
    return { type: 'FeatureCollection', features: [] } as unknown as LayerDataT;
  }
}

export function createContinentsLayer() {
  return new GeoJsonLayer({
    id: 'plain-continents',
    data: '/world-simple.geojson',
    dataTransform: sanitizeGeoJSON,
    filled: true,
    stroked: false,
    getFillColor: [15, 15, 15, 255],
    pickable: false,
    opacity: 1.0,
    wrapLongitude: true,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    parameters: {
      depthTest: false,
      depthMask: false,
      blend: true,
      blendFunc: [770, 771],
    },
  });
}

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
