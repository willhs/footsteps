import { GeoJsonLayer, ScatterplotLayer, BitmapLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';

// Create basemap layer
export function createBasemapLayer(data: any, basemapError: boolean) {
  return new GeoJsonLayer({
    id: 'land-layer',
    data: data || { type: 'FeatureCollection', features: [] },
    filled: true,
    // Disable stroke so internal country borders are not drawn
    stroked: false,
    getFillColor: basemapError ? [60, 80, 100, 60] : [40, 60, 80, 90],
    pickable: false,
    opacity: 1.0,
    updateTriggers: {
      data: data,
      getFillColor: basemapError
    }
  });
}

// Create human dots layer with stable ID for caching
export function createHumanDotsLayer(data: any[], viewState: any | null, year: number, lodLevel: number | null, onClick?: (info: any) => void) {
  const layerId = `human-dots-${year}-lod${lodLevel || 'legacy'}`;
  
  return new ScatterplotLayer({
    id: layerId,
    data,
    // Simplified update triggers - only recreate when data actually changes
    updateTriggers: {
      getPosition: [data.length, year, lodLevel],
      getRadius: [data.length, year, lodLevel], // Only update when data changes, not zoom
      getFillColor: [data.length]
    },
    pickable: true,
    radiusUnits: 'meters', // Use meters for GPU-accelerated scaling
    getPosition: (d: any) => {
      try {
        const coords = d.geometry?.coordinates;
        if (!coords || !Array.isArray(coords) || coords.length !== 2) {
          return [0, 0] as [number, number]; // Fallback to origin if invalid
        }
        return coords as [number, number];
      } catch (error) {
        return [0, 0] as [number, number];
      }
    },
    // Use pre-computed radius values for maximum performance
    getRadius: (d: any) => {
      // Use pre-computed radius if available, otherwise fall back to calculation
      return d?.properties?.precomputedRadius || 2000; // Default to village size (2km)
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
    
    // GPU performance optimizations for large datasets
    parameters: {
      depthTest: false, // Disable depth testing for better performance
      depthMask: false, // Don't write to depth buffer
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
    renderSubLayers: props => {
      const {boundingBox} = props.tile;
      return new BitmapLayer(props, {
        data: undefined,
        image: props.data,
        bounds: [
          boundingBox[0][0], 
          boundingBox[0][1], 
          boundingBox[1][0], 
          boundingBox[1][1]
        ]
      });
    },
    pickable: false,
    opacity: 0.6
  });
}
