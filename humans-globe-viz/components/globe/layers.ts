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
export function createHumanDotsLayer(data: any[], viewState: any, year: number, lodLevel: number | null, onClick?: (info: any) => void) {
  const layerId = `human-dots-${year}-lod${lodLevel || 'legacy'}`;
  
  return new ScatterplotLayer({
    id: layerId,
    data,
    // Use updateTriggers to control when layer actually re-renders
    // Throttle zoom updates aggressively to prevent 50k radius recalculations on every frame
    updateTriggers: {
      getPosition: [data.length, year, lodLevel],
      getRadius: [data.length, Math.floor(viewState.zoom * 2) / 2], // Throttle to 0.5 zoom precision
      getFillColor: [data.length]
    },
    pickable: true,
    radiusUnits: 'pixels',
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
    // Population-responsive dot sizing - smaller dots for less crowding, larger for major settlements
    getRadius: (d: any) => {
      const zoom = viewState.zoom;
      const population = d?.properties?.population || 0;
      
      // Smaller default sizes to reduce crowding, but larger for major populations
      let baseRadius;
      if (population > 50000) baseRadius = 12;      // Major cities stay large
      else if (population > 20000) baseRadius = 8;  // Large settlements 
      else if (population > 5000) baseRadius = 4;   // Medium settlements
      else if (population > 1000) baseRadius = 2;   // Small settlements
      else baseRadius = 1;                          // Villages - much smaller
      
      // Gentle zoom scaling - less aggressive growth
      const zoomScale = zoom > 3 ? 1 + (zoom - 3) * 0.2 : 0.8;
      
      return baseRadius * zoomScale;
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
    // Performance optimizations for large datasets
    getPickingInfo: ({ info }) => info, // Simplified picking
    autoHighlight: false, // Disable auto-highlighting for performance
    highlightColor: [255, 255, 255, 100], // Subtle highlight when enabled
    
    // Additional performance settings for 50k+ dots
    parameters: {
      depthTest: false, // Disable depth testing for better performance
      depthMask: false  // Don't write to depth buffer
    },
    
    // Optimize GPU buffer usage
    getTargetPosition: undefined, // Remove unnecessary position animations
    transitions: {
      getRadius: 0, // Disable radius transitions for immediate updates
      getFillColor: 0 // Disable color transitions
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
    renderSubLayers: props => {
      const {boundingBox} = props.tile;
      return new BitmapLayer(props, {
        data: null,
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
