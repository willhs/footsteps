---
id: design-icons
type: design
purpose: "The shared icon system: every icon goes through <Icon name>, emoji today and custom line SVGs later; inventory of ~50 concepts, which need a custom prehistoric icon, and the proposed style"
updated: 2026-11-28
---

# Icons

Footsteps uses icons to save reading: a picture says "night", "grassland" or "herder" faster than a word, and the UI text style is short
lines with an icon. For now the icons are emoji. They are free, readable at a glance, and they show us which concepts need an icon at all.
Their limits are why this doc exists:

- **They look different on every OS** (Apple, Google, Microsoft and Twemoji draw 🦣 four ways).
- **They read as modern.** There is no emoji for a pit house, a hand axe, a reindeer herd or a digging stick; ⛺ is a nylon tent and 🧵 a spool.
- **They are full colour**, which fights the map's muted palette and the amber people.

So the code is set up to replace them gradually, one name at a time, without touching the UI again.

## How it works

- **`footsteps-web/lib/icons.ts`**: `ICON_GLYPHS`, one map from icon name to emoji, grouped by section. `IconName` is its keys.
- **`footsteps-web/components/ui/Icon.tsx`**: `<Icon name="night" />` shows the icon, hidden from screen readers. Pass `label="Night"` when
  the icon stands alone and must be announced. `className` sizes and places it.
- **`iconGlyph(name)`** returns the emoji where only a string fits (a `title`, a canvas label, a log line).
- **Data carries names, not emoji.** A row or note that wants an icon has an `icon: IconName` field (for example `BiomeNote`, the hover
  card's `CardRow`, `LINE_ICON` in `lib/estimate.ts`, `SKY_PHASE_ICON` in `lib/timeOfDay.ts`).
- **A guard test** (`lib/icons.test.tsx`) fails if an emoji appears in any source file under `app/`, `components/` or `lib/` other than
  `lib/icons.ts`. Arrows and maths signs in comments are fine.

**To draw a custom icon:** add `name: () => <svg …/>` to `ICON_SVGS` in `Icon.tsx`. Every place that shows that name switches at once;
the emoji stays as the fallback for names without a drawing. To add a concept, add one line to `ICON_GLYPHS` under its section.

## Proposed style

One family, drawn to sit on the map without competing with the data:

- **Monochrome line**, `stroke="currentColor"`, so an icon takes the text colour around it (muted in notes, amber in warm rows).
- **24 × 24 grid, 1.8 px stroke, round caps and joins**: the same as the map controls already in `components/ui/icons.tsx`
  (map, globe, terrain), so the existing icons and the new ones match.
- **Shown at 12–16 px** beside 11–13 px text: one or two shapes per icon, no fine detail, no fills except small dots.
- **Silhouettes from the record**, not from today: a hide-covered conical tent rather than ⛺, a skin-and-pole frame, an Acheulean hand
  axe outline, a curved-horn wild cow for aurochs. Each custom icon's source picture is noted beside it, like a cited constant.

### Where to start from

Both are free, MIT-licensed and drawn on the same 24 × 24 round-stroke grid we use, so they mix with our own drawings:

- **[Lucide](https://lucide.dev)** (~1,500 icons, 2 px stroke; ours can be thinned to 1.8): good for the generic half: sun, moon,
  sunrise, sunset, thermometer, waves, map, map-pin, users, mouse-pointer, x, triangle-alert, wheat, tent, fish, flame, hammer, baby.
- **[Phosphor](https://phosphoricons.com)** (~1,250 icons in six weights; the "light" or "regular" weight is closest): a wider nature
  and animal set: cow, horse, bird, paw-print, plant, tree, campfire, drop, snowflake, house-line.

Take the generic icons from one of them (Lucide first, since its grid matches ours exactly) and draw only the prehistoric ones by hand.
Generated drafts are possible for those, but they need hand cleanup to hit the stroke and grid, so drawing them directly is likely as fast.

## Inventory

Concepts the app shows now or the person card is about to show. **Name** is the `IconName` (or the one planned). **Custom?** says whether
an open set covers it (no), or it needs our own prehistoric drawing (yes). "In code" marks names already in `ICON_GLYPHS`.

### Ways of life and groups

| Concept | Name | Emoji now | Custom? | Note |
| --- | --- | --- | --- | --- |
| Foragers | `forager` (in code) | 🧺 | yes | a digging stick and basket says more than a bow: most forager food was gathered |
| Farmers | `farmer` (in code) | 🌾 | no | wheat ear (Lucide `wheat`) |
| Herders | `herder` (in code) | 🐐 | partly | a sheep or goat in profile; cattle and reindeer herders need their own |
| City dwellers | `urban` | 🏛️ | yes | a mud-brick wall and gate reads older than a columned temple |
| Band | `band` (in code) | 🔥 | no | a few figures (Lucide `users`) |
| Camp | `camp` / `groups` (in code) | 🏕️ | yes | hide tents round a fire, not a modern campsite |
| Village | `village` (in code) | 🏠 | partly | a cluster of round houses for early villages |
| Town | `town` (in code) | 🏘️ | no | |
| City, metropolis, megacity | `megacity`, `metropolis` (in code) | 🏙️ 🌆 | no | modern only; used by the population tooltip's scale |
| Hamlet, outpost | `hamlet`, `tent` (in code) | 🏡 ⛺ | yes | `tent` should become a hide tent |

### Roles (person card)

| Concept | Name | Emoji now | Custom? | Note |
| --- | --- | --- | --- | --- |
| Gatherer | `gatherer` (in code) | 🧺 | partly | basket is fine; digging stick better |
| Hunter | `hunter` (in code) | 🏹 | yes | a spear for most of the timeline: the oldest likely arrowheads are ~64,000 years old (Sibudu, Lombard 2011) and bows spread much later |
| Toolmaker | `toolmaker` (in code) | 🪨 | yes | a knapped flake or hand axe outline |
| Fire-keeper | `fire-keeper` (in code) | 🔥 | no | flame (Lucide `flame`) |
| Fisher | `fisher` (in code) | 🎣 | no | fish; a net or weir would say "prehistoric" better |
| Shepherd | `shepherd` (in code) | 🐑 | partly | crook and sheep |
| Milker | `milker` (in code) | 🥛 | yes | a leather or clay pot, not a glass |
| Weaver | `weaver` (in code) | 🧵 | yes | a warp-weighted loom or spindle whorl, not a spool |
| Tanner | `tanner` (in code) | 🦌 | yes | a stretched hide on a frame |
| Potter | `potter` (in code) | 🏺 | no | a plain pot outline (the emoji amphora is Classical) |
| Builder | `builder` (in code) | 🪵 | partly | posts and a lashing |
| Young child, child, elder | `young-child`, `child`, `elder` (in code) | 🍼 🧒 🧓 | no | figure at three heights; avoid faces |

### Dwellings and shelters (`lib/dwellings.ts` shapes)

| Concept | Name | Emoji now | Custom? | Note |
| --- | --- | --- | --- | --- |
| Lean-to | `lean-to` | none | yes | |
| Dome hut | `dome` | none | yes | |
| Conical tent | `cone` | ⛺ | yes | hide or bark cone |
| Round house (drum) | `drum` | none | yes | |
| Gabled long house | `gable` | 🛖 | yes | |
| Block house | `block` | 🧱 | yes | flat-roofed mud brick |
| Pit house | `pit-house` | none | yes | half-sunk, earth roof |
| Mammoth-bone hut | `bone-hut` | none | yes | |

### Food

| Concept | Name | Emoji now | Custom? | Note |
| --- | --- | --- | --- | --- |
| Grain crops | `grain` | 🌾 | no | |
| Roots and tubers | `tuber` | 🍠 | yes | yam or taro outline |
| Domestic animals | `livestock` | 🐄 | partly | cattle in profile |
| Wild game | `game` | 🦌 | partly | |
| Reindeer herd | `reindeer` | 🦌 | yes | |
| Fish and shellfish | `seafood` | 🐟 | no | |
| Wild plants, nuts | `wild-plants` | 🌰 | no | |

### Land and climate

| Concept | Name | Emoji now | Custom? | Note |
| --- | --- | --- | --- | --- |
| Grassland / prairie | `grassland` (in code) | 🌾 | yes | tufts of grass, not a crop |
| Mammoth steppe | `mammoth-steppe` (in code) | 🦣 | yes | a mammoth in profile |
| Green Sahara | `green-sahara` (in code) | 🌿 | yes | palms by a lake |
| Ice sheet | `ice` | 🧊 | no | snowflake or ice wall |
| Sea level, coast | `land` (in code) | 🌊 | no | waves |
| Temperature | `climate` (in code) | 🌡️ | no | thermometer |
| Rain | `rain` | 🌧️ | no | drop |
| Animals here | `animals` | 🐾 | no | paw print |
| Other kinds of human | `other-human` | none | yes | a Neanderthal-like profile silhouette, handled with care |

### Time of day

| Concept | Name | Emoji now | Custom? | Note |
| --- | --- | --- | --- | --- |
| Night, dawn, day, dusk | `night`, `dawn`, `day`, `dusk` (in code) | 🌙 🌅 ☀️ 🌇 | no | Lucide moon, sunrise, sun, sunset; `dusk` is a city skyline now, which is wrong for most of history |
| Local sun time | `sun-clock` (in code) | ☀ | no | a sundial would fit better |
| Now | `now` | none | no | |

### Trust and estimates

| Concept | Name | Emoji now | Custom? | Note |
| --- | --- | --- | --- | --- |
| Measured / modelled / imagined | `measured`, `modelled`, `imagined` | none (words) | yes | if ever shown, three marks of falling certainty (solid dot, ring, dashed ring); see the uncertainty decision before adding them |
| Fair / rough / very rough | none | none (words) | no | words are clearer; no icon planned |
| Estimate panel lines | `people`, `continents`, `spread`, `between`, `way-of-life`, `groups`, `land`, `climate`, `corrections`, `place` (in code) | 👥 🌍 🗺️ ⏳ 🌾 🏕️ 🌊 🌡️ 🛠️ 📍 | no | all covered by Lucide |

### Controls and messages

| Concept | Name | Emoji now | Custom? | Note |
| --- | --- | --- | --- | --- |
| Drag to turn | `drag` (in code) | 🖱️ | no | |
| Close | `close` (in code) | ✕ | no | the map controls already have `CloseIcon` |
| Warning | `warning` (in code) | ⚠️ | no | |
| Info | `info` (in code) | ⓘ | no | |
| Footwear: barefoot, wraps, sandals, shoes | `barefoot`, `wraps`, `sandals`, `shoes` (in code) | 👣 🥾 🩴 👞 | yes | outlines of a foot and three soles |

**Counting the "yes" rows:** about 25 concepts need our own drawing. Most are dwellings, roles that look modern as emoji, and the land
notes. Everything else comes from Lucide.

## Order of work

1. Done (2026-11-28): every emoji in the UI goes through `Icon` / `iconGlyph`, with the guard test.
2. Draw the generic ones from Lucide in one PR and look at them on the map beside the emoji (one review for Will).
3. Draw the prehistoric ones in groups (dwellings, roles, land), each with its source picture.
4. When every name has a drawing, the emoji stay only as the fallback.
