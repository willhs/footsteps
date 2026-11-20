import { siteAgeLabel } from '@/lib/otherHumans';
import type { OtherHumansHover } from '../hooks/useOtherHumansLayer';

/** A hovered site (name, age, find, source) or guessed band of another kind of human. */
export default function OtherHumansTooltip({ hover }: { hover: OtherHumansHover | null }) {
  if (!hover) return null;
  return (
    <div
      className="ov-panel pointer-events-none absolute z-30 max-w-[300px] px-3 py-2"
      style={{ left: hover.x + 12, top: hover.y + 12 }}
    >
      {hover.kind === 'site' ? <Site site={hover.site} /> : <Band band={hover.band} />}
    </div>
  );
}

function Site({ site }: { site: Extract<OtherHumansHover, { kind: 'site' }>['site'] }) {
  return (
    <>
      <p className="ov-eyebrow">{site.human.name} · another kind of human</p>
      <p className="ov-body text-[var(--ov-text)]">{site.name}</p>
      <p className="ov-note tabular-nums">{siteAgeLabel(site)}</p>
      <p className="ov-note">{site.find}</p>
      <p className="ov-note">
        Source: {site.source}
        {!site.checked && ` · could not verify: ${site.couldNotVerify}`}
      </p>
    </>
  );
}

function Band({ band }: { band: Extract<OtherHumansHover, { kind: 'band' }>['band'] }) {
  return (
    <>
      <p className="ov-eyebrow">{band.human.name} · another kind of human</p>
      <p className="ov-body text-[var(--ov-text)]">A guessed band of about {band.people} people</p>
      <p className="ov-note">
        Imagined: how many and where are guesses, placed by climate and habitat inside a rough range, not a find.
        {band.hinted && ' This area is hinted at only by Denisovan DNA in people living today.'}
      </p>
    </>
  );
}
