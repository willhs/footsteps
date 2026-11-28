import { patternOrigin } from './groundDetail';

test('the pattern origin stays put while the view moves about a place, and follows it once it has gone a few degrees', () => {
  const start = patternOrigin(-168.3, 64.6);
  expect(start).toEqual([-168, 65]);
  // Panning within a few degrees keeps the origin, so the ground patterns never shift under a pan.
  expect(patternOrigin(-166.2, 63.1)).toEqual([-168, 65]);
  expect(patternOrigin(-170.9, 67.9)).toEqual([-168, 65]);
  // A jump elsewhere re-anchors near the new view: the shear (lon - origin) x sin(lat) stays under a few degrees' worth.
  expect(patternOrigin(12.5, 41.9)).toEqual([13, 42]);
});
