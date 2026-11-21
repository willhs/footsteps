'use client';

import { useEffect, useState } from 'react';
import { langsDeepEnabled, type ExpansionData } from '@/lib/languageExpansions';

let pending: Promise<ExpansionData> | null = null;

/** The cited expansions table (~7 KB), fetched once after the first hover with ?langs=deep. Null without the flag. */
export default function useLanguageExpansions(hovering: boolean): ExpansionData | null {
  const [data, setData] = useState<ExpansionData | null>(null);
  const enabled = typeof window !== 'undefined' && langsDeepEnabled(window.location.search);
  useEffect(() => {
    if (!enabled || !hovering) return;
    let live = true;
    if (!pending) pending = fetch('/languages/expansions.json?v=1').then((response) => {
      if (!response.ok) throw new Error(`language expansions: HTTP ${response.status}`);
      return response.json() as Promise<ExpansionData>;
    }).catch((error) => { pending = null; throw error; });
    pending.then((value) => { if (live) setData(value); }).catch((error) => console.warn('[langs]', error));
    return () => { live = false; };
  }, [enabled, hovering]);
  return enabled ? data : null;
}
