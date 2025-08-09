import { GeoJsonLayer, ScatterplotLayer, BitmapLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';

// Strategy pattern for radius calculation
interface RadiusStrategy {
  calculateRadius(baseRadius: number, zoom: number): number;
  getName(): string;
}

// Linear strategy: uses pre-computed radius as-is for geographic accuracy
class LinearRadiusStrategy implements RadiusStrategy {
  calculateRadius(baseRadius: number, zoom: number): number {
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
    if (zoom < 7) return 1.5;  // Local view: 1.5x boost
    return 1;                  // Detailed view: accurate scale
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
    if (zoom < 8) return scaledRadius * 0.9;   // Very close: slightly smaller
    return scaledRadius * 0.8;                 // Maximum zoom: smaller but still visible
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

// Create basemap layer
export function createBasemapLayer(data: any, basemapError: boolean) {
  return new GeoJsonLayer({
    id: 'land-layer',
    data: data || { type: 'FeatureCollection', features: [] },
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

// Create human dots layer with stable ID for caching
export function createHumanDotsLayer(
  data: any[], 
  viewState: any | null, 
  year: number, 
  lodLevel: number | null, 
  radiusStrategy: RadiusStrategy = radiusStrategies.zoomAdaptive,
  onClick?: (info: any) => void,
  onHover?: (info: any) => void
) {
  const layerId = `human-dots-${year}-lod${lodLevel || 'legacy'}-${radiusStrategy.getName()}`;
  
  const currentZoom = viewState?.zoom || 1;
  
  return new ScatterplotLayer({
    id: layerId,
    data,
    // Update triggers include zoom for radius strategies that depend on it
    updateTriggers: {
      getPosition: [data.length, year, lodLevel],
      getRadius: [data.length, year, lodLevel, Math.floor(currentZoom * 4) / 4, radiusStrategy.getName()], // Include strategy in triggers
      getFillColor: [data.length]
    },
    pickable: true,
    radiusUnits: 'meters', // Use meters for GPU-accelerated scaling
    radiusScale: 1, // Ensure dots are properly scaled
    getPosition: (d: any) => {
      try {
        const coords = d.geometry?.coordinates;
        if (!coords || !Array.isArray(coords) || coords.length !== 2) {
          return [0, 0]; // Fallback to origin if invalid
        }
        // Let GlobeView handle the sphere projection
        return coords as [number, number];
      } catch (error) {
        return [0, 0];
      }
    },
    // Use radius strategy for flexible calculation approach
    getRadius: (d: any) => {
      const baseRadius = d?.properties?.precomputedRadius || 2000; // Default to village size (2km)
      return radiusStrategy.calculateRadius(baseRadius, currentZoom);
    },
    getFillColor: (d: any) => {
      const population = d?.properties?.population || 100;
      
      // Color intensity based on population
      if (population > 20000) {
        return [255, 100, 0, 240]; // Large settlements: bright red-orange
      } else if (population > 5000) {
        return [255, 140, 0, 220]; // Medium settlements: orange
      } else if (population > 1000) {
        return [255, 180, 0, 200]; // Small settlements: light orange
      } else {
        return [255, 200, 100, 180]; // Very small settlements: pale orange
      }
    },
    onClick: onClick || (() => {}),
    onHover: onHover || (() => {}),
    
    // GPU performance optimizations for large datasets with proper 3D rendering
    parameters: {
      depthTest: true,  // Enable depth testing for proper 3D rendering
      depthMask: false, // Don't write to depth buffer for dots (for transparency)
      blend: true,      // Enable blending for overlapping dots
      blendFunc: [770, 771] // Standard alpha blending
    },
    
    // Optimize GPU buffer usage and disable expensive features
    getTargetPosition: undefined, // Remove unnecessary position animations
    transitions: {
      getRadius: 0,    // Disable radius transitions for immediate updates
      getFillColor: 0, // Disable color transitions
      getPosition: 0   // Disable position transitions
    },
    
    // Performance optimizations for picking and highlighting
    getPickingInfo: ({ info }: { info: any }) => info, // Simplified picking
    autoHighlight: false, // Disable auto-highlighting for performance
    highlightColor: [255, 255, 255, 100] // Subtle highlight when enabled
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
