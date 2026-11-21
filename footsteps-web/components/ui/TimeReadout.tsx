'use client';

import type { ReactNode } from 'react';
import { seaLevelAt, seaLevelLabel } from '@/lib/climate';
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

/** The line above the time bar: years ago, calendar year and people; sea level only when it differs from today; a quiet
 * note when the people are modelled or between data years, and a small dot while data loads (the bar's needle also
 * turns dashed). Everything else is on hover. */
export default function TimeReadout({ time, loading, note, calendar }: Props) {
  const modelled = evidenceAt(Math.round(time)) === 'modelled'; // as the calendar label rounds
  const status = dataStatus(time);
  const sea = Math.round(seaLevelAt(time));
  return (
    <>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="text-[17px] font-semibold leading-tight text-[var(--ov-text)] tabular-nums">{agoLabel(time)}</span>
        {calendar ?? <span className="text-[13px] text-[var(--ov-text-2)] tabular-nums">{calendarLabel(time)}</span>}
        <span className="text-[13px] text-[var(--ov-amber)] tabular-nums">
          ~{populationRangeLabel(populationRangeAt(time))} people
        </span>
        {Math.abs(sea) >= 5 && (
          <span
            className="text-[12px] text-[var(--ov-data)] tabular-nums"
            title="Global sea level relative to today. Spratt & Lisiecki v2 (2025), CC BY."
          >
            {seaLevelLabel(time)}
          </span>
        )}
        {modelled ? (
          <span
            className="text-[12px] text-[var(--ov-text-3)]"
            title="Before 10,000 BCE there is no HYDE data. People are a model: plant productivity, climate and when people arrived, scaled to a low-to-high world total from the literature. Drawn every 1,000 years."
          >
            modelled
          </span>
        ) : !status.exact ? (
          <span
            className="text-[12px] text-[var(--ov-text-3)]"
            title={`HYDE gives data every 1,000 years before 1 CE and every 100 years after. This year is estimated between ${calendarLabel(status.y0)} and ${calendarLabel(status.y1)}.`}
          >
            estimated
          </span>
        ) : null}
        {loading && (
          <span
            role="status"
            aria-live="polite"
            className="self-center"
            title={`Loading ${loading[0] === loading[1] ? calendarLabel(loading[0]) : `${calendarLabel(loading[0])}–${calendarLabel(loading[1])}`} data. The map shows the nearest data it has until it arrives.`}
          >
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ov-data)]" />
            <span className="sr-only">Loading data</span>
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
