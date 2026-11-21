'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildSeries, markerAt, yAt, type BandPoint } from '@/lib/populationSeries';
import { timeAt } from '@/lib/timeScale';

/**
 * The small world-population chart under the counter, behind `?chart=1` (nothing is drawn without it).
 * World people on a log scale, over the time bar's own compressed time axis (the same scale, so the same year is the same
 * fraction of the width): before 10,000 BCE the MODELLED low-high band, shaded; from 10,000 BCE HYDE's measured totals, solid.
 * Click or drag to set the year. The numbers are `lib/populationSeries.ts`'s; nothing else is read.
 */
interface Props {
  time: number;
  onChange: (time: number) => void;
}

// A viewBox of about 300 x 70; it scales as one picture, so the panel's width never distorts the text.
const W = 300;
const H = 70;
const PAD_L = 27; // room for the axis labels
const PAD_R = 3;
const PAD_T = 4;
const PAD_B = 4;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const GRID: ReadonlyArray<[number, string]> = [
  [1e5, '100k'],
  [1e6, '1M'],
  [1e7, '10M'],
  [1e8, '100M'],
  [1e9, '1B'],
];

const px = (x: number) => PAD_L + x * PLOT_W;
const py = (people: number) => PAD_T + (1 - yAt(people)) * PLOT_H;
const f = (n: number) => n.toFixed(1);
/** Where the two labels sit vertically: in the empty space above the band, and below the measured line's first stretch. */
const MODELLED_LABEL_AT = 4e7;
const HYDE_LABEL_AT = 3.5e5;

/** The band as one closed outline: along the high edge, back along the low edge. */
function bandPath(points: readonly BandPoint[]): string {
  const top = points.map((p) => `${f(px(p.x))},${f(py(p.high))}`);
  const bottom = [...points].reverse().map((p) => `${f(px(p.x))},${f(py(p.low))}`);
  return `M${top.join('L')}L${bottom.join('L')}Z`;
}

export default function PopulationChart({ time, onChange }: Props) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(new URLSearchParams(window.location.search).get('chart') === '1'), []);
  const series = useMemo(() => buildSeries(), []);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  if (!on) return null;

  const timeFromPointer = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W; // viewBox units
    return timeAt((x - PAD_L) / PLOT_W);
  };

  const m = markerAt(time);
  const { modelled, measured } = series;
  const measuredLine = measured.map((p) => `${f(px(p.x))},${f(py(p.people))}`).join(' ');
  const centralLine = modelled.map((p) => `${f(px(p.x))},${f(py(p.central))}`).join(' ');
  const joinX = px(measured[0].x);

  return (
    <svg
      ref={svgRef}
      data-testid="population-chart"
      viewBox={`0 0 ${W} ${H}`}
      className="mb-2 block w-full max-w-[300px] cursor-pointer touch-none select-none"
      role="img"
      aria-label="World population over time on a log scale: modelled range before 10,000 BCE, HYDE measured totals after. Click or drag to set the year."
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        onChange(timeFromPointer(e.clientX));
      }}
      onPointerMove={(e) => {
        if (dragging.current) onChange(timeFromPointer(e.clientX));
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <title>World population, log scale. Shaded: modelled range (before 10,000 BCE). Solid: HYDE measured totals.</title>
      {GRID.map(([people, label]) => (
        <g key={label}>
          <line x1={PAD_L} x2={W - PAD_R} y1={py(people)} y2={py(people)} style={{ stroke: 'var(--ov-divider)' }} strokeWidth={1} />
          <text x={PAD_L - 4} y={py(people) + 3} textAnchor="end" fontSize={8} style={{ fill: 'var(--ov-text-4)' }}>
            {label}
          </text>
        </g>
      ))}
      <path d={bandPath(modelled)} style={{ fill: 'var(--ov-amber)', fillOpacity: 0.28 }} />
      <polyline points={centralLine} fill="none" strokeWidth={0.75} strokeDasharray="2 2" style={{ stroke: 'var(--ov-amber)', strokeOpacity: 0.7 }} />
      <polyline points={measuredLine} fill="none" strokeWidth={1.75} strokeLinejoin="round" style={{ stroke: 'var(--ov-amber)' }} />
      <line x1={joinX} x2={joinX} y1={PAD_T} y2={H - PAD_B} strokeWidth={1} strokeDasharray="1 3" style={{ stroke: 'var(--ov-text-4)' }} />
      <text x={PAD_L + 5} y={py(MODELLED_LABEL_AT)} fontSize={8.5} style={{ fill: 'var(--ov-text-3)' }}>
        modelled
      </text>
      <text x={joinX + 5} y={py(HYDE_LABEL_AT)} fontSize={8.5} style={{ fill: 'var(--ov-text-2)' }}>
        HYDE
      </text>
      <line x1={px(m.x)} x2={px(m.x)} y1={PAD_T} y2={H - PAD_B} strokeWidth={1} data-testid="population-chart-marker" style={{ stroke: 'var(--ov-text)' }} />
      <circle cx={px(m.x)} cy={PAD_T + (1 - m.y) * PLOT_H} r={2.75} style={{ fill: 'var(--ov-text)', stroke: 'rgba(0,0,0,0.6)' }} strokeWidth={1} />
    </svg>
  );
}
