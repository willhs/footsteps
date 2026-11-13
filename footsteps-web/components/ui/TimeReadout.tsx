'use client';

import type { ReactNode } from 'react';
import { seaLevelLabel } from '@/lib/climate';
import type { Moment } from '@/lib/moments';
import {
  agoLabel,
  calendarLabel,
  dataStatus,
  evidenceAt,
  populationRangeAt,
  populationRangeLabel,
} from '@/lib/time';

interface Props {
  time: number;
  loading: [number, number] | null;
  /** The moment whose note shows under the readout, if any. */
  note: Moment | null;
  /** Replaces the plain calendar label (the time bar makes it editable). */
  calendar?: ReactNode;
}

/** The line above the time bar: years ago, calendar year, sea level, people, data status; and a moment note. */
export default function TimeReadout({ time, loading, note, calendar }: Props) {
  const modelled = evidenceAt(Math.round(time)) === 'modelled'; // as the calendar label rounds
  const status = dataStatus(time);
  return (
    <>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="text-[17px] font-semibold leading-tight text-[var(--ov-text)] tabular-nums">{agoLabel(time)}</span>
        {calendar ?? <span className="text-[13px] text-[var(--ov-text-2)] tabular-nums">{calendarLabel(time)}</span>}
        <span
          className="text-[13px] text-[var(--ov-data)] tabular-nums"
          title="Global sea level relative to today. Spratt & Lisiecki v2 (2025), CC BY."
        >
          {seaLevelLabel(time)}
        </span>
        <span className="text-[13px] text-[var(--ov-amber)] tabular-nums">
          ~{populationRangeLabel(populationRangeAt(time))} people
          {modelled && <span className="text-[var(--ov-text-3)]">, modelled</span>}
        </span>
        {loading ? (
          <span
            role="status"
            aria-live="polite"
            className="ov-chip self-center text-[var(--ov-data)]"
            title="The map shows the nearest data it has until this loads."
          >
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ov-data)]" />
            {loading[0] === loading[1]
              ? `loading ${calendarLabel(loading[0])} data…`
              : `loading ${calendarLabel(loading[0])}–${calendarLabel(loading[1])} data…`}
          </span>
        ) : modelled ? (
          <span
            className="ov-chip self-center text-[var(--ov-text-3)]"
            title="Before 10,000 BCE there is no HYDE data. People are a model: plant productivity, climate and when people arrived, scaled to a low-to-high world total from the literature. Drawn every 1,000 years."
          >
            modelled
          </span>
        ) : (
          <span
            className={`ov-chip self-center ${status.exact ? 'text-[var(--ov-data)]' : 'text-[var(--ov-text-3)]'}`}
            title="HYDE gives data every 1,000 years before 1 CE and every 100 years after. Years in between are estimated."
          >
            {status.exact
              ? 'data year'
              : `estimated between ${calendarLabel(status.y0)} and ${calendarLabel(status.y1)}`}
          </span>
        )}
      </div>
      {note ? (
        <p className="mb-1.5 text-[12px] leading-snug text-[var(--ov-text-2)]" data-testid="moment-note">
          <span className="font-semibold text-[var(--ov-amber)]">
            {note.label} · {agoLabel(note.year).replace(' years ago', '')} yrs ago:
          </span>{' '}
          {note.note} <span className="text-[var(--ov-text-3)]">({note.source})</span>
        </p>
      ) : null}
    </>
  );
}
