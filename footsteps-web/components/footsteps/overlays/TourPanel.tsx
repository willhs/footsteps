import { EVIDENCE_LABEL } from '@/lib/tour';
import { calendarLabel } from '@/lib/time';
import type { Tour } from '../hooks/useTour';

const button =
  'pointer-events-auto rounded border border-[var(--ov-border)] px-2.5 py-1 text-[var(--ov-text)] hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent';

/** The `?tour=1` stop card, docked at the top of the left column (docs/ops/tour.md). */
export default function TourPanel({ tour }: { tour: Tour }) {
  const { stop, index, count } = tour;
  const last = index === count - 1;
  return (
    <section className="ov-panel ov-panel-strong pointer-events-auto shrink-0 px-3.5 py-3" aria-label="Guided tour" data-testid="tour-panel" data-stop={stop.id} data-index={index} data-count={count}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="ov-eyebrow">
          Tour · {index + 1} of {count} · {calendarLabel(stop.year)}
        </p>
        <button type="button" className="ov-note hover:text-[var(--ov-text)]" onClick={tour.exit} aria-label="Leave the tour" title="Leave the tour (Esc)">
          ×
        </button>
      </div>
      <p className="ov-title">{stop.title}</p>
      <p className="ov-note mt-0.5">
        <strong className={`font-semibold ${stop.evidence === 'measured' ? 'text-[var(--ov-text-2)]' : 'text-[var(--ov-amber)]'}`}>{EVIDENCE_LABEL[stop.evidence]}</strong>
      </p>
      <p className="ov-body mt-1.5">{stop.text[0]}</p>
      <p className="ov-body mt-1">{stop.text[1]}</p>
      <p className="ov-note mt-1.5">Source: {stop.source}</p>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className={button} onClick={tour.back} disabled={index === 0}>
          ← Back
        </button>
        <button type="button" className={button} onClick={tour.next} data-testid="tour-next">
          {last ? 'Finish' : 'Next →'}
        </button>
        <span className="ov-note ml-auto">← → step · Esc leaves</span>
      </div>
    </section>
  );
}
