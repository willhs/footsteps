'use client';

import { useMemo } from 'react';
import { CONFIDENCE_LABEL, estimateLines, placeNotes, type PlaceCaveat } from '@/lib/estimate';
import { calendarLabel } from '@/lib/time';
import { formatPlace } from '@/lib/hoverCard';

/**
 * `?explain=1`: "How we estimate this" for the place under the cursor (or the selected spot, or the view centre) at the
 * slider's year. Quiet on purpose: text only, one confidence word per line, no bars or colours (lib/estimate.ts).
 */
export default function EstimatePanel({
  time,
  adjusted = false,
  place,
  placeFrom,
  corrections,
  onClose,
}: {
  time: number;
  /** The people on screen are the adjusted spread (grid.adjusted). */
  adjusted?: boolean;
  place: { lon: number; lat: number };
  /** Where `place` comes from, so the header can say so. */
  placeFrom: 'cursor' | 'selected' | 'centre';
  corrections?: PlaceCaveat[];
  onClose: () => void;
}) {
  const year = Math.round(time);
  const lines = useMemo(() => estimateLines({ time: year, adjusted }), [year, adjusted]);
  const notes = useMemo(
    () => placeNotes({ time: year, lon: place.lon, lat: place.lat, corrections }),
    [year, place.lon, place.lat, corrections],
  );
  return (
    <section
      className="ov-panel pointer-events-auto min-h-0 shrink overflow-y-auto !px-3.5 !py-3"
      aria-label="How we estimate this"
      data-testid="estimate-panel"
    >
      <button type="button" className="float-right -mt-0.5 text-[var(--ov-text-3)] hover:text-[var(--ov-text)]" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <p className="ov-body font-medium">How we estimate this</p>
      <p className="ov-debug mt-0.5">
        {calendarLabel(year)} · {formatPlace(place.lon, place.lat)}
        {placeFrom === 'centre' ? ' (map centre)' : placeFrom === 'cursor' ? ' (under the cursor)' : ''}
      </p>
      <ul className="mt-2 space-y-1">
        {lines.map((l) => (
          <li key={l.id} data-testid={`estimate-${l.id}`}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-baseline justify-between gap-2 text-[12px] leading-snug text-[var(--ov-text)] [&::-webkit-details-marker]:hidden">
                <span>
                  {l.shapes} <span className="text-[11px] text-[var(--ov-text-4)]">· {l.cite}</span>
                </span>
                <span className="shrink-0 text-[11px] italic text-[var(--ov-text-3)]">{CONFIDENCE_LABEL[l.confidence]}</span>
              </summary>
              <p className="mb-1 mt-0.5 text-[11px] leading-snug text-[var(--ov-text-3)]">
                {l.method} <span className="text-[var(--ov-text-4)]">{l.why}</span>
                <span className="mt-0.5 block text-[10.5px] text-[var(--ov-text-4)]">Source: {l.source}</span>
              </p>
            </details>
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <div className="mt-2.5 border-t border-[var(--ov-divider)] pt-2" data-testid="estimate-notes">
          <p className="text-[12px] text-[var(--ov-text)]">Here, at this time</p>
          <ul className="mt-0.5 space-y-1">
            {notes.map((n) => (
              <li key={n.text} className="text-[11px] leading-snug text-[var(--ov-text-3)]">
                {n.text} <span className="text-[var(--ov-text-4)]">({n.source})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2.5 text-[10.5px] leading-snug text-[var(--ov-text-4)]">
        Open a line for the method. Fair: sources agree within about a third. Rough: within about three-fold. Very rough: they differ more, or nobody counted.
        Illustrative: drawn to look plausible, not estimated.
      </p>
    </section>
  );
}
