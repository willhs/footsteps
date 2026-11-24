'use client';

// The person card's 3D figure behind `?avatar=3d` (docs/ops/avatar.md), in place of the SVG portrait. Loaded only with
// the flag (overlays/avatarLazy.ts). Same inputs and the same palette as the SVG (lib/avatar.ts): it waits for the atlas
// the same way, then builds the figure once. If WebGL or the files fail, it shows the SVG instead.
// An imagined illustration of the kind of person, never a likeness; the caption says so.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Person } from '../layers/people';
import { useAnthropology } from '../hooks/useAnthropology';
import Portrait from './Portrait';
import { mountAvatar } from './avatarScene';
import { portraitLooks } from '@/lib/avatar';
import { avatarCaption, avatarSpec, OTHER_HUMAN_BODY_NOTE } from '@/lib/avatarSpec';
import { epochHour, localHourAt, planOf, routineParam, stateAt } from '@/lib/routine';
import { solarNowMs } from '@/lib/solarClock';
import { stillOn } from '@/lib/still';

/** With `?routine=1`, what the person is doing now (read once when the card opens). */
function routineNow(person: Person) {
  if (typeof window === 'undefined' || !routineParam(window.location.search)) return null;
  const ms = solarNowMs();
  return stateAt(planOf(person, epochHour(ms)), localHourAt(ms, person.position[0]));
}

let canvasCount = 0;
const W = 120;
const H = 168;
const box = 'rounded-[var(--ov-radius-sm)] bg-[radial-gradient(ellipse_at_50%_35%,#3b3428_0%,#2a241d_70%)]';

export default function Avatar3D({ person, year, lat }: { person: Person; year: number; lat: number }) {
  const atlas = useAnthropology(lat, person.position[0], year);
  const rec = atlas.kind === 'settled' ? atlas.rec : undefined;
  const spec = useMemo(
    () => (rec === undefined ? null : avatarSpec(person, portraitLooks(person, year, lat, rec), { year, rec, state: routineNow(person) })),
    [person, year, lat, rec],
  );
  const canvas = useRef<HTMLCanvasElement>(null);
  // A fresh canvas per figure: dispose() forces the old WebGL context lost, and a lost canvas cannot draw again, so
  // reusing it made every rebuild (a new spec, e.g. after a zoom) fail and fall back to the drawing.
  const canvasKey = useMemo(() => ++canvasCount, [spec]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!spec || !canvas.current) return;
    setReady(false);
    const still = stillOn() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    let view: ReturnType<typeof mountAvatar>;
    try {
      view = mountAvatar(canvas.current, spec, { still });
    } catch (e) {
      console.warn('[avatar] WebGL unavailable, showing the drawing', e);
      setFailed(true);
      return;
    }
    let live = true;
    view.firstFrame.then(
      () => live && setReady(true),
      (e) => {
        console.warn('[avatar] could not build the figure, showing the drawing', e);
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
      view.dispose();
    };
  }, [spec, canvasKey]);

  if (failed) return <Portrait person={person} year={year} lat={lat} />;
  if (!spec)
    return (
      <div role="status" style={{ width: W, height: H }} className={`flex shrink-0 items-center justify-center p-3 text-center text-[11px] text-[var(--ov-text-3)] ${box}`}>
        Preparing illustration…
      </div>
    );
  return (
    <figure className="m-0 shrink-0" data-testid="avatar-3d">
      <div className="relative" style={{ width: W, height: H }}>
        <canvas
          key={canvasKey}
          ref={canvas}
          role="img"
          aria-label={`3D illustration of a ${person.role}, about ${person.age}. Drag to turn.`}
          title="Drag to turn"
          style={{ width: W, height: H, touchAction: 'none' }}
          className={`block cursor-grab active:cursor-grabbing ${box}`}
        />
        {!ready && (
          <span role="status" className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] text-[var(--ov-text-3)]">
            Preparing figure…
          </span>
        )}
      </div>
      <figcaption className="mt-1.5 text-[11px] leading-snug text-[var(--ov-text-3)]" style={{ width: W }}>
        <span className="block text-[var(--ov-text-2)]">{avatarCaption(spec)}</span>
        Imagined illustration, not a likeness
        {spec.otherHuman && <span className="mt-1 block">{OTHER_HUMAN_BODY_NOTE}</span>}
      </figcaption>
    </figure>
  );
}
