# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Footsteps of Time - Web Frontend

## Project Overview
A living atlas that lets anyone scrub through 100,000 BCE → today and watch humanity spread, cluster, and explode into cities on a single, elegant globe.

## Vision
Make the vast sweep of human presence instantly graspable by turning dry demographic tables into a visceral, time-lapse journey.

## Core Experience
1. Land on a globe showing faint clusters at -100k
2. Drag the slider forward or back or click to scrub through time to see human presence grow and shrink, cities bloom and shrink, and clusters form and dissolve.

## Frontend Architecture (This Repository)

### Tech Stack
- **Next.js 15** with App Router for the web application
- **Deck.gl 9.1+** for high-performance 3D globe rendering and data visualization layers
- **TypeScript** for type safety throughout the frontend
- **Tailwind CSS** for styling with efficient utility classes
- **RC-Slider** for time navigation controls

### Key Components

#### FootstepsViz.tsx (Main Visualization Component)
The core component managing the 3D globe visualization, data loading, and user interactions:
- **ViewState Management**: Controls globe position, zoom, and orientation
- **Data Loading & Caching**: Implements smart caching with Map-based storage to prevent duplicate API requests
- **LOD Integration**: Automatically requests appropriate Level-of-Detail based on zoom level
- **Performance Optimization**: Memoized layers, throttled zoom updates, progressive rendering limits

#### components/globe/ (Modular Globe System)
- **layers.ts**: Layer creation utilities for basemap and human dots
  - `createBasemapLayer()`: World geography rendering with fallback continent shapes
  - `createHumanDotsLayer()`: Population dot rendering with LOD support and performance optimizations
  - `createStaticTerrainLayer()`: Satellite imagery base layer
- **HumanDotsLayer.tsx**: Specialized component for population dot rendering
- **Overlays.tsx**: UI overlays for data info and controls

#### TimeSlider.tsx
Time navigation component for scrubbing through history with non-linear scaling optimized for the historical span.

#### app/api/human-dots/route.ts (API Endpoint)
Server-side API that serves processed population data:
- **Automatic LOD Selection**: Serves appropriate detail level based on zoom parameter
- **Server-side Spatial Filtering**: Filters data by viewport bounds to reduce transfer
- **Aggressive Caching**: ETag-based HTTP caching with 24-hour cache headers
- **Gzip Compression**: All responses compressed for faster loading
- **Pre-computed Radius Values**: Server calculates optimal dot sizes for GPU rendering

### Performance Architecture

#### LOD (Level of Detail) System
The frontend integrates with a sophisticated LOD system for performance at different zoom levels:
- **LOD 0** (Global, zoom < 2): Highly aggregated dots for world overview
- **LOD 1** (Regional, zoom < 4): Regional clustering 
- **LOD 2** (Local, zoom < 6): Local detail
- **LOD 3** (Detailed, zoom ≥ 6): Full resolution data

#### Frontend Performance Optimizations
- **Memoized Layers**: Prevents layer recreation on every render using `useMemo()`
- **Throttled Zoom**: Reduces layer updates during zoom gestures (0.25 precision throttling)
- **Progressive Rendering**: Hard limit of 35,000 dots for MacBook M3 performance
- **Smart Caching**: Map-based cache prevents duplicate API requests
- **Debounced Data Loading**: Extended delays during zoom to prevent API flooding
- **Viewport Culling**: Server-side spatial filtering reduces data transfer

#### Key Performance Patterns
```typescript
// Memoized layers to prevent recreation
const terrainLayer = useMemo(() => createStaticTerrainLayer(), []);

// Throttled zoom for layer dependencies
const throttledZoom = useMemo(() => {
  return Math.floor(viewState.zoom * 4) / 4; // 0.25 precision throttling
}, [viewState.zoom]);

// Debounced data loading during rapid zoom
const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
const delay = isZooming ? 500 : 150; // Longer delays during zoom
```

### Data Flow
1. **User Interaction**: User changes time slider or zooms/pans globe
2. **Cache Check**: Frontend checks Map-based cache for existing data
3. **API Request**: If not cached, requests data from `/api/human-dots` with zoom and viewport bounds
4. **Server LOD Selection**: API automatically serves appropriate LOD level based on zoom
5. **Data Processing**: Frontend validates and sorts data by population for efficient rendering
6. **GPU Rendering**: Deck.gl renders dots as ScatterplotLayer with pre-computed radius values
7. **Caching**: Response stored in frontend cache with stable cache key

### Relationship to Data Processing Pipeline
This frontend consumes data from a separate Python-based processing pipeline located in `../footstep-generator/`:
- **Input Data**: HYDE 3.5 ASC grid files with historical population density
- **Processing**: Python pipeline converts grids to GeoJSON points with hierarchical LOD aggregation
- **Output Format**: NDJSON.gz files optimized for streaming (`dots_{year}_lod_{level}.ndjson.gz`)
- **API Integration**: Next.js API routes serve the processed data with zoom-aware selection

## Commands
- **Development**: `pnpm dev` → http://localhost:4444
- **Build**: `pnpm build`
- **Lint**: `pnpm lint`
- **Type Check**: `pnpm build` (includes type checking)

## Development Guidelines

### Component Architecture
- Keep globe visualization logic in `FootstepsViz.tsx`
- Use `components/globe/` for modular, reusable globe features
- Prefer composition over inheritance for layer management
- Memoize expensive calculations and layer creations

### Performance Considerations
- Always use `useMemo()` for expensive calculations that depend on stable inputs
- Debounce data loading during rapid view state changes
- Implement progressive rendering limits based on hardware capabilities
- Pre-compute values server-side when possible for GPU optimization

### Data Loading Patterns
- Use Map-based caching to prevent duplicate API requests
- Generate stable cache keys to avoid unnecessary invalidation
- Handle loading states gracefully with error boundaries
- Implement zoom gesture detection to optimize cache behavior

### Testing
- Use `pnpm test` for basic functionality tests
- Test performance with large datasets (35k+ dots)
- Verify LOD transitions work smoothly across zoom levels
- Test caching behavior during rapid user interactions

## Key Files
- **Main Component**: `components/FootstepsViz.tsx` (585 lines)
- **API Endpoint**: `app/api/human-dots/route.ts` (180 lines)
- **Layer Logic**: `components/globe/layers.ts` (117 lines)
- **Time Controls**: `components/TimeSlider.tsx`
- **Type Definitions**: `lib/useYear.ts`

## Data Processing Context
The frontend serves as the visualization layer for a larger historical demographics project. Raw HYDE 3.5 data is processed by a Python pipeline that:
- Converts ASCII grid files to human settlement dots
- Implements hierarchical Level-of-Detail aggregation
- Validates data using Pydantic V2 models
- Outputs optimized NDJSON.gz files for web consumption

For data processing tasks, see the `../footstep-generator/` directory and its own documentation.