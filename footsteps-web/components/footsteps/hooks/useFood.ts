'use client';

import { useEffect, useState } from 'react';
import { foodEnabled, type FoodData } from '@/lib/food';

let pending: Promise<FoodData> | null = null;

/** Only fetch after the first hover with ?food=1. Shared for the page lifetime. */
export default function useFood(hovering: boolean, figures = false): FoodData | null {
  const [data, setData] = useState<FoodData | null>(null);
  const enabled = figures || (typeof window !== 'undefined' && foodEnabled(window.location.search));
  useEffect(() => {
    if (!enabled || !hovering) return;
    let live = true;
    if (!pending) pending = fetch('/food/food.json?v=1').then((response) => {
      if (!response.ok) throw new Error(`food: HTTP ${response.status}`);
      return response.json();
    }).catch((error) => { pending = null; throw error; });
    pending.then((value) => { if (live) setData(value); }).catch((error) => console.warn('[food]', error));
    return () => { live = false; };
  }, [enabled, hovering]);
  return enabled ? data : null;
}
