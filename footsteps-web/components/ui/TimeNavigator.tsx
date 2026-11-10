'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TARGET_YEARS } from '@/lib/constants';
import {
  NOW,
  TIME_MAX,
  TIME_MIN,
  agoLabel,
  calendarLabel,
  clampTime,
  dataStatus,
  livesFraction,
  populationAt,
  populationLabel,
  timeAtLivesFraction,
} from '@/lib/time';

/**
 * Time behaves like the map. The top strip is a zoomable, pannable window of
 * years centred on the current moment (scroll/pinch to zoom, drag to pan).
 * The bottom strip is the whole span scaled by lives lived: each pixel holds
 * the same number of person-years, so it stretches where more people were
 * alive; click or drag it to jump. Years are labels, not stops.
 */
interface Props {
  time: number;
  onChange: (time: number) => void;
}

const MIN_WIDTH = 4; // years across the strip at full zoom
const MAX_WIDTH = TIME_MAX - TIME_MIN;
const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const STRIP_H = 40;
const LIVES_H = 16;
const GAP = 20;
const COLORS = {
  line: 'rgba(255,255,255,0.14)',
  tick: 'rgba(255,255,255,0.55)',
  people: 'rgba(242,181,107,0.55)',
  data: '#5fd4e8',
  cursor: '#f2efe8',
  window: 'rgba(242,239,232,0.85)',
};

function popHeight(t: number, h: number) {
  const v = (Math.log10(populationAt(t)) - 6.5) / 3; // ~3M .. ~3B
  return Math.max(0.06, Math.min(1, v)) * h;
}

export default function TimeNavigator({ time, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(2000);
  const [cssWidth, setCssWidth] = useState(800);
  const timeRef = useRef(time);
  timeRef.current = time;
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCssWidth(el.clientWidth));
    ro.observe(el);
    setCssWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cssWidth;
    const h = STRIP_H + GAP + LIVES_H + 14;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'top';

    // --- zoom strip ---
    const half = width / 2;
    const left = time - half;
    const toX = (t: number) => ((t - left) / width) * w;
    // outside the data
    ctx.fillStyle = 'rgba(108,115,128,0.18)';
    if (toX(TIME_MIN) > 0) ctx.fillRect(0, 0, toX(TIME_MIN), STRIP_H);
    if (toX(TIME_MAX) < w) ctx.fillRect(toX(TIME_MAX), 0, w - toX(TIME_MAX), STRIP_H);
    // population ribbon
    ctx.fillStyle = COLORS.people;
    for (let px = 0; px < w; px += 2) {
      const t = left + (px / w) * width;
      if (t < TIME_MIN || t > TIME_MAX) continue;
      const ph = popHeight(t, STRIP_H);
      ctx.fillRect(px, STRIP_H - ph, 2, ph);
    }
    // ticks in years ago
    const step = NICE.find((n) => (n / width) * w >= 80) ?? 5000;
    const firstAgo = Math.ceil((NOW - (time + half)) / step) * step;
    ctx.textAlign = 'center';
    for (let ago = firstAgo; NOW - ago >= left; ago += step) {
      const t = NOW - ago;
      if (t < TIME_MIN || t > TIME_MAX) continue;
      const x = toX(t);
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(x, 0, 1, STRIP_H);
      ctx.fillStyle = COLORS.tick;
      ctx.fillText(`${ago.toLocaleString('en-US')} y ago`, x, STRIP_H + 3);
    }
    // data years
    ctx.fillStyle = COLORS.data;
    for (const k of TARGET_YEARS) {
      const x = toX(k);
      if (x >= -2 && x <= w + 2) ctx.fillRect(x - 1, 0, 2, 6);
    }
    // centre line = now showing
    ctx.fillStyle = COLORS.cursor;
    ctx.fillRect(w / 2 - 1, -2, 2, STRIP_H + 2);

    // --- lives-lived overview ---
    const ly = STRIP_H + GAP;
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(0, ly, w, LIVES_H);
    ctx.fillStyle = COLORS.people;
    for (let px = 0; px < w; px += 2) {
      const t = timeAtLivesFraction(px / w);
      const ph = popHeight(t, LIVES_H);
      ctx.fillRect(px, ly + LIVES_H - ph, 2, ph);
    }
    ctx.fillStyle = COLORS.data;
    for (const k of TARGET_YEARS) ctx.fillRect(livesFraction(k) * w - 0.5, ly, 1, 3);
    // visible window
    const a = livesFraction(clampTime(left)) * w;
    const b = livesFraction(clampTime(time + half)) * w;
    ctx.strokeStyle = COLORS.window;
    ctx.lineWidth = 1;
    ctx.strokeRect(a + 0.5, ly - 2.5, Math.max(2, b - a - 1), LIVES_H + 5);
    ctx.fillStyle = COLORS.cursor;
    ctx.fillRect(livesFraction(time) * w - 1, ly - 3, 2, LIVES_H + 6);
    // overview labels (a few anchors)
    ctx.fillStyle = COLORS.tick;
    ctx.textAlign = 'left';
    ctx.fillText(calendarLabel(TIME_MIN), 0, ly + LIVES_H + 3);
    ctx.textAlign = 'right';
    ctx.fillText(calendarLabel(TIME_MAX), w, ly + LIVES_H + 3);
    ctx.textAlign = 'center';
    for (const k of [-3000, 0, 1000, 1500]) {
      const x = livesFraction(k) * w;
      if (x > 60 && x < w - 60) ctx.fillText(calendarLabel(k), x, ly + LIVES_H + 3);
    }
  }, [time, width, cssWidth]);

  // --- interaction ---
  const zoom = useCallback((factor: number) => {
    setWidth((w0) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w0 * factor)));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // horizontal trackpad swipe pans
        onChange(clampTime(timeRef.current + (e.deltaX / canvas.clientWidth) * widthRef.current));
      } else zoom(Math.exp(e.deltaY * 0.002));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [onChange, zoom]);

  const drag = useRef<{ mode: 'pan' | 'lives'; x: number; t: number } | null>(null);
  const pointers = useRef(new Map<number, number>());
  const pinch = useRef<number | null>(null);

  const livesAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return timeAtLivesFraction((e.clientX - r.left) / r.width);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, e.clientX);
    const r = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - r.top;
    if (y > STRIP_H + GAP / 2) {
      drag.current = { mode: 'lives', x: e.clientX, t: time };
      onChange(livesAt(e));
    } else drag.current = { mode: 'pan', x: e.clientX, t: time };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, e.clientX);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.max(1, Math.abs(a - b));
      if (pinch.current) zoom(pinch.current / d);
      pinch.current = d;
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'lives') onChange(livesAt(e));
    else {
      const w = e.currentTarget.clientWidth;
      onChange(clampTime(d.t - ((e.clientX - d.x) / w) * width));
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = width * (e.shiftKey ? 0.2 : 0.02);
    if (e.key === 'ArrowLeft') onChange(clampTime(time - step));
    else if (e.key === 'ArrowRight') onChange(clampTime(time + step));
    else if (e.key === '+' || e.key === '=') zoom(0.8);
    else if (e.key === '-') zoom(1.25);
    else return;
    e.preventDefault();
  };

  const status = dataStatus(time);
  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-3 pt-2 bg-gradient-to-t from-black/85 via-black/60 to-transparent">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-white">
        <span className="text-base font-semibold tabular-nums">{agoLabel(time)}</span>
        <span className="text-xs text-white/60 tabular-nums">{calendarLabel(time)}</span>
        <span className="text-xs text-[#f2b56b] tabular-nums">~{populationLabel(populationAt(time))} people</span>
        <span
          className={`rounded-full border px-2 py-px text-[10px] ${status.exact ? 'border-[#5fd4e8] text-[#5fd4e8]' : 'border-white/30 text-white/60'}`}
          title="HYDE gives data every 1,000 years before 1 CE and every 100 years after. Years in between are estimated."
        >
          {status.exact
            ? 'data year'
            : `estimated between ${calendarLabel(status.y0)} and ${calendarLabel(status.y1)}`}
        </span>
        <span className="ml-auto flex gap-1">
          <button type="button" aria-label="Zoom time out" className="rounded border border-white/20 px-2 text-xs text-white/80 hover:text-white" onClick={() => zoom(2)}>−</button>
          <button type="button" aria-label="Zoom time in" className="rounded border border-white/20 px-2 text-xs text-white/80 hover:text-white" onClick={() => zoom(0.5)}>+</button>
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="block w-full cursor-grab touch-none select-none active:cursor-grabbing focus:outline-none focus-visible:ring-1 focus-visible:ring-[#5fd4e8]"
        style={{ height: STRIP_H + GAP + LIVES_H + 14 }}
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
