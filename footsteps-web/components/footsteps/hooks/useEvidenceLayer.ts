'use client';

// ?evidence=1: measured radiocarbon sites and ancient-DNA individuals.
// Load independently so an unavailable dataset does not hide the other kind of evidence.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScatterplotLayer, PolygonLayer } from '@deck.gl/layers';
import type { LayersList } from '@deck.gl/core';
import type { AadrDoc } from '@/lib/aadr';
import { loadEvidence } from '@/lib/evidence';
import type { EvidenceMark, PreparedSites } from '@/lib/evidenceMarks';
import { lazy, useLazy } from '@/lib/lazyModule';

// The marks code and the DNA loader load with the flag (docs/ops/first-load.md).
const EVIDENCE_CODE = lazy(() => import('./evidenceCode'));

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
  const code = useLazy(EVIDENCE_CODE, enabled);

  useEffect(() => {
    if (!enabled || !code) return;
    let live = true;
    loadEvidence().then(
      (d) => live && setPrepared(code.prepareSites(d)),
      () => {},
    );
    code.loadAadr().then(
      (d) => live && setDna(code.prepareSamples(d)),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [enabled, code]);

  const marks = useMemo(
    () => (prepared && code ? code.marksAt(prepared, time, zoom) : []),
    [code, prepared, time, zoom],
  );

  const dnaMarks = useMemo(
    () => (dna && code ? code.marksAt(dna, time, zoom) : []),
    [code, dna, time, zoom],
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
      enabled && code
        ? [
            new ScatterplotLayer<EvidenceMark>({
              id: 'evidence-sites',
              data: marks,
              getPosition: (m) => [m.lon, m.lat],
              getRadius: (m) => code.markRadius(m.count),
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
                  ((code.markRadius(m.count) * 1.5 * 360) / (512 * 2 ** zoom)) *
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
    [enabled, code, marks, dnaMarks, onHover, time, zoom],
  );

  return {
    layers,
    hover: enabled ? hover : null,
    doc: prepared?.doc ?? null,
    dnaDoc: dna?.doc ?? null,
  };
}
