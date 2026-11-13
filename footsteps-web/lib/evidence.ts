// Dated archaeological sites (p3k14c), for the "evidence nearby" list in the details panel.
// Drawn on the map only behind ?evidence=1 (lib/evidenceMarks.ts). The file is large (~1 MB gzip), so it loads only when the panel opens.

export interface EvidenceDoc {
  meta: { dataset: string; licence: string; caveat: string };
  sources: string[];
  refs: string[];
  sites: RawSite[];
}

/** Short keys as exported by footstep-generator/evidence/p3k14c.py (`meta.fields`). */
export interface RawSite {
  id: string | number;
  n: string;
  la: number;
  lo: number;
  nd: number;
  /** [oldest, youngest] edge of the 95.4% ranges, cal BP. */
  cal: [number, number] | null;
  m: string;
  r: number;
  /** Set when the oldest date is marine or reservoir-uncertain. */
  cs?: string;
}

export interface NearbySite {
  id: string | number;
  name: string;
  distanceKm: number;
  /** Year CE (negative = BCE), oldest first. */
  fromYear: number;
  toYear: number;
  dates: number;
  method: string;
  reference: string | null;
  uncertainCarbon: boolean;
}

export const EVIDENCE_URL = '/evidence/p3k14c_sites.json.gz';
export const DEFAULT_RADIUS_KM = 150;
export const DEFAULT_HALF_WINDOW_YEARS = 500;

const KM_PER_DEG = 111.195;

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The nearest sites within `radiusKm` whose calibrated range overlaps
 * [year - halfWindow, year + halfWindow] (years CE, negative = BCE). cal BP = 1950 - year CE.
 * The site range is the hull of all its dates, so it can overstate the span.
 */
export function nearbySites(
  doc: EvidenceDoc,
  lat: number,
  lon: number,
  year: number,
  { radiusKm = DEFAULT_RADIUS_KM, halfWindow = DEFAULT_HALF_WINDOW_YEARS, limit = 8 } = {},
): NearbySite[] {
  const dLat = radiusKm / KM_PER_DEG;
  const dLon = radiusKm / (KM_PER_DEG * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const winOld = 1950 - (year - halfWindow); // cal BP of the window's older edge
  const winYoung = 1950 - (year + halfWindow);
  const found: NearbySite[] = [];
  for (const s of doc.sites) {
    if (!s.cal || Math.abs(s.la - lat) > dLat) continue;
    let dl = Math.abs(s.lo - lon);
    if (dl > 180) dl = 360 - dl;
    if (dl > dLon) continue;
    const [old, young] = s.cal;
    if (old < winYoung || young > winOld) continue;
    const d = distanceKm(lat, lon, s.la, s.lo);
    if (d > radiusKm) continue;
    found.push({
      id: s.id,
      name: s.n || 'Unnamed site',
      distanceKm: d,
      fromYear: 1950 - old,
      toYear: 1950 - young,
      dates: s.nd,
      method: s.m,
      reference: s.r >= 0 ? (doc.refs[s.r] ?? null) : null,
      uncertainCarbon: Boolean(s.cs),
    });
  }
  found.sort((a, b) => a.distanceKm - b.distanceKm);
  return found.slice(0, limit);
}

/** "12,300–11,800 BCE" or "2,100 BCE – 40 CE"; the unit is dropped from the first year when shared. */
export function formatYearRange(from: number, to: number): string {
  const one = (y: number) => `${Math.abs(Math.round(y)).toLocaleString('en-US')} ${y < 1 ? 'BCE' : 'CE'}`;
  if (Math.round(from) === Math.round(to)) return one(from);
  const sameEra = from < 1 === to < 1;
  const a = one(from);
  return sameEra ? `${a.replace(/ (BCE|CE)$/, '')}–${one(to)}` : `${a} – ${one(to)}`;
}

/** A DOI link when the citation carries one; otherwise null (show the citation as text). */
export function referenceUrl(reference: string): string | null {
  const m = reference.match(/\b(10\.\d{4,9}\/[^\s"<>]+?)[.,;)]*(?=\s|$)/);
  return m ? `https://doi.org/${m[1]}` : null;
}

let loading: Promise<EvidenceDoc> | null = null;

/** Fetch and unzip the site file once; a failure is not cached, so reopening the panel retries. */
export function loadEvidence(): Promise<EvidenceDoc> {
  if (!loading) {
    loading = (async () => {
      const res = await fetch(EVIDENCE_URL);
      if (!res.ok || !res.body) throw new Error(`evidence file: HTTP ${res.status}`);
      const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
      return (await new Response(stream).json()) as EvidenceDoc;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}
