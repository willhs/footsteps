import series from '../public/climate_series.json';

const years: number[] = series.years;
const levels: number[] = series.seaLevel.values;
// The stack's own zero reads ~+8 m near the present, so measure from the last row.
const TODAY = levels[levels.length - 1];

/** Global sea level in metres relative to today, linear between series years. */
export function seaLevelAt(time: number): number {
  let i = years.findIndex((y) => y >= time);
  if (i < 0) i = years.length - 1;
  const j = Math.max(0, i - 1);
  const f = years[i] === years[j] ? 0 : Math.min(1, Math.max(0, (time - years[j]) / (years[i] - years[j])));
  return levels[j] + (levels[i] - levels[j]) * f - TODAY;
}

export function seaLevelLabel(time: number): string {
  const m = Math.round(seaLevelAt(time));
  if (m === 0) return 'sea ≈ today';
  return `sea ${m < 0 ? '−' : '+'}${Math.abs(m)} m`;
}
