import { flags } from '@/lib/flags';
export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

/**
 * Parse optional map view state from a URL query string.
 *
 * Recognized query parameters:
 * - `lat`: latitude in degrees (default `20`)
 * - `lon`/`lng`: longitude in degrees (default `0`)
 * - `zoom`/`z`: zoom level (default `1.5`)
 *
 * Any invalid or missing parameter falls back to its default value.
 *
 * @param search The query string portion of a URL (e.g. `window.location.search`).
 * @returns Initial view state derived from the query string.
 */
export default function parseInitialViewState(search?: string): ViewState {
  try {
    const sp = flags(search);
    
    // Parse parameters only if they exist, otherwise use undefined to trigger defaults
    const latParam = sp.value('lat');
    const lonParam = sp.value('lon') || sp.value('lng');
    const zoomParam = sp.value('zoom') || sp.value('z');
    
    // Coerce to numbers, using NaN when absent so Number.isFinite checks work and types stay number
    const lat = latParam !== null ? Number(latParam) : Number.NaN;
    const lon = lonParam !== null ? Number(lonParam) : Number.NaN;
    const zoom = zoomParam !== null ? Number(zoomParam) : Number.NaN;

    return {
      longitude: Number.isFinite(lon) ? lon : 0,
      latitude: Number.isFinite(lat) ? lat : 20,
      zoom: Number.isFinite(zoom) ? zoom : 1.5,
      pitch: 0,
      bearing: 0,
    };
  } catch {
    // ignore parsing errors and fall back to defaults
  }

  return { longitude: 0, latitude: 20, zoom: 1.5, pitch: 0, bearing: 0 };
}
