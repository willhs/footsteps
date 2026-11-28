import { sceneLight } from './sky';
import { localHourAt } from './routine';
import { solarAltitude, sunPosition } from './sunTime';
import { DEFAULT_DIAL_HOUR, dialInstant, formatHour, hourParam, skyPhase, snapHour } from './timeOfDay';

/** Places the reviews look at: the Alps, Beringia, Lake Mega-Chad, south-east Australia. */
const PLACES: [number, number][] = [[8, 46.6], [-168, 65], [15, 13.5], [150, -35]];

const altitudeDegrees = (hour: number, lon: number, lat: number) =>
  (Math.asin(solarAltitude(lon, lat, sunPosition(new Date(dialInstant(hour, lon, lat))))) * 180) / Math.PI;

describe('the time-of-day dial', () => {
  it('puts its hour at the view centre, whatever the longitude', () => {
    for (const [lon, lat] of PLACES) {
      for (const hour of [0, 6.25, 10.5, 23.75]) expect(localHourAt(dialInstant(hour, lon, lat), lon)).toBeCloseTo(hour, 6);
    }
  });

  it('starts at mid-morning with a high sun in the east, on either hemisphere', () => {
    for (const [lon, lat] of PLACES) {
      const light = sceneLight(lon, lat, dialInstant(DEFAULT_DIAL_HOUR, lon, lat));
      expect((Math.asin(light.sun[2]) * 180) / Math.PI).toBeGreaterThan(30);
      expect(light.sun[0]).toBeGreaterThan(0); // east-north-up: the morning sun is in the east
      expect(skyPhase(DEFAULT_DIAL_HOUR, lon, lat)).toBe('day');
    }
  });

  it('reaches a dark night at midnight up to about 65°', () => {
    for (const [lon, lat] of PLACES) {
      expect(altitudeDegrees(0, lon, lat)).toBeLessThan(-6);
      expect(skyPhase(0, lon, lat)).toBe('night');
    }
  });

  it('names dawn and dusk from where the sun is', () => {
    expect(skyPhase(4.75, 8, 46.6)).toBe('dawn');
    expect(skyPhase(19.25, 8, 46.6)).toBe('dusk');
  });

  it('snaps to quarter hours and wraps round midnight', () => {
    expect(snapHour(10.6)).toBe(10.5);
    expect(snapHour(23.9)).toBe(0);
    expect(snapHour(-0.25)).toBe(23.75);
  });

  it('reads ?hour= and writes 24-hour times', () => {
    expect(hourParam('?hour=21.5')).toBe(21.5);
    expect(hourParam('?hour=25')).toBe(1);
    expect(hourParam('?hour=')).toBeNull();
    expect(hourParam('?hour=dusk')).toBeNull();
    expect(hourParam('?year=-5000')).toBeNull();
    expect(formatHour(10.5)).toBe('10:30');
    expect(formatHour(0)).toBe('0:00');
    expect(formatHour(23.999)).toBe('0:00');
  });
});
