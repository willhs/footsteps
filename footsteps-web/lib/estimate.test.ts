import { agreement, correctionsAt, caveatsAt, estimateLines, placeNotes, seaLevelWithSigma, worldSpreadAt } from './estimate';

describe('estimate panel words', () => {
  test('confidence follows how far published world totals differ', () => {
    expect(agreement(100, 120)).toBe('fair');
    expect(agreement(100, 250)).toBe('rough');
    expect(agreement(100, 1000)).toBe('very rough');
  });

  test('world spread reads the research-0005 envelope and interpolates', () => {
    expect(worldSpreadAt(-10000)).toEqual({ low: 1e6, high: 1e7 });
    const mid = worldSpreadAt(1650)!;
    expect(mid.low).toBeGreaterThan(516e6);
    expect(mid.low).toBeLessThan(592e6);
    expect(worldSpreadAt(-20000)).toBeNull();
  });

  test('before HYDE the people line is the model, very rough, with its range', () => {
    const people = estimateLines({ time: -20000 }).find((l) => l.id === 'people')!;
    expect(people.confidence).toBe('very rough');
    expect(people.source).toMatch(/model/);
    expect(people.why).toMatch(/million|thousand/);
    expect(estimateLines({ time: -20000 }).some((l) => l.id === 'spread')).toBe(false);
  });

  test('HYDE years name HYDE and the year’s published range', () => {
    const lines = estimateLines({ time: 1000 });
    const people = lines.find((l) => l.id === 'people')!;
    expect(people.source).toMatch(/HYDE 3.5/);
    expect(people.confidence).toBe('fair');
    expect(people.why).toMatch(/1000 CE/);
    expect(lines.find((l) => l.id === 'spread')!.confidence).toBe('rough');
    expect(estimateLines({ time: -5000 }).find((l) => l.id === 'people')!.confidence).toBe('very rough');
  });

  test('the in-between line shows only off data years', () => {
    expect(estimateLines({ time: 1000 }).some((l) => l.id === 'between')).toBe(false);
    const between = estimateLines({ time: -2500 }).find((l) => l.id === 'between')!;
    expect(between.why).toMatch(/1,000 years apart/);
    expect(between.confidence).toBe('very rough');
  });

  test('the adjusted spread replaces HYDE’s allocation line when it is drawn', () => {
    const line = estimateLines({ time: -6000, adjusted: true }).find((l) => l.id === 'spread')!;
    expect(line.cite).toMatch(/climate/);
    expect(line.confidence).toBe('very rough');
  });

  test('groups are always illustrative', () => {
    for (const t of [-50000, -3000, 1800]) expect(estimateLines({ time: t }).find((l) => l.id === 'groups')!.confidence).toBe('imagined');
  });

  test('sea level carries its 1σ from the same series as the coasts', () => {
    const lgm = seaLevelWithSigma(-19000);
    expect(lgm.level).toBeLessThan(-100);
    expect(lgm.sigma).toBeGreaterThan(3);
    expect(estimateLines({ time: -19000 }).find((l) => l.id === 'land')!.why).toMatch(/± \d+ m/);
    expect(estimateLines({ time: 1500 }).find((l) => l.id === 'land')!.confidence).toBe('fair');
  });

  test('place caveats fire only inside their box and years', () => {
    expect(caveatsAt(134, -25, 1500)).toHaveLength(1); // central Australia
    expect(caveatsAt(134, -25, 1850)).toHaveLength(0);
    expect(caveatsAt(2, 48, 1500)).toHaveLength(0); // Paris
    expect(caveatsAt(-45, 70, 800)[0].text).toMatch(/Dorset/);
  });

  test('corrections come before caveats', () => {
    const notes = placeNotes({ time: 1500, lon: 134, lat: -25, corrections: [{ text: 'A fix', source: 'PR 155' }] });
    expect(notes.map((n) => n.text)[0]).toBe('A fix');
    expect(notes).toHaveLength(2);
  });

  test('the Holocene continent line shows 13,000-3000 BCE only', () => {
    expect(estimateLines({ time: -8000 }).find((l) => l.id === 'continents')!.confidence).toBe('very rough');
    expect(estimateLines({ time: -2000 }).some((l) => l.id === 'continents')).toBe(false);
    expect(estimateLines({ time: -20000 }).some((l) => l.id === 'continents')).toBe(false);
  });

  test('PR 155 corrections show at their place and time', () => {
    expect(correctionsAt(-19, 65, 500)[0].text).toMatch(/first settlers/); // Iceland
    expect(correctionsAt(-19, 65, 1500)).toHaveLength(0);
    expect(correctionsAt(-1.5, 52.5, -20000)[0].text).toMatch(/^Left empty/); // England at the LGM
    expect(correctionsAt(-109.35, -27.12, 1600)[0].text).toMatch(/Rapa Nui/);
    expect(correctionsAt(2, 48, 1500)).toHaveLength(0);
  });
});
