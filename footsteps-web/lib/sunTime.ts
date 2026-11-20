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

export type SunPosition = { longitude: number; declination: number };

/** Mean solar position: deliberately omits equation of time, like sunHours.
 * Declination uses NOAA's annual Fourier approximation (radians, day of year):
 * https://www.gml.noaa.gov/grad/solcalc/solareqns.PDF */
export function sunPosition(now: Date): SunPosition {
  const day = (now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86400000;
  const leap = new Date(Date.UTC(now.getUTCFullYear(), 1, 29)).getUTCMonth() === 1;
  const gamma = 2 * Math.PI * (day - 0.5) / (leap ? 366 : 365);
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  return { longitude: 180 - sunHours(0, now) * 15, declination: declination * 180 / Math.PI };
}

/** Sine of the solar altitude: zero is the geometric terminator. */
export function solarAltitude(lon: number, lat: number, sun: SunPosition): number {
  const rad = Math.PI / 180;
  return Math.sin(lat * rad) * Math.sin(sun.declination * rad)
    + Math.cos(lat * rad) * Math.cos(sun.declination * rad) * Math.cos((lon - sun.longitude) * rad);
}

/** Hours between sunrise and sunset at a latitude, for a solar declination in degrees (0 to 24;
 * 0 in polar night, 24 in midnight sun). Geometric: no refraction, upper limb or twilight. */
export function dayLengthHours(lat: number, declination: number): number {
  const rad = Math.PI / 180;
  const c = -Math.tan(lat * rad) * Math.tan(declination * rad);
  return c >= 1 ? 0 : c <= -1 ? 24 : (24 / Math.PI) * Math.acos(c);
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
export function sunTimeLabel(lon: number, now: Date, lat?: number): string {
  const h = sunHours(lon, now);
  const total = Math.round(h * 60) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const altitude = lat === undefined ? null : solarAltitude(lon, lat, sunPosition(now));
  const part = altitude === null ? partOfDay(h) : altitude < -0.104528 ? 'night'
    : altitude < 0 ? (h < 12 ? 'dawn' : 'dusk') : 'daylight';
  return `${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'} · ${part}`;
}
