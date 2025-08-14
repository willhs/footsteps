import fs from 'fs';
import path from 'path';
import { Storage } from '@google-cloud/storage';

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

export interface TileFile {
  exists: boolean;
  path: string;
  isLocal: boolean;
  size?: number;
  mtime?: Date;
}

export interface DownloadResult {
  path: string;
  isTemp: boolean;
  cacheStatus: 'hit' | 'refresh';
}

/**
 * Get the tiles directory path based on environment
 */
export function getTilesDir(): string {
  // Allow override via env; default to repo-level data/tiles/humans
  const fromEnv = process.env.HUMANS_TILES_DIR;
  if (fromEnv) return fromEnv;
  return path.resolve(process.cwd(), '..', 'data', 'tiles', 'humans');
}

/**
 * Determine the appropriate tile file path based on environment
 */
export async function getTileFilePath(year: number, lodLevel: number): Promise<TileFile> {
  // Single canonical format: combined per-year MBTiles
  const yearlyFilename = `humans_${year}.mbtiles`;
  
  if (process.env.NODE_ENV === 'production' && process.env.GCS_BUCKET_NAME) {
    // Production: Try GCS bucket
    const bucketName = process.env.GCS_BUCKET_NAME;
    
    // Use combined per-year MBTiles only
    return await checkGCSFile(bucketName, yearlyFilename);
  } else {
    // Development: Use local filesystem
    const tilesDir = getTilesDir();
    
    // Use combined per-year MBTiles only
    const yearlyPath = path.join(tilesDir, yearlyFilename);
    return checkLocalFile(yearlyPath);
  }
}

/**
 * Resolve LOD-specific tileset file path (humans_{year}_lod_{lod}.mbtiles)
 * Used as a fallback when the combined per-year MBTiles is missing certain tiles.
 */
export async function getLodTileFilePath(year: number, lodLevel: number): Promise<TileFile> {
  const lodFilename = `humans_${year}_lod_${lodLevel}.mbtiles`;

  if (process.env.NODE_ENV === 'production' && process.env.GCS_BUCKET_NAME) {
    const bucketName = process.env.GCS_BUCKET_NAME;
    return await checkGCSFile(bucketName, lodFilename);
  } else {
    const tilesDir = getTilesDir();
    const lodPath = path.join(tilesDir, lodFilename);
    return checkLocalFile(lodPath);
  }
}

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
      mtime: stats.mtime
    };
  } catch {
    return {
      exists: false,
      path: filePath,
      isLocal: true
    };
  }
}

/**
 * Check if a GCS file exists and get its metadata
 */
async function checkGCSFile(bucketName: string, filename: string): Promise<TileFile> {
  try {
    const storageClient = getStorageClient();
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(filename);
    
    const [exists] = await file.exists();
    if (!exists) {
      return {
        exists: false,
        path: `gs://${bucketName}/${filename}`,
        isLocal: false
      };
    }
    
    const [metadata] = await file.getMetadata();
    return {
      exists: true,
      path: `gs://${bucketName}/${filename}`,
      isLocal: false,
      size: parseInt(String(metadata.size ?? '0'), 10),
      mtime: new Date(metadata.updated || metadata.timeCreated || Date.now())
    };
  } catch {
    return {
      exists: false,
      path: `gs://${bucketName}/${filename}`,
      isLocal: false
    };
  }
}

/**
 * Download a GCS file to local temp location for MBTiles access
 */
export async function downloadTileFile(tileFile: TileFile): Promise<DownloadResult> {
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

    // Cache dir can be overridden; default to /tmp cache
    const cacheRoot = process.env.TILE_CACHE_DIR || path.join('/tmp', 'humans-tiles-cache');
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
    } catch {
      // cache miss or unreadable; proceed to download
    }

    // Download to a temporary path, then move atomically into place
    const tmpDownload = path.join(cachePath, `${Date.now()}.download`);
    await file.download({ destination: tmpDownload });

    // Move into place (overwrite if exists)
    try {
      fs.renameSync(tmpDownload, finalPath);
    } catch (e) {
      // If cross-device or rename fails, copy then unlink
      fs.copyFileSync(tmpDownload, finalPath);
      try { fs.unlinkSync(tmpDownload); } catch { /* ignore */ }
    }

    // Align mtime with remote metadata when available for caching logic
    if (tileFile.mtime) {
      try { fs.utimesSync(finalPath, new Date(), tileFile.mtime); } catch { /* ignore */ }
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
  const isEphemeral = filePath.startsWith('/tmp/') && filePath.includes('.download');
  if (isEphemeral) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
