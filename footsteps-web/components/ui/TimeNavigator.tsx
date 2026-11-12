'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TARGET_YEARS } from '@/lib/constants';
import {
  HYDE_MIN,
  NOW,
  TIME_MAX,
  TIME_MIN,
  agoLabel,
  calendarLabel,
  clampTime,
  dataStatus,
  hasPeopleData,
  populationAt,
  populationLabel,
} from '@/lib/time';

/**
 * Two strips:
 * - Overview: all of history on a log scale of years ago (recent time gets more
 *   room). Click or drag to jump. The bright box is the detail window.
 * - Detail: a linear tape of the years around the map's moment, under a fixed
 *   centre needle. Double-click a year to jump there. Drag to pan (with a little momentum), scroll or pinch to
 *   zoom. The window's width follows the log scale, so the deep past shows
 *   tens of thousands of years and recent history a few hundred.
 */
interface Props {
  time: number;
  onChange: (time: number) => void;
  /** Data years still loading for the current view; null when the map is up to date. */
  loading?: [number, number] | null;
}

const OV_BAR = 10;
const OV_H = OV_BAR + 16;
const DT_BAR = 26;
const DT_H = DT_BAR + 18;
const OFFSET = 30; // years-ago offset so the log scale behaves near the present
const AGO_MIN = NOW - TIME_MAX;
const AGO_MAX = NOW - TIME_MIN;
const OV_TICKS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200];
const ZOOM_MIN = 0.01; // detail window width as a share of the overview
const ZOOM_MAX = 0.6;
const ZOOM_DEFAULT = 0.1;
const FONT = '11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const COLORS = {
  bar: 'rgba(255,255,255,0.10)',
  people: 'rgba(242,181,107,0.55)',
  data: '#5fd4e8',
  tick: 'rgba(243,241,236,0.72)',
  tickDim: 'rgba(243,241,236,0.45)',
  grid: 'rgba(255,255,255,0.14)',
  window: 'rgba(242,239,232,0.85)',
  windowFill: 'rgba(242,239,232,0.10)',
  cursor: '#f2efe8',
  beyond: 'rgba(0,0,0,0.25)',
};

// Overview: s in [0,1], left = deep past, right = latest data year.
const lg = (ago: number) => Math.log(ago + OFFSET);
const LG_SPAN = lg(AGO_MAX) - lg(AGO_MIN);
const S = (time: number) => 1 - (lg(NOW - time) - lg(AGO_MIN)) / LG_SPAN;
const Sinv = (s: number) => NOW - (Math.exp(lg(AGO_MIN) + (1 - s) * LG_SPAN) - OFFSET);

/** Detail window [lo, hi] (years), centred on `time`. Its length is what `zoom`
 * (a share of the overview) covers around `time` on the log scale. */
export function detailWindow(time: number, zoom: number): [number, number] {
  const t = clampTime(time);
  const s = S(t);
  const span = Sinv(Math.min(1.5, s + zoom / 2)) - Sinv(s - zoom / 2);
  return [t - span / 2, t + span / 2];
}

function popHeight(t: number, bar: number) {
  const p = populationAt(t);
  if (p <= 0) return 0;
  const v = (Math.log10(p) - 6.5) / 3;
  return Math.max(0.08, Math.min(1, v)) * bar;
}

/** A round step (1, 2 or 5 × 10^k years) giving roughly `px` pixels between ticks. */
function niceStep(yearsPerPx: number, px: number) {
  const raw = yearsPerPx * px;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

function shortYear(y: number) {
  const n = Math.abs(Math.round(y));
  const text = n >= 10000 ? n.toLocaleString('en-US') : String(n);
  if (y < 0) return `${text} BCE`;
  return y === 0 ? '1 CE' : `${text} CE`;
}

function shortAgo(ago: number) {
  return ago >= 1000 ? `${ago / 1000}k` : String(ago);
}

function useCanvasWidth(ref: React.RefObject<HTMLCanvasElement | null>) {
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

function prepare(canvas: HTMLCanvasElement | null, w: number, h: number) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  return ctx;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export default function TimeNavigator({ time, onChange, loading = null }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const dtRef = useRef<HTMLCanvasElement>(null);
  const ovW = useCanvasWidth(ovRef);
  const dtW = useCanvasWidth(dtRef);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);

  // Latest values for event handlers and the momentum loop.
  const timeRef = useRef(time);
  timeRef.current = time;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  // Publish how much of the screen bottom the timeline takes (--ov-timeline-h),
  // so bottom-anchored overlays sit just above it at any width.
  useEffect(() => {
    const el = panelRef.current;
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
  }, []);

  const [lo, hi] = detailWindow(time, zoom);
  const span = hi - lo;

  // Overview strip
  useEffect(() => {
    const w = ovW;
    const ctx = prepare(ovRef.current, w, OV_H);
    if (!ctx) return;
    const x = (t: number) => S(t) * w;
    ctx.fillStyle = COLORS.bar;
    roundRect(ctx, 0, 0, w, OV_BAR, 3);
    ctx.fill();
    ctx.fillStyle = COLORS.people;
    for (let px = x(HYDE_MIN); px < w; px += 2) {
      const ph = popHeight(Sinv(px / w), OV_BAR);
      ctx.fillRect(px, OV_BAR - ph, 2, ph);
    }
    let lastRight = -1e9;
    for (const ago of OV_TICKS) {
      const t = NOW - ago;
      if (t < TIME_MIN || t > TIME_MAX) continue;
      const px = x(t);
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(px, 0, 1, OV_BAR);
      const label = ago === OV_TICKS[0] ? `${shortAgo(ago)} years ago` : shortAgo(ago);
      const half = ctx.measureText(label).width / 2;
      const cx = Math.min(w - half, Math.max(half, px));
      if (cx - half > lastRight + 6) {
        ctx.fillStyle = COLORS.tickDim;
        ctx.fillText(label, cx, OV_BAR + 3);
        lastRight = cx + half;
      }
    }
    // detail window
    const x0 = Math.max(0, x(lo));
    const x1 = Math.min(w, x(hi));
    ctx.fillStyle = COLORS.windowFill;
    ctx.fillRect(x0, -1, Math.max(2, x1 - x0), OV_BAR + 2);
    ctx.strokeStyle = COLORS.window;
    ctx.lineWidth = 1.25;
    roundRect(ctx, x0 + 0.5, 0.5, Math.max(2, x1 - x0) - 1, OV_BAR - 1, 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.cursor;
    ctx.fillRect(x(time) - 0.75, -1, 1.5, OV_BAR + 2);
  }, [time, lo, hi, ovW]);

  // Detail strip
  useEffect(() => {
    const w = dtW;
    const ctx = prepare(dtRef.current, w, DT_H);
    if (!ctx) return;
    const x = (t: number) => ((t - lo) / span) * w;
    ctx.fillStyle = COLORS.bar;
    roundRect(ctx, 0, 0, w, DT_BAR, 4);
    ctx.fill();
    // people
    ctx.fillStyle = COLORS.people;
    for (let px = 0; px < w; px += 2) {
      const t = lo + (px / w) * span;
      if (t > TIME_MAX || !hasPeopleData(t)) continue;
      const ph = popHeight(t, DT_BAR);
      ctx.fillRect(px, DT_BAR - ph, 2, ph);
    }
    // beyond either end of the timeline
    ctx.fillStyle = COLORS.beyond;
    if (hi > TIME_MAX) ctx.fillRect(x(TIME_MAX), 0, w - x(TIME_MAX), DT_BAR);
    if (lo < TIME_MIN) ctx.fillRect(0, 0, x(TIME_MIN), DT_BAR);
    // HYDE boundary label
    if (lo < HYDE_MIN && hi > HYDE_MIN - span * 0.2) {
      const bx = x(HYDE_MIN);
      ctx.fillStyle = COLORS.people;
      ctx.fillRect(bx, 0, 1, DT_BAR);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.tickDim;
      if (bx > 120) ctx.fillText('no population data', bx - 6, DT_BAR / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
    }
    // ticks
    const step = niceStep(span / w, 95);
    let lastRight = -1e9;
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
      if (t < TIME_MIN || t > TIME_MAX) continue;
      const px = x(t);
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(px, 0, 1, DT_BAR);
      const label = shortYear(t);
      const half = ctx.measureText(label).width / 2;
      if (px - half > lastRight + 8 && px + half < w) {
        ctx.fillStyle = COLORS.tick;
        ctx.fillText(label, Math.max(half, px), DT_BAR + 5);
        lastRight = px + half;
      }
    }
    // data years
    ctx.fillStyle = COLORS.data;
    for (const k of TARGET_YEARS) if (k >= lo && k <= hi) ctx.fillRect(x(k) - 1, 0, 2, 5);
    // needle: dashed cyan while the map is still catching up
    const cx = x(time);
    if (loading) {
      ctx.fillStyle = COLORS.data;
      for (let y = -2; y < DT_BAR + 2; y += 5) ctx.fillRect(cx - 1, y, 2, 3);
    } else {
      ctx.fillStyle = COLORS.cursor;
      ctx.fillRect(cx - 1, -2, 2, DT_BAR + 4);
    }
  }, [time, lo, hi, span, dtW, loading]);

  // Overview: click or drag to jump.
  const ovDragging = useRef(false);
  const ovTimeAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return clampTime(Sinv(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))));
  };

  // Detail: drag pans the tape; release keeps a little momentum.
  const pan = useRef<{ x: number; last: number; v: number } | null>(null);
  const momentum = useRef(0);
  const stopMomentum = () => {
    cancelAnimationFrame(momentum.current);
    momentum.current = 0;
  };
  const yearsPerPx = useCallback(() => {
    const [a, b] = detailWindow(timeRef.current, zoomRef.current);
    return (b - a) / (dtRef.current?.clientWidth || 800);
  }, []);
  const startMomentum = (vPxPerMs: number) => {
    // Capped so a flick glides at most ~240 px of tape.
    let v = Math.max(-1.5, Math.min(1.5, vPxPerMs));
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      v *= Math.exp(-dt / 160);
      if (Math.abs(v) < 0.02) return stopMomentum();
      const next = clampTime(timeRef.current - v * dt * yearsPerPx());
      if (next === timeRef.current) return stopMomentum();
      changeRef.current(next);
      momentum.current = requestAnimationFrame(tick);
    };
    momentum.current = requestAnimationFrame(tick);
  };
  useEffect(() => stopMomentum, []);

  // Wheel / pinch zooms the detail window. Native listener so it can preventDefault.
  useEffect(() => {
    const el = dtRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : 0;
      if (d) setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * Math.exp(d * 0.002))));
      else if (e.deltaX) changeRef.current(clampTime(timeRef.current + e.deltaX * yearsPerPx()));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [yearsPerPx]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const step = span * (e.shiftKey ? 0.2 : 0.02);
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = time - step;
    else if (e.key === 'ArrowRight') next = time + step;
    else if (e.key === 'Home') next = TIME_MIN;
    else if (e.key === 'End') next = TIME_MAX;
    else if (e.key === '+' || e.key === '=') setZoom((z) => Math.max(ZOOM_MIN, z / 1.5));
    else if (e.key === '-') setZoom((z) => Math.min(ZOOM_MAX, z * 1.5));
    else return;
    e.preventDefault();
    if (next !== null) {
      stopMomentum();
      onChange(clampTime(next));
    }
  };

  const people = hasPeopleData(time);
  const status = dataStatus(time);
  return (
    <div
      ref={panelRef}
      className="ov-panel absolute z-10 px-4 pb-2.5 pt-3 sm:px-5"
      style={{ left: 'var(--ov-left)', right: 'var(--ov-right)', bottom: 'var(--ov-bottom)' }}
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="text-[17px] font-semibold leading-tight text-[var(--ov-text)] tabular-nums">{agoLabel(time)}</span>
        <span className="text-[13px] text-[var(--ov-text-2)] tabular-nums">{calendarLabel(time)}</span>
        {people ? (
          <span className="text-[13px] text-[var(--ov-amber)] tabular-nums">~{populationLabel(populationAt(time))} people</span>
        ) : (
          <span className="text-[13px] text-[var(--ov-text-3)]">no population estimate</span>
        )}
        {loading && people ? (
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
        ) : !people ? (
          <span
            className="ov-chip self-center text-[var(--ov-text-3)]"
            title="HYDE population data starts at 10,000 BCE. Earth is drawn every 1,000 years back to 100,000 BCE."
          >
            before HYDE data
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
      <div
        tabIndex={0}
        role="slider"
        aria-label="Time"
        aria-valuemin={TIME_MIN}
        aria-valuemax={TIME_MAX}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${agoLabel(time)}, ${calendarLabel(time)}`}
        onKeyDown={onKeyDown}
        className="rounded focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ov-data)]"
      >
        <canvas
          ref={ovRef}
          data-testid="time-overview"
          className="block w-full cursor-pointer touch-none select-none"
          style={{ height: OV_H }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            ovDragging.current = true;
            stopMomentum();
            onChange(ovTimeAt(e));
          }}
          onPointerMove={(e) => {
            if (ovDragging.current) onChange(ovTimeAt(e));
          }}
          onPointerUp={() => (ovDragging.current = false)}
          onPointerCancel={() => (ovDragging.current = false)}
        />
        <canvas
          ref={dtRef}
          data-testid="time-detail"
          className="mt-1.5 block w-full cursor-grab touch-none select-none active:cursor-grabbing"
          style={{ height: DT_H }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            stopMomentum();
            pan.current = { x: e.clientX, last: performance.now(), v: 0 };
          }}
          onPointerMove={(e) => {
            const p = pan.current;
            if (!p) return;
            const now = performance.now();
            const dx = e.clientX - p.x;
            const dt = Math.max(1, now - p.last);
            p.v = 0.7 * (dx / dt) + 0.3 * p.v;
            p.x = e.clientX;
            p.last = now;
            if (dx) onChange(clampTime(timeRef.current - dx * yearsPerPx()));
          }}
          onPointerUp={() => {
            const p = pan.current;
            pan.current = null;
            if (!p) return;
            // A still release: treat as a click and jump there.
            if (performance.now() - p.last > 80) p.v = 0;
            if (Math.abs(p.v) > 0.05) startMomentum(p.v);
          }}
          onPointerCancel={() => (pan.current = null)}
          onDoubleClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onChange(clampTime(lo + ((e.clientX - r.left) / r.width) * span));
          }}
        />
      </div>
    </div>
  );
}
