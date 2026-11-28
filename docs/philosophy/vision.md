---
id: vision
type: note
purpose: "The one current vision for Footsteps of Time"
---

# Footsteps of Time: vision

A globe of where people lived and how they lived, at any moment in human history.

It is an instantiation of the available data, as accurate as possible. Where the data runs thin, it shows a best-guess, plausible
picture rather than a blank. Approximating the past well matters most; after 1900 simple and approximate is enough.

## Who it's for

Me, mostly. It's a personal way to explore history. Others are welcome, but I don't design for them first.

## What it shows

- **The people alive at that moment.** Pick a year and see everyone alive then, where they were. The ~100 billion who ever lived is context, not the picture
- **How they lived.** Foragers, herders, farmers and city folk, and how that mix shifts over time and place
- **Ordinary lives.** Click a group and meet a plausible person and their day. History as normal people living normal days, not great men and empires
- **How we know.** Most of this is a well-grounded guess. The map draws no uncertainty by default; how each part is estimated is
  explained in the opt-in "How we estimate this" panel (`?explain=1`, [estimate-panel.md](../ops/estimate-panel.md))

Today people are measured from 10,000 BCE to 1900 CE (HYDE 3.5), modelled before that back to 100,000 BCE, and roughly scaled from
1900 to 2025.

Beyond where and how many, [human-constants.md](human-constants.md) lists the parts of life every human has had (daily routine, food, groups, ritual, conflict, trade and more) that Footsteps could show.

## What it should feel like

Exploring. Scrub time, zoom from the whole planet to a single camp fire, and follow whatever catches your eye. Panning, zooming and scrubbing are smooth and quick, with no pops or waits.

## How it looks

- **Realism up close.** Close in, show what it looked like: ground, light, water, shelters and people as they plausibly were.
  Far out, people can stay symbols (firelight, units). Symbolic overlays and invented elements with no source behind them are suspect
- **Short text, icons for imagery.** A word or two plus an icon, not a sentence. Sources, methods and caveats go behind ⓘ.
  Every icon goes through the shared Icon system ([icons.md](../design/icons.md)): emoji now, custom drawings planned
- **Culture and language.** Short term, be cautious: covering every group would mean inventing prehistoric ones, so show them only
  where a cited source supports it. Long term, showing them (languages, beliefs, names) is still the plan

## Measured, modelled, imagined

Everything on screen is one of three kinds:

| Kind | Examples | How it looks |
| --- | --- | --- |
| Measured | HYDE head counts per cell, land use | The glow and density of people on the map |
| Modelled | Unit type (band, village, city), positions within a cell, way of life | Drawn on the map like measured data; explained in the legend |
| Imagined | AI-written days, portraits | Always labelled "speculative" where it appears |

Light touch: label where it matters (cards, legend), but don't clutter the map. Imagined content is always grounded in what we do know for that place and time, and shows those facts next to it.

## What it isn't

- **Not empires and wars.** No borders, battles or great-men timelines
- **Not a textbook.** No long text panels. You learn by exploring
- **Not decoration.** Every pixel carries data or clearly labelled imagination. People are the only warm colour
- **Not authoritative.** A well-grounded sketch, not a research tool claiming precision

## Open questions

Not decided yet (2026-11-28):

- **Uncertainty:** whether "How we estimate this" stays opt-in or becomes default, and whether uncertainty is ever drawn on the map
- **Paths:** keep or drop the procedural worn paths round settlements

## Other docs

- [design-philosophy.md](design-philosophy.md): visual and interaction conventions (some details are dated)
- [one-pager.md](one-pager.md): the original 2025 pitch, kept for history
- [README](../../README.md): setup and deployment
