import { RadiusStrategy } from './radiusStrategies';

// Map population to a base display radius in meters
export function getBaseRadiusFromPopulation(population: number): number {
  // Step levels (population threshold -> radius meters)
  const steps: Array<{ threshold: number; radius: number }> = [
    { threshold: 100, radius: 2000 },
    { threshold: 1000, radius: 4000 },
    { threshold: 5000, radius: 8000 },
    { threshold: 20000, radius: 15000 },
    { threshold: 50000, radius: 25000 },
    { threshold: 100000, radius: 40000 },
    { threshold: 1000000, radius: 60000 },
  ];

  // Below first threshold: base minimum
  const baseMin = 1000;

  // Soft band around thresholds to avoid hard pops when a population crosses
  // a boundary between years. Values outside the band remain exact step levels.
  // Example: with 0.15, 50k has a smoothing band of [42.5k .. 57.5k].
  const bandRatio = 0.15;

  // GLSL-like smoothstep for a nice S-curve between two edges
  const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };

  // Walk thresholds from low to high and apply soft interpolation near edges
  let prevRadius = baseMin;
  for (let i = 0; i < steps.length; i++) {
    const { threshold, radius } = steps[i];
    const low = threshold * (1 - bandRatio);
    const high = threshold * (1 + bandRatio);

    if (population < low) {
      // Firmly below the smoothing band: hold previous level
      return prevRadius;
    }
    if (population <= high) {
      // Inside the band: smoothly interpolate to the next level
      const t = smoothstep(low, high, population);
      return prevRadius + (radius - prevRadius) * t;
    }
    // Firmly above this threshold: advance to this level and continue
    prevRadius = radius;
  }

  // Above the highest threshold
  return prevRadius;
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
