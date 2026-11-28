import { FIRST_SETTLEMENTS, LAST_FIRST_SETTLEMENT, unsettledAt } from './firstSettlement';

describe('firstSettlement', () => {
  it('empties islands before their first settlers and not after', () => {
    expect(unsettledAt(-19, 64.5, 800)?.name).toBe('Iceland');
    expect(unsettledAt(-19, 64.5, 900)).toBeNull();
    expect(unsettledAt(-90.5, -0.7, 1500)?.name).toBe('Galápagos');
    expect(unsettledAt(-155.5, 19.6, 1000)?.name).toBe('Hawaii');
    expect(unsettledAt(-155.5, 19.6, 1200)).toBeNull();
    expect(unsettledAt(174.8, -41.3, 1200)?.name).toBe('New Zealand'); // HYDE has people here at 1200; the rats say ~1280
    expect(unsettledAt(174.8, -41.3, 1300)).toBeNull();
    expect(unsettledAt(47, -19, 0)?.name).toBe('Madagascar and Comoros');
    expect(unsettledAt(-77, 21.5, -5000)?.name).toBe('Greater Antilles');
    expect(unsettledAt(178, -17.8, -2000)?.name).toMatch(/Fiji/);
    expect(unsettledAt(178, -17.8, -1000)).toBeNull();
    expect(unsettledAt(-175.2, -21.1, -2000)?.name).toMatch(/Tonga/);
    expect(unsettledAt(168.3, -17.7, -3000)?.name).toBe('Vanuatu');
    expect(unsettledAt(144.8, 13.4, -2000)?.name).toBe('Mariana Islands');
    expect(unsettledAt(-16.9, 32.65, 1400)?.name).toBe('Madeira');
    expect(unsettledAt(-16.9, 32.65, 1500)).toBeNull();
  });

  it('never touches a mainland coast', () => {
    const mainland: [string, number, number][] = [
      ['Cape Juby, Morocco', -12.9, 27.95],
      ['Tarfaya, Morocco', -12.93, 27.94],
      ['Miami, Florida', -80.2, 25.8],
      ['Cancún, Yucatán', -86.85, 21.16],
      ['Caracas coast, Venezuela', -66.9, 10.6],
      ['Mozambique coast', 40.7, -15.0],
      ['Tierra del Fuego', -68, -54.5],
      ['Ecuador coast', -80.5, -1],
      ['Norway, North Cape', 25.8, 71.1],
      ['Morocco, Essaouira', -9.77, 31.5],
      ['Senegal, Dakar', -17.45, 14.7],
      ['New Guinea, Port Moresby', 147.2, -9.4],
      ['Solomons, Guadalcanal', 160, -9.5],
    ];
    for (const [name, lon, lat] of mainland) expect([name, unsettledAt(lon, lat, -10000)]).toEqual([name, null]);
  });

  it('keeps boxes valid and the last date in step', () => {
    for (const s of FIRST_SETTLEMENTS) {
      expect(s.box[0]).toBeLessThan(s.box[1]);
      expect(s.box[2]).toBeLessThan(s.box[3]);
      expect(s.source.length).toBeGreaterThan(20);
    }
    expect(LAST_FIRST_SETTLEMENT).toBe(1770);
  });

  it('leaves Britain and the north European plain empty at the glacial maximum, not before or after', () => {
    expect(unsettledAt(-1.5, 52, -20000)?.name).toMatch(/Britain/);
    expect(unsettledAt(-1.5, 52, -30000)).toBeNull();
    expect(unsettledAt(-1.5, 52, -12000)).toBeNull();
    expect(unsettledAt(10, 54, -18000)?.name).toMatch(/north European plain/);
    expect(unsettledAt(10, 50, -18000)).toBeNull(); // south Germany kept its people
    expect(unsettledAt(38, 51, -20000)).toBeNull(); // Kostenki, on the Don, was occupied
  });
});
