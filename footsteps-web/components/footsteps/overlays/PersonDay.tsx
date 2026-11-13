'use client';

import { useState } from 'react';

/** What the day API needs: the grounding facts for one clicked person. */
export type DayRequest = {
  year: number;
  lat: number;
  lon: number;
  cellPeople: number;
  neighbourhoodPeople: number;
  densityClass: string;
  confidence: string;
  person: {
    age: number;
    female: boolean;
    role: string;
    groupKind: number;
    groupPeople: number;
  };
};

type Day = {
  summary: string;
  schedule: { time: string; activity: string }[];
  grounded_in: string[];
  uncertainty: string;
  model: string;
  cached: boolean;
};

/** "Imagine their day": a short, clearly speculative day written by Claude
 * from the facts on this card (deploy/budgie/api/day_api.py). */
export default function PersonDay({ request }: { request: DayRequest }) {
  return <PersonDayRequest key={JSON.stringify(request)} request={request} />;
}

function PersonDayRequest({ request }: { request: DayRequest }) {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'done'; day: Day }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const key = JSON.stringify(request);

  async function imagine() {
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: key,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'The day service is not available.');
      setState({ kind: 'done', day: body as Day });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Something went wrong.',
      });
    }
  }

  if (state.kind === 'idle')
    return (
      <button type="button" onClick={imagine} className="ov-btn self-start">
        Imagine their day
      </button>
    );
  if (state.kind === 'loading')
    return (
      <p role="status" className="ov-body flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ov-warm)]" />
        Imagining a day from these facts…
      </p>
    );
  if (state.kind === 'error') return <p className="ov-body">{state.message}</p>;

  const { day } = state;
  return (
    <div className="rounded-[var(--ov-radius-sm)] border border-[var(--ov-divider)] bg-white/[0.03] p-3">
      <p className="ov-chip mb-2 uppercase tracking-wide text-[var(--ov-warm)]">Speculative</p>
      <p className="ov-body mb-3 text-[var(--ov-text)]">{day.summary}</p>
      <dl className="ov-body grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {day.schedule.map((s, i) => (
          <div key={i} className="contents">
            <dt className="whitespace-nowrap text-[var(--ov-text-3)] tabular-nums">{s.time}</dt>
            <dd className="text-[var(--ov-text)]">{s.activity}</dd>
          </div>
        ))}
      </dl>
      <p className="ov-note mt-3">
        <span className="text-[var(--ov-text-2)]">Most uncertain:</span>{' '}
        {day.uncertainty}
      </p>
      {day.grounded_in.length > 0 && (
        <p className="ov-note mt-1.5">
          <span className="text-[var(--ov-text-2)]">Shaped by:</span>{' '}
          {day.grounded_in.join('; ')}
        </p>
      )}
      <p className="mt-2 text-[11px] text-[var(--ov-text-4)]">
        Written by{' '}
        {day.model === 'demo' ? 'a placeholder (no API key yet)' : day.model}
        {day.cached ? ' · from cache' : ''}
      </p>
    </div>
  );
}
