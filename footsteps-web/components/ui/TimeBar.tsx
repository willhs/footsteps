'use client';

import { useEffect, useRef, useState } from 'react';
import { PEOPLE_YEARS } from '@/lib/constants';
import { MOMENTS, type Moment } from '@/lib/moments';
import { HYDE_MIN, TIME_MAX, TIME_MIN, agoLabel, calendarLabel, clampTime, evidenceAt, populationAt } from '@/lib/time';
import {
  BAR_LABELS,
  WHEEL_GAIN,
  dragMove,
  dragStart,
  parseYear,
  posAt,
  scrubLevel,
  stepTime,
  timeAt,
  yearsPerPos,
  type Drag,
} from '@/lib/timeScale';
import TimeReadout from './TimeReadout';

/**
 * The time bar: one fixed track, 100,000 BCE to 1900, log of years ago (the deep
 * past compressed, recent history roomy). Rough by default, precise on demand:
 * - click or drag anywhere: the needle follows the pointer (one gesture spans all of it)
 * - while dragging, slide up off the bar for 1/4 then 1/16 speed, labelled (lib/timeScale.ts dragMove)
 * - arrow keys step by round years (Shift or PageUp/PageDown for 10x), Home/End
 * - click the calendar year (or press Enter on the bar) and type a year
 * Quietly inside the track: the population curve (paler where modelled), the
 * 10,000 BCE measured/modelled boundary, data-year ticks and named moments.
 */
interface Props {
  time: number;
  onChange: (time: number) => void;
  /** Data years still loading for the current view; null when the map is up to date. */
  loading?: [number, number] | null;
}

const TOP = 9; // room above the track for moment markers
const BAR = 16;
const H = TOP + BAR + 19; // + label row; the whole canvas is the touch target
const MID = TOP + BAR / 2;
const FONT = '11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const COLORS = {
  track: 'rgba(255,255,255,0.08)',
  people: 'rgba(242,181,107,0.5)',
  modelled: 'rgba(242,181,107,0.22)',
  boundary: 'rgba(242,181,107,0.7)',
  data: 'rgba(95,212,232,0.55)',
  label: 'rgba(243,241,236,0.5)',
  labelTick: 'rgba(255,255,255,0.16)',
  hover: 'rgba(243,241,236,0.35)',
  hoverText: 'rgba(243,241,236,0.85)',
  needle: '#f2efe8',
  knobRing: 'rgba(0,0,0,0.55)',
  loading: '#5fd4e8',
  moment: '#f2b56b',
};
const NEEDLE_GRAB_PX = 16; // pressing this close to the needle grabs it without jumping

function popHeight(t: number) {
  const v = (Math.log10(populationAt(t)) - 5) / 4.5;
  return Math.max(0.06, Math.min(1, v)) * (BAR - 2);
}

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Publish how much of the screen bottom the panel takes (--ov-timeline-h), so
 * bottom-anchored overlays sit just above it at any width. */
function usePublishPanelHeight(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      root.style.setProperty('--ov-timeline-h', `${Math.max(0, Math.round(window.innerHeight - top))}px`);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    update();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref]);
}

function draw(
  canvas: HTMLCanvasElement,
  w: number,
  time: number,
  loading: boolean,
  fine: boolean,
  hoverX: number | null,
) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, H);
  ctx.font = FONT;
  const x = (t: number) => posAt(t) * w;

  // track
  ctx.fillStyle = COLORS.track;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, TOP, w, BAR, BAR / 2);
  else ctx.rect(0, TOP, w, BAR);
  ctx.fill();
  ctx.save();
  ctx.clip();

  // population curve, as two filled areas: modelled (pale) then measured
  const bx = x(HYDE_MIN);
  for (const [x0, x1, color] of [
    [0, bx, COLORS.modelled],
    [bx, w, COLORS.people],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x0, TOP + BAR);
    for (let px = x0; px <= x1; px += 2) ctx.lineTo(px, TOP + BAR - popHeight(timeAt(px / w)));
    ctx.lineTo(x1, TOP + BAR - popHeight(timeAt(x1 / w)));
    ctx.lineTo(x1, TOP + BAR);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // data years: a short cyan tick at the top, only where they stand apart
  ctx.fillStyle = COLORS.data;
  let lastTick = -1e9;
  for (const y of PEOPLE_YEARS) {
    const px = x(y);
    if (px - lastTick < 7) continue;
    ctx.fillRect(px - 0.5, TOP, 1, 3);
    lastTick = px;
  }
  ctx.restore();

  // measured / modelled boundary
  ctx.fillStyle = COLORS.boundary;
  ctx.fillRect(bx - 0.5, TOP, 1, BAR);
  if (w >= 640) {
    ctx.font = '10px ui-sans-serif, system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'right';
    ctx.fillText('modelled', bx - 6, MID);
    ctx.textAlign = 'left';
    ctx.fillText('measured', bx + 6, MID);
    ctx.font = FONT;
  }

  // named moments: small amber marks above the track
  ctx.fillStyle = COLORS.moment;
  for (const m of MOMENTS) {
    const mx = x(m.year);
    ctx.beginPath();
    ctx.moveTo(mx - 3, TOP - 6);
    ctx.lineTo(mx + 3, TOP - 6);
    ctx.lineTo(mx, TOP - 1);
    ctx.closePath();
    ctx.fill();
  }

  // where a click would land: a hairline, and its year in the label row
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let hoverSpan: [number, number] | null = null;
  if (hoverX !== null) {
    ctx.fillStyle = COLORS.hover;
    ctx.fillRect(Math.round(hoverX) - 0.5, TOP, 1, BAR);
    const text = calendarLabel(timeAt(hoverX / w));
    const tw = ctx.measureText(text).width;
    const left = Math.min(w - tw, Math.max(0, hoverX - tw / 2));
    ctx.fillStyle = COLORS.hoverText;
    ctx.fillText(text, left, TOP + BAR + 5);
    hoverSpan = [left - 8, left + tw + 8];
  }

  // labels under the track (skipping any the hover year covers)
  let lastRight = -1e9;
  BAR_LABELS.forEach((l, i) => {
    const px = x(l.time);
    const tw = ctx.measureText(l.text).width;
    const left = i === 0 ? 0 : i === BAR_LABELS.length - 1 ? w - tw : px - tw / 2;
    if (left < lastRight + 8) return;
    lastRight = left + tw;
    if (hoverSpan && left < hoverSpan[1] && left + tw > hoverSpan[0]) return;
    ctx.fillStyle = COLORS.labelTick;
    ctx.fillRect(px - 0.5, TOP + BAR + 1, 1, 3);
    ctx.fillStyle = COLORS.label;
    ctx.fillText(l.text, left, TOP + BAR + 5);
  });

  // needle and knob; dashed cyan while the map catches up
  const cx = x(time);
  if (loading) {
    ctx.fillStyle = COLORS.loading;
    for (let y = TOP - 4; y < TOP + BAR + 4; y += 5) ctx.fillRect(cx - 1, y, 2, 3);
  } else {
    ctx.fillStyle = COLORS.needle;
    ctx.fillRect(cx - 1, TOP - 4, 2, BAR + 8);
  }
  ctx.beginPath();
  ctx.arc(cx, MID, fine ? 4 : 6, 0, Math.PI * 2);
  ctx.fillStyle = loading ? COLORS.loading : COLORS.needle;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COLORS.knobRing;
  ctx.stroke();
  if (fine) {
    // a thin ring says "fine control" while scrubbing off the bar
    ctx.beginPath();
    ctx.arc(cx, MID, 9, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.needle;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export default function TimeBar({ time, onChange, loading = null }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const w = useWidth(canvasRef);
  usePublishPanelHeight(panelRef);

  const [hover, setHover] = useState<{ x: number; moment: Moment | null } | null>(null);
  const [pinnedMoment, setPinnedMoment] = useState<Moment | null>(null);
  const [scrub, setScrub] = useState<{ label: string } | null>(null); // set while dragging
  const fine = !!scrub?.label;
  const [editing, setEditing] = useState<string | null>(null); // the typed text while editing
  const note = hover?.moment ?? pinnedMoment;

  const timeRef = useRef(time);
  timeRef.current = time;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    const c = canvasRef.current;
    if (c) draw(c, w, time, !!loading, fine, hover && !hover.moment ? hover.x : null);
  }, [w, time, loading, fine, hover]);

  // Wheel or trackpad over the bar nudges time, finer than a drag.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const t = timeRef.current;
      changeRef.current(clampTime(t + (d * WHEEL_GAIN * yearsPerPos(t)) / (el.clientWidth || 800)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    // How far the pointer is above or below the track itself (0 while on it).
    const y = e.clientY - r.top;
    const offBar = Math.max(0, TOP - y, y - (TOP + BAR));
    return { px: e.clientX - r.left, width: r.width, offBar };
  };
  const momentNear = (px: number, width: number, slop: number): Moment | null => {
    let best: Moment | null = null;
    let bestD = slop;
    for (const m of MOMENTS) {
      const d = Math.abs(posAt(m.year) * width - px);
      if (d < bestD) {
        best = m;
        bestD = d;
      }
    }
    return best;
  };

  const drag = useRef<Drag | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    sliderRef.current?.focus({ preventScroll: true });
    const { px, width } = local(e);
    const onNeedle = Math.abs(posAt(time) * width - px) <= NEEDLE_GRAB_PX;
    const m = onNeedle ? null : momentNear(px, width, e.pointerType === 'mouse' ? 7 : 11);
    let start = time;
    if (m) start = clampTime(m.year);
    else if (!onNeedle) start = timeAt(px / width);
    setPinnedMoment(m);
    setHover(null);
    if (start !== time) onChange(start);
    drag.current = dragStart(start, e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { px, width, offBar } = local(e);
    const d = drag.current;
    if (!d) {
      if (e.pointerType === 'mouse') setHover({ x: px, moment: momentNear(px, width, 7) });
      return;
    }
    const next = dragMove(d, e.clientX, offBar, width, px / width);
    drag.current = next;
    const label = scrubLevel(offBar).label;
    if (label !== scrub?.label) setScrub({ label });
    if (next.pos !== d.pos) onChange(timeAt(next.pos));
  };
  const endDrag = () => {
    drag.current = null;
    setScrub(null);
  };

  const commitEdit = (text: string, keepOpen: boolean) => {
    const y = parseYear(text);
    if (y !== null) {
      onChange(y);
      setEditing(null);
      sliderRef.current?.focus({ preventScroll: true });
    } else if (!keepOpen) setEditing(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const big = e.shiftKey;
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = stepTime(time, -1, big);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = stepTime(time, 1, big);
    else if (e.key === 'PageDown') next = stepTime(time, -1, true);
    else if (e.key === 'PageUp') next = stepTime(time, 1, true);
    else if (e.key === 'Home') next = TIME_MIN;
    else if (e.key === 'End') next = TIME_MAX;
    else if (e.key === 'Enter') setEditing('');
    else return;
    e.preventDefault();
    if (next !== null) onChange(next);
  };

  const invalid = editing !== null && editing.trim() !== '' && parseYear(editing) === null;
  const calendar =
    editing === null ? (
      <button
        type="button"
        onClick={() => setEditing('')}
        className="rounded-sm text-[13px] text-[var(--ov-text-2)] tabular-nums underline decoration-dotted decoration-[var(--ov-text-4)] underline-offset-4 hover:text-[var(--ov-text)] hover:decoration-[var(--ov-text-2)] focus:outline-none focus-visible:outline-1 focus-visible:outline-[var(--ov-data)]"
        title="Type a year, e.g. 1347, 500 BCE or 12k BCE"
        data-testid="year-label"
      >
        {calendarLabel(time)}
      </button>
    ) : (
      <input
        autoFocus
        value={editing}
        placeholder={calendarLabel(time)}
        aria-label="Go to year"
        aria-invalid={invalid}
        data-testid="year-input"
        onChange={(e) => setEditing(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commitEdit(editing, true);
          else if (e.key === 'Escape') {
            setEditing(null);
            sliderRef.current?.focus({ preventScroll: true });
          }
        }}
        onBlur={() => commitEdit(editing, false)}
        className={`w-[11ch] rounded-sm border-b bg-transparent text-[13px] text-[var(--ov-text)] tabular-nums outline-none placeholder:text-[var(--ov-text-4)] ${
          invalid ? 'border-[var(--ov-text-4)] border-dashed' : 'border-[var(--ov-data)]'
        }`}
      />
    );

  return (
    <div
      ref={panelRef}
      className="ov-panel absolute z-10 px-4 pb-2 pt-3 sm:px-5"
      style={{ left: 'var(--ov-left)', right: 'var(--ov-right)', bottom: 'var(--ov-bottom)' }}
    >
      <TimeReadout time={time} loading={loading} note={note} calendar={calendar} />
      <div
        ref={sliderRef}
        tabIndex={0}
        role="slider"
        aria-label="Time"
        aria-valuemin={TIME_MIN}
        aria-valuemax={TIME_MAX}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${agoLabel(time)}, ${calendarLabel(time)}${evidenceAt(Math.round(time)) === 'modelled' ? ', modelled' : ''}`}
        aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight PageUp PageDown Home End Enter"
        onKeyDown={onKeyDown}
        className="relative rounded focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ov-data)]"
      >
        {scrub && (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-full z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded border border-white/15 bg-[#15140f] px-2 py-0.5 text-[11px] text-[var(--ov-text)] shadow"
            style={{ left: `clamp(48px, ${posAt(time) * 100}%, calc(100% - 48px))` }}
            data-testid="scrub-label"
          >
            {scrub.label || '\u2191 slide up for finer'}
          </div>
        )}
        <canvas
          ref={canvasRef}
          data-testid="time-bar"
          className="block w-full cursor-pointer touch-none select-none"
          style={{ height: H }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => setHover(null)}
        />
      </div>
    </div>
  );
}
