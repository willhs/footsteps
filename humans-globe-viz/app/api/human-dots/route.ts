import { NextResponse } from 'next/server';

// Use Node.js runtime so we can access the filesystem (fs module)
export const runtime = 'nodejs';
// Disable automatic static optimization because the data is dynamic / very large
export const dynamic = 'force-dynamic';
import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import readline from 'readline';
import { gzipSync, createGunzip } from 'zlib';

// Helper function to determine LOD level based on zoom
function getLODLevel(zoom: number): number {
  if (zoom < 3) return 1;      // Regional LOD (minimum)
  if (zoom < 5) return 2;      // Local LOD
  return 3;                    // Detailed LOD
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const limit = parseInt(searchParams.get('limit') || '5000000');
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
    const features: any[] = [];
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
    
    // Helper function optimized for 10k BCE to 1500 CE period
    const getPrecomputedRadius = (population: number): number => {
      if (population > 100000) return 40000;    // Massive cities (rare): 40km radius
      else if (population > 50000) return 25000; // Major cities: 25km radius
      else if (population > 20000) return 15000; // Large settlements: 15km radius
      else if (population > 5000) return 8000;   // Medium settlements: 8km radius  
      else if (population > 1000) return 4000;   // Small settlements: 4km radius
      else if (population > 100) return 2000;    // Villages: 2km radius
      else return 1000;                          // Tiny settlements: 1km radius
    };

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
          
          // Stop when we have enough visible dots
          if (features.length >= limit) {
            rl.close();
            break;
          }
        }
      } catch (_) {}
    }

    // Build GeoJSON response with metadata
    const geojson = {
      type: 'FeatureCollection',
      features,
      metadata: {
        year: yr,
        lodLevel: lodLevel,
        zoomRequested: zoom,
        usedLOD: lodLevel !== null,
        totalFeatures: features.length,
        filename: path.basename(ndPath)
      }
    };

    const lodInfo = lodLevel !== null ? ` (LOD ${lodLevel} for zoom ${zoom})` : ' (legacy format)';
    const boundsInfo = `bounds: [${minLon.toFixed(1)}, ${minLat.toFixed(1)}, ${maxLon.toFixed(1)}, ${maxLat.toFixed(1)}]`;
    console.log(`Loaded ${features.length}/${totalProcessed} features for year ${yr}${lodInfo}, ${boundsInfo}`);

    const jsonStr = JSON.stringify(geojson);
    const gzBody = gzipSync(Buffer.from(jsonStr));
    return new NextResponse(new Uint8Array(gzBody), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'public, max-age=86400',
        'X-LOD-Level': lodLevel?.toString() || 'legacy',
        'X-Zoom-Level': zoom.toString(),
        'X-Features-Count': features.length.toString(),
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
