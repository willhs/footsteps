import { cameraDistanceM, cameraLift, horizonRow, sceneLight, skyBackdrop, skyParam, sunVector } from './sky';
import { CLOSE3D_PITCH, SKY_PITCH } from './close3d';
import { sunPosition } from './sunTime';

// 21 June 2024 (the still day): the Nile at Luxor, local sun time = UTC + 2:10.
const LON = 32.6;
const LAT = 25.7;
const at = (utcHours: number) => Date.UTC(2024, 5, 21) + utcHours * 3_600_000;
const warmth = (c: number[]) => c[0] - c[2];

test('the flag: on unless ?sky=0', () => {
  expect(skyParam('')).toBe(true);
  expect(skyParam('?year=-3000&sky=1')).toBe(true);
  expect(skyParam('?sky=0')).toBe(false);
});

test('the sun vector is a unit vector: east in the morning, west in the afternoon, high at noon', () => {
  for (const h of [3, 7, 9.8, 13, 16.5, 22]) {
    const v = sunVector(LON, LAT, sunPosition(new Date(at(h))));
    expect(Math.hypot(...v)).toBeCloseTo(1, 6);
  }
  expect(sunVector(LON, LAT, sunPosition(new Date(at(5))))[0]).toBeGreaterThan(0.5);
  expect(sunVector(LON, LAT, sunPosition(new Date(at(14))))[0]).toBeLessThan(-0.5);
  // Local noon at 25.7°N on the solstice: 87.7° up, a little south (declination 23.4° < latitude).
  const noon = sunVector(LON, LAT, sunPosition(new Date(at(12 - LON / 15))));
  expect(noon[2]).toBeGreaterThan(0.99);
  expect(noon[1]).toBeLessThan(0);
});

test('midday is white light under a blue sky; dusk is low and warm; night is a dim blue-grey moon with a floor', () => {
  const noon = sceneLight(LON, LAT, at(9.8));
  const dusk = sceneLight(LON, LAT, at(16.45));
  const night = sceneLight(LON, LAT, at(20.5));
  expect(noon.sun[2]).toBeGreaterThan(0.95);
  expect(noon.zenith[2]).toBeGreaterThan(noon.zenith[0]);
  expect(Math.min(...noon.direct)).toBeGreaterThan(0.85);
  expect(dusk.sun[2]).toBeLessThan(0.1);
  expect(dusk.sun[0]).toBeLessThan(-0.8); // in the west
  expect(warmth(dusk.direct)).toBeGreaterThan(0.4);
  expect(warmth(dusk.horizon)).toBeGreaterThan(warmth(noon.horizon) + 0.3);
  expect(Math.max(...night.direct)).toBeLessThan(0.35);
  expect(night.direct[2]).toBeGreaterThan(night.direct[0]);
  expect(Math.min(...night.ambient)).toBeGreaterThan(0.05);
  expect(night.sun[2]).toBeGreaterThan(0.5); // the moon stands up in the sky, so slopes still read
  expect(night.key).not.toBe(noon.key);
  expect(sceneLight(LON, LAT, at(9.8)).key).toBe(noon.key);
});

test('the light turns smoothly through dusk: no visible jump between minutes', () => {
  // What a slope sees is the direct light along its direction; the sun hands over to the moon while both are weak.
  const seen = (l: ReturnType<typeof sceneLight>) => l.sun.flatMap((s) => l.direct.map((d) => s * d));
  let last = sceneLight(LON, LAT, at(16));
  for (let m = 1; m <= 180; m++) {
    const l = sceneLight(LON, LAT, at(16 + m / 60));
    const [a, b] = [seen(l), seen(last)];
    const jump = Math.max(...a.map((v, i) => Math.abs(v - b[i])), ...l.ambient.map((v, i) => Math.abs(v - last.ambient[i])));
    expect(jump).toBeLessThan(0.05);
    last = l;
  }
});

test('the horizon is off the top of the frame at the plain tilt and in it at the sky tilt', () => {
  expect(horizonRow(CLOSE3D_PITCH)).toBeLessThan(0);
  expect(horizonRow(SKY_PITCH)).toBeGreaterThan(0.03);
  expect(horizonRow(SKY_PITCH)).toBeLessThan(0.2);
  expect(skyBackdrop(sceneLight(LON, LAT, at(9.8)), SKY_PITCH)).toMatch(/^linear-gradient\(to bottom, rgba/);
});

test('the camera is lifted above the ground it looks at, never into a mountain, and not at all over lowland', () => {
  const dist = cameraDistanceM(13, 46.55, 800);
  expect(dist).toBeGreaterThan(7500);
  expect(dist).toBeLessThan(8500);
  const above = dist * Math.cos((SKY_PITCH * Math.PI) / 180);
  expect(cameraLift(0, 0, dist, SKY_PITCH, 1.6)).toBe(0);
  expect(cameraLift(-30, -50, dist, SKY_PITCH, 1.6)).toBe(0);
  // Jungfrau: 3,300 m at the centre, 2,800 m under the camera. The camera ends up above both drawn heights.
  const lift = cameraLift(3300, 2800, dist, SKY_PITCH, 1.6);
  expect(lift).toBeGreaterThanOrEqual(3300 * 1.6);
  expect(lift + above).toBeGreaterThan(2800 * 1.6);
  // A ridge under the camera higher than the centre still leaves the camera above it.
  expect(cameraLift(500, 3000, dist, SKY_PITCH, 1.6) + above).toBeGreaterThan(3000 * 1.6 + 80);
});
