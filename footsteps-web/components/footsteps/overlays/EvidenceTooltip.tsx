import { formatYearRange, type EvidenceDoc } from '@/lib/evidence';
import type { EvidenceHover } from '../hooks/useEvidenceLayer';

/** Name, date range and source of the hovered dated site (or the count for a bunch). */
export default function EvidenceTooltip({ hover, doc }: { hover: EvidenceHover | null; doc: EvidenceDoc | null }) {
  if (!hover) return null;
  const { mark } = hover;
  const s = mark.count === 1 && doc ? doc.sites[mark.site] : null;
  const ref = s && s.r >= 0 ? (doc?.refs[s.r] ?? null) : null;
  return (
    <div
      className="ov-panel pointer-events-none absolute z-30 max-w-[280px] px-3 py-2"
      style={{ left: hover.x + 12, top: hover.y + 12 }}
    >
      {s && s.cal ? (
        <>
          <p className="ov-body text-[var(--ov-text)]">{s.n || 'Unnamed site'}</p>
          <p className="ov-note tabular-nums">
            {formatYearRange(1950 - s.cal[0], 1950 - s.cal[1])} · {s.nd} {s.nd === 1 ? 'date' : 'dates'} · {s.m}
          </p>
          {ref && <p className="ov-note">{ref.length > 140 ? `${ref.slice(0, 140)}…` : ref}</p>}
        </>
      ) : (
        <p className="ov-body">{mark.count.toLocaleString('en-US')} dated sites here. Zoom in to see each.</p>
      )}
    </div>
  );
}
