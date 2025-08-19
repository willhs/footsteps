// Shared formatting utilities for the Humans Globe frontend

// Format population counts into human‑readable strings
export function formatPopulation(pop: number): string {
  if (pop >= 1_000_000_000)
    return `${Math.round(pop / 1_000_000_000).toLocaleString()}B people`;
  if (pop >= 1_000_000)
    return `${Math.round(pop / 1_000_000).toLocaleString()}M people`;
  if (pop >= 1_000)
    return `${Math.round(pop / 1_000).toLocaleString()}K people`;
  return `${Math.round(pop).toLocaleString()} people`;
}

// Describe the level of detail based on zoom level
export function getDetailContext(zoom: number): string {
  if (zoom < 4) return 'Regional clusters • Showing major population centers';
  if (zoom < 5) return 'Subregional detail • Country & province scale';
  if (zoom < 6) return 'Local communities • County & district scale';
  return 'Detailed settlements • Full resolution data';
}

// Format historical years for display
export function formatYear(year: number): string {
  if (year < 0) {
    return `${Math.abs(year)} BC`;
  }
  if (year === 0) {
    return '1 CE';
  }
  return `${year} CE`;
}
