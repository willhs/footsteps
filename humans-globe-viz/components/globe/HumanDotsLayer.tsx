'use client';

import { ScatterplotLayer } from '@deck.gl/layers';

interface HumanDot {
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

interface HumanDotsLayerProps {
  data: HumanDot[];
  viewState: any;
  onClick?: (info: any) => void;
}

export function createHumanDotsLayer({ data, viewState, onClick }: HumanDotsLayerProps) {
  return new ScatterplotLayer({
    id: 'human-dots',
    data,
    pickable: true,
    radiusUnits: 'meters',
    getPosition: (d: any) => {
      try {
        const coords = d.geometry?.coordinates;
        if (!coords || !Array.isArray(coords) || coords.length !== 2) {
          return [0, 0] as [number, number]; // Fallback to origin if invalid
        }
        return coords as [number, number];
      } catch (error) {
        console.warn('Error getting position:', error);
        return [0, 0] as [number, number];
      }
    },
    // Population-based dot sizing using square-root scaling
    getRadius: (d: any) => {
      const zoom = viewState.zoom;
      const population = d?.properties?.population || 0;
      
      // Use square-root scaling to map population to radius
      // This makes the area proportional to population, which is more intuitive
      const minRadius = 100;  // Minimum radius in meters
      const maxRadius = 10000; // Maximum radius in meters
      const scaleFactor = 50;   // Adjust this to control scaling sensitivity
      
      // Calculate radius using square-root scaling, with min/max bounds
      let radius = minRadius + Math.sqrt(population / scaleFactor);
      radius = Math.max(minRadius, Math.min(maxRadius, radius));
      
      // Apply zoom-based scaling
      const zoomScale = Math.pow(2, zoom - 3); // Adjust exponent to control zoom sensitivity
      
      return radius * zoomScale;
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
    onHover: (info: any) => {
      if (info.object) {
        console.log('Hovered dot:', info.object);
      }
    },
    onClick: onClick || (() => {}),
  });
}
