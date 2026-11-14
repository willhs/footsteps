'use client';

import { useMemo } from 'react';
import type { HoverPoint } from '../hooks/useHoverPoint';
import useHabitatLookups from '../hooks/useHabitatLookups';
import useFauna from '../hooks/useFauna';
import { groundingFacts } from '../layers/grounding';
import type { GridData } from '../hooks/gridData';
import { readHabitat, readLandUse } from '@/lib/habitat';
import { notableAnimals } from '@/lib/fauna';
import { cardAnchor, formatPlace, hoverCardRows, type CardRow } from '@/lib/hoverCard';
import { HYDE_MIN } from '@/lib/time';

const WARM_ROWS: ReadonlySet<CardRow['id']> = new Set(['people', 'life']);

/**
 * A small card that follows the cursor: the habitat, climate, people and way of life at the
 * slider's year. Each row says whether it is measured or modelled. People are the only warm colour.
 * On by default; ?hover=0 turns it off.
 */
export default function HoverCard({
  point,
  time,
  year,
  grid,
}: {
  point: HoverPoint | null;
  time: number;
  /** The population image year in use (nearestDataYear) and its decoded grid, if loaded. */
  year: number;
  grid: GridData | null;
}) {
  const lookups = useHabitatLookups(point !== null, time, year >= HYDE_MIN ? year : null);
  const fauna = useFauna(point, time);
  const rows = useMemo(() => {
    if (!point) return [];
    const facts = grid ? groundingFacts(grid, year, point.lon, point.lat) : null;
    return hoverCardRows({
      time,
      habitat: lookups.step ? readHabitat(lookups.step, point.lon, point.lat) : null,
      today: lookups.today ? readHabitat(lookups.today, point.lon, point.lat) : null,
      people: facts && { count: facts.people, evidence: facts.evidence, cellDeg: facts.cellDeg },
      landUse: lookups.landUse ? readLandUse(lookups.landUse, point.lon, point.lat) : null,
      animals: fauna ? notableAnimals(fauna.species, fauna.ids) : null,
    });
  }, [point, time, year, grid, lookups.step, lookups.today, lookups.landUse, fauna]);

  if (!point) return null;
  return (
    <div
      role="tooltip"
      className="ov-panel pointer-events-none fixed z-40 w-[232px] !px-3 !py-2.5"
      style={cardAnchor(point.x, point.y, window.innerWidth, window.innerHeight)}
    >
      <p className="ov-debug">{formatPlace(point.lon, point.lat)}</p>
      <ul className="mt-1 space-y-1.5">
        {rows.map((row) => (
          <li key={row.id}>
            <p className={`text-[13px] leading-snug ${WARM_ROWS.has(row.id) ? 'text-[var(--ov-amber)]' : 'text-[var(--ov-text)]'}`}>
              {row.text}
            </p>
            <p className="text-[11px] leading-snug text-[var(--ov-text-3)]">
              {row.detail ? `${row.detail} · ` : ''}
              <span className={row.evidence === 'modelled' ? 'italic' : ''}>{row.evidence}</span>
            </p>
          </li>
        ))}
        {rows.length === 0 && <li className="text-[11px] text-[var(--ov-text-4)]">Looking…</li>}
      </ul>
    </div>
  );
}
