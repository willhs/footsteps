// The regional group under the cursor (or the selected group), drawn as one soft tint and never a line:
// research 0012 says the boundary is imagined, so it must not read as a territory edge. Soft edge = a few
// nested, inset rectangles whose faint fills add up towards the middle. One block only, never all at once.
import { PolygonLayer } from '@deck.gl/layers';
import type { RegionalGroup } from '@/lib/regionalGroup';

const STEPS = 14;
/** Each ring is this share of the block's side further in than the last. */
const INSET = 0.03;
const TINT: [number, number, number] = [150, 190, 255];

type Ring = { polygon: [number, number][]; alpha: number };

export function regionRings(r: Pick<RegionalGroup, 'west' | 'south' | 'east' | 'north'>): Ring[] {
  const w = r.east - r.west;
  const h = r.north - r.south;
  return Array.from({ length: STEPS }, (_, i) => {
    const dx = w * INSET * i;
    const dy = h * INSET * i;
    return {
      polygon: [
        [r.west + dx, r.south + dy],
        [r.east - dx, r.south + dy],
        [r.east - dx, r.north - dy],
        [r.west + dx, r.north - dy],
      ] as [number, number][],
      alpha: 8,
    };
  });
}

export function regionTintLayer(region: RegionalGroup | null) {
  if (!region) return [];
  return [
    new PolygonLayer<Ring>({
      id: 'region-tint',
      data: regionRings(region),
      getPolygon: (d) => d.polygon,
      getFillColor: (d) => [...TINT, d.alpha],
      stroked: false,
      filled: true,
      pickable: false,
      // Lies on the ground; the close-up 3D relief is raised above sea level, so draw it over that.
      parameters: { depthCompare: 'always', depthWriteEnabled: false },
    }),
  ];
}
