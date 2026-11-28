// Features you can turn on and off from the map controls (components/ui/FeaturesMenu.tsx), remembered in this browser.
// Every feature still reads its URL parameter at load (docs/ops/flags.md), so the choices are applied by writing them into the
// URL before anything reads it: app/layout.tsx inlines `applyFlagChoices` in the page head as source text, so it must be
// self-contained (no imports or outside names inside it). A parameter already in the URL wins over a remembered choice.

/** One feature in the menu: its URL parameter, the value that turns it on, and whether it is on without the parameter. */
export type MenuFlag = {
  name: string;
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

export const MENU_FLAGS: readonly MenuFlag[] = [
  { name: 'sky', on: '1', group: 'Close-up', label: 'Sky and sunlight', hint: 'Light from the local sun clock, haze into a sky at the horizon, moving water; with Tilt, a steeper tilt' },
  { name: 'tilt', on: '1', group: 'Close-up', label: 'Tilt as you zoom', hint: 'The close-up tilts into a landscape as you zoom in, instead of staying a bird’s-eye view' },
  { name: 'trees', on: '1', group: 'Close-up', label: 'Trees', hint: 'Trees by biome, with clearings round homes (imagined)' },
  { name: 'fields', on: '1', group: 'Close-up', label: 'Fields and paths', hint: 'Fields, gardens, terraces, corrals and worn paths round each group (extent modelled, layout imagined)' },
  { name: 'shelters', on: '1', group: 'Close-up', label: 'Shelters', hint: 'One dwelling per household, its type from the analog society’s house codes' },
  { name: 'smoke', on: '1', group: 'Close-up', label: 'Hearth smoke', hint: 'Smoke from each hearth, and firelight at night (imagined)' },
  { name: 'ground', on: '1', group: 'Close-up', label: 'Ground texture', hint: 'Grass, canopy, sand ripples, cracked ice, reeds and rock in the ground (imagined)' },
  { name: 'weather', on: '1', group: 'Close-up', label: 'Weather', hint: 'Cloud shadows by the place’s rainfall and wind in the grass (imagined)' },
  { name: 'plants', on: '1', group: 'Close-up', label: 'Plant marks (old)', hint: 'The earlier cone and blob plants (they read as toys)' },
  { name: 'humans', on: '0', defaultOn: true, live: true, group: 'People', label: 'Other humans', hint: 'Neanderthals, Denisovans, Homo floresiensis and Homo luzonensis: guessed bands and key dated sites, until each was last seen' },
  { name: 'figures', on: '1', group: 'People', label: 'Standing figures', hint: 'Each person at street zoom as an upright figure (imagined)' },
  { name: 'routine', on: '1', group: 'People', label: 'Daily routine', hint: 'People follow a day by the local sun time: asleep, hearth, play, trips' },
  { name: 'avatar', on: '3d', group: 'People', label: '3D person', hint: 'An animated 3D figure in the person card instead of the drawing' },
  { name: 'seasons', on: '1', group: 'People', label: 'Seasons', hint: 'Off / Jun / Dec season controls for where groups stay' },
  { name: 'ice', on: '1', group: 'Data', label: 'Ice sheets', hint: 'Dated ice-sheet edges, 0-80,000 years ago (PaleoMIST)' },
  { name: 'pastwater', on: '1', group: 'Data', label: 'Past lakes and coasts', hint: 'Dated past water: Lake Mega-Chad, European glacial lakes, the Mesopotamian coast' },
  { name: 'spread', on: '1', group: 'Data', label: 'Climate-adjusted spread', hint: 'HYDE people moved by climate then vs now, 10,000-4,000 BCE (modelled)' },
  { name: 'evidence', on: '1', group: 'Data', label: 'Dated sites', hint: 'Radiocarbon sites and ancient-DNA individuals' },
  { name: 'terrain_tiles', on: '1', group: 'Data', label: 'Sharper terrain', hint: 'The 500 m photo pyramid, recoloured per year, at zoom 3-8' },
  { name: 'food', on: '1', group: 'Extras', label: 'Food in hover card', hint: 'Crops, animals and forager staples around the cursor (modelled)' },
  { name: 'langs', on: 'deep', group: 'Extras', label: 'Spreading languages', hint: '“Languages spreading here” in the hover card (from 3050 BCE)' },
  { name: 'tour', on: '1', group: 'Extras', label: 'Guided tour', hint: 'Nine sourced stops that fly the camera and set the year' },
  { name: 'chart', on: '1', group: 'Extras', label: 'Population chart', hint: 'World population chart under the counter' },
];

/** Whether a feature is on for these URL parameters. */
export function flagOn(flag: Pick<MenuFlag, 'name' | 'on' | 'defaultOn'>, search: string): boolean {
  const value = new URLSearchParams(search).get(flag.name);
  return flag.defaultOn ? value !== flag.on : value === flag.on;
}

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
