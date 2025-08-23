// Color scheme definitions for human representation
export const COLOR_SCHEMES = {
  orange: {
    name: 'Orange (Default)',
    colors: {
      highest: [255, 100, 0, 240] as [number, number, number, number],
      high: [255, 140, 0, 220] as [number, number, number, number], 
      medium: [255, 180, 0, 200] as [number, number, number, number],
      low: [255, 200, 100, 180] as [number, number, number, number],
    },
  },
  cyan: {
    name: 'Cyan (High Contrast)',
    colors: {
      highest: [0, 255, 255, 240] as [number, number, number, number],
      high: [0, 220, 255, 220] as [number, number, number, number],
      medium: [0, 180, 255, 200] as [number, number, number, number], 
      low: [100, 200, 255, 180] as [number, number, number, number],
    },
  },
  magenta: {
    name: 'Magenta (Vivid)',
    colors: {
      highest: [255, 0, 128, 240] as [number, number, number, number],
      high: [255, 50, 150, 220] as [number, number, number, number],
      medium: [255, 100, 180, 200] as [number, number, number, number],
      low: [255, 150, 200, 180] as [number, number, number, number],
    },
  },
  white: {
    name: 'White (Classic)',
    colors: {
      highest: [255, 255, 255, 240] as [number, number, number, number],
      high: [240, 240, 240, 220] as [number, number, number, number],
      medium: [220, 220, 220, 200] as [number, number, number, number],
      low: [200, 200, 200, 180] as [number, number, number, number],
    },
  },
  red: {
    name: 'Red (Bold)',
    colors: {
      highest: [255, 50, 50, 240] as [number, number, number, number],
      high: [255, 80, 80, 220] as [number, number, number, number],
      medium: [255, 120, 120, 200] as [number, number, number, number],
      low: [255, 160, 160, 180] as [number, number, number, number],
    },
  },
} as const;

export type ColorScheme = keyof typeof COLOR_SCHEMES;

// Determine fill color based on population, color scheme, and optional debug tint
export function getFillColor(
  feature: unknown,
  debugTint?: [number, number, number],
  colorScheme: ColorScheme = 'orange',
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
    const fallback = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.orange;
    return fallback.colors.low;
  }
}
