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

// Provide historical context for time periods
export function getHistoricalContext(year: number): {
  period: string;
  description: string;
} {
  if (year <= -10000) {
    return {
      period: 'Paleolithic',
      description: 'Hunter-gatherer societies, small nomadic bands',
    };
  }
  if (year <= -3500) {
    return {
      period: 'Neolithic',
      description: 'Agricultural revolution, first permanent settlements',
    };
  }
  if (year <= -1200) {
    return {
      period: 'Bronze Age',
      description: 'Early civilizations, writing systems emerge',
    };
  }
  if (year <= -800) {
    return {
      period: 'Iron Age',
      description: 'Advanced metallurgy, expanding trade networks',
    };
  }
  if (year <= 500) {
    return {
      period: 'Classical Antiquity',
      description: 'Great empires, philosophy, and cultural flowering',
    };
  }
  if (year <= 1000) {
    return {
      period: 'Late Antiquity',
      description: 'Fall of empires, rise of new religions',
    };
  }
  if (year <= 1500) {
    return {
      period: 'Medieval Period',
      description: 'Feudalism, trade expansion, cathedral building',
    };
  }
  if (year <= 1800) {
    return {
      period: 'Early Modern',
      description: 'Age of exploration, Renaissance, scientific revolution',
    };
  }
  if (year <= 1900) {
    return {
      period: 'Industrial Age',
      description: 'Industrial revolution, urbanization, population growth',
    };
  }
  if (year <= 2000) {
    return {
      period: 'Modern Era',
      description: 'World wars, technological revolution, globalization',
    };
  }
  return {
    period: 'Contemporary',
    description: 'Digital age, climate change, global connectivity',
  };
}
