export function getTooltipPosition(
  clickPosition: { x: number; y: number },
  windowSize?: { innerWidth: number; innerHeight: number },
): { left: number; top: number } {
  const tooltipWidth = 260;
  const tooltipHeight = 100;
  const padding = 16;

  let left = clickPosition.x + 16; // Offset from cursor
  let top = clickPosition.y - tooltipHeight - 16; // Above cursor

  const winWidth =
    windowSize?.innerWidth ??
    (typeof window !== 'undefined' ? window.innerWidth : undefined);
  const winHeight =
    windowSize?.innerHeight ??
    (typeof window !== 'undefined' ? window.innerHeight : undefined);

  if (winWidth !== undefined && winHeight !== undefined) {
    if (left + tooltipWidth > winWidth - padding) {
      left = clickPosition.x - tooltipWidth - 16; // Show on left
    }

    if (top < padding) {
      top = clickPosition.y + 16; // Show below cursor
    }

    if (top + tooltipHeight > winHeight - padding) {
      top = winHeight - tooltipHeight - padding;
    }

    if (left < padding) {
      left = padding;
    }
  }

  return { left, top };
}
export function formatCoordinates(coords: [number, number]): string {
  const [lon, lat] = coords;
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
}
