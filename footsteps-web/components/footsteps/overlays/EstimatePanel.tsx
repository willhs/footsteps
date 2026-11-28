'use client';

import { useMemo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CONFIDENCE_LABEL, CONFIDENCE_MEANING, LINE_ICON, estimateLines, placeNotes, type PlaceCaveat } from '@/lib/estimate';
import { calendarLabel } from '@/lib/time';
import { formatPlace } from '@/lib/hoverCard';

/**
 * `?explain=1`: "How we estimate this", opened from the ? button under the map controls. It sits beside the hover card (which keeps
 * showing what is here); this says where those numbers come from, for the place under the cursor (or the clicked spot, or the map
 * centre) at the slider's year. One icon, a few words and one trust word per line; click a line for the method (lib/estimate.ts).
 */
export default function EstimatePanel({
  time,
  adjusted = false,
  place,
  corrections,
  onClose,
}: {
  time: number;
  /** The people on screen are the adjusted spread (grid.adjusted). */
  adjusted?: boolean;
  place: { lon: number; lat: number };
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
      className="ov-panel pointer-events-auto w-[300px] max-w-[calc(100vw-2*var(--ov-right))] overflow-y-auto !px-3 !py-2.5"
      style={{ maxHeight: 'calc(100vh - var(--ov-timeline-h) - 260px)' }}
      aria-label="How we estimate this"
      data-testid="estimate-panel"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-[var(--ov-text)]">How we estimate this</p>
        <button type="button" className="text-[var(--ov-text-3)] hover:text-[var(--ov-text)]" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="ov-debug">
        {calendarLabel(year)} · {formatPlace(place.lon, place.lat)}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {lines.map((l) => (
          <li key={l.id} data-testid={`estimate-${l.id}`}>
            <details>
              <summary className="flex cursor-pointer list-none items-baseline gap-1.5 rounded-sm py-0.5 text-[12px] leading-snug text-[var(--ov-text)] hover:bg-white/5 [&::-webkit-details-marker]:hidden">
                <Icon name={LINE_ICON[l.id]} className="w-4 shrink-0 text-center" />
                <span className="min-w-0 flex-1 truncate">
                  {l.shapes} <span className="text-[11px] text-[var(--ov-text-4)]">{l.cite}</span>
                </span>
                <span className="shrink-0 text-[11px] italic text-[var(--ov-text-3)]" title={CONFIDENCE_MEANING[l.confidence]}>
                  {CONFIDENCE_LABEL[l.confidence]}
                </span>
              </summary>
              <p className="mb-1 ml-[22px] text-[11px] leading-snug text-[var(--ov-text-3)]">
                {l.method} <span className="text-[var(--ov-text-4)]">{l.why}</span>
                <span className="mt-0.5 block text-[10.5px] text-[var(--ov-text-4)]">{l.source}</span>
              </p>
            </details>
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-t border-[var(--ov-divider)] pt-1.5" data-testid="estimate-notes">
          {notes.map((n) => (
            <li key={n.text} className="flex gap-1.5 text-[11px] leading-snug text-[var(--ov-text-3)]" title={n.source}>
              <Icon name="place" className="w-4 shrink-0 text-center" />
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
