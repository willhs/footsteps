import { biomeNoteAt, MAMMOTH_STEPPE_NOTE, PRAIRIE_NOTE } from './biomeNotes';
import { GREEN_SAHARA_NOTE } from './greenSahara';

test('the Green Sahara note holds whatever the biome model says', () => {
  expect(biomeNoteAt(10, 20, -6000, 'Desert')).toBe(GREEN_SAHARA_NOTE);
  expect(biomeNoteAt(10, 20, 1500, 'Desert')).toBeNull();
});

test('Kansas reads prairie, not forest, from the mid-Holocene to the plough', () => {
  expect(biomeNoteAt(-95, 40, -3000, 'Temperate deciduous forest')).toBe(PRAIRIE_NOTE);
  expect(biomeNoteAt(-95, 40, 1800, 'Warm mixed forest')).toBe(PRAIRIE_NOTE);
  expect(biomeNoteAt(-95, 40, 1900, 'Temperate deciduous forest')).toBeNull(); // ploughed by then
  expect(biomeNoteAt(-95, 40, -3000, 'Temperate grassland')).toBeNull(); // the model already says grassland
  expect(biomeNoteAt(-85, 40, -3000, 'Temperate deciduous forest')).toBeNull(); // Ohio: forest is right
});

test('the ice edge and Beringia at the glacial maximum read steppe-tundra where the model has forest', () => {
  expect(biomeNoteAt(5.8, 55.8, -20000, 'Deciduous taiga/montane forest')).toBe(MAMMOTH_STEPPE_NOTE);
  expect(biomeNoteAt(-170, 62, -20000, 'Deciduous taiga/montane forest')).toBe(MAMMOTH_STEPPE_NOTE);
  expect(biomeNoteAt(5.8, 55.8, -20000, 'Steppe tundra')).toBeNull();
  expect(biomeNoteAt(5.8, 55.8, -8000, 'Cool mixed forest')).toBeNull(); // the Holocene forest is real
  expect(biomeNoteAt(20, 38, -20000, 'Temperate sclerophyll woodland')).toBeNull(); // Greece: a southern refuge
});
