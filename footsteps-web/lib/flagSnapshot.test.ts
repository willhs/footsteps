import { FLAGS } from './flagRegistry';
import { flags, parseFlags, resetFlags } from './flags';
import { applyFlagChoices, FLAG_CHOICES_KEY, MENU_FLAGS } from './flagChoices';
import { preloadScript, firstLoadUrls, PRELOAD_TABLES } from './firstLoadPreload';
import { bracketIn } from './time';

afterEach(() => {
  resetFlags();
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  jest.restoreAllMocks();
});

describe.each(FLAGS)('$name URL contract', (flag) => {
  it('retains the default and raw parameter semantics', () => {
    expect(parseFlags('').value(flag.name)).toBeNull();
    expect(parseFlags(`?${flag.name}=`).value(flag.name)).toBe('');
    expect(parseFlags(`?${flag.name}=first&${flag.name}=second`).value(flag.name)).toBe('first');
  });

  if ('on' in flag) {
    it('preserves the registry default, switch value and non-switch values', () => {
      expect(parseFlags('').enabled(flag.name)).toBe(flag.default === 'on');
      for (const value of ['', '0', '1', 'deep', '3d', 'false', 'unexpected']) {
        const expected = flag.kind === 'off-switch' ? value !== flag.on : value === flag.on;
        expect(parseFlags(`?${flag.name}=${value}`).enabled(flag.name)).toBe(expected);
      }
    });
  }

  if ('aliases' in flag) {
    it.each(flag.aliases)('keeps alias %s available to view validation', (alias) => {
      expect(parseFlags(`?${alias}=7`).value(alias)).toBe('7');
      expect(parseFlags(`?${flag.name}=0&${alias}=7`).value(flag.name)).toBe('0');
    });
  }
});

it('parses the browser URL once and keeps that page snapshot after history changes', () => {
  window.history.replaceState(null, '', '/?trees=0&year=-6000');
  const Parser = globalThis.URLSearchParams;
  const parser = jest.spyOn(globalThis, 'URLSearchParams').mockImplementation((query) => new Parser(query));
  const first = flags();
  expect(first.enabled('trees')).toBe(false);
  expect(first.value('year')).toBe('-6000');
  window.history.replaceState(null, '', '/?trees=1');
  expect(flags()).toBe(first);
  expect(flags().enabled('trees')).toBe(false);
  expect(parser).toHaveBeenCalledTimes(1);
  expect(Object.isFrozen(first)).toBe(true);
});

it('uses remembered choices in the head, with explicit URL values winning, and reuses the head snapshot', () => {
  window.localStorage.setItem(FLAG_CHOICES_KEY, JSON.stringify({ sky: false, trees: false }));
  window.history.replaceState(null, '', '/?trees=1&year=1900');
  applyFlagChoices(MENU_FLAGS.map((f) => [f.name, f.on, Boolean(f.defaultOn)]), FLAG_CHOICES_KEY);
  const Parser = globalThis.URLSearchParams;
  const parser = jest.spyOn(globalThis, 'URLSearchParams').mockImplementation((query) => new Parser(query));
  const added: { href: string }[] = [];
  const doc = { createElement: () => ({ setAttribute: jest.fn() }), head: { appendChild: (link: { href: string }) => added.push(link) } };
  new Function('location', 'document', preloadScript())(window.location, doc);
  const snapshot = window.__footstepsFlags;
  expect(snapshot).toBeDefined();
  expect(flags()).toBe(snapshot);
  expect(flags().enabled('trees')).toBe(true);
  expect(flags().enabled('sky')).toBe(false);
  expect(parser).toHaveBeenCalledTimes(1);
  expect(added.map((link) => link.href)).toEqual(firstLoadUrls(window.location.search, PRELOAD_TABLES, bracketIn));
});
