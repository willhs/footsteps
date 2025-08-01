'use client';

import { useState, useMemo, useEffect, memo } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
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
  
  // Frontend data cache to prevent duplicate API requests
  const [dataCache, setDataCache] = useState<Map<number, HumanDot[]>>(new Map());
  const [activeRequests, setActiveRequests] = useState<Set<number>>(new Set());
  
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



  // Load HYDE human dots data with frontend caching to prevent duplicate requests
  useEffect(() => {
    const loadData = async () => {
      try {
        // Check if data is already cached
        if (dataCache.has(year)) {
          console.log(`Using cached data for year ${year}`);
          const cachedData = dataCache.get(year)!;
          setHumanDotsData(cachedData);
          setLoading(false);
          setError(null);
          return;
        }
        
        // Check if request is already in progress
        if (activeRequests.has(year)) {
          console.log(`Request already in progress for year ${year}, skipping...`);
          return;
        }
        
        // Mark request as active
        setActiveRequests(prev => new Set(prev).add(year));
        setLoading(true);
        const startTime = performance.now();
        
        console.log(`Loading human dots data for year ${year}...`);
        const response = await fetch(`/api/human-dots?year=${year}&limit=${DOT_LIMIT}`);
        if (!response.ok) {
          throw new Error('Failed to load human dots data');
        }
        
        const loadEndTime = performance.now();
        
        console.log('Parsing data...');
        const data = await response.json();
        const features = data.features || [];
        
        const processEndTime = performance.now();
        
        console.log(`Loaded ${features.length.toLocaleString()} human dots for year ${year}`);
        
        // Cache the data
        setDataCache(prev => new Map(prev).set(year, features));
        setHumanDotsData(features);
        setError(null);
        setLoading(false);
        
        // Update performance metrics
        setRenderMetrics({
          loadTime: loadEndTime - startTime,
          processTime: processEndTime - loadEndTime,
          renderTime: 0, // Will be updated by render callback
          lastUpdate: Date.now()
        });
        
      } catch (err) {
        console.error('Error loading data:', err);
        setError('No processed data found. Run the data processing pipeline first.');
        setHumanDotsData([]);
        setLoading(false);
      } finally {
        // Remove from active requests
        setActiveRequests(prev => {
          const newSet = new Set(prev);
          newSet.delete(year);
          return newSet;
        });
      }
    };

    loadData();
  }, [year]); // Reload when year changes

  // Use loaded data with zoom-based adaptive density
  const currentHumanDots = useMemo(() => {
    try {
      if (!Array.isArray(humanDotsData) || humanDotsData.length === 0) {
        return [];
      }
      
      // Validate data structure and coordinates
      const validDots = humanDotsData.filter(dot => {
        if (!dot || !dot.properties || !dot.geometry || !dot.geometry.coordinates) {
          console.warn('Invalid dot data:', dot);
          return false;
        }
        
        const coords = dot.geometry.coordinates;
        if (!Array.isArray(coords) || coords.length !== 2) {
          console.warn('Invalid coordinates array:', coords);
          return false;
        }
        
        const [lon, lat] = coords;
        if (typeof lon !== 'number' || typeof lat !== 'number' || 
            !isFinite(lon) || !isFinite(lat) ||
            Math.abs(lon) > 180 || Math.abs(lat) > 90) {
          console.warn('Invalid coordinate values:', lon, lat);
          return false;
        }
        
        return true;
      });
      
      return validDots;
    } catch (error) {
      console.error('Error processing human dots data:', error);
      return [];
    }
  }, [humanDotsData]);

  // Percentage of dots actually rendered vs total dots loaded for the year
  const samplingRate = useMemo(() => {
    const totalLoaded = humanDotsData.length;
    if (totalLoaded === 0) return 0;
    return (currentHumanDots.length / totalLoaded) * 100;
  }, [currentHumanDots, humanDotsData]);
  
  // For now, disable population density layer and focus on human dots
  const populationLayer = new GeoJsonLayer({
    id: 'population-density',
    data: { type: 'FeatureCollection', features: [] },
    visible: false
  });
  
  // Create human dots layer with performance optimizations and error handling
  const humanDotsLayer = new ScatterplotLayer({
    id: 'human-dots',
    data: currentHumanDots,
    getPosition: (d: any) => {
      try {
        const coords = d.geometry?.coordinates;
        if (!coords || !Array.isArray(coords) || coords.length !== 2) {
          return [0, 0]; // Fallback to origin if invalid
        }
        return coords;
      } catch (error) {
        console.warn('Error getting position:', error);
        return [0, 0];
      }
    },
    // Zoom-adaptive dot sizing
    getRadius: (d: any) => {
      const zoom = viewState.zoom;
      const baseRadius = 2000;
      const population = d?.properties?.population || 100;
      
      // Scale radius based on population and zoom level
      const populationScale = Math.sqrt(population / 100); // Square root scaling
      const zoomScale = Math.max(0.5, Math.min(2.0, zoom / 3)); // Zoom factor
      
      return baseRadius * populationScale * zoomScale;
    },
    getFillColor: (d: any) => {
      const population = d?.properties?.population || 100;
      
      // Color intensity based on population
      if (population > 1000) {
        return [255, 100, 0, 240]; // Large settlements: bright red-orange
      } else if (population > 500) {
        return [255, 150, 50, 220]; // Medium settlements: orange
      } else {
        return [255, 200, 100, 200]; // Small settlements: pale yellow
      }
    },
    radiusMinPixels: 1,
    radiusMaxPixels: 15,
    pickable: false, // Disable picking for better performance
    updateTriggers: {
      getPosition: currentHumanDots,
      getFillColor: currentHumanDots,
      getRadius: [currentHumanDots, viewState.zoom]
    },
    // Performance optimizations
    billboard: false,
    antialiasing: false,
    // Performance tracking (throttled to avoid render loops)
    onAfterRender: useMemo(() => {
      let lastRenderTime = 0;
      return () => {
        const now = performance.now();
        if (now - lastRenderTime > 100) { // Throttle to 10fps
          setRenderMetrics(prev => ({
            ...prev,
            renderTime: now - lastRenderTime
          }));
          lastRenderTime = now;
        }
      };
    }, []),
    // Additional error handling
    onError: (error: any) => {
      console.warn('ScatterplotLayer error:', error);
    }
  });
  
  // Simple basemap layer using Natural Earth land boundaries with fallback
  const [basemapData, setBasemapData] = useState<any>(null);
  const [basemapError, setBasemapError] = useState<boolean>(false);
  
  // Load basemap data on mount
  useEffect(() => {
    // Start with proper continent shapes for better fallback
    console.log('Setting up basemap...');
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
          console.log('All external sources failed, using enhanced fallback');
          return;
        }
        
        fetch(sources[sourceIndex])
          .then(response => {
            if (!response.ok) throw new Error(`Failed to load from source ${sourceIndex + 1}`);
            return response.json();
          })
          .then(data => {
            console.log(`Basemap loaded successfully from source ${sourceIndex + 1}:`, data);
            setBasemapError(false);
            setBasemapData(data);
          })
          .catch(error => {
            console.log(`Source ${sourceIndex + 1} failed:`, error.message);
            tryLoadSource(sourceIndex + 1);
          });
      };
      
      tryLoadSource();
    }, 1000);
  }, []);

  const basemapLayer = new GeoJsonLayer({
    id: 'land-layer',
    data: basemapData || { type: 'FeatureCollection', features: [] },
    filled: true,
    // Disable stroke so internal country borders are not drawn
    stroked: false,
    getFillColor: basemapError ? [60, 80, 100, 120] : [40, 60, 80, 180],
    pickable: false,
    opacity: 1.0,
    updateTriggers: {
      data: basemapData,
      getFillColor: basemapError
    }
  });

  const layers = [basemapLayer, populationLayer, humanDotsLayer];
  
  return (
    <div className="relative w-full h-full">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: newViewState }) => {
          setViewState(newViewState as any);
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
        {/* Base map - using a dark style */}
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'radial-gradient(circle at center, #001122 0%, #000000 100%)',
            zIndex: -1
          }}
        />
      </DeckGL>
      
      {/* Data info overlay */}
      {!loading && (
        <div 
          className="absolute bg-black/90 rounded-lg p-4 text-white font-sans"
          style={{ top: '2rem', left: '2rem', zIndex: 30 }}
        >
          <div className="text-sm text-blue-300 font-normal">Deep History of Human Settlement</div>
          <div className="text-lg font-bold text-orange-400 font-mono">
            {currentHumanDots.length.toLocaleString()} dots
          </div>
          <div className="text-xs text-gray-500 mt-1 font-normal">
            Dots: 100-1000 people (density-scaled)
          </div>
          <div className="text-xs text-gray-500 mt-1 font-normal">
            Total population ≈ {totalPopulation.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1 font-normal">
            Zoom level: {viewState.zoom.toFixed(1)}x
          </div>
          <div className="text-xs text-gray-500 mt-1 font-normal">
            Sampling rate: {samplingRate.toFixed(1)}%
          </div>
          
          {/* Performance metrics */}
          <div className="text-xs text-gray-600 mt-2 border-t border-gray-700 pt-2">
            <div>Load: {renderMetrics.loadTime.toFixed(0)}ms</div>
            <div>Process: {renderMetrics.processTime.toFixed(0)}ms</div>
            <div>Render: {renderMetrics.renderTime.toFixed(0)}ms</div>
            <div>Cache: {dataCache.size} years cached</div>
          </div>
        </div>
      )}
      
      {/* Error overlay removed – details are logged in the browser console */}
      
      
      {/* Legend */}
      <div 
        className="absolute bg-black/80 backdrop-blur-sm rounded-lg p-4 text-white"
        style={{ top: '2rem', right: '2rem', zIndex: 30 }}
      >
        <div className="text-sm font-semibold mb-2 text-blue-300">Deep History</div>
        <div className="text-xs text-gray-400 mb-3">12,000 Years of Settlement</div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-400"></div>
            <span>Human settlements</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400 opacity-60"></div>
            <span>Population density</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(Globe);