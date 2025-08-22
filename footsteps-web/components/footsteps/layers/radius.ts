import { RadiusStrategy } from './radiusStrategies';

// Map population to a base display radius in meters
export function getBaseRadiusFromPopulation(population: number): number {
  if (population > 1_000_000) return 60000; // Super cities: 60km
  if (population > 100_000) return 40000; // Massive cities: 40km
  if (population > 50_000) return 25000; // Major cities: 25km
  if (population > 20_000) return 15000; // Large settlements: 15km
  if (population > 5_000) return 8000; // Medium settlements: 8km
  if (population > 1_000) return 4000; // Small settlements: 4km
  if (population > 100) return 2000; // Villages: 2km
  return 1000; // Tiny settlements: 1km
}

// Calculate radius for a feature using a strategy
export function getPointRadius(
  feature: unknown,
  zoom: number,
  strategy: RadiusStrategy,
): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pop = Number((feature as any)?.properties?.population || 0);
  const base = getBaseRadiusFromPopulation(pop);
  return strategy.calculateRadius(base, zoom);
}
