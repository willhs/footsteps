'use client';

// ?evidence=1: dated archaeological sites (p3k14c) drawn as small cool marks, the "measured" contrast to
// the modelled people. Loads the site file once, then re-filters on every time/zoom change.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { LayersList } from '@deck.gl/core';
import { loadEvidence } from '@/lib/evidence';
import { markRadius, marksAt, prepareSites, type EvidenceMark, type PreparedSites } from '@/lib/evidenceMarks';

// Cool blue-violet: people are the only warm colour.
const RGB: [number, number, number] = [120, 160, 255];

export interface EvidenceHover {
  mark: EvidenceMark;
  x: number;
  y: number;
}

export default function useEvidenceLayer({ enabled, time, zoom }: { enabled: boolean; time: number; zoom: number }) {
  const [prepared, setPrepared] = useState<PreparedSites | null>(null);
  const [hover, setHover] = useState<EvidenceHover | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadEvidence().then(
      (d) => live && setPrepared(prepareSites(d)),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [enabled]);

  const marks = useMemo(() => (prepared ? marksAt(prepared, time, zoom) : []), [prepared, time, zoom]);

  const onHover = useCallback((info: { object?: EvidenceMark | null; x: number; y: number }) => {
    setHover(info.object ? { mark: info.object, x: info.x, y: info.y } : null);
  }, []);

  const layers = useMemo<LayersList>(
    () =>
      enabled && marks.length
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
          ]
        : [],
    [enabled, marks, onHover, time, zoom],
  );

  return { layers, hover: enabled ? hover : null, doc: prepared?.doc ?? null };
}
