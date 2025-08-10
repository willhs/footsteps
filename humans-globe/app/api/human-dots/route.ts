import { NextResponse } from 'next/server';

// Use Node.js runtime so we can access the filesystem (fs module)
export const runtime = 'nodejs';
// Disable automatic static optimization because the data is dynamic / very large
export const dynamic = 'force-dynamic';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { gzipSync, createGunzip, brotliCompressSync } from 'zlib';

// Minimal feature type used in this route
interface MinimalFeatureProperties {
  population?: number;
  precomputedRadius?: number;
  aggregated?: boolean;
  gridSize?: number;
}

interface MinimalFeature {
  type?: string;
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: MinimalFeatureProperties;
}

// Helper: map population to a display radius in meters
function getPrecomputedRadius(population: number): number {
  if (population > 1_000_000) return 60000;   // Super cities: 60km
  if (population > 100_000) return 40000;     // Massive cities: 40km
  if (population > 50_000) return 25000;      // Major cities: 25km
  if (population > 20_000) return 15000;      // Large settlements: 15km
  if (population > 5_000) return 8000;        // Medium settlements: 8km
  if (population > 1_000) return 4000;        // Small settlements: 4km
  if (population > 100) return 2000;          // Villages: 2km
  return 1000;                                // Tiny settlements: 1km
}

// Simple population-preserving grid aggregator to cap dot count
function aggregateToGrid(
  features: MinimalFeature[],
  maxDots: number,
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number }
) {
  if (features.length <= maxDots) {
    return features;
  }

  const areaDeg2 = Math.max(0.0001, (bounds.maxLon - bounds.minLon) * (bounds.maxLat - bounds.minLat));
  // Initial grid size so area / s^2 ~= maxDots
  let gridSize = Math.sqrt(areaDeg2 / Math.max(1, maxDots));
  // Clamp grid size to reasonable bounds (in degrees)
  gridSize = Math.min(Math.max(gridSize, 0.05), 10);

  // Iteratively increase grid size if still too many buckets
  for (let iter = 0; iter < 4; iter++) {
    const buckets = new Map<string, { sumPop: number; wx: number; wy: number }>();

    for (const f of features) {
      const coords = f?.geometry?.coordinates;
      const pop = Number(f?.properties?.population || 0);
      if (!coords || !Array.isArray(coords) || coords.length !== 2 || !isFinite(pop) || pop <= 0) continue;
      const [lon, lat] = coords as [number, number];

      const gx = Math.floor(lon / gridSize);
      const gy = Math.floor(lat / gridSize);
      const key = `${gx}:${gy}`;
      const bucket = buckets.get(key) || { sumPop: 0, wx: 0, wy: 0 };
      bucket.sumPop += pop;
      bucket.wx += lon * pop;
      bucket.wy += lat * pop;
      buckets.set(key, bucket);
    }

    if (buckets.size <= maxDots || iter === 3) {
      // Build aggregated features
      const aggregated: MinimalFeature[] = [];
      for (const [, b] of buckets.entries()) {
        if (b.sumPop <= 0) continue;
        const lon = b.wx / b.sumPop;
        const lat = b.wy / b.sumPop;
        aggregated.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: {
            population: b.sumPop,
            precomputedRadius: getPrecomputedRadius(b.sumPop),
            aggregated: true,
            gridSize,
          }
        });
      }
      // If still above max, take the top by population (last resort)
      if (aggregated.length > maxDots) {
        aggregated.sort(
          (a, b) => ((b.properties?.population ?? 0) - (a.properties?.population ?? 0))
        );
        return aggregated.slice(0, maxDots);
      }
      return aggregated;
    }

    // Increase grid to reduce buckets proportionally
    const factor = Math.sqrt(buckets.size / maxDots);
    gridSize = Math.min(10, gridSize * Math.max(1.1, factor));
  }

  return features;
}

// Helper function to determine LOD level based on zoom
function getLODLevel(zoom: number): number {
  if (zoom < 3) return 1;      // Regional LOD (minimum)
  if (zoom < 5) return 2;      // Local LOD
  return 3;                    // Detailed LOD
}

export async function GET(request: Request) {
  const startTime = performance.now();
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const limit = parseInt(searchParams.get('limit') || '250000');
    const maxDots = parseInt(searchParams.get('maxDots') || '100000');
    const zoom = parseFloat(searchParams.get('zoom') || '1.5'); // Default to global view
    
    // Parse viewport bounds for server-side spatial filtering
    const minLon = parseFloat(searchParams.get('minLon') || '-180');
    const maxLon = parseFloat(searchParams.get('maxLon') || '180');
    const minLat = parseFloat(searchParams.get('minLat') || '-90');
    const maxLat = parseFloat(searchParams.get('maxLat') || '90');
    
    if (!year) {
      return NextResponse.json({ error: 'year query param required' }, { status: 400 });
    }
    const yr = parseInt(year);

    // Determine appropriate file path based on zoom level (automatic LOD selection)
    let ndPath: string | undefined;
    let lodLevel: number | null = null;
    
    // Try to use LOD files first based on zoom level
    lodLevel = getLODLevel(zoom);
    const lodCandidates = [
      path.join(process.cwd(), '..', 'data', 'processed', `dots_${yr}_lod_${lodLevel}.ndjson.gz`),
      path.join(process.cwd(), 'data', 'processed', `dots_${yr}_lod_${lodLevel}.ndjson.gz`)
    ];
    ndPath = lodCandidates.find(p => fs.existsSync(p));
    
    // Fallback to detailed LOD if specific level not found
    if (!ndPath && lodLevel !== 3) {
      console.log(`LOD level ${lodLevel} not found for year ${yr}, falling back to detailed (LOD 3)`);
      lodLevel = 3;
      const detailedCandidates = [
        path.join(process.cwd(), '..', 'data', 'processed', `dots_${yr}_lod_3.ndjson.gz`),
        path.join(process.cwd(), 'data', 'processed', `dots_${yr}_lod_3.ndjson.gz`)
      ];
      ndPath = detailedCandidates.find(p => fs.existsSync(p));
    }
    
    // Fallback to legacy format if LOD files not available
    if (!ndPath) {
      console.log(`LOD files not found for year ${yr}, using legacy format`);
      const legacyCandidates = [
        path.join(process.cwd(), '..', 'data', 'processed', `dots_${yr}.ndjson.gz`),
        path.join(process.cwd(), 'data', 'processed', `dots_${yr}.ndjson.gz`)
      ];
      ndPath = legacyCandidates.find(p => fs.existsSync(p));
      lodLevel = null;
    }
    
    if (!ndPath) {
      return NextResponse.json({ error: 'Year not available' }, { status: 404 });
    }

    // ---- Caching ----
    const stat = fs.statSync(ndPath);
    const lodSuffix = lodLevel !== null ? `-lod${lodLevel}` : '';
    const etag = `W/\"${yr}${lodSuffix}-${stat.mtimeMs}\"`;
    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    // Stream and filter dots by viewport bounds
    const features: MinimalFeature[] = [];
    let totalProcessed = 0;
    const rl = readline.createInterface({
      input: fs.createReadStream(ndPath).pipe(createGunzip()),
      crlfDelay: Infinity
    });
    
    // Add buffer for smooth panning (10% of viewport size)
    const lonBuffer = (maxLon - minLon) * 0.1;
    const latBuffer = (maxLat - minLat) * 0.1;
    const bufferedMinLon = minLon - lonBuffer;
    const bufferedMaxLon = maxLon + lonBuffer;
    const bufferedMinLat = minLat - latBuffer;
    const bufferedMaxLat = maxLat + latBuffer;
    
    // getPrecomputedRadius is defined at module scope

    for await (const line of rl) {
      if (!line) continue;
      totalProcessed++;
      
      try {
        const feature = JSON.parse(line);
        const [lon, lat] = feature.geometry?.coordinates || [0, 0];
        
        // Server-side spatial filtering
        if (lon >= bufferedMinLon && lon <= bufferedMaxLon && 
            lat >= bufferedMinLat && lat <= bufferedMaxLat) {
          // Pre-compute and cache radius value for GPU optimization
          const population = feature.properties?.population || 0;
          feature.properties.precomputedRadius = getPrecomputedRadius(population);
          
          features.push(feature);
          
          // Stop when we have enough visible dots loaded (pre-aggregation)
          if (features.length >= limit) {
            rl.close();
            break;
          }
      }
    } catch {}
    }

    // Aggregate within viewport to cap dot count while preserving total population
    const aggregated = aggregateToGrid(features, Math.max(1, maxDots), {
      minLon, maxLon, minLat, maxLat
    });

    // Build GeoJSON response with metadata
    const geojson = {
      type: 'FeatureCollection',
      features: aggregated,
      metadata: {
        year: yr,
        lodLevel: lodLevel,
        zoomRequested: zoom,
        usedLOD: lodLevel !== null,
        totalFeatures: aggregated.length,
        filename: path.basename(ndPath),
        aggregated: features.length !== aggregated.length,
        requestedMaxDots: maxDots
      }
    };

    const processingEndTime = performance.now();
    const totalProcessingTime = processingEndTime - startTime;
    
    const lodInfo = lodLevel !== null ? ` (LOD ${lodLevel} for zoom ${zoom})` : ' (legacy format)';
    const boundsInfo = `bounds: [${minLon.toFixed(1)}, ${minLat.toFixed(1)}, ${maxLon.toFixed(1)}, ${maxLat.toFixed(1)}]`;
    const perfInfo = `${totalProcessingTime.toFixed(1)}ms`;
    
    console.log(`✅ Loaded ${features.length}/${totalProcessed} features, returned ${aggregated.length} for year ${yr}${lodInfo}, ${boundsInfo} in ${perfInfo}`);

    const jsonStr = JSON.stringify(geojson);
    const acceptEncoding = request.headers.get('accept-encoding') || '';
    let body: Uint8Array;
    let encoding: string;
    if (acceptEncoding.includes('br')) {
      body = new Uint8Array(brotliCompressSync(Buffer.from(jsonStr)));
      encoding = 'br';
    } else {
      body = new Uint8Array(gzipSync(Buffer.from(jsonStr)));
      encoding = 'gzip';
    }
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': encoding,
        'Cache-Control': 'public, max-age=86400',
        'X-LOD-Level': lodLevel?.toString() || 'legacy',
        'X-Zoom-Level': zoom.toString(),
        'X-Features-Count': features.length.toString(),
        'X-Processing-Time': totalProcessingTime.toFixed(1),
        'X-File-Size-MB': (Buffer.byteLength(jsonStr) / 1024 / 1024).toFixed(2),
        ETag: etag
      }
    });
    
  } catch (error) {
    console.error('Error loading human dots data:', error);
    return NextResponse.json(
      { error: 'Failed to load human dots data' },
      { status: 500 }
    );
  }
}
