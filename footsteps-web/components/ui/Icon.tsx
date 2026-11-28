import type { ReactElement } from 'react';
import { ICON_GLYPHS, type IconName } from '@/lib/icons';

/**
 * Custom line drawings that replace an emoji, by icon name. Empty for now: every icon is still its emoji.
 * To draw one, add `name: () => <svg …/>` here (24 × 24 viewBox, stroke currentColor, like components/ui/icons.tsx);
 * every <Icon name="…" /> in the app switches over at once. See docs/design/icons.md.
 */
const ICON_SVGS: Partial<Record<IconName, () => ReactElement>> = {};

type IconProps = {
  name: IconName;
  /** Read out to screen readers. Leave it out when the text beside the icon already says the same thing. */
  label?: string;
  className?: string;
};

/** One icon from the app's shared set (lib/icons.ts): its line drawing if it has one, else its emoji. */
export function Icon({ name, label, className }: IconProps) {
  const Svg = ICON_SVGS[name];
  const a11y = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': true };

  return (
    <span className={className} data-icon={name} {...a11y}>
      {Svg ? <Svg /> : ICON_GLYPHS[name]}
    </span>
  );
}
