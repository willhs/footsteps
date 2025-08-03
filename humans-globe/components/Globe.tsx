'use client';

import { useState, useMemo, useEffect, memo, useCallback, useRef } from 'react';
import { getViewMode, setViewMode } from '../lib/viewModeStore';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { createBasemapLayer, createHumanDotsLayer, createStaticTerrainLayer, createEarthSphereLayer, radiusStrategies } from './globe/layers';
import { WebMercatorViewport } from '@deck.gl/core';
import HumanDotsOverlay from './globe/HumanDotsOverlay';
import LegendOverlay from './globe/LegendOverlay';
import GlobeView3D from './GlobeView3D';
import MapView2D from './MapView2D';
import useHumanDotsData, { MAX_RENDER_DOTS } from './globe/useHumanDotsData';
// import { scaleSequential } from 'd3-scale';
// import * as d3 from 'd3-scale';

interface GlobeProps {
  year: number;
}

function Globe({ year }: GlobeProps) {
  // View mode toggle state with cookie persistence for SSR compatibility
  const [is3DMode, setIs3DMode] = useState(() => getViewMode());
  
  // View states for different modes
  const [viewState2D, setViewState2D] = useState({
    longitude: 0,
    latitude: 20,
    zoom: 1.5,
    pitch: 0,
    bearing: 0
  });
  
  const [viewState3D, setViewState3D] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 2.5,
    minZoom: -3,
    maxZoom: 10,
    target: [0, 0, 0], // Center of the Earth
    rotationX: 0,
    rotationOrbit: 0
  });
  
  // Current view state based on mode
  const viewState = is3DMode ? viewState3D : viewState2D;
  
  // Save view mode preference to cookie
  useEffect(() => {
    setViewMode(is3DMode);
  }, [is3DMode]);
  
  // // Color scale for population density (disabled for now)
  // const densityColorScale = useMemo(() => 
  //   scaleSequential(d3.interpolateYlOrRd)
  //     .domain([0, 2000]),
  //   []
  // );
  
  
  // Zoom gesture state tracking
  const [isZooming, setIsZooming] = useState(false);
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pan gesture state tracking
  const [isPanning, setIsPanning] = useState(false);
  const panTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  
  // Helper to get LOD level from zoom (still needed for other calculations)
  const getLODLevel = useCallback((zoom: number): number => {
    if (zoom < 4) return 1;      // Regional LOD (minimum)
    if (zoom < 6) return 2;      // Local LOD
    return 3;                    // Detailed LOD
  }, []);

  // Throttled viewport bounds calculation - only update when movement is significant
  // Skip bounds calculation for 3D mode since OrbitView handles visibility differently
  const viewportBounds = useMemo(() => {
    if (is3DMode || typeof window === 'undefined') return null;
    
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
    Math.round(viewState.zoom * 2) / 2,
    is3DMode
  ]);

  const {
    humanDotsData,
    loading,
    dataCache,
    visibleHumanDots,
    samplingRate,
    renderMetrics
  } = useHumanDotsData(year, viewState.zoom, viewportBounds);

  const totalPopulation = useMemo(() => {
    return humanDotsData.reduce((sum, dot) => {
      return sum + (dot?.properties?.population ?? 0);
    }, 0);
  }, [humanDotsData]);

  // Simple basemap layer using Natural Earth land boundaries with fallback
  const [basemapData, setBasemapData] = useState<any>(null);
  const [basemapError, setBasemapError] = useState<boolean>(false);
  
  // Load basemap data on mount
  useEffect(() => {
    // Start with proper continent shapes for better fallback
    setBasemapError(true);
    setBasemapData({
      type: 'FeatureCollection',
      features: [
        // North America (simplified but accurate outline)
        { 
          type: 'Feature', 
          properties: { name: 'North America' }, 
          geometry: { 
            type: 'Polygon', 
            coordinates: [[
              [-168, 65], [-160, 70], [-140, 70], [-130, 69], [-110, 71], [-95, 69], [-85, 68], 
              [-75, 62], [-68, 57], [-60, 60], [-55, 70], [-75, 74], [-100, 75], [-130, 75], 
              [-150, 73], [-168, 65]
            ]]
          }
        },
        // USA (contiguous)
        {
          type: 'Feature',
          properties: { name: 'United States' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-125, 49], [-117, 32], [-109, 31], [-104, 29], [-94, 29], [-84, 30], [-80, 25], 
              [-75, 35], [-70, 42], [-67, 45], [-74, 45], [-83, 46], [-95, 49], [-111, 49], [-125, 49]
            ]]
          }
        },
        // South America
        { 
          type: 'Feature', 
          properties: { name: 'South America' }, 
          geometry: { 
            type: 'Polygon', 
            coordinates: [[
              [-82, 12], [-70, 12], [-60, 5], [-50, -5], [-45, -15], [-40, -25], [-45, -35], 
              [-50, -45], [-65, -55], [-70, -50], [-75, -40], [-80, -20], [-85, 0], [-82, 12]
            ]]
          }
        },
        // Europe
        { 
          type: 'Feature', 
          properties: { name: 'Europe' }, 
          geometry: { 
            type: 'Polygon', 
            coordinates: [[
              [-10, 71], [30, 71], [40, 60], [35, 45], [25, 35], [10, 35], [0, 45], [-5, 55], [-10, 71]
            ]]
          }
        },
        // Africa
        { 
          type: 'Feature', 
          properties: { name: 'Africa' }, 
          geometry: { 
            type: 'Polygon', 
            coordinates: [[
              [-20, 37], [10, 37], [35, 30], [50, 15], [45, 0], [40, -15], [35, -25], 
              [20, -35], [15, -30], [10, -22], [0, -15], [-10, -5], [-18, 15], [-20, 37]
            ]]
          }
        },
        // Asia
        { 
          type: 'Feature', 
          properties: { name: 'Asia' }, 
          geometry: { 
            type: 'Polygon', 
            coordinates: [[
              [25, 71], [180, 71], [180, 40], [140, 20], [120, 15], [100, 25], [80, 35], 
              [60, 45], [40, 55], [30, 65], [25, 71]
            ]]
          }
        },
        // Australia
        { 
          type: 'Feature', 
          properties: { name: 'Australia' }, 
          geometry: { 
            type: 'Polygon', 
            coordinates: [[
              [113, -10], [115, -20], [125, -25], [140, -20], [150, -15], [153, -25], 
              [145, -40], [135, -35], [125, -30], [115, -25], [113, -10]
            ]]
          }
        }
      ]
    });
    
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
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
      if (panTimeoutRef.current) {
        clearTimeout(panTimeoutRef.current);
      }
    };
  }, []);

  // Memoized layers to prevent recreation on every render (critical for performance)
  
  // Static terrain layer - enabled for both modes (GlobeView can handle it)
  const terrainLayer = useMemo(() => {
    return createStaticTerrainLayer();
  }, []);
  
  // Remove earth sphere layer to prevent geometric artifacts
  
  // Basemap layer - use regular basemap for both modes (GlobeView handles sphere projection)
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
  }), [viewState.longitude, viewState.latitude, viewState.zoom, throttledZoom]);
  
  // Performance monitoring for zoom issues
  const lastRenderTime = useRef(performance.now());
  const renderCount = useRef(0);
  
  // Optimized layer creation - use different radius strategies for 2D vs 3D
  const humanDotsLayer = useMemo(() => {
    const radiusStrategy = is3DMode ? radiusStrategies.globe3D : radiusStrategies.zoomAdaptive;
    
    return createHumanDotsLayer(
      dotsToRender, 
      layerViewState, 
      year, 
      stableLODLevel, 
      radiusStrategy,
      (info: any) => {
        if (info.object) {
          console.log('Clicked dot:', info.object);
        }
      }
    );
  }, [dotsToRender, layerViewState, year, stableLODLevel, is3DMode]);
  
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
  // Shared view-state change handler reused by both 2-D and 3-D views
  const handleViewStateChange = ({ viewState: newViewState }: { viewState: any }) => {
    const oldZoom = viewState.zoom;
    const newZoom = (newViewState as any).zoom;
    const oldLon = viewState.longitude;
    const newLon = (newViewState as any).longitude;
    const oldLat = viewState.latitude;
    const newLat = (newViewState as any).latitude;

    // Update appropriate view state based on mode
    if (is3DMode) {
      setViewState3D(newViewState as any);
    } else {
      setViewState2D(newViewState as any);
    }

    // Zoom detection for debouncing data loads
    if (typeof newZoom === 'number' && Math.abs(newZoom - oldZoom) > 0.01) {
      if (!isZooming) {
        setIsZooming(true);
      }
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
      zoomTimeoutRef.current = setTimeout(() => setIsZooming(false), 150);
    }

    // Pan detection for viewport-based data loading
    const panThreshold = 0.1; // degrees
    if ((Math.abs(newLon - oldLon) > panThreshold || Math.abs(newLat - oldLat) > panThreshold) && !isZooming) {
      if (!isPanning) setIsPanning(true);
      if (panTimeoutRef.current) clearTimeout(panTimeoutRef.current);
      panTimeoutRef.current = setTimeout(() => setIsPanning(false), 300);
    }
  };

  const layers = useMemo(() => {
    // Layer ordering: terrain -> basemap -> human dots (front)
    return [terrainLayer, basemapLayer, humanDotsLayer].filter(Boolean);
  }, [terrainLayer, basemapLayer, humanDotsLayer]);
  
  return (
    <div className="relative w-full h-full">
      {is3DMode ? (
        <GlobeView3D
          viewState={viewState}
          onViewStateChange={handleViewStateChange}
          layers={layers}
        />
      ) : (
        <MapView2D
          viewState={viewState}
          onViewStateChange={handleViewStateChange}
          layers={layers}
        />
      )}
      
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
      
      {/* View Mode Toggle */}
      <div className="absolute top-4 right-4 z-10">
        <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg border border-gray-600/50 p-1 flex items-center gap-1 shadow-lg">
          <button
            onClick={() => setIs3DMode(false)}
            className={`px-4 py-2.5 rounded-md text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              !is3DMode 
                ? 'bg-blue-400 text-white shadow-lg shadow-blue-400/40 ring-2 ring-blue-300 ring-offset-2 ring-offset-gray-900' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
            }`}
            title="2D Map View"
          >
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>
            </svg>
            Map
          </button>
          
          <button
            onClick={() => setIs3DMode(true)}
            className={`px-4 py-2.5 rounded-md text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              is3DMode 
                ? 'bg-blue-400 text-white shadow-lg shadow-blue-400/40 ring-2 ring-blue-300 ring-offset-2 ring-offset-gray-900' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
            }`}
            title="3D Globe View"
          >
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM2.04 4.326c.325 1.329 2.532 2.54 3.717 3.19.48.263.793.434.743.484-.08.08-.162.158-.242.234-.416.396-.787.749-.758 1.266.035.634.618.824 1.214 1.017.577.188 1.168.38 1.286.983.082.417-.075.988-.22 1.52-.215.782-.406 1.48.22 1.653.5.138.5-.619.5-.619.5-.619 1.5-.619 1.5-.619.5 0 .5.619.5.619s0 .757.5.619c.626-.173.435-.871.22-1.653-.145-.532-.302-1.103-.22-1.52.118-.603.709-.795 1.286-.983.596-.193 1.179-.383 1.214-1.017.029-.517-.342-.87-.758-1.266-.08-.076-.162-.154-.242-.234-.05-.05.263-.221.743-.484 1.185-.65 3.392-1.861 3.717-3.19.119-.486.16-1.13-.234-1.326-.39-.192-1.33-.162-2.162-.162-.68 0-1.311.03-1.98.03-.68 0-1.311-.03-1.98-.03-.832 0-1.772-.03-2.162.162-.394.196-.353.84-.234 1.326z"/>
            </svg>
            Globe
          </button>
        </div>
      </div>

      {/* Legend */}
      <LegendOverlay />
    </div>
  );
}

export default memo(Globe);