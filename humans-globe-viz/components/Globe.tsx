'use client';

import { useState, useMemo, useEffect, memo, useCallback, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { createBasemapLayer, createHumanDotsLayer, createStaticTerrainLayer } from './globe/layers';
import { WebMercatorViewport } from '@deck.gl/core';
import HumanDotsOverlay from './globe/HumanDotsOverlay';
import LegendOverlay from './globe/LegendOverlay';
import fallbackBasemapData from './globe/basemapData';
// import { scaleSequential } from 'd3-scale';
// import * as d3 from 'd3-scale';

interface GlobeProps {
  year: number;
}

interface HumanDot {
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    population: number;
    year: number;
    type: string;
  };
}

function Globe({ year }: GlobeProps) {
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 20,
    zoom: 1.5,
    pitch: 0,
    bearing: 0
  });
  
  // // Color scale for population density (disabled for now)
  // const densityColorScale = useMemo(() => 
  //   scaleSequential(d3.interpolateYlOrRd)
  //     .domain([0, 2000]),
  //   []
  // );
  
  const [humanDotsData, setHumanDotsData] = useState<HumanDot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const DOT_LIMIT = 5000000; // Load all available dots for accurate population representation
  const MAX_RENDER_DOTS = 35000; // MacBook M3 should handle this fine
  
  // Frontend data cache to prevent duplicate API requests  
  // Cache key includes year, LOD level, and LOD enabled state
  const [dataCache, setDataCache] = useState<Map<string, HumanDot[]>>(new Map());
  const [activeRequests, setActiveRequests] = useState<Set<string>>(new Set());
  
  // Simplified: no LOD transitions to prevent visual artifacts
  
  // Zoom gesture state tracking
  const [isZooming, setIsZooming] = useState(false);
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pan gesture state tracking
  const [isPanning, setIsPanning] = useState(false);
  const panTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  
  // Track previous LOD level for proper transition detection
  const [previousLODLevel, setPreviousLODLevel] = useState<number | null>(null);
  
  // Helper to get LOD level from zoom
  const getLODLevel = useCallback((zoom: number): number => {
    if (zoom < 4) return 1;      // Regional LOD (minimum)
    if (zoom < 6) return 2;      // Local LOD
    return 3;                    // Detailed LOD
  }, []);
  
  // Generate stable cache key - round bounds to prevent cache invalidation on micro-movements
  const getCacheKey = useCallback((year: number, zoom: number, bounds?: number[]): string => {
    const lodLevel = getLODLevel(zoom);
    // Round bounds to 0.5 degree precision to create stable cache regions
    // This prevents cache invalidation on every tiny pan movement
    const boundsKey = bounds ? `-${bounds.map(b => Math.round(b * 2) / 2).join(',')}` : '';
    return `${year}-lod${lodLevel}${boundsKey}`;
  }, [getLODLevel]);
  
  // LOD is now handled server-side based on zoom level
  
  // Performance analysis state
  const [renderMetrics, setRenderMetrics] = useState({
    loadTime: 0,
    processTime: 0,
    renderTime: 0,
    lastUpdate: 0
  });

  // Derived statistics
  const totalPopulation = useMemo(() => {
    return humanDotsData.reduce((sum, dot) => {
      return sum + (dot?.properties?.population ?? 0);
    }, 0);
  }, [humanDotsData]);

  // Spatial grid sampling function to reduce dot overlap
  const applySpatialGridSampling = useCallback((dots: HumanDot[], gridSize: number): HumanDot[] => {
    if (dots.length === 0) return dots;
    
    // Create a grid to distribute dots evenly
    const grid = new Map<string, HumanDot>();
    
    dots.forEach(dot => {
      const [lon, lat] = dot.geometry.coordinates;
      
      // Calculate grid cell coordinates
      const gridX = Math.floor((lon + 180) / gridSize);
      const gridY = Math.floor((lat + 90) / gridSize);
      const gridKey = `${gridX},${gridY}`;
      
      // Keep the dot with highest population in each grid cell
      const existingDot = grid.get(gridKey);
      if (!existingDot || (dot.properties?.population || 0) > (existingDot.properties?.population || 0)) {
        grid.set(gridKey, dot);
      }
    });
    
    return Array.from(grid.values());
  }, []);

  // Throttled viewport bounds calculation - only update when movement is significant
  const viewportBounds = useMemo(() => {
    if (typeof window === 'undefined') return null;
    
    const viewport = new WebMercatorViewport({
      longitude: Math.round(viewState.longitude * 4) / 4, // 0.25 degree precision
      latitude: Math.round(viewState.latitude * 4) / 4,   // 0.25 degree precision 
      zoom: Math.round(viewState.zoom * 2) / 2,           // 0.5 zoom precision
      width: window.innerWidth || 1024,
      height: window.innerHeight || 768
    });
    return viewport.getBounds();
  }, [
    // Heavily throttled to prevent constant recalculation
    Math.round(viewState.longitude * 4) / 4,
    Math.round(viewState.latitude * 4) / 4,
    Math.round(viewState.zoom * 2) / 2
  ]);

  // -----------------------------
  // Debounced data loading  
  // -----------------------------
  // We debounce the loadData call so that rapid viewState.zoom changes (e.g. while the user
  // is zoom-scrolling) do not flood the API with requests. Extended delay during zoom gestures.
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Use longer delays during interaction to prevent cache invalidation storms
    const delay = (isZooming || isPanning) ? 500 : 150;
    
    debounceTimeoutRef.current = setTimeout(() => {
      const loadData = async () => {
        const cacheKey = getCacheKey(year, viewState.zoom, viewportBounds || undefined);
        const currentLODLevel = getLODLevel(viewState.zoom);
        
        try {
          // Check if data is already cached
          if (dataCache.has(cacheKey)) {
            const cachedData = dataCache.get(cacheKey)!;
            
            // Simplified: immediate data updates without transitions
            setHumanDotsData(cachedData);
            
            setLoading(false);
            setError(null);
            
            // Update previous LOD level for next transition detection
            setPreviousLODLevel(currentLODLevel);
            return;
          }
          
          // Check if request is already in progress
          if (activeRequests.has(cacheKey)) {
            return;
          }
          
          // Mark request as active
          setActiveRequests(prev => new Set(prev).add(cacheKey));
          setLoading(true);
          const startTime = performance.now();
          
          // Calculate viewport bounds for server-side filtering
          let boundsQuery = '';
          if (viewportBounds) {
            const [minLon, minLat, maxLon, maxLat] = viewportBounds;
            boundsQuery = `&minLon=${minLon}&maxLon=${maxLon}&minLat=${minLat}&maxLat=${maxLat}`;
          }
          
          const response = await fetch(`/api/human-dots?year=${year}&limit=${DOT_LIMIT}&zoom=${viewState.zoom}${boundsQuery}`);
          if (!response.ok) {
            throw new Error('Failed to load human dots data');
          }
          
          const loadEndTime = performance.now();
          const data = await response.json();
          const features = data.features || [];
          const processEndTime = performance.now();
          
          // Cache the data
          setDataCache(prev => new Map(prev).set(cacheKey, features));
          setHumanDotsData(features);
          setError(null);
          setLoading(false);
          
          // Update previous LOD level for next transition detection
          setPreviousLODLevel(currentLODLevel);
          
          // Update performance metrics
          setRenderMetrics({
            loadTime: loadEndTime - startTime,
            processTime: processEndTime - loadEndTime,
            renderTime: 0, // Will be updated by render callback
            lastUpdate: Date.now()
          });
          
        } catch (err) {
          setError('No processed data found. Run the data processing pipeline first.');
          setHumanDotsData([]);
          setLoading(false);
        } finally {
          // Remove from active requests
          setActiveRequests(prev => {
            const newSet = new Set(prev);
            newSet.delete(cacheKey);
            return newSet;
          });
        }
      };

      loadData();
    }, delay);
  }, [year, getCacheKey, viewState.zoom, getLODLevel, isZooming, isPanning, viewportBounds]); // Added pan detection and viewport bounds

  // Use loaded data (server-side LOD selection means no client-side filtering needed)
  // Pre-process and sort data by population for efficient rendering
  const currentHumanDots = useMemo(() => {
    try {
      if (!Array.isArray(humanDotsData) || humanDotsData.length === 0) {
        return [];
      }
      
      // Validate data structure and coordinates
      const validDots = humanDotsData.filter(dot => {
        if (!dot || !dot.properties || !dot.geometry || !dot.geometry.coordinates) {
          return false;
        }
        
        const coords = dot.geometry.coordinates;
        if (!Array.isArray(coords) || coords.length !== 2) {
          return false;
        }
        
        const [lon, lat] = coords;
        if (typeof lon !== 'number' || typeof lat !== 'number' || 
            !isFinite(lon) || !isFinite(lat) ||
            Math.abs(lon) > 180 || Math.abs(lat) > 90) {
          return false;
        }
        
        return true;
      });
      
      // Pre-sort by population (descending) so we can efficiently take top N during viewport culling
      // This expensive operation only happens when data changes, not on every pan/zoom
      return validDots.sort((a, b) => (b.properties?.population || 0) - (a.properties?.population || 0));
      
    } catch (error) {
      console.error('Error processing human dots data:', error);
      return [];
    }
  }, [humanDotsData]);

  // Percentage of dots actually rendered vs total dots loaded for the year
  const samplingRate = useMemo(() => {
    if (humanDotsData.length === 0) return 100;
    return (currentHumanDots.length / humanDotsData.length) * 100;
  }, [humanDotsData, currentHumanDots]);

  // Client-side viewport culling as secondary filter after server-side filtering
  // PERFORMANCE FIX: Simple population-based limiting instead of expensive viewport culling
  const visibleHumanDots = useMemo(() => {
    if (currentHumanDots.length === 0) return [];
    
    // Skip expensive viewport culling entirely - let GPU handle what's visible
    // Just take the top N most populated settlements (data is already sorted by population)
    const result = currentHumanDots.slice(0, MAX_RENDER_DOTS);
    
    return result;
  }, [currentHumanDots]);

  // Simple basemap layer using Natural Earth land boundaries with fallback
  const [basemapData, setBasemapData] = useState<any>(null);
  const [basemapError, setBasemapError] = useState<boolean>(false);
  
  // Load basemap data on mount
  useEffect(() => {
    // Start with proper continent shapes for better fallback
    setBasemapError(true);
    setBasemapData(fallbackBasemapData);
    
    // Try to load better basemap in background
    setTimeout(() => {
      // Try multiple GeoJSON sources in order of preference
      const sources = [
        // Natural Earth landmass (no internal country boundaries)
        'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/physical/ne_50m_land.json',
        // Low-resolution fallback
        'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/110m/physical/ne_110m_land.json',
        // Additional fallbacks (may include country polygons)
        'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson',
        'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'
      ];
      
      const tryLoadSource = (sourceIndex = 0) => {
        if (sourceIndex >= sources.length) {
          return;
        }
        
        fetch(sources[sourceIndex])
          .then(response => {
            if (!response.ok) throw new Error(`Failed to load from source ${sourceIndex + 1}`);
            return response.json();
          })
          .then(data => {
            setBasemapError(false);
            setBasemapData(data);
          })
          .catch(error => {
            tryLoadSource(sourceIndex + 1);
          });
      };
      
      tryLoadSource();
    }, 1000);
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
      if (panTimeoutRef.current) {
        clearTimeout(panTimeoutRef.current);
      }
    };
  }, []);

  // Memoized layers to prevent recreation on every render (critical for performance)
  
  // Static terrain layer - never changes
  const terrainLayer = useMemo(() => createStaticTerrainLayer(), []);
  
  // Basemap layer - only changes when data or error state changes
  const basemapLayer = useMemo(() => {
    return createBasemapLayer(basemapData, basemapError);
  }, [basemapData, basemapError]);
  
  // Prepare dots for rendering with hard performance limit
  const dotsToRender = useMemo(() => {
    return visibleHumanDots.length > MAX_RENDER_DOTS 
      ? visibleHumanDots.slice(0, MAX_RENDER_DOTS)
      : visibleHumanDots;
  }, [visibleHumanDots]);
  
  // Stable LOD level for memoization - only changes at discrete boundaries
  const stableLODLevel = useMemo(() => {
    return getLODLevel(viewState.zoom);
  }, [getLODLevel, Math.floor(viewState.zoom)]); // Only change on integer zoom levels
  
  // Throttled zoom for layer dependencies - reduces recreation frequency
  const throttledZoom = useMemo(() => {
    return Math.floor(viewState.zoom * 4) / 4; // 0.25 precision throttling
  }, [viewState.zoom]);
  
  // Create stable viewState with throttled zoom for layer creation
  const layerViewState = useMemo(() => ({
    ...viewState,
    zoom: throttledZoom  // Use throttled zoom to reduce layer recreation
  }), [viewState.longitude, viewState.latitude, viewState.pitch, viewState.bearing, throttledZoom]);
  
  // Performance monitoring for zoom issues
  const lastRenderTime = useRef(performance.now());
  const renderCount = useRef(0);
  
  // Optimized layer creation - don't pass viewState since radius is pre-computed
  const humanDotsLayer = useMemo(() => {
    return createHumanDotsLayer(dotsToRender, null, year, stableLODLevel, (info: any) => {
      if (info.object) {
        console.log('Clicked dot:', info.object);
      }
    });
  }, [dotsToRender, year, stableLODLevel]); // viewState not needed with pre-computed radius
  
  // Track render performance - measure actual render cycles not useEffect timing
  useEffect(() => {
    const renderStart = performance.now();
    
    // Use requestAnimationFrame to measure post-render timing
    requestAnimationFrame(() => {
      const renderEnd = performance.now();
      const renderTime = renderEnd - renderStart;
      
      // Only log significant render delays
      if (renderTime > 16) { // > 16ms = < 60fps
        console.log(`⚡ Render: ${renderTime.toFixed(1)}ms with ${dotsToRender.length} dots at zoom ${viewState.zoom.toFixed(2)}`);
      }
    });
  });
  
  // Memoized layers array to prevent array recreation
  const layers = useMemo(() => {
    return [terrainLayer, basemapLayer, humanDotsLayer];
  }, [terrainLayer, basemapLayer, humanDotsLayer]);
  
  return (
    <div className="relative w-full h-full">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: newViewState }) => {
          const oldZoom = viewState.zoom;
          const newZoom = (newViewState as any).zoom;
          const oldLon = viewState.longitude;
          const newLon = (newViewState as any).longitude;
          const oldLat = viewState.latitude;
          const newLat = (newViewState as any).latitude;
          
          // Update view state immediately for smooth visual feedback
          setViewState(newViewState as any);
          
          // Zoom detection for debouncing data loads
          if (typeof newZoom === 'number' && Math.abs(newZoom - oldZoom) > 0.01) {
            if (!isZooming) {
              setIsZooming(true);
            }
            
            // Clear existing timeout
            if (zoomTimeoutRef.current) {
              clearTimeout(zoomTimeoutRef.current);
            }
            
            // Set timeout to detect end of zoom gesture
            zoomTimeoutRef.current = setTimeout(() => {
              setIsZooming(false);
            }, 150); // 150ms after last zoom change
          }
          
          // Pan detection for viewport-based data loading
          const panThreshold = 0.1; // Degrees - adjust based on sensitivity needed
          if ((Math.abs(newLon - oldLon) > panThreshold || Math.abs(newLat - oldLat) > panThreshold) && !isZooming) {
            if (!isPanning) {
              setIsPanning(true);
            }
            
            // Clear existing pan timeout
            if (panTimeoutRef.current) {
              clearTimeout(panTimeoutRef.current);
            }
            
            // Set timeout to detect end of pan gesture
            panTimeoutRef.current = setTimeout(() => {
              setIsPanning(false);
            }, 300); // 300ms after last pan change (longer than zoom)
          }
        }}
        controller={{
          dragPan: true,
          dragRotate: true,
          scrollZoom: true,
          touchZoom: true,
          touchRotate: true,
          keyboard: false
        }}
        layers={layers}
        getCursor={() => 'crosshair'}
        style={{ background: '#000810' }}
      >
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          background: 'radial-gradient(circle at center, #001122 0%, #000000 100%)',
          zIndex: -1
        }} />
      </DeckGL>

      {/* Data info overlay */}
      {!loading && (
        <HumanDotsOverlay
          dotCount={dotsToRender.length}
          totalPopulation={totalPopulation}
          viewState={viewState}
          samplingRate={samplingRate}
          lodEnabled={true} // Always enabled with server-side LOD
          toggleLOD={() => {}} // No-op since LOD is server-controlled
          renderMetrics={renderMetrics}
          cacheSize={dataCache.size}
          progressiveRenderStatus={
            dotsToRender.length < visibleHumanDots.length 
              ? { rendered: dotsToRender.length, total: visibleHumanDots.length }
              : undefined
          }
        />
      )}
      
      {/* Legend */}
      <LegendOverlay />
    </div>
  );
}

export default memo(Globe);