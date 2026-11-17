'use client';

// Other kinds of human (Neanderthals, Denisovans, H. floresiensis, H. luzonensis): rough ranges under the
// people, key dated sites and names above them. On by default; the View panel or ?humans=0 turns it off.
// Data and sources: lib/otherHumans.ts.
import { useCallback, useMemo, useState } from 'react';
import { PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { LayersList } from '@deck.gl/core';
import {
  kaToYear,
  lastSeenLabel,
  otherHumansAt,
  type OtherHuman,
  type Range,
  type Site,
} from '@/lib/otherHumans';

// Lavender: cool like the evidence marks (blue, teal) but distinct; people are the only warm colour.
export const OTHER_HUMANS_RGB: [number, number, number] = [190, 150, 255];
const RGB = OTHER_HUMANS_RGB;

type RangeDatum = Range & { presence: number };
type SiteDatum = Site & { human: OtherHuman; presence: number; active: boolean };
type LabelDatum = { human: OtherHuman; presence: number };

export interface OtherHumansHover {
  site: SiteDatum;
  x: number;
  y: number;
}

/** Is a site's date range around `year`? Minimum ages count from the far past. */
export function siteActive(site: Site, year: number): boolean {
  const oldest = site.minimum ? -Infinity : kaToYear(site.ka[0]);
  return year >= oldest && year <= kaToYear(site.ka[1]);
}

/** Is `p` on the near side of a globe centred on `c` (within 80° of the centre)? */
export function facing(p: [number, number], c: [number, number]): boolean {
  const r = Math.PI / 180;
  const cos =
    Math.sin(p[1] * r) * Math.sin(c[1] * r) + Math.cos(p[1] * r) * Math.cos(c[1] * r) * Math.cos((p[0] - c[0]) * r);
  return cos > Math.cos(80 * r);
}

export default function useOtherHumansLayer({
  enabled,
  time,
  zoom,
  globeCenter,
}: {
  enabled: boolean;
  time: number;
  zoom: number;
  /** On the globe: the view centre [lon, lat], so names on the far side can be hidden. */
  globeCenter?: [number, number] | null;
}) {
  const [hover, setHover] = useState<OtherHumansHover | null>(null);
  const year = Math.round(time);
  // Rebuild only when someone's presence changes, not every slider frame.
  const shown = useMemo(() => (enabled ? otherHumansAt(year) : []), [enabled, year]);
  const key = shown.map((d) => `${d.human.id}:${d.presence.toFixed(2)}`).join('|');

  const data = useMemo(() => {
    const ranges: RangeDatum[] = [];
    const sites: SiteDatum[] = [];
    const labels: LabelDatum[] = [];
    for (const { human, presence } of shown) {
      for (const r of human.ranges) ranges.push({ ...r, presence });
      for (const s of human.sites) sites.push({ ...s, human, presence, active: siteActive(s, year) });
      labels.push({ human, presence });
    }
    return { ranges, sites, labels };
    // `key` and the rounded thousand capture every change that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, Math.round(year / 1000)]);

  const onHover = useCallback((info: { object?: SiteDatum | null; x: number; y: number }) => {
    setHover(info.object ? { site: info.object, x: info.x, y: info.y } : null);
  }, []);

  const below = useMemo<LayersList>(
    () =>
      data.ranges.length
        ? [
            new PolygonLayer<RangeDatum>({
              id: 'other-humans-ranges',
              data: data.ranges,
              getPolygon: (r) => r.polygon,
              getFillColor: (r) => [...RGB, Math.round((r.confidence === 'hinted' ? 14 : 34) * r.presence)],
              getLineColor: (r) => [...RGB, Math.round((r.confidence === 'hinted' ? 70 : 150) * r.presence)],
              lineWidthUnits: 'pixels',
              getLineWidth: (r) => (r.confidence === 'hinted' ? 1 : 1.5),
              stroked: true,
              filled: true,
              pickable: false,
              updateTriggers: { getFillColor: key, getLineColor: key },
            }),
          ]
        : [],
    [data, key],
  );

  const islandsNamed = zoom >= 3;
  const detailed = zoom >= 2;
  // Names draw over the ground (a curved globe would cut them), so hide those round the back.
  const cLon = globeCenter ? Math.round(globeCenter[0]) : null;
  const cLat = globeCenter ? Math.round(globeCenter[1]) : null;
  const labels = useMemo(
    () =>
      data.labels.filter(
        (d) =>
          (islandsNamed || d.human.id === 'neanderthals' || d.human.id === 'denisovans') &&
          (cLon === null || cLat === null || facing(d.human.label, [cLon, cLat])),
      ),
    [data, islandsNamed, cLon, cLat],
  );

  const above = useMemo<LayersList>(
    () =>
      data.labels.length
        ? [
            new ScatterplotLayer<SiteDatum>({
              id: 'other-humans-sites',
              data: data.sites,
              getPosition: (s) => s.position,
              getRadius: (s) => (s.active ? 4.5 : 3),
              getFillColor: (s) => [...RGB, Math.round((s.active ? 245 : 170) * s.presence)],
              getLineColor: (s) => (s.active ? [245, 240, 255, Math.round(230 * s.presence)] : [20, 16, 40, Math.round(200 * s.presence)]),
              lineWidthUnits: 'pixels',
              getLineWidth: 1,
              stroked: true,
              radiusUnits: 'pixels',
              pickable: true,
              onHover,
              updateTriggers: { getRadius: year, getFillColor: [key, year], getLineColor: [key, year] },
            }),
            ...(['name', 'about'] as const).map(
              (line) =>
                new TextLayer<LabelDatum>({
                  id: `other-humans-${line}`,
                  // Island species need some zoom before their names fit; far out, names only.
                  data: line === 'name' || detailed ? labels : [],
                  getPosition: (d) => d.human.label,
                  getText: (d) => (line === 'name' ? d.human.name : `another kind of human · ${lastSeenLabel(d.human)}`),
                  getSize: line === 'name' ? 15 : 12,
                  getColor: (d) => [225, 210, 255, Math.round((line === 'name' ? 245 : 200) * d.presence)],
                  getPixelOffset: [0, line === 'name' ? -8 : 8],
                  getTextAnchor: 'middle',
                  getAlignmentBaseline: 'center',
                  characterSet: 'auto',
                  fontFamily: 'system-ui, sans-serif',
                  fontWeight: line === 'name' ? 700 : 600,
                  outlineWidth: 2,
                  outlineColor: [12, 10, 24, 220],
                  fontSettings: { sdf: true, fontSize: 96, buffer: 8 },
                  pickable: false,
                  parameters: { depthCompare: 'always' },
                  updateTriggers: { getColor: key },
                }),
            ),
          ]
        : [],
    [data, key, labels, detailed, onHover, year],
  );

  return { below, above, hover: enabled ? hover : null, shown: shown.length > 0 };
}
