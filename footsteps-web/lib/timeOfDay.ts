// The time-of-day dial: the hour of the day the map shows, chosen by the viewer, in place of the old Day/night switch that
// followed the real clock. Turning it sets the local sun time at the view's centre, and that fixes one sun for the whole Earth:
// panning and zooming afterwards never move the sun or the night side, the dial just reads the local hour at the new centre.
// The light, the night shading, the hearths' firelight and every person's daily routine (lib/routine.ts) follow it.
//
// WHAT IS MEASURED, WHAT IS IMAGINED. Nothing here is about the past: the slider's year has no date or hour. The dial picks an
// hour on a late-spring day of the view's hemisphere (the sun about 12° on that side of the equator): a high mid-morning sun at
// mid latitudes, and still a dark night up to about 65° (at midsummer the far north never gets dark, so night could not be
// shown there). Who sleeps and who walks out at that hour is the routine's model.

import { solarAltitude, sunPosition } from './sunTime';
import type { IconName } from './icons';

const HOUR_MS = 3_600_000;
const HOURS_PER_DAY = 24;
const DEGREES_PER_HOUR = 15;

/** Where the dial starts: mid-morning, so the default view is daytime and slopes still show (the close-up's fixed daylight
 * used the same hour before the dial replaced it). */
export const DEFAULT_DIAL_HOUR = 10.5;

/** The dial moves in quarter hours (arrow keys move one step, Page Up / Page Down an hour). */
export const DIAL_STEP_HOURS = 0.25;
export const DIAL_PAGE_HOURS = 1;

/** The dial's days, UTC midnight: late spring, the sun's declination about +12° (north) and -12° (south) (lib/sunTime.ts `sunPosition`). */
const NORTH_DIAL_DAY_UTC_MS = Date.UTC(2024, 3, 22);
const SOUTH_DIAL_DAY_UTC_MS = Date.UTC(2024, 9, 25);

/** `?hour=21.5` opens the map at that local sun hour (for links to a night scene); without it the dial starts at DEFAULT_DIAL_HOUR. */
export function hourParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('hour');
  if (raw === null || raw.trim() === '') return null;
  const hour = Number(raw);
  return Number.isFinite(hour) ? wrapHour(hour) : null;
}

/** An hour folded into [0, 24). */
export function wrapHour(hour: number): number {
  return ((hour % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
}

/** An hour rounded to the dial's step, folded into [0, 24). */
export function snapHour(hour: number): number {
  return wrapHour(Math.round(hour / DIAL_STEP_HOURS) * DIAL_STEP_HOURS);
}

/** The sun-clock instant (ms since the epoch) at which it is `hour` local sun time at longitude `lon`, on the dial's day for
 * latitude `lat`'s hemisphere. */
export function dialInstant(hour: number, lon: number, lat: number): number {
  const day = lat < 0 ? SOUTH_DIAL_DAY_UTC_MS : NORTH_DIAL_DAY_UTC_MS;
  return day + (hour - lon / DEGREES_PER_HOUR) * HOUR_MS;
}

/** The sun the dial set: its local sun `hour` at the place (`lon`, `lat`) the view was centred on when it was set. The latitude
 * picks the hemisphere's day; it is kept from the first setting, so turning the dial over the other hemisphere moves only the hour. */
export type DialSun = { hour: number; lon: number; lat: number };

/** "10:30", 24-hour. */
export function formatHour(hour: number): string {
  const minutes = Math.round(wrapHour(hour) * 60) % (HOURS_PER_DAY * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

export type SkyPhase = 'night' | 'dawn' | 'day' | 'dusk';

/** Sine of the sun's altitude where twilight ends: 6° below the horizon (civil twilight). */
const TWILIGHT_SINE = -Math.sin((6 * Math.PI) / 180);

/** Night, dawn, day or dusk at (`lon`, `lat`) at a sun-clock instant (ms since the epoch), from where the sun really is then. */
export function skyPhase(ms: number, lon: number, lat: number): SkyPhase {
  const altitude = solarAltitude(lon, lat, sunPosition(new Date(ms)));
  if (altitude >= 0) return 'day';
  if (altitude < TWILIGHT_SINE) return 'night';
  return localSunHour(ms, lon) < 12 ? 'dawn' : 'dusk';
}

/** Local sun hour (0 to 24) at a longitude at a sun-clock instant. */
const localSunHour = (ms: number, lon: number) => wrapHour(ms / HOUR_MS + lon / DEGREES_PER_HOUR);

export const SKY_PHASE_ICON: Record<SkyPhase, IconName> = { night: 'night', dawn: 'dawn', day: 'day', dusk: 'dusk' };
