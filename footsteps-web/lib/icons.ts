// Every icon the app shows, by name. The UI never writes an emoji itself: it asks for a name (<Icon name="night" />, or
// iconGlyph('night') where only a string will do), so the whole set can be redrawn from this one file.
//
// Today every name maps to an emoji: free, readable at a glance, and a quick way to learn which concepts need an icon at all.
// Later a name can gain a monochrome line SVG in ICON_SVGS (components/ui/Icon.tsx); the emoji stays as its fallback.
// The plan and the inventory of concepts: docs/design/icons.md.

export const ICON_GLYPHS = {
  // Settlement sizes (lib/format.ts)
  megacity: '🏙️',
  metropolis: '🌆',
  town: '🏘️',
  village: '🏠',
  hamlet: '🏡',
  tent: '⛺',

  // Land and climate notes (lib/biomeNotes.ts, lib/greenSahara.ts)
  grassland: '🌾',
  'mammoth-steppe': '🦣',
  'green-sahara': '🌿',

  // Time of day (lib/timeOfDay.ts)
  night: '🌙',
  dawn: '🌅',
  day: '☀️',
  dusk: '🌇',
  'sun-clock': '☀',

  // How we estimate this (lib/estimate.ts)
  people: '👥',
  continents: '🌍',
  spread: '🗺️',
  between: '⏳',
  'way-of-life': '🌾',
  groups: '🏕️',
  land: '🌊',
  climate: '🌡️',
  corrections: '🛠️',
  place: '📍',

  // A person on the card: role, kind of human, what they do now (components/footsteps/layers/people.ts)
  forager: '🧺',
  gatherer: '🧺',
  hunter: '🏹',
  toolmaker: '🪨',
  'fire-keeper': '🔥',
  band: '🔥',
  fisher: '🎣',
  herder: '🐐',
  shepherd: '🐑',
  milker: '🥛',
  weaver: '🧵',
  tanner: '🦌',
  farmer: '🌾',
  potter: '🏺',
  builder: '🪵',
  'young-child': '🍼',
  child: '🧒',
  elder: '🧓',
  person: '🧑',
  'other-human': '🦴',
  now: '🕒',

  // Footwear (lib/footwear.ts)
  barefoot: '👣',
  wraps: '🥾',
  sandals: '🩴',
  shoes: '👞',

  // Controls and messages
  click: '👆',
  info: 'ⓘ',
  drag: '🖱️',
  close: '✕',
  warning: '⚠️',
  performance: '⚡',
} as const;

export type IconName = keyof typeof ICON_GLYPHS;

/** The emoji for an icon, for places that take only text: a title, a canvas label, a log line. */
export function iconGlyph(name: IconName): string {
  return ICON_GLYPHS[name];
}
