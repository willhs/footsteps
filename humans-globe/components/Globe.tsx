'use client';

import { useState, useMemo, useEffect, memo, useCallback, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { createBasemapLayer, createHumanDotsLayer, createStaticTerrainLayer } from './globe/layers';
import { WebMercatorViewport } from '@deck.gl/core';
import HumanDotsOverlay from './globe/HumanDotsOverlay';
import LegendOverlay from './globe/LegendOverlay';
import useHumanDotsData, { MAX_RENDER_DOTS } from './globe/useHumanDotsData';
// import { scaleSequential } from 'd3-scale';
// import * as d3 from 'd3-scale';

interface GlobeProps {
  year: number;
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
  
  // Zoom gesture state tracking
  const [isZooming, setIsZooming] = useState(false);
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pan gesture state tracking
  const [isPanning, setIsPanning] = useState(false);
  const panTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  
  // Helper to get LOD level from zoom
  const getLODLevel = useCallback((zoom: number): number => {
    if (zoom < 4) return 1;      // Regional LOD (minimum)
    if (zoom < 6) return 2;      // Local LOD
    return 3;                    // Detailed LOD
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
          .catch(() => {
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