import { homininLabel, sampleCaveats, type AadrDoc } from '@/lib/aadr';
import { formatYearRange, type EvidenceDoc } from '@/lib/evidence';
import type { EvidenceHover } from '../hooks/useEvidenceLayer';

/** Name, date range and source of the hovered dated site (or the count for a bunch), shown in the left column. */
export default function EvidenceTooltip({
  hover,
  doc,
  dnaDoc,
}: {
  hover: EvidenceHover | null;
  doc: EvidenceDoc | null;
  dnaDoc: AadrDoc | null;
}) {
  if (!hover) return null;
  const { mark } = hover;
  const s =
    hover.kind === 'site' && mark.count === 1 && doc
      ? doc.sites[mark.site]
      : null;
  const sample =
    hover.kind === 'dna' && mark.count === 1
      ? dnaDoc?.samples[mark.site]
      : null;
  const ref = s && s.r >= 0 ? (doc?.refs[s.r] ?? null) : null;
  return (
    <div className="ov-panel pointer-events-none shrink-0 px-3.5 py-3" data-testid="evidence-info">
      <p className="ov-eyebrow">
        Measured evidence ·{' '}
        {hover.kind === 'dna' ? 'Ancient DNA (AADR)' : 'Radiocarbon (p3k14c)'}
      </p>
      {sample ? (
        <>
          <p className="ov-body">
            {sample.n || 'Unnamed locality'}, {sample.c}
          </p>
          <p className="ov-note">
            {formatYearRange(1950 - sample.r[0], 1950 - sample.r[1])} ·{' '}
            {homininLabel(sample)}
          </p>
          <p className="ov-note">{sampleCaveats(sample).join(' · ')}</p>
          <p className="ov-note">
            Source: {dnaDoc?.refs[sample.p] || dnaDoc?.meta.dataset}
          </p>
        </>
      ) : s && s.cal ? (
        <>
          <p className="ov-body text-[var(--ov-text)]">
            {s.n || 'Unnamed site'}
          </p>
          <p className="ov-note tabular-nums">
            {formatYearRange(1950 - s.cal[0], 1950 - s.cal[1])} · {s.nd}{' '}
            {s.nd === 1 ? 'date' : 'dates'} · {s.m}
          </p>
          {ref && (
            <p className="ov-note">
              {ref.length > 140 ? `${ref.slice(0, 140)}…` : ref}
            </p>
          )}
        </>
      ) : (
        <p className="ov-body">
          {mark.count.toLocaleString('en-US')}{' '}
          {hover.kind === 'dna' ? 'ancient-DNA individuals' : 'dated sites'}{' '}
          here. Zoom in to see each.
        </p>
      )}
    </div>
  );
}
