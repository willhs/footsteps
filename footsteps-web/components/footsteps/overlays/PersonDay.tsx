'use client';

import { useEffect, useState } from 'react';

/** What the day API needs: the grounding facts for one clicked person. */
export type DayRequest = {
  year: number;
  lat: number;
  lon: number;
  cellPeople: number;
  neighbourhoodPeople: number;
  densityClass: string;
  confidence: string;
  person: { age: number; female: boolean; role: string; groupKind: number; groupPeople: number };
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
  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; day: Day } | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const key = JSON.stringify(request);
  useEffect(() => setState({ kind: 'idle' }), [key]);

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
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
    }
  }

  if (state.kind === 'idle')
    return (
      <button
        type="button"
        onClick={imagine}
        className="mt-2 rounded border border-[#ffe2aa]/60 px-2 py-1 text-[#ffe2aa] hover:bg-[#ffe2aa]/10"
      >
        Imagine their day
      </button>
    );
  if (state.kind === 'loading')
    return (
      <p role="status" className="mt-2 flex items-center gap-2 text-white/70">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ffe2aa]" />
        Imagining a day from these facts…
      </p>
    );
  if (state.kind === 'error') return <p className="mt-2 text-white/70">{state.message}</p>;

  const { day } = state;
  return (
    <div className="mt-2 max-h-72 overflow-y-auto pr-1">
      <p className="mb-1 inline-block rounded-full border border-[#ffe2aa]/60 px-2 py-px text-[10px] uppercase tracking-wide text-[#ffe2aa]">
        Speculative
      </p>
      <p className="mb-2 text-white">{day.summary}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {day.schedule.map((s, i) => (
          <div key={i} className="contents">
            <dt className="whitespace-nowrap text-white/55">{s.time}</dt>
            <dd className="text-white/90">{s.activity}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-white/55">Most uncertain: {day.uncertainty}</p>
      {day.grounded_in.length > 0 && (
        <p className="mt-1 text-white/45">Shaped by: {day.grounded_in.join('; ')}</p>
      )}
      <p className="mt-1 text-white/35">
        Written by {day.model === 'demo' ? 'a placeholder (no API key yet)' : day.model}
        {day.cached ? ' · from cache' : ''}
      </p>
    </div>
  );
}
