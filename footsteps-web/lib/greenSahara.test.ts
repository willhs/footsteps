import { inGreenSahara } from './greenSahara';

it('covers the Sahara from 9000 to 3500 BCE only', () => {
  expect(inGreenSahara(10, 20, -6000)).toBe(true);
  expect(inGreenSahara(10, 20, -2000)).toBe(false);
  expect(inGreenSahara(10, 20, -12000)).toBe(false);
  expect(inGreenSahara(10, 5, -6000)).toBe(false); // the Gulf of Guinea coast was never desert
});
