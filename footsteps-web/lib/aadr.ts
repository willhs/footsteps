// Annotation-only ancient individuals, exported by evidence/aadr.py. Loaded only behind ?evidence=1.
export interface AadrSample {
  id: string;
  la: number;
  lo: number;
  dp: number;
  r: [number, number];
  n: string;
  c: string;
  p: number;
  h?: 'neanderthal' | 'denisovan' | 'neanderthal_denisovan';
  t: 'd' | 'c' | 't' | 'o';
  rs?: 'mean_sd' | 'conflict';
}
export interface AadrDoc {
  meta: { dataset: string; caveat: string };
  refs: string[];
  samples: AadrSample[];
}
export const AADR_URL = '/evidence/aadr_samples.json.gz';
let loading: Promise<AadrDoc> | null = null;

export function loadAadr(): Promise<AadrDoc> {
  if (!loading) {
    loading = (async () => {
      const res = await fetch(AADR_URL);
      if (!res.ok || !res.body)
        throw new Error(`AADR file: HTTP ${res.status}`);
      return (await new Response(
        res.body.pipeThrough(new DecompressionStream('gzip')),
      ).json()) as AadrDoc;
    })().catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}
export function homininLabel(sample: AadrSample): string {
  if (sample.h === 'neanderthal_denisovan')
    return 'Neanderthal–Denisovan hybrid';
  return sample.h === 'neanderthal'
    ? 'Neanderthal'
    : sample.h === 'denisovan'
      ? 'Denisovan'
      : 'Modern human (Homo sapiens)';
}
export function sampleCaveats(sample: AadrSample): string[] {
  return [
    {
      d: 'Direct radiocarbon date',
      c: 'Context date',
      t: 'Date tethered to a relative',
      o: 'Other dating method',
    }[sample.t],
    ...(sample.dp <= 1 ? ['Rounded locality or district centroid'] : []),
    ...(sample.rs === 'conflict'
      ? ['Conflicting source dates — do not trust this date']
      : sample.rs === 'mean_sd'
        ? ['Range estimated from mean ± 2 standard deviations']
        : []),
  ];
}
