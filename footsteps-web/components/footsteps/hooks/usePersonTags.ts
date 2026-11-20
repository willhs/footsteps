import { useEffect, useMemo, useRef, useState } from 'react';
import { WebMercatorViewport, type LayersList } from '@deck.gl/core';
import { TextLayer } from '@deck.gl/layers';
import { animClock } from '@/lib/gait';
import { solarNowMs } from '@/lib/solarClock';
import type { Person } from '../layers/people';
import { TAG_FONT_PX, TAG_GAP_PX, chooseTags, tagVisibility, type Tag } from '../layers/personTags';

type View = { longitude: number; latitude: number; zoom: number; pitch?: number; bearing?: number };

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
}: {
  people: readonly Person[];
  view: View;
  size: { width: number; height: number } | undefined;
  enabled: boolean;
  peopleOpacity: number;
  /** The daily routine's plan hour (`epochHour`), or null when it is off: tags then follow people on their trips. */
  routineEpoch?: number | null;
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
  const { longitude, latitude, zoom, pitch = 0, bearing = 0 } = view;
  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  const tags = useMemo(() => {
    if (!active) {
      shown.current = [];
      return shown.current;
    }
    const viewport = new WebMercatorViewport({ longitude, latitude, zoom, pitch, bearing, width, height });
    // Pixels on screen for a small step on the ground (the longer of east and north: a tilt only
    // squashes one way). Against the same at the view centre it is how big deck.gl draws a mark
    // of fixed pixel size there.
    const D = 1e-5;
    const groundPx = (lon: number, lat: number) => {
      const [x, y] = viewport.project([lon, lat]);
      const [x1, y1] = viewport.project([lon + D, lat]);
      const [x2, y2] = viewport.project([lon, lat + D]);
      return Math.max(Math.hypot(x1 - x, y1 - y), Math.hypot(x2 - x, y2 - y));
    };
    const centrePx = groundPx(longitude, latitude);
    const next = chooseTags({
      people,
      clock: animClock(),
      centre: [longitude, latitude],
      size: { width, height },
      project: ([lon, lat]) => {
        const [x, y] = viewport.project([lon, lat]);
        return { x, y, scale: groundPx(lon, lat) / centrePx };
      },
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
  }, [active, people, longitude, latitude, zoom, pitch, bearing, width, height, frame, routineEpoch]);

  return useMemo(
    () =>
      active
        ? [
            new TextLayer<Tag>({
              id: 'person-tags',
              data: tags,
              getPosition: (t) => t.position,
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
              updateTriggers: { getPosition: frame },
            }),
          ]
        : [],
    [active, tags, opacity, frame],
  );
}
