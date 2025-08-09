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
  onHover?: (info: any) => void;
}

export function createHumanDotsLayer({
  data,
  viewState,
  onClick,
  onHover,
}: HumanDotsLayerProps) {
  return new ScatterplotLayer({
    id: 'human-dots',
    data,
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
        console.warn('Error getting position:', error);
        return [0, 0] as [number, number];
      }
    },
    // Use pre-computed radius values for optimal performance
    getRadius: (d: any) => {
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
    onHover: onHover || (() => {}),
    onClick: onClick || (() => {}),
  });
}
