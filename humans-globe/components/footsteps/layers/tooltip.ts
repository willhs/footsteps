export interface PickingInfo {
  object?: {
    properties?: { population?: number };
    geometry?: { coordinates?: [number, number] };
  };
  x?: number;
  y?: number;
}

export function buildTooltipData(info: PickingInfo, year: number) {
  if (info?.object) {
    const f = info.object as {
      properties?: { population?: number };
      geometry?: { coordinates?: [number, number] };
    };
    const population = f?.properties?.population || 0;
    const coordinates = (f?.geometry?.coordinates as [number, number]) || [
      0, 0,
    ];
    const clickPosition = { x: info.x || 0, y: info.y || 0 };
    return { population, coordinates, year, clickPosition };
  }
  return null;
}
