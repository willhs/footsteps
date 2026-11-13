// Dated sites as map marks for the experimental ?evidence=1 layer.
// Pure functions: which sites show at a year, how strongly, and how they bunch up when zoomed out.
import type { EvidenceDoc } from '@/lib/evidence';

/** Sites with a calibrated range, as flat arrays so a filter pass over ~20k sites stays cheap while scrubbing. */
export interface PreparedSites {
  doc: EvidenceDoc;
  /** Index into doc.sites for each prepared row. */
  index: Int32Array;
  lon: Float32Array;
  lat: Float32Array;
  /** Year CE (negative = BCE) of the range's older and younger edge. */
  from: Float32Array;
  to: Float32Array;
}

export function prepareSites(doc: EvidenceDoc): PreparedSites {
  const rows = doc.sites.map((s, i) => [s, i] as const).filter(([s]) => s.cal);
  const n = rows.length;
  const out: PreparedSites = {
    doc,
    index: new Int32Array(n),
    lon: new Float32Array(n),
    lat: new Float32Array(n),
    from: new Float32Array(n),
    to: new Float32Array(n),
  };
  rows.forEach(([s, i], k) => {
    out.index[k] = i;
    out.lon[k] = s.lo;
    out.lat[k] = s.la;
    out.from[k] = 1950 - s.cal![0];
    out.to[k] = 1950 - s.cal![1];
  });
  return out;
}

/** Years either side of the slider year in which a site still shows (fading out). Wider further back, where dates are looser. */
export function fadeWindow(year: number): number {
  return Math.min(1000, Math.max(100, 0.03 * (1950 - year)));
}

/** Aggregate below this zoom; show individual sites from it. */
export const SITE_ZOOM = 5.5;

/** Bin size in degrees for a zoom, or 0 when sites are drawn individually. Steps of 0.5 zoom so zooming does not rebuild every frame. */
export function binDegrees(zoom: number): number {
  const z = Math.floor(zoom * 2) / 2;
  return z >= SITE_ZOOM ? 0 : 12 / 2 ** z;
}

export interface EvidenceMark {
  lon: number;
  lat: number;
  /** 0..1; 1 when the site's range covers the year, falling to 0 at the edge of the window. */
  alpha: number;
  /** Sites represented (1 = a single site). */
  count: number;
  /** Row in doc.sites when count is 1. */
  site: number;
}

export function marksAt(p: PreparedSites, year: number, zoom: number): EvidenceMark[] {
  const w = fadeWindow(year);
  const bin = binDegrees(zoom);
  const out: EvidenceMark[] = [];
  const bins = new Map<number, { sx: number; sy: number; n: number; a: number; site: number }>();
  for (let k = 0; k < p.from.length; k++) {
    const d = Math.max(p.from[k] - year, year - p.to[k], 0);
    if (d >= w) continue;
    const alpha = 1 - d / w;
    if (!bin) {
      out.push({ lon: p.lon[k], lat: p.lat[k], alpha, count: 1, site: p.index[k] });
      continue;
    }
    const key = Math.floor((p.lat[k] + 90) / bin) * 100000 + Math.floor((p.lon[k] + 180) / bin);
    const b = bins.get(key);
    if (b) {
      b.sx += p.lon[k];
      b.sy += p.lat[k];
      b.n++;
      if (alpha > b.a) b.a = alpha;
    } else {
      bins.set(key, { sx: p.lon[k], sy: p.lat[k], n: 1, a: alpha, site: p.index[k] });
    }
  }
  for (const b of bins.values()) {
    out.push({ lon: b.sx / b.n, lat: b.sy / b.n, alpha: b.a, count: b.n, site: b.n === 1 ? b.site : -1 });
  }
  return out;
}

/** Mark radius in pixels: a single site is a dot; a bunch grows with the log of its count. */
export function markRadius(count: number): number {
  return count <= 1 ? 2.5 : Math.min(9, 2.5 + 1.5 * Math.log2(count));
}
