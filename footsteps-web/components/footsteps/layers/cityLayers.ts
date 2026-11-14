import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { AllocatedCity } from '@/lib/settlements';

/** Settlement experiment: named Reba cities, labelled as modelled allocations. */
export function cityLayers(cities: AllocatedCity[], opacity: number, zoom: number) {
  return [
    new ScatterplotLayer<AllocatedCity>({
      id: 'modelled-historical-cities', data: cities,
      getPosition: (city) => city.position,
      getRadius: (city) => Math.min(30000, Math.sqrt(city.people) * 45),
      getFillColor: [60, 230, 255, 190], radiusMinPixels: 2,
      opacity, pickable: false,
    }),
    new TextLayer<AllocatedCity>({
      id: 'modelled-city-names', data: cities,
      getPosition: (city) => city.position,
      getText: (city) => `${city.name}\n${Math.round(city.people).toLocaleString()} modelled${city.people < city.requested * 0.99 ? ' (budget limited)' : ''}`,
      getSize: 12, getColor: [190, 235, 235, 255], getPixelOffset: [0, -18],
      getTextAnchor: 'middle', getAlignmentBaseline: 'bottom',
      visible: zoom >= 6, opacity,
    }),
  ];
}
