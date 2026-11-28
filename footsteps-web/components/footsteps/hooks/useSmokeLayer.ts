import { useMemo, useSyncExternalStore } from 'react';
import { drawnGroundZ, groundVersion, subscribeGround, wetAt } from '@/lib/groundHeights';
import { lazy, useLazy } from '@/lib/lazyModule';
import { smokeCloseFade, smokeOpacity, type Hearth } from '@/lib/hearths';

// `?smoke=1` only: the layer's code loads on first use (docs/ops/first-load.md).
const SMOKE_MODULE = lazy(() => import('../layers/SmokeLayer'));

/** Smoke and firelight where the people (footprints) are drawn: on the close-up ground's drawn height in the close-up (`onGround`,
 * lib/groundHeights.ts drawnGroundZ), at z = 0 on the flat map (lib/hearths.ts). Before 2026-11-28 they were at z = 0 in the close-up too. They are top-level layers drawn
 * after the ground tiles (a tile layer inside one tile would be painted over by the next tile's ground). The close-up ground is raised above sea level by its height
 * and the camera looks at sea level, so a hearth standing on that ground would be hundreds of pixels from its people on high ground at close zoom. Hearths over
 * water (the close-up's loaded tiles say so, lib/groundHeights.ts) are left out. The motion is on the GPU: the data is built when the hearths in view
 * (or the loaded ground) change, and a zoom changes only the opacity. Firelight shows only where the sun clock (the time-of-day dial) has the sun down. */
export default function useSmokeLayer({ enabled, hearths, zoom, seaLevel, onGround = false }: { enabled: boolean; hearths: readonly Hearth[]; zoom: number; seaLevel: number; onGround?: boolean }) {
  const layers = useLazy(SMOKE_MODULE, enabled);
  const ground = useSyncExternalStore(subscribeGround, groundVersion, groundVersion);
  const props = useMemo(() => {
    if (!layers || !enabled || !hearths.length) return null;
    const standing = hearths.filter((h) => !wetAt(h.lon, h.lat, seaLevel)).map((h) => ({ ...h, z: onGround ? drawnGroundZ(h.lon, h.lat) : 0 }));
    return { smoke: layers.smokeProps(standing, 1), light: layers.firelightProps(standing, 1) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, enabled, hearths, seaLevel, ground, onGround]);
  const opacity = Math.round(smokeOpacity(zoom) * 40) / 40;
  const smokeOpacityNow = Math.round(opacity * smokeCloseFade(zoom) * 40) / 40;
  return useMemo(
    () =>
      layers && props && opacity > 0
        ? [
            new layers.FirelightLayer({ id: 'firelight', ...props.light, opacity }),
            new layers.SmokeLayer({ id: 'smoke', ...props.smoke, opacity: smokeOpacityNow }),
          ]
        : [],
    [layers, props, opacity, smokeOpacityNow],
  );
}
