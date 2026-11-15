'use client';

// ?evidence=1: measured radiocarbon sites and ancient-DNA individuals.
// Load independently so an unavailable dataset does not hide the other kind of evidence.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScatterplotLayer, PolygonLayer } from '@deck.gl/layers';
import type { LayersList } from '@deck.gl/core';
import { loadAadr, type AadrDoc } from '@/lib/aadr';
import { loadEvidence } from '@/lib/evidence';
import {
  markRadius,
  marksAt,
  prepareSites,
  prepareSamples,
  type EvidenceMark,
  type PreparedSites,
} from '@/lib/evidenceMarks';

// Cool blue-violet: people are the only warm colour.
const RGB: [number, number, number] = [120, 160, 255];

export interface EvidenceHover {
  kind: 'site' | 'dna';
  mark: EvidenceMark;
  x: number;
  y: number;
}

export default function useEvidenceLayer({
  enabled,
  time,
  zoom,
}: {
  enabled: boolean;
  time: number;
  zoom: number;
}) {
  const [prepared, setPrepared] = useState<PreparedSites | null>(null);
  const [dna, setDna] = useState<PreparedSites<AadrDoc> | null>(null);
  const [hover, setHover] = useState<EvidenceHover | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadEvidence().then(
      (d) => live && setPrepared(prepareSites(d)),
      () => {},
    );
    loadAadr().then(
      (d) => live && setDna(prepareSamples(d)),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [enabled]);

  const marks = useMemo(
    () => (prepared ? marksAt(prepared, time, zoom) : []),
    [prepared, time, zoom],
  );

  const dnaMarks = useMemo(
    () => (dna ? marksAt(dna, time, zoom) : []),
    [dna, time, zoom],
  );

  const onHover = useCallback(
    (info: { object?: EvidenceMark | null; x: number; y: number }) => {
      setHover(
        info.object
          ? { kind: 'site', mark: info.object, x: info.x, y: info.y }
          : null,
      );
    },
    [],
  );

  const layers = useMemo<LayersList>(
    () =>
      enabled
        ? [
            new ScatterplotLayer<EvidenceMark>({
              id: 'evidence-sites',
              data: marks,
              getPosition: (m) => [m.lon, m.lat],
              getRadius: (m) => markRadius(m.count),
              getFillColor: (m) => [...RGB, Math.round(40 + 190 * m.alpha)],
              radiusUnits: 'pixels',
              radiusMinPixels: 2,
              pickable: true,
              onHover,
              // Rebuild colours when only the alpha changed.
              updateTriggers: { getFillColor: [time], getRadius: [zoom] },
            }),
            new PolygonLayer<EvidenceMark>({
              id: 'evidence-dna',
              data: dnaMarks,
              // A screen-sized diamond, in geographic degrees at this zoom and latitude.
              getPolygon: (m) => {
                const dy =
                  ((markRadius(m.count) * 1.5 * 360) / (512 * 2 ** zoom)) *
                  Math.cos((m.lat * Math.PI) / 180);
                const dx =
                  dy / Math.max(0.05, Math.cos((m.lat * Math.PI) / 180));
                return [
                  [m.lon, m.lat + dy],
                  [m.lon + dx, m.lat],
                  [m.lon, m.lat - dy],
                  [m.lon - dx, m.lat],
                ];
              },
              getFillColor: (m) => [
                80,
                235,
                215,
                Math.round(40 + 190 * m.alpha),
              ],
              stroked: false,
              pickable: true,
              onHover: (info) =>
                setHover(
                  info.object
                    ? { kind: 'dna', mark: info.object, x: info.x, y: info.y }
                    : null,
                ),
              updateTriggers: { getPolygon: [zoom], getFillColor: [time] },
            }),
          ]
        : [],
    [enabled, marks, dnaMarks, onHover, time, zoom],
  );

  return {
    layers,
    hover: enabled ? hover : null,
    doc: prepared?.doc ?? null,
    dnaDoc: dna?.doc ?? null,
  };
}
