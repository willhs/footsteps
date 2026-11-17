import { siteAgeLabel } from '@/lib/otherHumans';
import type { OtherHumansHover } from '../hooks/useOtherHumansLayer';

/** Name, age, find and source of a hovered site of another kind of human. */
export default function OtherHumansTooltip({ hover }: { hover: OtherHumansHover | null }) {
  if (!hover) return null;
  const { site } = hover;
  return (
    <div
      className="ov-panel pointer-events-none absolute z-30 max-w-[300px] px-3 py-2"
      style={{ left: hover.x + 12, top: hover.y + 12 }}
    >
      <p className="ov-eyebrow">{site.human.name} · another kind of human</p>
      <p className="ov-body text-[var(--ov-text)]">{site.name}</p>
      <p className="ov-note tabular-nums">{siteAgeLabel(site)}</p>
      <p className="ov-note">{site.find}</p>
      <p className="ov-note">
        Source: {site.source}
        {!site.checked && ' · date recalled, not yet checked'}
      </p>
    </div>
  );
}
