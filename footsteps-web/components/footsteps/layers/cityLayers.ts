import { TextLayer } from '@deck.gl/layers';
import type { AllocatedCity } from '@/lib/settlements';
import { cityRadiusM } from '../hooks/unitMorph';
import { LOOKS, WayOfLife } from '@/lib/waysOfLife';
import MorphScatterplotLayer from './MorphScatterplotLayer';

const CITY_RGB = LOOKS[WayOfLife.Urban].rgb;
const CITY_COLOR: [number, number, number, number] = [CITY_RGB[0], CITY_RGB[1], CITY_RGB[2], 220];

/** "450,000" → "450k"; under 10,000 to the hundred. */
export function shortCount(people: number) {
  if (people >= 1e6) return `${(people / 1e6).toFixed(people >= 1e7 ? 0 : 1)}M`;
  if (people >= 1e4) return `${Math.round(people / 1e3)}k`;
  if (people >= 1e3) return `${(people / 1e3).toFixed(1)}k`;
  return `${Math.round(people / 100) * 100}`;
}

/** Settlement model (default Units view): named Reba cities, labelled as modelled allocations. Drawn with the same
 * town marks as the grid's urban cells (built-up area, roofs, glow; MorphScatterplotLayer), never a flat disc. The name
 * shows from zoom 6, the count (small, dim) from zoom 8; the hover card says "modelled". */
export function cityLayers(cities: AllocatedCity[], opacity: number, zoom: number) {
  const settle = 1 - Math.min(1, Math.max(0, (zoom - 6) / 2.5));
  // Labels sit just above the built-up area at this zoom (deck's 512 px world: 78,271.5 m per pixel at zoom 0, equator).
  const z = Math.round(zoom * 4) / 4;
  const lift = (city: AllocatedCity) =>
    cityRadiusM(city.people) / ((78_271.5 * Math.cos((city.position[1] * Math.PI) / 180)) / 2 ** z);
  return [
    new MorphScatterplotLayer({
      id: 'modelled-historical-cities', data: cities,
      getPosition: (city: AllocatedCity) => city.position,
      getRadius: (city: AllocatedCity) => cityRadiusM(city.people),
      getTargetRadius: (city: AllocatedCity) => cityRadiusM(city.people),
      getFillColor: CITY_COLOR,
      getTargetFillColor: CITY_COLOR,
      radiusUnits: 'meters', radiusMinPixels: 2, stroked: false,
      progress: 1, brightness: 1, settle, halo: 8,
      opacity, pickable: false,
      parameters: { depthTest: false, blend: true, blendColorSrcFactor: 'src-alpha', blendColorDstFactor: 'one', blendAlphaSrcFactor: 'one', blendAlphaDstFactor: 'one' },
    } as never),
    new TextLayer<AllocatedCity>({
      id: 'modelled-city-names', data: cities,
      getPosition: (city) => city.position,
      getText: (city) => city.name,
      getSize: (city) => (city.people >= 100_000 ? 14 : 12),
      getColor: [225, 245, 250, 235], getPixelOffset: (city) => [0, -Math.max(14, lift(city) + 16)],
      updateTriggers: { getPixelOffset: z },
      getTextAnchor: 'middle', getAlignmentBaseline: 'bottom',
      fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 600,
      outlineWidth: 3, outlineColor: [10, 20, 24, 200], fontSettings: { sdf: true },
      visible: zoom >= 6, opacity,
    }),
    new TextLayer<AllocatedCity>({
      id: 'modelled-city-counts', data: cities,
      getPosition: (city) => city.position,
      getText: (city) => `~${shortCount(city.people)}`,
      getSize: 10, getColor: [190, 225, 232, 170], getPixelOffset: (city) => [0, -Math.max(2, lift(city) + 4)],
      updateTriggers: { getPixelOffset: z },
      getTextAnchor: 'middle', getAlignmentBaseline: 'bottom',
      fontFamily: 'Inter, system-ui, sans-serif',
      outlineWidth: 3, outlineColor: [10, 20, 24, 200], fontSettings: { sdf: true },
      visible: zoom >= 8, opacity,
    }),
  ];
}
