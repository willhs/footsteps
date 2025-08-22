import { RadiusStrategy } from './radiusStrategies';

// Global layer counter to ensure unique IDs
let layerCounter = 0;

export function createLayerId(
  year: number,
  strategy: RadiusStrategy,
  instanceId?: string,
): string {
  const baseId = `human-tiles-${year}-single-${strategy.getName()}`;
  return instanceId || `${baseId}-${++layerCounter}-${Date.now()}`;
}

export function patchTileByteLength(tile: unknown): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tile as any;
    const content = t && 'content' in t ? t.content : undefined;
    const hasFiniteByteLength =
      typeof content?.byteLength === 'number' &&
      Number.isFinite(content.byteLength);
    if (content && !hasFiniteByteLength) {
      let approx = 0;
      try {
        if (typeof content === 'string') {
          approx = content.length;
        } else if (
          content instanceof ArrayBuffer ||
          ArrayBuffer.isView(content)
        ) {
          // Covers ArrayBuffer and typed arrays
          approx = (content as ArrayBufferLike).byteLength || 0;
        } else {
          // Fall back to JSON size estimate for GeoJSON-like objects
          approx = JSON.stringify(content).length;
        }
      } catch {
        // Ignore estimation errors; leave undefined
      }
      if (Number.isFinite(approx) && approx > 0) {
        try {
          (content as { byteLength?: number }).byteLength = approx;
        } catch {
          // If content is not extensible, ignore
        }
      }
    }
  } catch {
    // Swallow any defensive errors here
  }
}

export function createOnTileLoadHandler(
  extra?: (tile: unknown) => void,
): (tile: unknown) => void {
  return (tile: unknown) => {
    patchTileByteLength(tile);
    if (typeof extra === 'function') extra(tile);
  };
}
