import { FLAGS } from './flagRegistry';
import type { BooleanFlagName } from './flags';

// Features you can turn on and off from the map controls (components/ui/FeaturesMenu.tsx), remembered in this browser.
// Every feature still reads its URL parameter at load (docs/ops/flags.md), so the choices are applied by writing them into the
// URL before anything reads it: app/layout.tsx inlines `applyFlagChoices` in the page head as source text, so it must be
// self-contained (no imports or outside names inside it). A parameter already in the URL wins over a remembered choice.

/** One feature in the menu: its URL parameter, the value that turns it on, and whether it is on without the parameter. */
export type MenuFlag = {
  name: BooleanFlagName;
  on: string;
  label: string;
  group: 'Close-up' | 'People' | 'Data' | 'Extras';
  hint: string;
  /** On unless the parameter turns it off (`name=0`). */
  defaultOn?: boolean;
  /** Changes without a reload (the menu calls back instead). */
  live?: boolean;
};

export const FLAG_CHOICES_KEY = 'footsteps.flags.v1';

const MENU_LABELS: readonly Omit<MenuFlag, 'on' | 'defaultOn'>[] = [
  { name: 'sky', group: 'Close-up', label: 'Sky and sunlight', hint: 'Light from the local sun clock, haze into a sky at the horizon (tilt by hand to see it), moving water' },
  { name: 'trees', group: 'Close-up', label: 'Trees', hint: 'Trees by biome, with clearings round homes (imagined)' },
  { name: 'rivers', group: 'Close-up', label: 'Rivers', hint: 'Today’s rivers (Natural Earth 10m) drawn on the close-up ground; courses that moved are drawn where they run now' },
  { name: 'fields', group: 'Close-up', label: 'Fields and paths', hint: 'Fields, gardens, terraces, corrals and worn paths round each group (extent modelled, layout imagined)' },
  { name: 'shelters', group: 'Close-up', label: 'Shelters', hint: 'One dwelling per household, its type from the analog society’s house codes' },
  { name: 'smoke', group: 'Close-up', label: 'Hearth smoke', hint: 'Smoke from each hearth, and firelight at night (imagined)' },
  { name: 'ground', group: 'Close-up', label: 'Ground texture', hint: 'Grass, canopy, sand ripples, cracked ice, reeds and rock in the ground (imagined)' },
  { name: 'weather', group: 'Close-up', label: 'Weather', hint: 'Cloud shadows by the place’s rainfall and wind in the grass (imagined)' },
  { name: 'humans', live: true, group: 'People', label: 'Other humans', hint: 'Neanderthals, Denisovans, Homo floresiensis and Homo luzonensis: guessed bands and key dated sites, until each was last seen' },
  { name: 'routine', group: 'People', label: 'Daily routine', hint: 'People follow a day by the local sun time: asleep, hearth, play, trips' },
  { name: 'avatar', group: 'People', label: '3D person', hint: 'An animated 3D figure in the person card instead of the drawing' },
  { name: 'ice', group: 'Data', label: 'Ice sheets', hint: 'Dated ice-sheet edges, 0-80,000 years ago (PaleoMIST)' },
  { name: 'pastwater', group: 'Data', label: 'Past lakes and coasts', hint: 'Dated past water: Lake Mega-Chad, European glacial lakes, the Mesopotamian coast' },
  { name: 'spread', group: 'Data', label: 'Climate-adjusted spread', hint: 'HYDE people moved by climate then vs now, 10,000-4,000 BCE (modelled)' },
  { name: 'terrain_tiles', group: 'Data', label: 'Sharper terrain', hint: 'The 500 m photo pyramid, recoloured per year, at zoom 3-8' },
  { name: 'food', group: 'Extras', label: 'Food in hover card', hint: 'Crops, animals and forager staples around the cursor (modelled)' },
  { name: 'langs', group: 'Extras', label: 'Spreading languages', hint: '“Languages spreading here” in the hover card (from 3050 BCE)' },
  { name: 'explain', group: 'Extras', label: 'How we estimate this', hint: 'A quiet link under the counter: which sources and methods drive the map here and now, and how far to trust them' },
];

export const MENU_FLAGS: readonly MenuFlag[] = MENU_LABELS.map((menu) => {
  const definition = FLAGS.find((flag) => flag.name === menu.name)!;
  if (!('on' in definition)) throw new Error(`Menu feature ${menu.name} must be a boolean flag`);
  return { ...menu, on: definition.on, defaultOn: definition.kind === 'off-switch' };
});

/** Set a feature's parameter in a URL: present when it differs from its default, absent otherwise. */
export function withFlag(url: URL, flag: Pick<MenuFlag, 'name' | 'on' | 'defaultOn'>, on: boolean): URL {
  if (on !== Boolean(flag.defaultOn)) url.searchParams.set(flag.name, flag.on);
  else url.searchParams.delete(flag.name);
  return url;
}

/** The remembered choices: parameter name → on. Empty when storage is unavailable. */
export function readChoices(storage: Pick<Storage, 'getItem'> | null): Record<string, boolean> {
  try {
    const parsed = JSON.parse(storage?.getItem(FLAG_CHOICES_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Remember one choice; a choice equal to the default is forgotten. */
export function rememberChoice(storage: Pick<Storage, 'getItem' | 'setItem'> | null, flag: Pick<MenuFlag, 'name' | 'defaultOn'>, on: boolean): void {
  try {
    const choices = readChoices(storage);
    if (on === Boolean(flag.defaultOn)) delete choices[flag.name];
    else choices[flag.name] = on;
    storage?.setItem(FLAG_CHOICES_KEY, JSON.stringify(choices));
  } catch {
    // Private windows and blocked storage: the choice lasts for this page only.
  }
}

/** Write remembered choices into the page URL for parameters it does not already have. Self-contained: inlined in the page head.
 * `flags` is [name, on value, defaultOn] per feature. */
export function applyFlagChoices(flags: [string, string, boolean][], key: string): void {
  try {
    const choices = JSON.parse(window.localStorage.getItem(key) || '{}') || {};
    const url = new URL(window.location.href);
    let changed = false;
    for (const [name, on, defaultOn] of flags) {
      if (url.searchParams.has(name) || typeof choices[name] !== 'boolean') continue;
      if (choices[name] !== defaultOn) {
        url.searchParams.set(name, on);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(null, '', url.toString());
  } catch {
    // No storage, or a URL the browser will not let us rewrite: the page loads with its own parameters.
  }
}

/** The page-head script: `applyFlagChoices` with the menu's features. */
export function flagChoicesScript(): string {
  const flags = MENU_FLAGS.map((f) => [f.name, f.on, Boolean(f.defaultOn)]);
  return `(${applyFlagChoices.toString()})(${JSON.stringify(flags)},${JSON.stringify(FLAG_CHOICES_KEY)});`;
}
