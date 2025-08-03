import type { FeatureCollection } from 'geojson';

const basemapData: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'North America' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-168, 65], [-160, 70], [-140, 70], [-130, 69], [-110, 71], [-95, 69], [-85, 68],
          [-75, 62], [-68, 57], [-60, 60], [-55, 70], [-75, 74], [-100, 75], [-130, 75],
          [-150, 73], [-168, 65]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'United States' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-125, 49], [-117, 32], [-109, 31], [-104, 29], [-94, 29], [-84, 30], [-80, 25],
          [-75, 35], [-70, 42], [-67, 45], [-74, 45], [-83, 46], [-95, 49], [-111, 49], [-125, 49]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'South America' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-82, 12], [-70, 12], [-60, 5], [-50, -5], [-45, -15], [-40, -25], [-45, -35],
          [-50, -45], [-65, -55], [-70, -50], [-75, -40], [-80, -20], [-85, 0], [-82, 12]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Europe' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-10, 71], [30, 71], [40, 60], [35, 45], [25, 35], [10, 35], [0, 45], [-5, 55], [-10, 71]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Africa' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-20, 37], [10, 37], [35, 30], [50, 15], [45, 0], [40, -15], [35, -25],
          [20, -35], [15, -30], [10, -22], [0, -15], [-10, -5], [-18, 15], [-20, 37]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Asia' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [25, 71], [180, 71], [180, 40], [140, 20], [120, 15], [100, 25], [80, 35],
          [60, 45], [40, 55], [30, 65], [25, 71]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Australia' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [113, -10], [115, -20], [125, -25], [140, -20], [150, -15], [153, -25],
          [145, -40], [135, -35], [125, -30], [115, -25], [113, -10]
        ]]
      }
    }
  ]
};

export default basemapData;
