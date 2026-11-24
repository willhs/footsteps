import { FLAG_CHOICES_KEY, MENU_FLAGS, applyFlagChoices, flagChoicesScript, flagOn, readChoices, rememberChoice, withFlag } from './flagChoices';
import { FLAGS } from '../scripts/flags-lib.mjs';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const sky = MENU_FLAGS.find((f) => f.name === 'sky')!;
const humans = MENU_FLAGS.find((f) => f.name === 'humans')!;

describe('flag choices', () => {
  it('every menu feature is a registered flag with the same value', () => {
    const registry = new Map((FLAGS as { name: string; on: string }[]).map((f) => [f.name, f.on]));
    for (const f of MENU_FLAGS) expect(registry.get(f.name)).toBe(f.on);
  });

  it('reads on and off from the URL, including features on by default', () => {
    expect(flagOn(sky, '')).toBe(false);
    expect(flagOn(sky, '?sky=1')).toBe(true);
    expect(flagOn(humans, '')).toBe(true);
    expect(flagOn(humans, '?humans=0')).toBe(false);
    expect(withFlag(new URL('https://x/?a=1'), sky, true).search).toBe('?a=1&sky=1');
    expect(withFlag(new URL('https://x/?sky=1'), sky, false).search).toBe('');
    expect(withFlag(new URL('https://x/'), humans, false).search).toBe('?humans=0');
  });

  it('remembers only choices that differ from the default', () => {
    const s = memory();
    rememberChoice(s, sky, true);
    rememberChoice(s, humans, false);
    expect(readChoices(s)).toEqual({ sky: true, humans: false });
    rememberChoice(s, sky, false);
    rememberChoice(s, humans, true);
    expect(readChoices(s)).toEqual({});
    expect(readChoices({ getItem: () => 'not json' })).toEqual({});
  });

  it('writes remembered choices into the URL, the URL winning', () => {
    window.localStorage.setItem(FLAG_CHOICES_KEY, JSON.stringify({ sky: true, trees: true, humans: false }));
    window.history.replaceState(null, '', '/?trees=0&year=-1000');
    applyFlagChoices(MENU_FLAGS.map((f) => [f.name, f.on, Boolean(f.defaultOn)]), FLAG_CHOICES_KEY);
    const p = new URLSearchParams(window.location.search);
    expect(p.get('sky')).toBe('1');
    expect(p.get('trees')).toBe('0'); // already in the URL
    expect(p.get('humans')).toBe('0');
    expect(p.get('year')).toBe('-1000');
  });

  it('the inlined script runs on its own', () => {
    window.localStorage.setItem(FLAG_CHOICES_KEY, JSON.stringify({ ice: true }));
    window.history.replaceState(null, '', '/');
    new Function(flagChoicesScript())();
    expect(new URLSearchParams(window.location.search).get('ice')).toBe('1');
  });
});
