'use client';

// Other kinds of human (Neanderthals, Denisovans, H. floresiensis, H. luzonensis), drawn like our own people:
// each guessed band is a flickering fire (FireLayer), thinned far out by the same one-fire-per-so-many-people
// rule, all bands shown once the people view switches to groups, and at street zoom each band in view becomes
// its people walking in footprints (layers/people.ts), as ours do. Colour is the only difference. Key dated
// sites sit above them. On by default; the View panel or ?humans=0 turns it off.
// Data and sources: lib/otherHumans.ts, lib/otherHumanBands.ts.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { LayersList } from '@deck.gl/core';
import { kaToYear, otherHumansAt, type OtherHuman, type Site } from '@/lib/otherHumans';
import { BANDS_URL, bandStepKa, bandsAt, type Band, type BandsFile } from '@/lib/otherHumanBands';
import { populationAt } from '@/lib/time';
import FireLayer, { FIRE_BLEND, fireRadius, fireVisibleFraction, peoplePerFire } from '../layers/FireLayer';
import { viewBlend, viewBounds } from './peopleView';
import { PeopleLayer, footprintData, peopleForGroups, type Person } from '../layers/people';
import { UnitKind } from '../layers/units';

// Lavender: cool like the evidence marks (blue, teal) but distinct; our own people are the warm colours.
export const OTHER_HUMANS_RGB: [number, number, number] = [190, 150, 255];
const RGB = OTHER_HUMANS_RGB;

export type BandDatum = Band & { human: OtherHuman; people: number };
type SiteDatum = Site & { human: OtherHuman; presence: number; active: boolean };

export type OtherHumansHover = ({ kind: 'site'; site: SiteDatum } | { kind: 'band'; band: BandDatum }) & {
  x: number;
  y: number;
};

/** Is a site's date range around `year`? Minimum ages count from the far past. */
export function siteActive(site: Site, year: number): boolean {
  const oldest = site.minimum ? -Infinity : kaToYear(site.ka[0]);
  return year >= oldest && year <= kaToYear(site.ka[1]);
}

/** Share of bands drawn: far out, one fire per as many people as our own people's fires stand for, thinned by
 * zoom exactly as theirs are; as the view hands over to groups (`far` → 0), every band. */
export function bandShare(bandPeople: number, year: number, zoom: number, far: number): number {
  const farShare = Math.min(1, bandPeople / peoplePerFire(populationAt(year))) * fireVisibleFraction(zoom);
  return far * farShare + (1 - far);
}

// On the flat map (and its close-up 3D relief, which writes depth) bands and sites always draw over the ground, as our own
// group marks do (people.ts). On the globe they stay depth-tested so the far side does not show through.
const OVER_GROUND = { depthCompare: 'always', depthWriteEnabled: false } as const;

/** Walkers' colours by age, as ours (people.ts) but lavender: child, elder, adult. */
const WALKER_RGBA = {
  child: [238, 228, 255, 235],
  elder: [212, 202, 232, 235],
  adult: [208, 178, 255, 245],
} as const satisfies Record<string, [number, number, number, number]>;
/** Their ids sit above ours so the two never collide. */
const WALKER_ID_BASE = 50_000_000;
/** Cap on walkers in view (ours: MAX_PEOPLE). */
const MAX_WALKERS = 6_000;

/** The people of each guessed band in `box`, generated as ours are (people.ts) and tinted lavender. */
export function walkersOf(
  bands: readonly BandDatum[],
  box: { west: number; south: number; east: number; north: number },
  year: number,
): Person[] {
  const out: Person[] = [];
  const pad = 0.05;
  for (const b of bands) {
    const [lon, lat] = b.position;
    if (lon < box.west - pad || lon > box.east + pad || lat < box.south - pad || lat > box.north + pad) continue;
    for (const p of peopleForGroups([{ lon, lat, kind: UnitKind.Band, people: b.people }], year)) {
      if (out.length >= MAX_WALKERS) return out;
      const rgba = p.age < 13 ? WALKER_RGBA.child : p.age >= 55 ? WALKER_RGBA.elder : WALKER_RGBA.adult;
      out.push({ ...p, id: WALKER_ID_BASE + out.length, color: [...rgba], kindOfHuman: b.human.id });
    }
  }
  return out;
}

export default function useOtherHumansLayer({
  enabled,
  time,
  zoom,
  globe = false,
  view,
  size,
}: {
  enabled: boolean;
  time: number;
  zoom: number;
  globe?: boolean;
  /** The flat map's view and screen size: which bands' people to walk at street zoom. */
  view?: { longitude: number; latitude: number; zoom: number };
  size?: { width: number; height: number };
}) {
  const [hover, setHover] = useState<OtherHumansHover | null>(null);
  const year = Math.round(time);
  // Rebuild only when someone's presence changes, not every slider frame.
  const shown = useMemo(() => (enabled ? otherHumansAt(year) : []), [enabled, year]);
  const key = shown.map((d) => `${d.human.id}:${d.presence.toFixed(2)}`).join('|');

  // The bands file (~100 KB) loads the first time anyone is shown; a failed fetch leaves the sites.
  const [bandsFile, setBandsFile] = useState<BandsFile | null>(null);
  const wantBands = shown.length > 0;
  useEffect(() => {
    if (!wantBands || bandsFile) return;
    let live = true;
    fetch(BANDS_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((f: BandsFile | null) => live && f && setBandsFile(f))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [wantBands, bandsFile]);
  const stepKa = bandsFile ? bandStepKa(bandsFile, year) : null;

  const data = useMemo(() => {
    const bands: BandDatum[] = [];
    const sites: SiteDatum[] = [];
    for (const { human, presence } of shown) {
      const rows = bandsFile?.species[human.id]?.bands;
      if (rows && stepKa !== null) {
        for (const b of bandsAt(rows, stepKa, presence)) bands.push({ ...b, human, people: bandsFile.band_people });
      }
      for (const s of human.sites) sites.push({ ...s, human, presence, active: siteActive(s, year) });
    }
    return { bands, sites };
    // `key`, the band step and the rounded thousand capture every change that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bandsFile, stepKa, Math.round(year / 1000)]);

  const onSiteHover = useCallback((info: { object?: SiteDatum | null; x: number; y: number }) => {
    setHover(info.object ? { kind: 'site', site: info.object, x: info.x, y: info.y } : null);
  }, []);
  const onBandHover = useCallback((info: { index: number; x: number; y: number }) => {
    const band = info.index >= 0 ? data.bands[info.index] : undefined;
    setHover(band ? { kind: 'band', band, x: info.x, y: info.y } : null);
  }, [data]);

  // The same instanced buffers our own fires use: position, radius, rank, colour.
  const fires = useMemo(() => {
    const n = data.bands.length;
    const positions = new Float32Array(n * 2);
    const radius = new Float32Array(n).fill(fireRadius(bandsFile?.band_people ?? 15));
    const rank = new Float32Array(n);
    const color = new Uint8ClampedArray(n * 4);
    data.bands.forEach((b, i) => {
      positions.set(b.position, i * 2);
      rank[i] = b.rank;
      color.set([...RGB, b.hinted ? 120 : 255], i * 4);
    });
    return {
      length: n,
      attributes: {
        getPosition: { value: positions, size: 2 },
        getRadius: { value: radius, size: 1 },
        getRank: { value: rank, size: 1 },
        getFillColor: { value: color, size: 4 },
      },
    };
  }, [data, bandsFile]);

  const blend = viewBlend(zoom, 'auto');
  const visibleFraction = bandsFile ? bandShare(bandsFile.band_people, year, zoom, blend.glow) : 1;
  // Close in our own bands are fire sprites of at least `halo` px; match them.
  const radiusScale = Math.max(1, blend.halo / fireRadius(bandsFile?.band_people ?? 15)) * (1 - blend.glow) + blend.glow;

  const below = useMemo<FireLayer[]>(
    () =>
      fires.length
        ? [
            new FireLayer({
              id: 'other-humans-bands',
              data: fires as never,
              visibleFraction: 1,
              parameters: globe ? FIRE_BLEND : { ...FIRE_BLEND, ...OVER_GROUND },
              pickable: true,
              onHover: onBandHover as never,
            }),
          ]
        : [],
    [fires, onBandHover, globe],
  );

  // Street zoom: each band in view becomes its people, as ours do (useGridLayer).
  const walkersOn = !globe && blend.people > 0 && !!view && !!size && data.bands.length > 0;
  const snap = (v: number) => Math.round(v / 0.02) * 0.02;
  const box = walkersOn ? viewBounds(view!, size!.width, size!.height) : null;
  const boxKey = box ? [box.west, box.south, box.east, box.north].map(snap).join() : '';
  const walkers = useMemo(
    () => (box ? walkersOf(data.bands, box, year) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, boxKey, Math.round(year / 1000)],
  );
  const walkerLayer = useMemo(
    // The id starts with 'people', so a click picks a walker as it picks one of ours (FootstepsViz).
    () => (walkers.length ? new PeopleLayer({ id: 'people-other-humans', data: footprintData(walkers) }) : null),
    [walkers],
  );

  const above = useMemo<LayersList>(
    () =>
      data.sites.length
        ? [
            new ScatterplotLayer<SiteDatum>({
              id: 'other-humans-sites',
              data: data.sites,
              getPosition: (s) => s.position,
              getRadius: (s) => (s.active ? 4.5 : 3),
              getFillColor: (s) => [...RGB, Math.round((s.active ? 245 : 170) * s.presence)],
              getLineColor: (s) => (s.active ? [245, 240, 255, Math.round(230 * s.presence)] : [20, 16, 40, Math.round(200 * s.presence)]),
              lineWidthUnits: 'pixels',
              getLineWidth: 1,
              stroked: true,
              radiusUnits: 'pixels',
              parameters: globe ? {} : OVER_GROUND,
              pickable: true,
              onHover: onSiteHover,
              updateTriggers: { getRadius: year, getFillColor: [key, year], getLineColor: [key, year] },
            }),
          ]
        : [],
    [data, key, onSiteHover, year, globe],
  );

  return {
    below: [
      // Fires give way to walkers at street zoom, as our own group marks do.
      ...below.map((l) => l.clone({ visibleFraction, radiusScale, opacity: 1 - blend.people } as never)),
      ...(walkerLayer ? [walkerLayer.clone({ opacity: blend.people, visible: blend.people > 0 })] : []),
    ],
    /** The walkers drawn now, for name tags. */
    people: walkers,
    above,
    hover: enabled ? hover : null,
    shown: shown.length > 0,
    /** Guessed bands drawn now (positions only matter to the empty-view check). */
    bands: enabled ? data.bands : [],
  };
}
