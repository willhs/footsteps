import { NextResponse } from 'next/server';

// Use Node.js runtime so we can access the filesystem (fs module)
export const runtime = 'nodejs';
// Disable automatic static optimization because the data is dynamic / very large
export const dynamic = 'force-dynamic';
import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import readline from 'readline';
import { gzipSync } from 'zlib';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const limit = parseInt(searchParams.get('limit') || '5000000');  // Removed cap - load all available data
    
    if (!year) {
      return NextResponse.json({ error: 'year query param required' }, { status: 400 });
    }
    const yr = parseInt(year);

    // Determine NDJSON file path
    const candidates = [
      path.join(process.cwd(), '..', 'data', 'processed', `dots_${yr}.ndjson`),
      path.join(process.cwd(), 'data', 'processed', `dots_${yr}.ndjson`)
    ];
    const ndPath = candidates.find(p => fs.existsSync(p));
    if (!ndPath) {
      return NextResponse.json({ error: 'Year not available' }, { status: 404 });
    }

    // ---- Caching ----
    const stat = fs.statSync(ndPath);
    const etag = `W/\"${yr}-${stat.mtimeMs}\"`;
    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    // Stream first <limit> lines
    const features: any[] = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(ndPath, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });
    for await (const line of rl) {
      if (!line) continue;
      try {
        features.push(JSON.parse(line));
      } catch (_) {}
      if (features.length >= limit) {
        rl.close();
        break;
      }
    }

    // Build GeoJSON response
    const geojson = {
      type: 'FeatureCollection',
      features
    };

    console.log(`Loaded ${features.length} features for year ${yr}`);

    const jsonStr = JSON.stringify(geojson);
    const gzBody = gzipSync(Buffer.from(jsonStr));
    return new NextResponse(gzBody, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'public, max-age=86400',
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