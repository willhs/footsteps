'use client';

import { useEffect, useState } from 'react';

/** /ground/index.json, written by footstep-generator/ground_images.py next to the pictures. */
export type GroundIndex = {
  /** Bump when pictures are regenerated: Cloudflare caches /ground for a day. */
  version: number;
  scenes: string[];
};

let pending: Promise<GroundIndex | null> | null = null;

/** One small request per page, and only once the card is first used; null when there are no pictures. */
export function loadGroundIndex(): Promise<GroundIndex | null> {
  pending ??= fetch('/ground/index.json')
    .then((r) => (r.ok ? (r.json() as Promise<GroundIndex>) : null))
    .catch(() => null);
  return pending;
}

export default function useGroundIndex(active: boolean): GroundIndex | null {
  const [index, setIndex] = useState<GroundIndex | null>(null);
  useEffect(() => {
    if (!active) return;
    let live = true;
    loadGroundIndex().then((i) => live && setIndex(i));
    return () => {
      live = false;
    };
  }, [active]);
  return index;
}
