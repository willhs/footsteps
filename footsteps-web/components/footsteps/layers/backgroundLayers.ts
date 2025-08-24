import { GeoJsonLayer, BitmapLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
const DEBUG = process.env.NEXT_PUBLIC_DEBUG_LOGS === '1';

// Create sea layer factory function
export function createSeaLayer() {
  return new GeoJsonLayer({
    id: 'plain-sea',
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
    getFillColor: [20, 30, 45, 255], // Dark blue for sea
    pickable: false,
    opacity: 1.0,
    parameters: {
      depthTest: true,
      depthMask: true,
      blend: false,
    },
  });
}

export function createContinentsLayer() {
  return new GeoJsonLayer({
    id: 'plain-continents',
    // Using a more reliable CDN for world land data
    data: 'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson',
    filled: true,
    stroked: false,
    getFillColor: [15, 15, 15, 255], // Very dark gray/black for continents
    pickable: false,
    opacity: 1.0,
    parameters: {
      depthTest: true,
      depthMask: false, // Don't write to depth buffer so dots render on top
      blend: true,
    },
  });
}

export function createTerrainLayer() {
  return new TileLayer({
    id: 'terrain-layer',
    // Using satellite imagery that shows natural land and water colors without labels
    data: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 8,
    minZoom: 0,
    // Provide no-op callbacks to satisfy deck.gl TileLayer expectations
    onTileLoad: () => {},
    onViewportLoad: () => {},
    onTileError: () => {},
    // Only render the sub-layer once the tile image has loaded.
    // Otherwise DeckGL will attempt to create a BitmapLayer with
    // an undefined image which triggers an `assert` failure under
    // WebGL. This manifests as large dark artefacts on first load
    // when the page is opened directly in 3-D mode.
    renderSubLayers: (props) => {
      // Skip if tile image hasn't loaded yet
      if (!props.data) {
        return null;
      }

      // Defensive: ensure bounding box exists & values are finite
      const { boundingBox } = props.tile ?? {};
      if (
        !boundingBox ||
        !Number.isFinite(boundingBox[0]?.[0]) ||
        !Number.isFinite(boundingBox[0]?.[1]) ||
        !Number.isFinite(boundingBox[1]?.[0]) ||
        !Number.isFinite(boundingBox[1]?.[1])
      ) {
        if (DEBUG) {
          /* eslint-disable no-console */
          console.warn(
            '[terrain-layer] invalid boundingBox, skipping sub-layer',
            boundingBox,
          );
          /* eslint-enable no-console */
        }
        return null;
      }

      return new BitmapLayer(props, {
        id: `${props.id}-bitmap`,
        data: undefined,
        image: props.data,
        bounds: [
          boundingBox[0][0],
          boundingBox[0][1],
          boundingBox[1][0],
          boundingBox[1][1],
        ],
        // Small optimisation: disable updates once image is set
        updateTriggers: {
          image: props.data,
        },
      });
    },
    pickable: false,
    opacity: 1.0, // Full opacity to prevent seeing through globe
    parameters: {
      depthTest: true, // Enable depth testing for proper layering
      depthMask: true, // Write to depth buffer to block background
      blend: false, // Disable blending for solid coverage
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
    parameters: {
      depthTest: true, // Enable depth testing for proper 3D rendering
      depthMask: true, // Write to depth buffer
      blend: false, // No blending needed for solid base layer
    },
  });
}

// Create static terrain layer for land/water visualization
export function createStaticTerrainLayer() {
  return createTerrainLayer();
}

