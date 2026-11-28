'use client';

import { flags } from '@/lib/flags';

import { useEffect, useState } from 'react';
import { type FoodData } from '@/lib/food';

let pending: Promise<FoodData> | null = null;

/** Only fetch after the first hover (or when the close-up's fields need it), unless ?food=0. Shared for the page lifetime. */
export default function useFood(hovering: boolean, always = false): FoodData | null {
  const [data, setData] = useState<FoodData | null>(null);
  const enabled = always || (typeof window !== 'undefined' && flags().enabled('food'));
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
