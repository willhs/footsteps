'use client';

import { useMemo, useState } from 'react';
import type { HoverPoint } from '../hooks/useHoverPoint';
import useHabitatLookups from '../hooks/useHabitatLookups';
import useFauna from '../hooks/useFauna';
import useGroundIndex from '../hooks/useGroundIndex';
import { groundingFacts } from '../layers/grounding';
import type { GridData } from '../hooks/gridData';
import { readHabitat, readLandUse } from '@/lib/habitat';
import { notableAnimals } from '@/lib/fauna';
import { cardAnchor, formatPlace, hoverCardRows, settledLife, type CardRow } from '@/lib/hoverCard';
import { groundImageUrl, groundView, type GroundView } from '@/lib/groundScene';
import { HYDE_MIN } from '@/lib/time';

/**
 * The painted ground view: an imagined scene (docs/ops/ground-view.md), always tagged as such, with the
 * facts it was chosen from underneath. The box is reserved before the picture arrives so the card
 * does not jump; a picture that fails to load leaves nothing behind.
 */
function GroundPicture({ view, version }: { view: GroundView; version: number }) {
  const [state, setState] = useState<{ scene: string; status: 'loaded' | 'failed' } | null>(null);
  const status = state?.scene === view.scene ? state.status : 'loading';
  if (status === 'failed') return null;
  return (
    <figure className="mb-2">
      <div className="relative aspect-video overflow-hidden rounded-sm bg-[var(--ov-text-4)]/15">
        {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static painting; next/image needs a server */}
        <img
          src={groundImageUrl(view.scene, version)}
          alt=""
          decoding="async"
          draggable={false}
          onLoad={() => setState({ scene: view.scene, status: 'loaded' })}
          onError={() => setState({ scene: view.scene, status: 'failed' })}
          className={`h-full w-full object-cover transition-opacity duration-150 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
        <span className="absolute left-1.5 top-1.5 rounded-sm bg-black/65 px-1.5 py-0.5 text-[10px] font-medium uppercase italic tracking-wider text-white/90">
          Imagined
        </span>
      </div>
      <figcaption className="mt-1 text-[11px] leading-snug text-[var(--ov-text-3)]">
        A painted guess from: {view.basis.join(' · ')}
        {view.note && <span className="block text-[var(--ov-text-4)]">{view.note}</span>}
      </figcaption>
    </figure>
  );
}

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
  const ground = useGroundIndex(point !== null);
  const { rows, view } = useMemo(() => {
    if (!point) return { rows: [], view: null };
    const facts = grid ? groundingFacts(grid, year, point.lon, point.lat) : null;
    const input = {
      time,
      habitat: lookups.step ? readHabitat(lookups.step, point.lon, point.lat) : null,
      today: lookups.today ? readHabitat(lookups.today, point.lon, point.lat) : null,
      people: facts && { count: facts.people, evidence: facts.evidence, cellDeg: facts.cellDeg },
      landUse: lookups.landUse ? readLandUse(lookups.landUse, point.lon, point.lat) : null,
      animals: fauna ? notableAnimals(fauna.species, fauna.ids) : null,
    };
    return {
      rows: hoverCardRows(input),
      // In HYDE years the way of life picks the scene, so wait for it rather than flash the wrong picture.
      view:
        year >= HYDE_MIN && !(input.landUse && input.people)
          ? null
          : groundView({
              time,
              habitat: input.habitat,
              life: settledLife(input),
              peopleModelled: input.people?.evidence === 'modelled' && input.people.count > 0,
            }),
    };
  }, [point, time, year, grid, lookups.step, lookups.today, lookups.landUse, fauna]);

  if (!point) return null;
  return (
    <div
      role="tooltip"
      className="ov-panel pointer-events-none fixed z-40 w-[232px] !px-3 !py-2.5"
      style={cardAnchor(point.x, point.y, window.innerWidth, window.innerHeight)}
    >
      {view && ground?.scenes.includes(view.scene) && <GroundPicture view={view} version={ground.version} />}
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
