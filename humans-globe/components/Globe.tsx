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
  const DOT_LIMIT = 100000;

  // Derived statistics
  const totalPopulation = useMemo(() => {
    return humanDotsData.reduce((sum, dot) => {
      return sum + (dot?.properties?.population ?? 0);
    }, 0);
  }, [humanDotsData]);



  // Load HYDE human dots data for current year only
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load data for specific year with reasonable limit
        console.log(`Loading human dots data for year ${year}...`);
        const response = await fetch(`/api/human-dots?year=${year}&limit=${DOT_LIMIT}`);
        if (!response.ok) {
          throw new Error('Failed to load human dots data');
        }
        
        console.log('Parsing data...');
        const data = await response.json();
        const features = data.features || [];
        
        console.log(`Loaded ${features.length.toLocaleString()} human dots for year ${year}`);
        
        setHumanDotsData(features);
        setError(null);
        setLoading(false);
        
      } catch (err) {
        console.error('Error loading data:', err);
        setError('No processed data found. Run the data processing pipeline first.');
        setHumanDotsData([]);
        setLoading(false);
      }
    };

    loadData();
  }, [year]); // Reload when year changes

  // Use loaded data directly since it's already filtered by year
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

  const samplingRate = useMemo(() => {
    return (currentHumanDots.length / DOT_LIMIT) * 100;
  }, [currentHumanDots]);
  
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
    getRadius: 2000, // Slightly larger for better visibility against basemap
    getFillColor: [255, 180, 0, 220], // Brighter orange with more opacity
    radiusMinPixels: 1.5,
    radiusMaxPixels: 10, // Slightly larger max size
    pickable: false, // Disable picking for better performance
    updateTriggers: {
      getPosition: currentHumanDots,
      getFillColor: currentHumanDots
    },
    // Performance optimizations
    billboard: false,
    antialiasing: false,
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
        'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson',
        'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson',
        'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/cultural/ne_50m_admin_0_countries.geojson'
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
    stroked: true,
    getFillColor: basemapError ? [60, 80, 100, 120] : [40, 60, 80, 180], // Lighter if using fallback
    getLineColor: [80, 100, 120, 255], // More visible coastlines
    getLineWidth: basemapError ? 2 : 1, // Thicker lines for fallback
    lineWidthMinPixels: 1,
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
        onViewStateChange={({ viewState }) => setViewState(viewState as any)}
        controller={true}
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
          <div className="text-sm text-gray-400 font-normal">Human Settlements</div>
          <div className="text-lg font-bold text-orange-400 font-mono">
            {currentHumanDots.length.toLocaleString()} dots
          </div>
          <div className="text-xs text-gray-500 mt-1 font-normal">
            Each dot ≈ 100 people
          </div>
          <div className="text-xs text-gray-500 mt-1 font-normal">
            Total population ≈ {totalPopulation.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1 font-normal">
            Sampling rate: {samplingRate.toFixed(1)}%
          </div>
        </div>
      )}
      
      {!loading && error && (
        <div className="absolute inset-0 flex items-center justify-center z-50">
          <div className="bg-black/90 backdrop-blur-sm rounded-lg p-8 text-white text-center max-w-md">
            <div className="text-4xl mb-4">❌</div>
            <div className="text-xl font-bold mb-2">Data Loading Failed</div>
            <div className="text-gray-400 mb-4">{error}</div>
            <div className="text-sm text-left bg-gray-800 rounded p-3 font-mono">
              <div className="text-blue-400 mb-1"># Process HYDE data</div>
              <div>poetry run process-hyde</div>
              <div className="text-blue-400 mt-2 mb-1"># Start API server</div>
              <div>Create API endpoint for data</div>
            </div>
          </div>
        </div>
      )}
      
      
      {/* Legend */}
      <div 
        className="absolute bg-black/80 backdrop-blur-sm rounded-lg p-4 text-white"
        style={{ top: '2rem', right: '2rem', zIndex: 30 }}
      >
        <div className="text-sm font-semibold mb-2">Legend</div>
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