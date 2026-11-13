import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_HALF_WINDOW_YEARS,
  DEFAULT_RADIUS_KM,
  formatYearRange,
  loadEvidence,
  nearbySites,
  referenceUrl,
  type EvidenceDoc,
} from '@/lib/evidence';

/** Sources on demand: dated sites near a clicked place and time. Loads its file when mounted. */
export default function EvidenceNearby({ lat, lon, year }: { lat: number; lon: number; year: number }) {
  const [doc, setDoc] = useState<EvidenceDoc | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadEvidence().then(
      (d) => live && setDoc(d),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const sites = useMemo(() => (doc ? nearbySites(doc, lat, lon, year) : []), [doc, lat, lon, year]);

  return (
    <div className="border-t border-[var(--ov-divider)] pt-3">
      <h3 className="ov-eyebrow mb-1">Evidence nearby</h3>
      <p className="ov-note mb-2">
        Radiocarbon-dated sites within {DEFAULT_RADIUS_KM} km, dated within {DEFAULT_HALF_WINDOW_YEARS} years of{' '}
        {formatYearRange(year, year)}.
      </p>
      {failed ? (
        <p className="ov-body">The dated-site file is not available here.</p>
      ) : !doc ? (
        <p className="ov-body">Loading dated sites…</p>
      ) : sites.length === 0 ? (
        <p className="ov-body">
          No dated sites found in this window. That reflects where archaeologists have dated things, not
          whether people were here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {sites.map((s) => {
            const url = s.reference ? referenceUrl(s.reference) : null;
            return (
              <li key={s.id} className="ov-body">
                <p className="text-[var(--ov-text)]">
                  {s.name} <span className="ov-note tabular-nums">· {Math.round(s.distanceKm)} km</span>
                </p>
                <p className="ov-note tabular-nums">
                  {formatYearRange(s.fromYear, s.toYear)} · {s.dates} {s.dates === 1 ? 'date' : 'dates'} ·{' '}
                  {s.method}
                  {s.uncertainCarbon ? ' · marine or reservoir-uncertain' : ''}
                </p>
                {s.reference &&
                  (url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="ov-note underline">
                      {s.reference}
                    </a>
                  ) : (
                    <p className="ov-note">{s.reference}</p>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      {doc && (
        <p className="ov-note mt-2">
          {doc.meta.dataset}, {doc.meta.licence.split(';')[0]}. Sites, not people: more dates mean more
          research, not more inhabitants. Each range spans all dates at a site.
        </p>
      )}
    </div>
  );
}
