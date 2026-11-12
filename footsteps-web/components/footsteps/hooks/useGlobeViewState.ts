'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import useDebouncedFlag from '@/components/footsteps/hooks/useDebouncedFlag';
import parseInitialViewState, {
  type ViewState,
} from '@/lib/parseInitialViewState';

// Thresholds centralized for easy tweaking; small changes below these values
// come from deck.gl's internal updates and shouldn't trigger interaction flags.
const ZOOM_DELTA_THRESHOLD = 0.01;
const PAN_THRESHOLD = 0.1;

type BasicViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
};

export default function useGlobeViewState() {
  // Read optional initial state from URL query on first mount for QA/debug convenience
  // Example: ?lat=28.6&lon=77.2&zoom=8
  const [viewState, setViewState] = useState<ViewState>(() =>
    parseInitialViewState(
      typeof window !== 'undefined' ? window.location.search : '',
    ),
  );
  const viewStateRef = useRef<ViewState>(viewState);

  const [isZooming, triggerZoom] = useDebouncedFlag(800);
  const [isPanning, triggerPan] = useDebouncedFlag(600);

  const isZoomingRef = useRef(isZooming);
  useEffect(() => {
    isZoomingRef.current = isZooming;
  }, [isZooming]);

  const onViewStateChange = useCallback(
    ({ viewState: newViewState }: { viewState: BasicViewState }) => {
      const zoom = Math.max(0.5, Math.min(20, newViewState.zoom));
      
      // Limit horizontal scrolling when zoomed out to prevent globe from sliding off-screen
      const maxLongitude = zoom < 2 ? Math.max(10, zoom * 90) : 180;
      
      const normalized: ViewState = {
        longitude: Math.max(-maxLongitude, Math.min(maxLongitude, newViewState.longitude)),
        latitude: Math.max(-85, Math.min(85, newViewState.latitude)),
        zoom,
        pitch: newViewState.pitch ?? 0,
        bearing: newViewState.bearing ?? 0,
      };

      const oldState = viewStateRef.current;
      viewStateRef.current = normalized;
      setViewState(normalized);

      if (
        typeof normalized.zoom === 'number' &&
        Math.abs(normalized.zoom - oldState.zoom) > ZOOM_DELTA_THRESHOLD
      ) {
        triggerZoom();
      }
      if (
        (Math.abs(normalized.longitude - oldState.longitude) > PAN_THRESHOLD ||
          Math.abs(normalized.latitude - oldState.latitude) > PAN_THRESHOLD) &&
        !isZoomingRef.current
      ) {
        triggerPan();
      }
    },
    [triggerZoom, triggerPan],
  );

  useKeyboardPan(viewStateRef, onViewStateChange);

  return { viewState, isZooming, isPanning, onViewStateChange };
}

// WASD pans the map (Shift for faster). Velocity eases in and out so the
// motion glides rather than jumping; arrow keys stay with the time slider.
const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  KeyA: [-1, 0],
  KeyS: [0, 1],
  KeyD: [1, 0],
};
const PAN_PX_PER_S = 650;
const EASE_S = 0.12;
/** A quick tap still counts as this long a hold, so it gives a visible nudge. */
const MIN_HOLD_MS = 180;

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function useKeyboardPan(
  viewStateRef: React.MutableRefObject<ViewState>,
  onViewStateChange: (p: { viewState: BasicViewState }) => void,
) {
  const changeRef = useRef(onViewStateChange);
  changeRef.current = onViewStateChange;
  useEffect(() => {
    const held = new Set<string>();
    const pressedAt = new Map<string, number>();
    let fast = false;
    let vx = 0;
    let vy = 0;
    let frame = 0;
    let last = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let tx = 0;
      let ty = 0;
      held.forEach((code) => {
        tx += PAN_KEYS[code][0];
        ty += PAN_KEYS[code][1];
      });
      const len = Math.hypot(tx, ty) || 1;
      const speed = PAN_PX_PER_S * (fast ? 2.5 : 1);
      const k = 1 - Math.exp(-dt / EASE_S);
      vx += ((tx / len) * speed - vx) * k;
      vy += ((ty / len) * speed - vy) * k;
      if (held.size === 0 && Math.hypot(vx, vy) < 5) {
        vx = vy = 0;
        frame = 0;
        return;
      }
      const v = viewStateRef.current;
      // Web Mercator: degrees per screen pixel at this zoom (512 px world tile).
      const degPerPx = 360 / (512 * 2 ** v.zoom);
      const cosLat = Math.cos((v.latitude * Math.PI) / 180);
      changeRef.current({
        viewState: {
          ...v,
          longitude: v.longitude + vx * dt * degPerPx,
          latitude: v.latitude - vy * dt * degPerPx * cosLat,
        },
      });
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const down = (e: KeyboardEvent) => {
      fast = e.shiftKey;
      if (!(e.code in PAN_KEYS) || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      if (!e.repeat) pressedAt.set(e.code, performance.now());
      held.add(e.code);
      start();
    };
    const up = (e: KeyboardEvent) => {
      fast = e.shiftKey;
      const code = e.code;
      const at = pressedAt.get(code) ?? 0;
      const left = MIN_HOLD_MS - (performance.now() - at);
      // Only release if the key wasn't pressed again in the meantime.
      if (left > 0) setTimeout(() => pressedAt.get(code) === at && held.delete(code), left);
      else held.delete(code);
    };
    const clear = () => held.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      cancelAnimationFrame(frame);
    };
  }, [viewStateRef]);
}
