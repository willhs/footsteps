'use client';

// Other kinds of human (Neanderthals, Denisovans, H. floresiensis, H. luzonensis): guessed bands under the
// people (one mark per band, a shape per species), key dated sites and names above them. On by default; the
// View panel or ?humans=0 turns it off. Data and sources: lib/otherHumans.ts, lib/otherHumanBands.ts.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { LayersList } from '@deck.gl/core';
import {
  kaToYear,
  lastSeenLabel,
  otherHumansAt,
  type OtherHuman,
  type Site,
} from '@/lib/otherHumans';
import { BANDS_URL, bandIconUrl, bandStepKa, bandsAt, type Band, type BandsFile } from '@/lib/otherHumanBands';

// Lavender: cool like the evidence marks (blue, teal) but distinct; people are the only warm colour.
export const OTHER_HUMANS_RGB: [number, number, number] = [190, 150, 255];
const RGB = OTHER_HUMANS_RGB;

export type BandDatum = Band & { human: OtherHuman; presence: number; people: number };
type SiteDatum = Site & { human: OtherHuman; presence: number; active: boolean };
type LabelDatum = { human: OtherHuman; presence: number };

export type OtherHumansHover = ({ kind: 'site'; site: SiteDatum } | { kind: 'band'; band: BandDatum }) & {
  x: number;
  y: number;
};

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

  // The bands file (~100 KB) loads the first time anyone is shown; a failed fetch leaves sites and names.
  const [bandsFile, setBandsFile] = useState<BandsFile | null>(null);
  const wantBands = shown.length > 0;
  useEffect(() => {
    if (!wantBands || bandsFile) return;
    let live = true;
    fetch(BANDS_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((f: BandsFile | null) => live && f && setBandsFile(f))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [wantBands, bandsFile]);
  const stepKa = bandsFile ? bandStepKa(bandsFile, year) : null;

  const data = useMemo(() => {
    const bands: BandDatum[] = [];
    const sites: SiteDatum[] = [];
    const labels: LabelDatum[] = [];
    for (const { human, presence } of shown) {
      const rows = bandsFile?.species[human.id]?.bands;
      if (rows && stepKa !== null) {
        for (const b of bandsAt(rows, stepKa, presence)) bands.push({ ...b, human, presence, people: bandsFile.band_people });
      }
      for (const s of human.sites) sites.push({ ...s, human, presence, active: siteActive(s, year) });
      labels.push({ human, presence });
    }
    return { bands, sites, labels };
    // `key`, the band step and the rounded thousand capture every change that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bandsFile, stepKa, Math.round(year / 1000)]);

  const onSiteHover = useCallback((info: { object?: SiteDatum | null; x: number; y: number }) => {
    setHover(info.object ? { kind: 'site', site: info.object, x: info.x, y: info.y } : null);
  }, []);
  const onBandHover = useCallback((info: { object?: BandDatum | null; x: number; y: number }) => {
    setHover(info.object ? { kind: 'band', band: info.object, x: info.x, y: info.y } : null);
  }, []);

  const bandSize = zoom >= 5 ? 13 : zoom >= 3 ? 10 : 8;
  const below = useMemo<LayersList>(
    () =>
      data.bands.length
        ? [
            new IconLayer<BandDatum>({
              id: 'other-humans-bands',
              data: data.bands,
              getPosition: (b) => b.position,
              getIcon: (b) => ({ id: b.human.id, url: bandIconUrl(b.human.id), width: 48, height: 48, mask: true }),
              getSize: bandSize,
              sizeUnits: 'pixels',
              getColor: (b) => [...RGB, Math.round((b.hinted ? 110 : 215) * (0.5 + 0.5 * b.presence))],
              pickable: true,
              onHover: onBandHover,
              updateTriggers: { getColor: key },
            }),
          ]
        : [],
    [data, key, bandSize, onBandHover],
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
              onHover: onSiteHover,
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
    [data, key, labels, detailed, onSiteHover, year],
  );

  return { below, above, hover: enabled ? hover : null, shown: shown.length > 0 };
}
