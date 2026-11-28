import { domesticatesAt, gateEra } from './domesticatesGate';

const at = (lon: number, lat: number, year: number) => domesticatesAt(lon, lat, gateEra(year));

describe('domesticatesGate', () => {
  it('has nothing domesticated in the modelled deep past', () => {
    expect(gateEra(-20000)).toBe(-1);
    expect(at(36, 33, -20000)).toEqual({ crops: false, herds: false });
  });

  it('has crops and herds in the Fertile Crescent by 7000 BCE', () => {
    expect(at(38, 36, -7000)).toEqual({ crops: true, herds: true });
  });

  it('has no herd animals in Australia before 1788 and has them by 1800', () => {
    expect(at(145, -30, 1700).herds).toBe(false);
    expect(at(145, -30, 1700).crops).toBe(false);
    expect(at(151, -34, 1800).herds).toBe(true);
  });

  it('has no herds in eastern North America before Europeans, but crops (squash, maize) by 1000 CE', () => {
    expect(at(-85, 38, 1000)).toEqual({ crops: true, herds: false });
  });

  it('has llamas in the Andes but not the Amazon lowlands before 1500', () => {
    expect(at(-70, -15, 1000).herds).toBe(true);
    expect(at(-60, -5, 1000).herds).toBe(false);
  });

  it('has no crops in New Zealand before Polynesian settlement', () => {
    expect(at(175, -38, 1000).crops).toBe(false);
  });
});
