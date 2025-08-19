import { createHumanTilesLayer, radiusStrategies } from './index';
import { NEW_YEAR_FADE_MS, YEAR_FADE_MS } from '../hooks/useYearCrossfade';

interface PickingInfo {
  object?: {
    properties?: { population?: number };
    geometry?: { coordinates?: [number, number] };
  };
  x?: number;
  y?: number;
}

function buildTooltipData(info: PickingInfo, year: number) {
  if (info?.object) {
    const f = info.object as {
      properties?: { population?: number };
      geometry?: { coordinates?: [number, number] };
    };
    const population = f?.properties?.population || 0;
    const coordinates = (f?.geometry?.coordinates as [number, number]) || [
      0, 0,
    ];
    const clickPosition = { x: info.x || 0, y: info.y || 0 };
    return { population, coordinates, year, clickPosition };
  }
  return null;
}

function featuresFromTile(
  tile: unknown,
): Array<{ properties?: { population?: number } }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tile as any;
    const tileCoords = t?.index
      ? `${t.index.z}/${t.index.x}/${t.index.y}`
      : 'unknown';
    void tileCoords; // quiet unused in production
    const possibleFeatures = [
      t?.data?.features,
      t?.content?.features,
      t?.data,
      t?.content,
      t?.data?.layers?.['humans']?.features,
      t?.content?.layers?.['humans']?.features,
      Array.isArray(t?.data) ? t.data : null,
      Array.isArray(t?.content) ? t.content : null,
    ].filter(Boolean);

    for (let i = 0; i < possibleFeatures.length; i++) {
      const candidate = possibleFeatures[i];
      if (Array.isArray(candidate) && candidate.length > 0) {
        return candidate;
      }
    }
    return [];
  } catch (error) {
    console.error(`[FEATURE-EXTRACT-ERROR]:`, error);
    return [];
  }
}

interface HumanLayerFactoryOptions {
  is3DMode: boolean;
  layerViewState: { zoom?: number } | null;
  isZooming: boolean;
  isPanning: boolean;
  isYearCrossfading: boolean;
  setTileLoading: (loading: boolean) => void;
  setFeatureCount: (count: number) => void;
  setTotalPopulation: (total: number) => void;
  setTooltipData: (
    data: {
      population: number;
      coordinates: [number, number];
      year: number;
      settlementType?: string;
      clickPosition: { x: number; y: number };
    } | null,
  ) => void;
}

export function createHumanLayerFactory(options: HumanLayerFactoryOptions) {
  const {
    is3DMode,
    layerViewState,
    isZooming,
    isPanning,
    isYearCrossfading,
    setTileLoading,
    setFeatureCount,
    setTotalPopulation,
    setTooltipData,
  } = options;

  return function createHumanLayerForYear(
    targetYear: number,
    lodLevel: number,
    layerOpacity: number,
    instanceId: string,
    isNewYearLayer: boolean,
  ) {
    const radiusStrategy = is3DMode
      ? radiusStrategies.globe3D
      : radiusStrategies.zoomAdaptive;

    const fadeMs = isNewYearLayer ? NEW_YEAR_FADE_MS : YEAR_FADE_MS;

    return createHumanTilesLayer(
      targetYear,
      lodLevel,
      layerViewState,
      radiusStrategy,
      (raw: unknown) => {
        const info = raw as PickingInfo;
        const data = buildTooltipData(info, targetYear);
        if (data) setTooltipData(data);
      },
      (raw: unknown) => {
        const info = raw as PickingInfo;
        setTooltipData(buildTooltipData(info, targetYear));
      },
      {
        onTileLoad: (_tile: unknown) => {
          if (isNewYearLayer) {
            setTileLoading(false);
          }
        },
        onViewportLoad: (rawTiles: unknown[]) => {
          try {
            if (isNewYearLayer) {
              const tiles = rawTiles as Array<unknown>;
              let count = 0;
              let pop = 0;
              for (const t of tiles) {
                const feats = featuresFromTile(t);
                count += feats.length;
                for (const g of feats)
                  pop += Number(g?.properties?.population) || 0;
              }
              setFeatureCount(count);
              setTotalPopulation(pop);
              setTileLoading(false);
            }
          } catch (error) {
            console.error(
              `[VIEWPORT-LOAD-ERROR] Year: ${targetYear}, LOD: ${lodLevel}:`,
              error,
            );
            setTileLoading(false);
          }
        },
        onTileError: (error: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errorInfo = error as any;
          const tileCoords = errorInfo?.tile?.index || errorInfo?.index || {};
          const url = errorInfo?.tile?.url || errorInfo?.url || 'unknown';
          const status =
            errorInfo?.response?.status || errorInfo?.status || 'unknown';
          console.error(`[TILE-ERROR] Failed to load tile:`, {
            year: targetYear,
            lodLevel,
            coords: `${tileCoords.z}/${tileCoords.x}/${tileCoords.y}`,
            url,
            status,
            error: errorInfo?.message || errorInfo?.error || errorInfo,
          });
          setTileLoading(false);
        },
        tileOptions: {
          fadeMs: fadeMs,
          debounceTime: isZooming || isPanning ? 80 : 20,
          useBinary: false,
        },
        debugTint:
          process.env.NODE_ENV !== 'production' && isYearCrossfading
            ? isNewYearLayer
              ? [0, 30, 80]
              : [80, 0, 0]
            : undefined,
      },
      layerOpacity,
      instanceId,
      is3DMode,
    );
  };
}

export { buildTooltipData };
