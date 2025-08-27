import fs from 'fs';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { createMBTilesReader, supportsRangeRequests, HTTPRangeMBTilesReader } from './httpRangeMbtiles';

// Initialize Google Cloud Storage client
let storage: Storage | null = null;

function getStorageClient(): Storage {
  if (!storage) {
    if (process.env.NODE_ENV === 'production' && process.env.GCP_PROJECT_ID) {
      storage = new Storage({
        projectId: process.env.GCP_PROJECT_ID,
      });
    } else {
      throw new Error('GCS client not available in development mode');
    }
  }
  return storage;
}

export function getTilesBucket(): string {
  const bucket = process.env.GCS_TILES_BUCKET;
  if (!bucket) {
    const msg =
      'GCS_TILES_BUCKET environment variable is required in production';
    console.error(msg);
    throw new Error(msg);
  }
  return bucket;
}

export function getTilesBucketIfAvailable(): string | null {
  return process.env.GCS_TILES_BUCKET || null;
}

export interface TileFile {
  exists: boolean;
  path: string;
  isLocal: boolean;
  size?: number;
  mtime?: Date;
  httpUrl?: string; // HTTP URL for byte-range access
}

export interface DownloadResult {
  path: string;
  isTemp: boolean;
  cacheStatus: 'hit' | 'refresh';
}

export interface HTTPTileAccess {
  reader: HTTPRangeMBTilesReader;
  url: string;
  supportsRanges: boolean;
}

/**
 * Get the tiles directory path based on environment
 */
export function getTilesDir(): string {
  // Production and development both use /data/tiles/humans
  // Production: mounted persistent disk
  // Development: local filesystem
  const fromEnv = process.env.HUMANS_TILES_DIR;
  if (fromEnv) return fromEnv;

  // Default development path (relative to repo)
  return path.resolve(process.cwd(), '..', 'data', 'tiles', 'humans');
}

/**
 * Determine the appropriate tile file path based on environment
 */
export async function getTileFilePath(
  year: number,
  _lodLevel: number,
): Promise<TileFile> {
  // Single canonical format: combined per-year MBTiles
  const yearlyFilename = `humans_${year}.mbtiles`;

  // Check if we should use production mode (GCS bucket available)
  const bucketName = getTilesBucketIfAvailable();
  if (process.env.NODE_ENV === 'production' && bucketName) {
    // Always try HTTP range access first in production for remote MBTiles
    const httpUrl = `https://storage.googleapis.com/${bucketName}/${yearlyFilename}`;
    
    // Check if the file exists and supports range requests
    try {
      const supportsRanges = await supportsRangeRequests(httpUrl);
      if (supportsRanges) {
        return {
          exists: true,
          path: httpUrl,
          isLocal: false,
          httpUrl: httpUrl,
          // We can't easily get size/mtime for HTTP without a HEAD request
          // but that's okay since we're using byte ranges
        };
      } else {
        console.warn(`HTTP server does not advertise range support; using GCS SDK for ${httpUrl}`);
      }
    } catch (error) {
      console.warn(`HTTP range check failed for ${httpUrl}, falling back to GCS SDK:`, error);
    }
    
    // Use GCS SDK approach (download entire file) - this is the default
    return await checkGCSFile(bucketName, yearlyFilename);
  }

  // Development: Use local filesystem
  const tilesDir = getTilesDir();

  // Use combined per-year MBTiles only
  const yearlyPath = path.join(tilesDir, yearlyFilename);
  return checkLocalFile(yearlyPath);
}

// Note: Per-LOD tiles are no longer used; consolidated to single per-year MBTiles.

/**
 * Check if a local file exists and get its stats
 */
function checkLocalFile(filePath: string): TileFile {
  try {
    const stats = fs.statSync(filePath);
    return {
      exists: true,
      path: filePath,
      isLocal: true,
      size: stats.size,
      mtime: stats.mtime,
    };
  } catch {
    return {
      exists: false,
      path: filePath,
      isLocal: true,
    };
  }
}

/**
 * Check if a GCS file exists and get its metadata
 */
async function checkGCSFile(
  bucketName: string,
  filename: string,
): Promise<TileFile> {
  try {
    const storageClient = getStorageClient();
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(filename);

    const [exists] = await file.exists();
    if (!exists) {
      return {
        exists: false,
        path: `gs://${bucketName}/${filename}`,
        isLocal: false,
      };
    }

    const [metadata] = await file.getMetadata();
    return {
      exists: true,
      path: `gs://${bucketName}/${filename}`,
      isLocal: false,
      size: parseInt(String(metadata.size ?? '0'), 10),
      mtime: new Date(metadata.updated || metadata.timeCreated || Date.now()),
      httpUrl: `https://storage.googleapis.com/${bucketName}/${filename}`,
    };
  } catch (error) {
    console.error(`Failed to check GCS file gs://${bucketName}/${filename}:`, error);
    return {
      exists: false,
      path: `gs://${bucketName}/${filename}`,
      isLocal: false,
    };
  }
}

/**
 * Create HTTP tile access for byte-range requests
 */
export async function createHTTPTileAccess(
  tileFile: TileFile,
): Promise<HTTPTileAccess | null> {
  if (tileFile.isLocal || !tileFile.httpUrl) {
    return null;
  }

  try {
    const reader = createMBTilesReader(tileFile.httpUrl);
    if (!reader) {
      return null;
    }

    const supportsRanges = await supportsRangeRequests(tileFile.httpUrl);
    
    return {
      reader,
      url: tileFile.httpUrl,
      supportsRanges,
    };
  } catch (error) {
    console.error(`Failed to create HTTP tile access for ${tileFile.httpUrl}:`, error);
    return null;
  }
}

/**
 * Download a GCS file to local temp location for MBTiles access
 */
export async function downloadTileFile(
  tileFile: TileFile,
): Promise<DownloadResult> {
  if (tileFile.isLocal) {
    // Treat local files as cache hits for telemetry purposes
    return { path: tileFile.path, isTemp: false, cacheStatus: 'hit' };
  }

  // For GCS files, download to a stable cached location to enable reuse across requests
  const gcsPath = tileFile.path.replace('gs://', '');
  const [bucketName, ...filePathParts] = gcsPath.split('/');
  const filename = filePathParts.join('/');

  try {
    const storageClient = getStorageClient();
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(filename);

    // Cache dir: persistent disk in production, /tmp in development
    const cacheRoot =
      process.env.TILE_CACHE_DIR || path.join('/tmp', 'humans-tiles-cache');
    const cachePath = path.join(cacheRoot, bucketName, path.dirname(filename));
    const finalPath = path.join(cacheRoot, bucketName, filename);

    // Ensure cache directory exists
    fs.mkdirSync(cachePath, { recursive: true });

    // If cached file exists and is up-to-date (based on metadata mtime), reuse it
    try {
      const st = fs.statSync(finalPath);
      if (tileFile.mtime && st.mtime >= tileFile.mtime) {
        return { path: finalPath, isTemp: false, cacheStatus: 'hit' };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'file not found';
      console.log(`Cache miss for ${finalPath}:`, message);
    }

    // Download to a temporary path, then move atomically into place
    const tmpDownload = path.join(cachePath, `${Date.now()}.download`);
    await file.download({ destination: tmpDownload });

    // Move into place (overwrite if exists)
    try {
      fs.renameSync(tmpDownload, finalPath);
    } catch {
      // If cross-device or rename fails, copy then unlink
      fs.copyFileSync(tmpDownload, finalPath);
      try {
        fs.unlinkSync(tmpDownload);
      } catch {
        /* ignore */
      }
    }

    // Align mtime with remote metadata when available for caching logic
    if (tileFile.mtime) {
      try {
        fs.utimesSync(finalPath, new Date(), tileFile.mtime);
      } catch {
        /* ignore */
      }
    }

    return { path: finalPath, isTemp: false, cacheStatus: 'refresh' };
  } catch (error) {
    throw new Error(`Failed to download tile file from GCS: ${error}`);
  }
}

/**
 * Clean up temporary files
 */
export function cleanupTempFile(filePath: string): void {
  // Only remove ephemeral temp files. Cached files are stable paths under
  // /tmp/humans-tiles-cache/... and should not be deleted per request.
  const isEphemeral =
    filePath.startsWith('/tmp/') && filePath.includes('.download');
  if (isEphemeral) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
