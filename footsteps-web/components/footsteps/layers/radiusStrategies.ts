// Strategy pattern for radius calculation
export interface RadiusStrategy {
  calculateRadius(baseRadius: number, zoom: number): number;
  getName(): string;
}

// Linear strategy: uses pre-computed radius as-is for geographic accuracy
class LinearRadiusStrategy implements RadiusStrategy {
  calculateRadius(baseRadius: number, _zoom: number): number {
    void _zoom; // reference to satisfy no-unused-vars when argsIgnorePattern isn't set
    return baseRadius;
  }

  getName(): string {
    return 'linear';
  }
}

// Zoom-adaptive strategy: scales radius based on zoom level for better visibility
class ZoomAdaptiveRadiusStrategy implements RadiusStrategy {
  calculateRadius(baseRadius: number, zoom: number): number {
    const multiplier = this.getZoomMultiplier(zoom);
    return baseRadius * multiplier;
  }

  private getZoomMultiplier(zoom: number): number {
    if (zoom < 3) return 6; // Global view: 6x boost for visibility
    if (zoom < 5) return 3; // Regional view: 3x boost
    // Maintain perceived density across the LOD 2 -> LOD 3 boundary
    if (zoom < 7) return 1.5; // Local view: 1.5x boost
    return 1.5; // Detailed view: keep size to avoid sudden area drop at LOD 3
  }

  getName(): string {
    return 'zoom-adaptive';
  }
}

// 3D Globe strategy: smaller, more realistic radii for sphere visibility
class Globe3DRadiusStrategy implements RadiusStrategy {
  calculateRadius(baseRadius: number, zoom: number): number {
    // Smaller scaling for 3D globe view - more realistic sizes
    const scaledRadius = Math.max(baseRadius * 0.5, 5000); // Minimum 5km

    // Balanced zoom scaling: prevent dots from being too big OR too small
    // Range: zoom -3 to 10 (13 levels total)
    if (zoom < -2) return scaledRadius * 2.5; // Very far out: large for visibility
    if (zoom < 0) return scaledRadius * 2; // Far out: large-medium
    if (zoom < 2) return scaledRadius * 1.5; // Medium distance: moderate
    if (zoom < 4) return scaledRadius * 1.2; // Getting closer: slightly larger than base
    if (zoom < 6) return scaledRadius * 1; // Close: normal size (base)
    // Maintain density for close views (LOD 3+); avoid shrinking at high zoom
    return scaledRadius * 1; // Very close & maximum zoom: keep base size
  }

  getName(): string {
    return 'globe-3d';
  }
}

// Available strategies
export const radiusStrategies = {
  linear: new LinearRadiusStrategy(),
  zoomAdaptive: new ZoomAdaptiveRadiusStrategy(),
  globe3D: new Globe3DRadiusStrategy(),
};
