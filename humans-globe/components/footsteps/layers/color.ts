// Determine fill color based on population and optional debug tint
export function getFillColor(
  feature: unknown,
  debugTint?: [number, number, number],
): [number, number, number, number] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const population = Number((feature as any)?.properties?.population || 0);
    // Use fixed alpha; rely on layer.opacity for crossfades to avoid double-dimming
    let base: [number, number, number, number];
    if (population > 20000) base = [255, 100, 0, 240];
    else if (population > 5000) base = [255, 140, 0, 220];
    else if (population > 1000) base = [255, 180, 0, 200];
    else base = [255, 200, 100, 180];
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
    return [255, 200, 100, 180];
  }
}
