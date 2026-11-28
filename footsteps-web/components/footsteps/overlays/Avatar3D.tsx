'use client';

// The person card's 3D figure behind `?avatar=3d` (docs/ops/avatar.md), in place of the SVG portrait. Loaded only with
// the flag (overlays/avatarLazy.ts). Same inputs and the same palette as the SVG (lib/avatar.ts): it waits for the atlas
// the same way, then builds the figure once. If WebGL or the files fail, it shows the SVG instead.
// An imagined illustration of the kind of person, never a likeness; the caption says so.
// Orbit view (avatarScene.ts): drag to circle, scroll or pinch to zoom, right-drag to move, double-click to reset. The
// expand button opens the same person large over the map, with its own canvas; Esc or a click outside closes it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Person } from '../layers/people';
import { useAnthropology } from '../hooks/useAnthropology';
import Portrait from './Portrait';
import { mountAvatar } from './avatarScene';
import { portraitLooks } from '@/lib/avatar';
import { Icon } from '@/components/ui/Icon';
import { avatarCaption, avatarSpec, OTHER_HUMAN_BODY_NOTE } from '@/lib/avatarSpec';
import { epochHour, localHourAt, planOf, routineParam, stateAt } from '@/lib/routine';
import { solarNowMs } from '@/lib/solarClock';
import { stillOn } from '@/lib/still';
import { CloseIcon, ExpandIcon } from '@/components/ui/icons';

/** With `?routine=1`, what the person is doing now (read once when the card opens). */
function routineNow(person: Person) {
  if (typeof window === 'undefined' || !routineParam(window.location.search)) return null;
  const ms = solarNowMs();
  return stateAt(planOf(person, epochHour(ms)), localHourAt(ms, person.position[0]));
}

let canvasCount = 0;

/** The card's figure, in CSS px: small and quiet beside the text. */
const CARD_W = 120;
const CARD_H = 168;
/** Opened large: as tall as fits the window, at the card's proportions. */
const LARGE_MAX_H = 720;
const LARGE_VIEWPORT_SHARE = 0.82;
const box = 'rounded-[var(--ov-radius-sm)] bg-[radial-gradient(ellipse_at_50%_35%,#3b3428_0%,#2a241d_70%)]';
const HINT = 'Drag to turn · scroll to zoom · double-click to reset';

type Spec = NonNullable<ReturnType<typeof avatarSpec>>;

/** One WebGL figure on its own canvas, sized by its parent. Reports when it first draws, or fails. */
function FigureCanvas({ spec, label, onFail }: { spec: Spec; label: string; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // A fresh canvas per figure: dispose() forces the old WebGL context lost, and a lost canvas cannot draw again, so
  // reusing it made every rebuild (a new spec, e.g. after a zoom) fail and fall back to the drawing.
  const canvasKey = useMemo(() => ++canvasCount, [spec]);
  const [ready, setReady] = useState(false);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    if (!canvas.current) return;
    setReady(false);
    const still = stillOn() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    let view: ReturnType<typeof mountAvatar>;
    try {
      view = mountAvatar(canvas.current, spec, { still });
    } catch (e) {
      console.warn('[avatar] WebGL unavailable, showing the drawing', e);
      failRef.current();
      return;
    }
    let live = true;
    view.firstFrame.then(
      () => live && setReady(true),
      (e) => {
        console.warn('[avatar] could not build the figure, showing the drawing', e);
        if (live) failRef.current();
      },
    );
    return () => {
      live = false;
      view.dispose();
    };
  }, [spec, canvasKey]);

  return (
    <>
      <canvas
        key={canvasKey}
        ref={canvas}
        role="img"
        aria-label={label}
        title={HINT}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
        className={`block cursor-grab active:cursor-grabbing ${box}`}
      />
      {!ready && (
        <span role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] text-[var(--ov-text-3)]">
          Preparing figure…
        </span>
      )}
    </>
  );
}

/** The figure opened large over the map: same person, bigger canvas, a one-line hint. */
function LargeFigure({ spec, label, caption, onClose, onFail }: { spec: Spec; label: string; caption: string; onClose: () => void; onFail: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const height = `min(${LARGE_MAX_H}px, ${LARGE_VIEWPORT_SHARE * 100}vh)`;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="avatar-3d-large"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={(e) => {
        // Portalled, but React still bubbles it to the card: keep it from opening the person's panel.
        e.stopPropagation();
        onClose();
      }}
    >
      <figure className="ov-panel ov-panel-strong relative m-0 p-3" onClick={(e) => e.stopPropagation()}>
        <div className="relative" style={{ height, aspectRatio: `${CARD_W} / ${CARD_H}`, maxWidth: 'calc(100vw - 56px)' }}>
          <FigureCanvas spec={spec} label={label} onFail={onFail} />
          <button ref={close} type="button" aria-label="Close large view" title="Close" onClick={onClose} className="ov-icon-btn absolute right-1 top-1">
            <CloseIcon />
          </button>
        </div>
        <figcaption className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[11px] text-[var(--ov-text-3)]">
          <span className="text-[var(--ov-text-2)]">{caption}</span>
          <span>
            <Icon name="drag" /> {HINT}
          </span>
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}

export default function Avatar3D({ person, year, lat }: { person: Person; year: number; lat: number }) {
  const atlas = useAnthropology(lat, person.position[0], year);
  const rec = atlas.kind === 'settled' ? atlas.rec : undefined;
  const spec = useMemo(
    () => (rec === undefined ? null : avatarSpec(person, portraitLooks(person, year, lat, rec), { year, rec, state: routineNow(person) })),
    [person, year, lat, rec],
  );
  const [failed, setFailed] = useState(false);
  const [large, setLarge] = useState(false);
  const closeLarge = useCallback(() => setLarge(false), []);

  if (failed) return <Portrait person={person} year={year} lat={lat} />;
  if (!spec)
    return (
      <div role="status" style={{ width: CARD_W, height: CARD_H }} className={`flex shrink-0 items-center justify-center p-3 text-center text-[11px] text-[var(--ov-text-3)] ${box}`}>
        Preparing illustration…
      </div>
    );
  const label = `3D illustration of a ${person.role}, about ${person.age}. ${HINT}.`;
  const fail = () => setFailed(true);
  return (
    <figure className="m-0 shrink-0" data-testid="avatar-3d">
      <div className="group relative" style={{ width: CARD_W, height: CARD_H }}>
        <FigureCanvas spec={spec} label={label} onFail={fail} />
        <button
          type="button"
          aria-label="Open the figure large"
          title="Open large"
          onClick={(e) => {
            e.stopPropagation();
            setLarge(true);
          }}
          className="ov-icon-btn absolute right-0.5 top-0.5 h-6 w-6 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <ExpandIcon />
        </button>
      </div>
      <figcaption className="mt-1.5 text-[11px] leading-snug text-[var(--ov-text-3)]" style={{ width: CARD_W }}>
        <span className="block text-[var(--ov-text-2)]">{avatarCaption(spec)}</span>
        Imagined illustration, not a likeness
        {spec.otherHuman && <span className="mt-1 block">{OTHER_HUMAN_BODY_NOTE}</span>}
      </figcaption>
      {large && <LargeFigure spec={spec} label={label} caption={avatarCaption(spec)} onClose={closeLarge} onFail={fail} />}
    </figure>
  );
}
