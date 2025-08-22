# Footsteps of Time: Design System (Practical Guide)

Simple, action-oriented rules for building UI that matches our philosophy. Use this as the source of truth for agents and contributors.

See also: docs/philosophy/design-philosophy.md

---

## Principles (build by these)

- Data-first: Show people over polish. Remove decoration that doesn’t explain the data.
- Time-first: The time slider is the hero control; everything supports it.
- Anti-duck: UI should disappear; the story (human presence) should remain.
- Fast-by-default: Maintain 60fps on modern laptops and phones.
- Accessible: Keyboard usable, visible focus, sufficient contrast.

---

## Design Tokens (minimal set)

Define or reference these tokens. Prefer Tailwind utilities; when custom CSS is needed, use variables below and implement under `@layer components` in `footsteps-web/app/globals.css`.

Colors

```css
:root {
  /* Core */
  --background: #0a0a0a;     /* Space/time backdrop */
  --foreground: #ededed;     /* Default text */

  /* Brand semantics */
  --color-time: #0ea5e9;     /* Active year, primary accents */
  --color-accent: #38bdf8;   /* Highlights, selected */
  --color-human: #f97316;    /* Settlement dots */

  /* States */
  --color-muted: #94a3b8;    /* Labels, tertiary text */
  --color-success: #10b981;
  --color-warn: #f59e0b;
  --color-error: #ef4444;

  /* Surfaces */
  --glass-bg: rgba(0, 0, 0, 0.4);
  --glass-border: rgba(148, 163, 184, 0.3);
}
```

Type & spacing

```css
:root {
  --font-stack: Arial, Helvetica, sans-serif;
  --text-mega: 24px;   /* hero year */
  --text-lg: 18px;     /* headings */
  --text-md: 14px;     /* body */
  --text-sm: 12px;     /* secondary */
  --text-xs: 10px;     /* dense labels */

  --radius-md: 8px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 32px;
}
```

Layers

```css
:root {
  --z-base: 0;        /* globe + viz */
  --z-secondary: 10;  /* minor controls */
  --z-controls: 20;   /* view toggles */
  --z-overlay: 30;    /* data overlays */
  --z-slider: 40;     /* time slider */
  --z-critical: 50;   /* toasts/errors */
}
```

Breakpoints

- Mobile: < 640px
- Tablet: 640–1024px
- Desktop: > 1024px

---

## Patterns (copy these)

Glass panel (for overlays, slider container)

```css
@layer components {
  .glass-panel {
    backdrop-filter: blur(12px);
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(14,165,233,0.1);
  }
}
```

Text hierarchy

```css
@layer components {
  .text-hero { font-size: var(--text-mega); font-weight: 600; color: var(--color-time); }
  .text-body { font-size: var(--text-md); font-weight: 400; color: var(--foreground); }
  .text-dim  { font-size: var(--text-sm); font-weight: 400; color: var(--color-muted); }
}
```

Time slider (hero control)

- Keep visible, fixed bottom, `z-index: var(--z-slider)`.
- Track: 8px height; rail muted; track gradient `--color-time → --color-accent`.
- Handle: 28px circular, high-contrast ring, hover scale ≤ 1.1.
- Labels: 12px default; 10px on mobile; use accent for milestones/current.

Implementation aligns with existing styles in `globals.css` (`.time-slider-container`, `.rc-slider-*`).

---

## Interaction Rules

- Time-first: Scrubbing is instant; precompute/cache where possible.
- Progressive disclosure: show more detail with zoom/hover; avoid clutter at rest.
- Gentle feedback: use transform/opacity; prefer subtle glow over heavy shadows.
- No spinners for scrubbing: use skeletons/opacity fades; never block the slider.
- Pointer + keyboard: arrow keys nudge year; Home/End jump to bounds.

---

## Accessibility

- Contrast: meet WCAG AA for text and critical UI.
- Focus: visible focus ring on interactive elements (including slider handle).
- Touch targets: min 40×40px for primary controls.
- Motion: respect reduced-motion; disable non-essential animations.
- Labels: aria labels for slider, overlays, and toggles.

---

## Performance (non‑negotiables)

- 60fps target: keep handlers light; avoid allocations in render.
- Animations: only `transform`/`opacity`; avoid layout thrash.
- Deck.gl: keep layer props stable; memoize accessors; batch updates.
- Z-order: don’t trigger repaints by moving the slider layer frequently.
- Assets: no web fonts; tiny SVGs over PNGs for UI glyphs.

---

## Implementation Rules (for agents)

- Tailwind-first: prefer utilities; custom CSS only in `@layer components`.
- Tokens-only: use variables above; do not invent new colors without discussion.
- Components: functional, typed props, stable keys; no inline style duplication.
- Names: `PascalCase.tsx` for components; colocate tests as `*.test.tsx`.
- Slider: do not change size/position without a strong reason.

---

## Do / Don’t

Do

- Use `glass-panel` for overlays and the slider container.
- Use `text-hero` for the current year; `text-body` for other copy.
- Keep tooltips concise: name, year, population; defer detail to overlays.
- Gate complexity behind zoom/hover; keep default view clean.

Don’t

- Add decorative gradients, borders, or fonts.
- Animate properties that cause layout (width/height/top/left).
- Obscure the slider or move it behind other UI.
- Introduce new colors or sizes ad hoc.

---

## Quick Checklist (before PR)

- Uses tokens and `@layer components` only; Tailwind elsewhere.
- Slider remains smooth at 60fps while scrubbing.
- Keyboard accessible and visible focus on all controls.
- Contrast checks pass; mobile labels readable.
- No new colors/fonts; z-index follows the strategy above.

---

This design system is intentionally small: it aligns with our philosophy and gives agents just enough to build consistent, fast UIs without ornament. When in doubt, remove UI and show the data.
