import { CompositeLayer, Layer } from '@deck.gl/core';
import { MVTLayer } from '@deck.gl/geo-layers';
import { getTileUrlPattern } from '@/lib/tilesConfig';
import { radiusStrategies, type RadiusStrategy } from './radiusStrategies';
import { getPointRadius } from './radius';
import { createOnTileLoadHandler } from './tileCache';
import { getFillColor, type ColorScheme } from './color';

interface InterpolationLayerProps {
  id: string;
  fromYear: number;
  toYear: number;
  // Interpolation parameter: 0 = fromYear, 1 = toYear
  t: number;
  viewState: { zoom?: number } | null;
  radiusStrategy?: RadiusStrategy;
  colorScheme?: ColorScheme;
  opacity?: number;
  onTileLoad?: (tile: unknown) => void;
  onClick?: (info: unknown) => void;
  onHover?: (info: unknown) => void;
}

/**
 * Layer that smoothly interpolates between two years of population data.
 * Uses two MVT layers and blends their opacity and positions for smooth transitions.
 */
export class InterpolationLayer extends CompositeLayer<InterpolationLayerProps> {
  static layerName = 'InterpolationLayer';

  renderLayers(): Layer[] {
    const {
      id,
      fromYear,
      toYear,
      t,
      viewState,
      radiusStrategy = radiusStrategies.zoomAdaptive,
      colorScheme = 'cyan',
      opacity = 1.0,
      onTileLoad,
      onClick,
      onHover,
    } = this.props;

    const currentZoom = viewState?.zoom || 1;
    
    // Smooth opacity transition
    const fromOpacity = (1 - t) * opacity;
    const toOpacity = t * opacity;
    
    const layers: Layer[] = [];

    // From year layer (fading out)
    if (fromOpacity > 0.01) {
      layers.push(
        new MVTLayer({
          id: `${id}-from-${fromYear}`,
          data: getTileUrlPattern(fromYear),
          minZoom: 0,
          maxZoom: 12,
          refinementStrategy: 'best-available',
          maxCacheSize: 300,
          maxCacheByteSize: 64 * 1024 * 1024,
          debounceTime: 0,
          maxRequests: 6,
          autoHighlight: false,
          binary: true,
          loadOptions: {
            mvt: {
              coordinates: 'wgs84',
              layers: ['humans'],
            },
          },
          pickable: true,
          onClick: onClick || (() => {}),
          onHover: onHover || (() => {}),
          onTileLoad: createOnTileLoadHandler(onTileLoad),
          onViewportLoad: () => {},
          onTileError: () => {},
          pointRadiusUnits: 'meters',
          getPointRadius: (f: unknown) => {
            try {
              // Scale radius during interpolation for smooth size transitions
              const baseRadius = getPointRadius(f, currentZoom, radiusStrategy);
              return baseRadius * (1 + t * 0.1); // Slight size increase during transition
            } catch (error) {
              console.error(`[INTERPOLATION-RADIUS-ERROR]:`, error);
              return 2000;
            }
          },
          getFillColor: (f: unknown) => {
            const color = getFillColor(f, undefined, colorScheme);
            // Slightly tint the from-year dots to show they're transitioning
            return [color[0], color[1], color[2], Math.floor(255 * fromOpacity)];
          },
          updateTriggers: {
            getPointRadius: [fromYear, currentZoom, radiusStrategy.getName(), t],
            getFillColor: [fromYear, colorScheme, fromOpacity],
          },
          opacity: fromOpacity,
          parameters: {
            depthTest: false,
            depthMask: false,
            blend: true,
            blendFunc: [770, 771],
          },
          transitions: {
            opacity: { duration: 0 }, // No automatic transitions, we control it manually
          },
        })
      );
    }

    // To year layer (fading in)
    if (toOpacity > 0.01) {
      layers.push(
        new MVTLayer({
          id: `${id}-to-${toYear}`,
          data: getTileUrlPattern(toYear),
          minZoom: 0,
          maxZoom: 12,
          refinementStrategy: 'best-available',
          maxCacheSize: 300,
          maxCacheByteSize: 64 * 1024 * 1024,
          debounceTime: 0,
          maxRequests: 6,
          autoHighlight: false,
          binary: true,
          loadOptions: {
            mvt: {
              coordinates: 'wgs84',
              layers: ['humans'],
            },
          },
          pickable: true,
          onClick: onClick || (() => {}),
          onHover: onHover || (() => {}),
          onTileLoad: createOnTileLoadHandler(onTileLoad),
          onViewportLoad: () => {},
          onTileError: () => {},
          pointRadiusUnits: 'meters',
          getPointRadius: (f: unknown) => {
            try {
              const baseRadius = getPointRadius(f, currentZoom, radiusStrategy);
              return baseRadius * (1 - t * 0.1 + t * 0.1); // Smooth size transition
            } catch (error) {
              console.error(`[INTERPOLATION-RADIUS-ERROR]:`, error);
              return 2000;
            }
          },
          getFillColor: (f: unknown) => {
            const color = getFillColor(f, undefined, colorScheme);
            // Slightly different tint for to-year dots
            return [
              Math.min(255, color[0] + t * 20), 
              color[1], 
              color[2], 
              Math.floor(255 * toOpacity)
            ];
          },
          updateTriggers: {
            getPointRadius: [toYear, currentZoom, radiusStrategy.getName(), t],
            getFillColor: [toYear, colorScheme, toOpacity],
          },
          opacity: toOpacity,
          parameters: {
            depthTest: false,
            depthMask: false,
            blend: true,
            blendFunc: [770, 771],
          },
          transitions: {
            opacity: { duration: 0 }, // No automatic transitions
          },
        })
      );
    }

    return layers;
  }
}