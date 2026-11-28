import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { WebMercatorViewport, type LayersList } from '@deck.gl/core';
import { TextLayer } from '@deck.gl/layers';
import { animClock } from '@/lib/gait';
import { drawnGroundZ, groundVersion, subscribeGround } from '@/lib/groundHeights';
import { solarNowMs } from '@/lib/solarClock';
import type { Person } from '../layers/people';
import { TAG_FONT_PX, TAG_GAP_PX, chooseTags, groundProjector, tagVisibility, type Tag } from '../layers/personTags';

type View = { longitude: number; latitude: number; zoom: number; pitch?: number; bearing?: number; position?: [number, number, number] };

/** How often tags follow their walkers. A walker moves ~1.4 m/s: ~4 px/s at the closest zoom, so
 * this is well under a pixel of lag. Only positions are rewritten; the text is laid out once. */
const UPDATE_MS = 200;
// Roles are lowercase words; ages are digits. A fixed set means the glyph atlas is built once.
const CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789,- '";

/** Name tags for the people at the closest zoom (see layers/personTags.ts). Empty and idle (no
 * timer) until the zoom is near enough. `peopleOpacity` is the people layers' own fade. */
export default function usePersonTags({
  people,
  view,
  size,
  enabled,
  peopleOpacity,
  routineEpoch = null,
  onGround = false,
}: {
  people: readonly Person[];
  view: View;
  size: { width: number; height: number } | undefined;
  enabled: boolean;
  peopleOpacity: number;
  /** The daily routine's plan hour (`epochHour`), or null when it is off: tags then follow people on their trips. */
  routineEpoch?: number | null;
  /** The close-up 3D ground is drawn: the people stand on its drawn height (lib/groundHeights.ts drawnGroundZ), so their tags must too.
   * At z = 0 under raised ground a tag was drawn off to the side of its person (toward the view centre) and, zoomed in, so far below the
   * camera that it was judged too small and dropped. */
  onGround?: boolean;
}): LayersList {
  const opacity = enabled ? tagVisibility(view.zoom) * peopleOpacity : 0;
  const active = opacity > 0 && people.length > 0 && !!size;

  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setFrame((f) => f + 1), UPDATE_MS);
    return () => clearInterval(timer);
  }, [active]);

  const shown = useRef<Tag[]>([]);
  const { longitude, latitude, zoom, pitch = 0, bearing = 0, position: eye } = view;
  const groundVer = useSyncExternalStore(subscribeGround, groundVersion, groundVersion);
  const zAt = (lon: number, lat: number) => (onGround ? drawnGroundZ(lon, lat) : 0);
  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  const tags = useMemo(() => {
    if (!active) {
      shown.current = [];
      return shown.current;
    }
    const viewport = new WebMercatorViewport({ longitude, latitude, zoom, pitch, bearing, width, height, ...(eye ? { position: eye } : {}) });
    const next = chooseTags({
      people,
      clock: animClock(),
      centre: [longitude, latitude],
      size: { width, height },
      project: groundProjector(viewport, [longitude, latitude], zAt),
      kept: new Set(shown.current.map((t) => t.person.id)),
      routine: routineEpoch === null ? undefined : { epoch: routineEpoch, ms: solarNowMs() },
    });
    // Same people as last time: keep the objects (so the layer keeps its text) and move them.
    const prev = shown.current;
    if (next.length === prev.length && next.every((t, i) => t.person === prev[i].person)) {
      next.forEach((t, i) => (prev[i].position = t.position));
    } else {
      shown.current = next;
    }
    return shown.current;
    // `frame` is the clock tick: it is what re-runs this as the walkers move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, people, longitude, latitude, zoom, pitch, bearing, eye?.[2], width, height, frame, routineEpoch, onGround, groundVer]);

  return useMemo(
    () =>
      active
        ? [
            new TextLayer<Tag>({
              id: 'person-tags',
              data: tags,
              getPosition: (t) => [t.position[0], t.position[1], zAt(t.position[0], t.position[1])],
              getText: (t) => t.text,
              getSize: TAG_FONT_PX,
              getColor: [255, 226, 170, 255],
              getPixelOffset: [TAG_GAP_PX, 0],
              getTextAnchor: 'start',
              getAlignmentBaseline: 'center',
              characterSet: CHARACTERS,
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontWeight: 500,
              outlineWidth: 2,
              outlineColor: [28, 18, 8, 230],
              fontSettings: { sdf: true, fontSize: 64, buffer: 8 },
              opacity,
              pickable: false,
              // Like the prints: drawn over the raised ground of the close-up 3D view.
              parameters: { depthCompare: 'always', depthWriteEnabled: false },
              updateTriggers: { getPosition: [frame, onGround, groundVer] },
            }),
          ]
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, tags, opacity, frame, onGround, groundVer],
  );
}
