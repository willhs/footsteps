import { GeoJsonLayer, BitmapLayer } from '@deck.gl/layers';
import { TileLayer, MVTLayer } from '@deck.gl/geo-layers';

// Strategy pattern for radius calculation
interface RadiusStrategy {
  calculateRadius(baseRadius: number, zoom: number): number;
  getName(): string;
}

// Linear strategy: uses pre-computed radius as-is for geographic accuracy
class LinearRadiusStrategy implements RadiusStrategy {
  calculateRadius(baseRadius: number, _zoom: number): number {
    // reference to satisfy no-unused-vars when argsIgnorePattern isn't set
    void _zoom;
    return baseRadius;
  }
  
  getName(): string {
    return 'linear';
  }
}

// Zoom-adaptive strategy: scales radius based on zoom level for better visibility
class ZoomAdaptiveRadiusStrategy implements RadiusStrategy {
  calculateRadius(baseRadius: number, zoom: number): number {
    const multiplier = this.getZoomMultiplier(zoom);
    return baseRadius * multiplier;
  }
  
  private getZoomMultiplier(zoom: number): number {
    if (zoom < 3) return 6;    // Global view: 6x boost for visibility
    if (zoom < 5) return 3;    // Regional view: 3x boost
    // Maintain perceived density across the LOD 2 -> LOD 3 boundary
    if (zoom < 7) return 1.5;  // Local view: 1.5x boost
    return 1.5;                // Detailed view: keep size to avoid sudden area drop at LOD 3
  }
  
  getName(): string {
    return 'zoom-adaptive';
  }
}

// 3D Globe strategy: smaller, more realistic radii for sphere visibility
class Globe3DRadiusStrategy implements RadiusStrategy {
  calculateRadius(baseRadius: number, zoom: number): number {
    // Smaller scaling for 3D globe view - more realistic sizes
    const scaledRadius = Math.max(baseRadius * 0.5, 5000); // Minimum 5km
    
    // Balanced zoom scaling: prevent dots from being too big OR too small
    // Range: zoom -3 to 10 (13 levels total)
    if (zoom < -2) return scaledRadius * 2.5;  // Very far out: large for visibility
    if (zoom < 0) return scaledRadius * 2;     // Far out: large-medium
    if (zoom < 2) return scaledRadius * 1.5;   // Medium distance: moderate
    if (zoom < 4) return scaledRadius * 1.2;   // Getting closer: slightly larger than base
    if (zoom < 6) return scaledRadius * 1;     // Close: normal size (base)
    // Maintain density for close views (LOD 3+); avoid shrinking at high zoom
    return scaledRadius * 1;                    // Very close & maximum zoom: keep base size
  }
  
  getName(): string {
    return 'globe-3d';
  }
}

// Available strategies
export const radiusStrategies = {
  linear: new LinearRadiusStrategy(),
  zoomAdaptive: new ZoomAdaptiveRadiusStrategy(),
  globe3D: new Globe3DRadiusStrategy()
};

// Helper: map population to a base display radius in meters
function getBaseRadiusFromPopulation(population: number): number {
  if (population > 1_000_000) return 60000;   // Super cities: 60km
  if (population > 100_000) return 40000;     // Massive cities: 40km
  if (population > 50_000) return 25000;      // Major cities: 25km
  if (population > 20_000) return 15000;      // Large settlements: 15km
  if (population > 5_000) return 8000;        // Medium settlements: 8km
  if (population > 1_000) return 4000;        // Small settlements: 4km
  if (population > 100) return 2000;          // Villages: 2km
  return 1000;                                // Tiny settlements: 1km
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
    getFillColor: basemapError ? [60, 80, 100, 120] : [40, 60, 80, 140],  // Increased alpha for better coverage
    pickable: false,
    opacity: 1.0,
    parameters: {
      depthTest: true,   // Enable depth testing for proper layering
      depthMask: false,  // Don't write to depth buffer
      blend: true        // Enable blending with underlying layers
    },
    updateTriggers: {
      data: data,
      getFillColor: basemapError
    }
  });
}

// Global layer counter to ensure unique IDs
let layerCounter = 0;

// Create MVT-based human tiles layer
export function createHumanTilesLayer(
  year: number,
  lodLevel: number,
  viewState: { zoom?: number } | null,
  radiusStrategy: RadiusStrategy = radiusStrategies.zoomAdaptive,
  onClick?: (info: unknown) => void,
  onHover?: (info: unknown) => void,
  extra?: { onTileLoad?: (tile: unknown) => void; onViewportLoad?: (tiles: unknown[]) => void; onTileError?: (error: unknown) => void },
  opacity: number = 1.0,
  instanceId?: string,
  enableDepthTest: boolean = true,
  singleLayerMode: boolean = false
) {
  const currentZoom = viewState?.zoom || 1;
  
  // Generate unique layer ID to prevent deck.gl assertion failures from layer reuse
  const baseId = singleLayerMode
    ? `human-tiles-${year}-single-${radiusStrategy.getName()}`
    : `human-tiles-${year}-lod${lodLevel}-${radiusStrategy.getName()}`;
  const layerId = instanceId || `${baseId}-${++layerCounter}-${Date.now()}`;
  
  // Clamp tile zooms to the ranges actually present in each LOD's MBTiles.
  // This prevents deck.gl from requesting higher z tiles than exist when the
  // viewport zoom is between integer levels (e.g. z=4.8 with LOD 1 → still use z=4 tiles).
  const lodZoomRanges: Record<number, { min: number; max: number }> = {
    0: { min: 0, max: 3 },
    1: { min: 4, max: 4 },
    2: { min: 5, max: 5 },
    3: { min: 6, max: 12 },
  };
  const zoomRange = singleLayerMode ? { min: 0, max: 12 } : (lodZoomRanges[lodLevel] || { min: 0, max: 12 });

  return new MVTLayer({
    id: layerId,
    data: singleLayerMode
      ? `/api/tiles/${year}/single/{z}/{x}/{y}.pbf`
      : `/api/tiles/${year}/${lodLevel}/{z}/{x}/{y}.pbf`,
    minZoom: zoomRange.min,
    maxZoom: zoomRange.max,
    autoHighlight: false,
    // Use GeoJSON objects for simpler accessor logic
    binary: false,
    // Align with loaders.gl v4 API to avoid deprecated `options.gis` warnings
    // and ensure coordinates are returned in WGS84.
    loadOptions: {
      mvt: {
        coordinates: 'wgs84',
        shape: 'geojson',
        // Layer selection depends on tiling mode
        layers: singleLayerMode ? ['humans'] : [`humans_lod_${lodLevel}`]
      }
    },
    pickable: true,
    // Forward events
    onClick: onClick || (() => {}),
    onHover: onHover || (() => {}),
    // Ensure deck.gl always receives callable callbacks to avoid TypeErrors
    onTileLoad: (typeof extra?.onTileLoad === 'function' ? extra?.onTileLoad : (() => {})),
    onViewportLoad: (typeof extra?.onViewportLoad === 'function' ? extra?.onViewportLoad : (() => {})),
    onTileError: (typeof extra?.onTileError === 'function' ? extra?.onTileError : (() => {})),
    // Styling forwarded to GeoJsonLayer sublayers
    pointRadiusUnits: 'meters',
    getPointRadius: (f: unknown) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const feature = f as any;
        const pop = Number(feature?.properties?.population || 0);
        const base = getBaseRadiusFromPopulation(pop);
        const radius = radiusStrategy.calculateRadius(base, currentZoom);
        return radius;
      } catch (error) {
        console.error(`[RADIUS-ERROR]:`, error);
        return 2000;
      }
    },
    getFillColor: (f: unknown) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const population = Number((f as any)?.properties?.population || 0);
        if (population > 20000) return [255, 100, 0, 240];
        if (population > 5000) return [255, 140, 0, 220];
        if (population > 1000) return [255, 180, 0, 200];
        return [255, 200, 100, 180];
      } catch {
        return [255, 200, 100, 180];
      }
    },
    updateTriggers: {
      getPointRadius: [year, lodLevel, Math.floor((currentZoom || 0) * 4) / 4, radiusStrategy.getName()],
      getFillColor: [year, lodLevel]
    },
    opacity: opacity,
    parameters: {
      // In 2D map view, disable depth testing so dots are never occluded
      // by the terrain bitmap tiles (which write to depth buffer).
      depthTest: enableDepthTest,
      depthMask: false,
      blend: true,
      blendFunc: [770, 771]
    },
    transitions: {
      opacity: {
        duration: 300,
        easing: (t: number) => t * t * (3.0 - 2.0 * t) // smoothstep
      }
    }
  });
}

// Create a solid earth sphere for 3D globe mode to prevent transparency
export function createEarthSphereLayer() {
  // Create a solid earth sphere that completely covers the globe
  return new GeoJsonLayer({
    id: 'earth-sphere',
    data: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]
          ]]
        }
      }]
    },
    filled: true,
    stroked: false,
    getFillColor: [20, 30, 50, 255], // Solid dark blue for earth base
    pickable: false,
    opacity: 1.0, // Fully opaque to prevent seeing through
    parameters: {
      depthTest: true,   // Enable depth testing for proper 3D rendering
      depthMask: true,   // Write to depth buffer
      blend: false       // No blending needed for solid base layer
    }
  });
}

// Create static terrain layer for land/water visualization
export function createStaticTerrainLayer() {
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
      if (!boundingBox ||
          !Number.isFinite(boundingBox[0]?.[0]) ||
          !Number.isFinite(boundingBox[0]?.[1]) ||
          !Number.isFinite(boundingBox[1]?.[0]) ||
          !Number.isFinite(boundingBox[1]?.[1])) {
        /* eslint-disable no-console */
        console.warn('[terrain-layer] invalid boundingBox, skipping sub-layer', boundingBox);
        /* eslint-enable no-console */
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
          boundingBox[1][1]
        ],
        // Small optimisation: disable updates once image is set
        updateTriggers: {
          image: props.data
        }
      });
    },
    pickable: false,
    opacity: 1.0,  // Full opacity to prevent seeing through globe
    parameters: {
      depthTest: true,   // Enable depth testing for proper layering
      depthMask: true,   // Write to depth buffer to block background
      blend: false       // Disable blending for solid coverage
    }
  });
}
