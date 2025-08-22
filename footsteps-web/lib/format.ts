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

// Translate population counts into a qualitative scale.
// Used by overlays and will support future charts.
export function getPopulationScale(population: number): {
  scale: string;
  icon: string;
  significance: string;
} {
  if (population > 1_000_000) {
    return {
      scale: 'Megacity',
      icon: '🏙️',
      significance: 'Major urban center',
    };
  }
  if (population > 500_000) {
    return { scale: 'Metropolis', icon: '🌆', significance: 'Large city' };
  }
  if (population > 100_000) {
    return { scale: 'City', icon: '🏘️', significance: 'Urban settlement' };
  }
  if (population > 50_000) {
    return { scale: 'Large Town', icon: '🏘️', significance: 'Regional center' };
  }
  if (population > 10_000) {
    return { scale: 'Town', icon: '🏘️', significance: 'Local hub' };
  }
  if (population > 2_000) {
    return { scale: 'Village', icon: '🏠', significance: 'Rural community' };
  }
  if (population > 500) {
    return { scale: 'Hamlet', icon: '🏡', significance: 'Small settlement' };
  }
  return { scale: 'Outpost', icon: '⛺', significance: 'Remote presence' };
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
