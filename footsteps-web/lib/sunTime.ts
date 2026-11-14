// Local sun time: what a sundial would read at a longitude right now (mean solar
// time, UTC + 4 minutes per degree east). The year on the slider has no date or
// hour, so close in the map runs on today's clock: people move in real time and
// this says what time of day it is where you are looking. Within ~16 minutes of a
// true sundial (the equation of time is ignored).

/** Hours past local midnight, 0 to 24. */
export function sunHours(lon: number, now: Date): number {
  const utc = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  return (((utc + lon / 15) % 24) + 24) % 24;
}

/** Rough part of the day, from the sun's local hour (equinox-like; ignores latitude and season). */
export function partOfDay(hours: number): string {
  if (hours < 5) return 'night';
  if (hours < 7) return 'dawn';
  if (hours < 11) return 'morning';
  if (hours < 14) return 'midday';
  if (hours < 17.5) return 'afternoon';
  if (hours < 19.5) return 'dusk';
  return 'night';
}

/** e.g. "3:40 pm · afternoon". */
export function sunTimeLabel(lon: number, now: Date): string {
  const h = sunHours(lon, now);
  const total = Math.round(h * 60) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'} · ${partOfDay(h)}`;
}
