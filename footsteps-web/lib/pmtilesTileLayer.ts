import { TileLayer } from '@deck.gl/geo-layers';
import { GeoJsonLayer } from '@deck.gl/layers';
import { PMTiles, FetchSource, SharedPromiseCache } from 'pmtiles';
import { parse } from '@loaders.gl/core';
import { MVTLoader } from '@loaders.gl/mvt';

// Simple PMTiles instance cache - avoid recreating FetchSource
const pmtilesCache = new Map<string, PMTiles>();
// Share header/dir requests across instances and HMR
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g: any = (globalThis as unknown) as any;
const sharedPMCache: SharedPromiseCache = g.__pmtilesCache || new SharedPromiseCache(2000);
g.__pmtilesCache = sharedPMCache;

interface PMTilesTileLayerProps {
  id: string;
  pmtilesUrl: string;
  mvtLayers?: string[];
  getPointRadius?: (feature: any) => number;
  getFillColor?: (feature: any) => [number, number, number, number];
  pointRadiusUnits?: 'meters' | 'pixels';
  opacity?: number;
  pickable?: boolean;
  onClick?: (info: any) => void;
  onHover?: (info: any) => void;
  updateTriggers?: any;
  transitions?: any;
  parameters?: any;
  // Common TileLayer props we forward
  minZoom?: number;
  maxZoom?: number;
  extent?: [number, number, number, number];
  refinementStrategy?: 'best-available' | 'no-overlap' | 'never' | ((...args: any[]) => any);
  maxCacheSize?: number;
  maxCacheByteSize?: number;
  debounceTime?: number;
  maxRequests?: number;
}

function getPMTiles(url: string): PMTiles {
  const existing = pmtilesCache.get(url);
  if (existing) return existing;
  
  // PMTiles + FetchSource handles HTTP caching automatically; SharedPromiseCache coalesces
  const pmt = new PMTiles(new FetchSource(url), sharedPMCache);
  pmtilesCache.set(url, pmt);
  return pmt;
}

export class PMTilesTileLayer extends TileLayer<any, PMTilesTileLayerProps> {
  static layerName = 'PMTilesTileLayer';
  
  getTileData = async (tile: any) => {
    const { x, y, z } = tile.index;
    const pmt = getPMTiles(this.props.pmtilesUrl);
    
    try {
      // PMTiles handles HTTP caching of range requests automatically
      const res = await pmt.getZxy(z, x, y);
      if (!res || !res.data) return null;
      
      // Parse MVT data to GeoJSON features  
      const parsed = await parse(res.data, MVTLoader, {
        mvt: {
          coordinates: 'wgs84',
          tileIndex: { x, y, z },
          layers: this.props.mvtLayers || ['humans'],
          shape: 'geojson'
        }
      });
      
      // Extract features from parsed MVT data
      const layerName = this.props.mvtLayers?.[0] || 'humans';
      return (parsed as any)?.[layerName]?.features || [];
    } catch (err) {
      console.warn('[PMTilesTileLayer] Failed to load tile:', { z, x, y, error: err });
      return null;
    }
  };

  renderSubLayers(props: any) {
    const { data } = props.tile;
    if (!data || data.length === 0) return null;

    return new GeoJsonLayer({
      ...this.getSubLayerProps(props),
      id: `${this.props.id}-geojson-${props.tile.index.x}-${props.tile.index.y}-${props.tile.index.z}`,
      data,
      pointType: 'circle',
      getPointRadius: this.props.getPointRadius,
      getFillColor: this.props.getFillColor,
      pointRadiusUnits: this.props.pointRadiusUnits || 'meters',
      opacity: this.props.opacity,
      pickable: this.props.pickable,
      onClick: this.props.onClick,
      onHover: this.props.onHover,
      updateTriggers: this.props.updateTriggers,
      transitions: this.props.transitions,
      parameters: this.props.parameters,
    });
  }
}
