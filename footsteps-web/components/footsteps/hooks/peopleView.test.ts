import { nextRegion, padRegion, viewBlend, ZOOM } from './peopleView';

test('auto picks glow far out, units close in, and cross-fades between', () => {
  const far = viewBlend(2, 'auto');
  expect(far).toMatchObject({ glow: 1, units: 0, pickable: false });
  const mid = viewBlend((ZOOM.unitsIn + ZOOM.unitsFull) / 2, 'auto');
  expect(mid.glow).toBeGreaterThan(0);
  expect(mid.units).toBeGreaterThan(0);
  expect(mid.units).toBeLessThan(1);
  expect(viewBlend(ZOOM.glowGone, 'auto')).toMatchObject({ glow: 0, units: 1 });
  expect(viewBlend(ZOOM.groups, 'auto').pickable).toBe(true);
});

test('zoom changes size and brightness continuously, without steps', () => {
  for (let z = 1; z < 10; z += 0.01) {
    const a = viewBlend(z, 'auto');
    const b = viewBlend(z + 0.01, 'auto');
    expect(Math.abs(b.minPx - a.minPx)).toBeLessThan(0.02);
    expect(Math.abs(b.brightness - a.brightness)).toBeLessThan(0.01);
    expect(Math.abs(b.glow - a.glow)).toBeLessThan(0.02);
    expect(Math.abs(b.units - a.units)).toBeLessThan(0.02);
  }
});

test('debug modes fix the look regardless of zoom', () => {
  expect(viewBlend(1, 'units')).toMatchObject({ glow: 0, units: 1 });
  expect(viewBlend(8, 'grid')).toMatchObject({ glow: 0, units: 0, pickable: false });
});

test('the units region is kept while it covers the screen and rebuilt otherwise', () => {
  const screen = { west: 0, south: 40, east: 10, north: 50 };
  const region = nextRegion(null, screen, 0.25);
  expect(region).toEqual(padRegion(screen, 0.25));
  expect(region).toEqual({ west: -3, south: 37, east: 13, north: 53 });
  // A small pan stays inside: same object, nothing rebuilt.
  expect(nextRegion(region, { west: 2, south: 41, east: 12, north: 51 }, 0.25)).toBe(region);
  // Panning out of it, or zooming far in, cuts a new one.
  expect(nextRegion(region, { west: 8, south: 40, east: 18, north: 50 }, 0.25)).not.toBe(region);
  expect(nextRegion(region, { west: 4, south: 44, east: 5, north: 45 }, 0.25)).not.toBe(region);
});

test('a screen wider than the world settles on one world region', () => {
  const wide = { west: -253, south: -85, east: 253, north: 85 };
  const region = nextRegion(null, wide, 0.25);
  expect(region).toEqual({ west: -180, south: -90, east: 180, north: 90 });
  expect(nextRegion(region, wide, 0.25)).toBe(region);
});
