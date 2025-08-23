// Color scheme definitions for human representation
export const COLOR_SCHEMES = {
  white: {
    name: 'White',
    colors: {
      highest: [255, 255, 255, 240] as [number, number, number, number],
      high: [240, 240, 240, 220] as [number, number, number, number],
      medium: [220, 220, 220, 200] as [number, number, number, number],
      low: [200, 200, 200, 180] as [number, number, number, number],
    },
  },
  cyan: {
    name: 'Cyan',
    colors: {
      highest: [0, 255, 255, 240] as [number, number, number, number],
      high: [0, 220, 255, 220] as [number, number, number, number],
      medium: [0, 180, 255, 200] as [number, number, number, number], 
      low: [100, 200, 255, 180] as [number, number, number, number],
    },
  },
  violet: {
    name: 'Violet',
    colors: {
      highest: [138, 43, 226, 240] as [number, number, number, number],
      high: [148, 70, 230, 220] as [number, number, number, number],
      medium: [160, 100, 235, 200] as [number, number, number, number],
      low: [180, 140, 240, 180] as [number, number, number, number],
    },
  },
  black: {
    name: 'Black',
    colors: {
      highest: [0, 0, 0, 240] as [number, number, number, number],
      high: [40, 40, 40, 220] as [number, number, number, number],
      medium: [80, 80, 80, 200] as [number, number, number, number],
      low: [120, 120, 120, 180] as [number, number, number, number],
    },
  },
} as const;

export type ColorScheme = keyof typeof COLOR_SCHEMES;

// Determine fill color based on population, color scheme, and optional debug tint
export function getFillColor(
  feature: unknown,
  debugTint?: [number, number, number],
  colorScheme: ColorScheme = 'white',
): [number, number, number, number] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const population = Number((feature as any)?.properties?.population || 0);
    const scheme = COLOR_SCHEMES[colorScheme];
    
    // Use fixed alpha; rely on layer.opacity for crossfades to avoid double-dimming
    let base: [number, number, number, number];
    if (population > 20000) base = scheme.colors.highest;
    else if (population > 5000) base = scheme.colors.high;
    else if (population > 1000) base = scheme.colors.medium;
    else base = scheme.colors.low;
    
    // Apply optional debug tint to help visualize crossfade layers in dev
    if (debugTint && Array.isArray(debugTint)) {
      const clamp = (v: number) => Math.max(0, Math.min(255, v));
      const r = clamp(base[0] + debugTint[0]);
      const g = clamp(base[1] + debugTint[1]);
      const b = clamp(base[2] + debugTint[2]);
      return [r, g, b, base[3]] as [number, number, number, number];
    }
    return base;
  } catch {
    const fallback = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.white;
    return fallback.colors.low;
  }
}
