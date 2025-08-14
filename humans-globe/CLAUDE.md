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

#### components/footsteps/ (Feature Modules)
- **layers/layers.ts**: Layer creation utilities
  - `createBasemapLayer()`: World geography rendering
  - `createHumanTilesLayer()`: Population dots via deck.gl `MVTLayer` (vector tiles)
- **views/**, **overlays/**, **hooks/**: Feature-scoped UI and logic (see `FootstepsViz.tsx` as root)

#### TimeSlider.tsx
Time navigation component for scrubbing through history with non-linear scaling optimized for the historical span.

#### app/api/tiles/[year]/[lod]/[z]/[x]/[y]/route.ts (Tile API)
Serves Mapbox Vector Tiles (MVT) points from MBTiles:
- **Single Format**: Uses combined yearly MBTiles `humans_{year}.mbtiles`; `lod` selects the MVT layer
- **MBTiles Access**: Uses `@mapbox/mbtiles` if available; falls back to `sqlite3` CLI
- **Configurable Path**: `HUMANS_TILES_DIR` env var (default `../data/tiles/humans`)
- **Caching**: Strong ETag + long-lived immutable cache headers
- Legacy `/api/human-dots` endpoint removed

##### Tile Caching (GCS → local)
- GCS tiles are cached to a stable local path for reuse across requests.
- Env `TILE_CACHE_DIR` controls the cache root (default: `/tmp/humans-tiles-cache`).
- Cached files are not deleted per-request; only ephemeral `.download` temps are cleaned up.
- Response header `X-Tile-Cache` indicates `hit` or `refresh`.

### Performance Architecture

#### LOD (Level of Detail) System
The frontend integrates with a four‑tier LOD system for performance at different zoom levels:
- **LOD 0 – Regional** (zoom < 4): Coarse clusters for fast world/regional overview
- **LOD 1 – Subregional** (4 ≤ zoom < 5): Mid‑detail clusters for country/province scale
- **LOD 2 – Local** (5 ≤ zoom < 6): High detail for sub‑province/county scale
- **LOD 3 – Detailed** (zoom ≥ 6): Full resolution data

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
2. **LOD Selection (frontend)**: `lib/lod.ts` maps zoom → LOD; `FootstepsViz.tsx` passes `lod` to the layer
3. **Tile Requests**: deck.gl `MVTLayer` fetches `/api/tiles/{year}/{lod}/{z}/{x}/{y}.pbf`
4. **Decoding + Styling**: `MVTLayer` decodes MVT and sublayers style by population and radius strategy
5. **GPU Rendering**: Deck.gl renders dots on the globe
6. **Caching**: HTTP caching handled per tile; deck.gl manages tile cache

### Relationship to Data Processing Pipeline
This frontend consumes tiles produced by the Python pipeline in `../footstep-generator/`:
- **Input Data**: HYDE 3.5 grids, etc.
- **Tiling**: `make_tiles.py` generates per-LOD tiles and combines them per-year
- **Output**: `data/tiles/humans/humans_{year}.mbtiles` (combined yearly, contains LOD layers)
- **Serving**: Next.js Tile API serves MVT from MBTiles; `HUMANS_TILES_DIR` can override tiles directory

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
- **Main Component**: `components/footsteps/FootstepsViz.tsx`
- **Tile API**: `app/api/tiles/[year]/[lod]/[z]/[x]/[y]/route.ts`
- **Layer Logic**: `components/footsteps/layers/layers.ts`
- **Time Controls**: `components/ui/TimeSlider.tsx`
- **LOD Utils**: `lib/lod.ts`

## Data Processing Context
The frontend serves as the visualization layer for a larger historical demographics project. Raw HYDE 3.5 data is processed by a Python pipeline that:
- Converts ASCII grid files to MVT point features
- Implements hierarchical Level-of-Detail aggregation
- Validates data using Pydantic V2 models
- Outputs MBTiles files containing Mapbox Vector Tiles (MVT) for web consumption

For data processing tasks, see the `../footstep-generator/` directory and its own documentation.
