import { FLAGS } from './flagRegistry';

type Definition = (typeof FLAGS)[number];
export type FlagName = Definition['name'];
export type BooleanFlagName = Extract<Definition, { on: string }>['name'];
type Alias = Extract<Definition, { aliases: readonly string[] }>['aliases'][number];

/** Immutable answers for one page address. Raw values retain null, empty and first-value semantics. */
export type FlagSnapshot = {
  enabled(name: BooleanFlagName): boolean;
  value(name: FlagName | Alias): string | null;
};

/** Self-contained because the preload head script inlines it before the application loads. */
export function parseFlags(search: string, registry: readonly Definition[] = FLAGS): FlagSnapshot {
  const params = new URLSearchParams(search);
  const values: Record<string, string | null> = {};
  const enabled: Record<string, boolean> = {};
  for (const flag of registry) {
    values[flag.name] = params.get(flag.name);
    if ('aliases' in flag) for (const alias of flag.aliases) values[alias] = params.get(alias);
    if ('on' in flag) enabled[flag.name] = flag.kind === 'off-switch'
      ? values[flag.name] !== flag.on
      : values[flag.name] === flag.on;
  }
  return Object.freeze({
    enabled: (name: BooleanFlagName) => enabled[name],
    value: (name: FlagName | Alias) => values[name],
  });
}

declare global {
  interface Window { __footstepsFlags?: FlagSnapshot }
}

let explicit: { search: string; snapshot: FlagSnapshot } | undefined;

/** Read the browser address once, after saved choices apply. SSR never populates the browser cache.
 * Explicit strings support pure view/clock helpers and tests, with a bounded one-entry cache. */
export function flags(search?: string): FlagSnapshot {
  if (search === undefined && typeof window !== 'undefined') {
    return window.__footstepsFlags ??= parseFlags(window.location.search);
  }
  const query = search ?? '';
  if (explicit?.search !== query) explicit = { search: query, snapshot: parseFlags(query) };
  return explicit.snapshot;
}

/** Forget page state between tests that simulate separate browser loads. */
export function resetFlags(): void {
  explicit = undefined;
  if (typeof window !== 'undefined') delete window.__footstepsFlags;
}
