'use client';

import { useEffect, useRef, useState } from 'react';
import { TARGET_YEARS } from '@/lib/constants';
import {
  NOW,
  TIME_MAX,
  TIME_MIN,
  agoLabel,
  calendarLabel,
  clampTime,
  dataStatus,
  populationAt,
  populationLabel,
} from '@/lib/time';

/**
 * One bar, log scale of years ago (recent time gets more room), with a lens:
 * the stretch around the current moment is magnified, so nearby years are easy
 * to move through while the far past and the present stay visible at the ends.
 * The scale shifts as you move. Years are labels, not stops.
 */
interface Props {
  time: number;
  onChange: (time: number) => void;
  /** Data years still loading for the current view; null when the map is up to date. */
  loading?: [number, number] | null;
}

const BAR_H = 22;
const H = BAR_H + 18;
const OFFSET = 30; // years-ago offset so the log scale behaves near the present
const LENS = 5; // magnification strength
const AGO_MIN = NOW - TIME_MAX;
const AGO_MAX = NOW - TIME_MIN;
const TICKS = [150, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000, 7000, 10000, 12000];
const COLORS = {
  bar: 'rgba(255,255,255,0.10)',
  people: 'rgba(242,181,107,0.55)',
  data: '#5fd4e8',
  tick: 'rgba(255,255,255,0.55)',
  grid: 'rgba(255,255,255,0.12)',
  cursor: '#f2efe8',
};

// s in [0,1], left = deep past, right = latest data year
const lg = (ago: number) => Math.log(ago + OFFSET);
const S = (time: number) =>
  1 - (lg(NOW - time) - lg(AGO_MIN)) / (lg(AGO_MAX) - lg(AGO_MIN));
const Sinv = (s: number) =>
  NOW - (Math.exp(lg(AGO_MIN) + (1 - s) * (lg(AGO_MAX) - lg(AGO_MIN))) - OFFSET);

// Sarkar–Brown fisheye around focus f, and its inverse
function lens(s: number, f: number) {
  const side = s >= f ? 1 - f : f;
  if (side <= 0) return s;
  const d = Math.abs(s - f) / side;
  return f + Math.sign(s - f) * (((LENS + 1) * d) / (LENS * d + 1)) * side;
}
function unlens(x: number, f: number) {
  const side = x >= f ? 1 - f : f;
  if (side <= 0) return x;
  const g = Math.abs(x - f) / side;
  return f + Math.sign(x - f) * (g / (LENS + 1 - LENS * g)) * side;
}

function popHeight(t: number) {
  const v = (Math.log10(populationAt(t)) - 6.5) / 3;
  return Math.max(0.08, Math.min(1, v)) * BAR_H;
}

export default function TimeNavigator({ time, onChange, loading = null }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cssWidth, setCssWidth] = useState(800);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCssWidth(el.clientWidth));
    ro.observe(el);
    setCssWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cssWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);
    const f = S(time);
    const x = (t: number) => lens(S(t), f) * w;

    ctx.fillStyle = COLORS.bar;
    ctx.fillRect(0, 0, w, BAR_H);
    ctx.fillStyle = COLORS.people;
    for (let px = 0; px < w; px += 2) {
      const t = Sinv(unlens(px / w, f));
      const ph = popHeight(t);
      ctx.fillRect(px, BAR_H - ph, 2, ph);
    }
    // ticks (years ago), skipping labels that would collide
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    let lastRight = -1e9;
    // left to right (oldest first) so the collision check sees labels in order
    for (const ago of [...TICKS].reverse()) {
      const t = NOW - ago;
      if (t < TIME_MIN || t > TIME_MAX) continue;
      const px = x(t);
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(px, 0, 1, BAR_H);
      const label = `${ago.toLocaleString('en-US')} y ago`;
      const half = ctx.measureText(label).width / 2;
      const cx = Math.min(w - half, Math.max(half, px));
      if (cx - half > lastRight + 8) {
        ctx.fillStyle = COLORS.tick;
        ctx.fillText(label, cx, BAR_H + 4);
        lastRight = cx + half;
      }
    }
    // data years
    ctx.fillStyle = COLORS.data;
    for (const k of TARGET_YEARS) ctx.fillRect(x(k) - 1, 0, 2, 5);
    // current moment: dashed cyan while the map is still catching up
    const cxp = x(time);
    if (loading) {
      ctx.fillStyle = COLORS.data;
      for (let y = -2; y < BAR_H + 2; y += 5) ctx.fillRect(cxp - 1, y, 2, 3);
    } else {
      ctx.fillStyle = COLORS.cursor;
      ctx.fillRect(cxp - 1, -2, 2, BAR_H + 4);
    }
  }, [time, cssWidth, loading]);

  // Drag: the pointer maps through the current lens, so the scale shifts
  // smoothly under the finger as the moment moves.
  const dragging = useRef(false);
  const timeAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const xFrac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    return clampTime(Sinv(unlens(xFrac, S(time))));
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    onChange(timeAt(e));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragging.current) onChange(timeAt(e));
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    // step a fixed share of the bar's (log) length, so steps are small near
    // the present and large in the deep past
    const step = e.shiftKey ? 0.04 : 0.005;
    if (e.key === 'ArrowLeft') onChange(clampTime(Sinv(Math.max(0, S(time) - step))));
    else if (e.key === 'ArrowRight') onChange(clampTime(Sinv(Math.min(1, S(time) + step))));
    else return;
    e.preventDefault();
  };

  const status = dataStatus(time);
  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-3 pt-2 bg-gradient-to-t from-black/85 via-black/60 to-transparent">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-white">
        <span className="text-base font-semibold tabular-nums">{agoLabel(time)}</span>
        <span className="text-xs text-white/60 tabular-nums">{calendarLabel(time)}</span>
        <span className="text-xs text-[#f2b56b] tabular-nums">~{populationLabel(populationAt(time))} people</span>
        {loading ? (
          <span
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 rounded-full border border-[#5fd4e8] px-2 py-px text-[10px] text-[#5fd4e8]"
            title="The map shows the nearest data it has until this loads."
          >
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#5fd4e8]" />
            {loading[0] === loading[1]
              ? `loading ${calendarLabel(loading[0])} data…`
              : `loading ${calendarLabel(loading[0])}–${calendarLabel(loading[1])} data…`}
          </span>
        ) : (
          <span
            className={`rounded-full border px-2 py-px text-[10px] ${status.exact ? 'border-[#5fd4e8] text-[#5fd4e8]' : 'border-white/30 text-white/60'}`}
            title="HYDE gives data every 1,000 years before 1 CE and every 100 years after. Years in between are estimated."
          >
            {status.exact
              ? 'data year'
              : `estimated between ${calendarLabel(status.y0)} and ${calendarLabel(status.y1)}`}
          </span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="block w-full cursor-ew-resize touch-none select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[#5fd4e8]"
        style={{ height: H }}
        tabIndex={0}
        role="slider"
        aria-label="Time"
        aria-valuemin={TIME_MIN}
        aria-valuemax={TIME_MAX}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${agoLabel(time)}, ${calendarLabel(time)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
