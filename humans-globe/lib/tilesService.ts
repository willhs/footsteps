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
  const perLodFilename = `humans_${year}_lod_${lodLevel}.mbtiles`;
  const yearlyFilename = `humans_${year}.mbtiles`;
  
  if (process.env.NODE_ENV === 'production' && process.env.GCS_BUCKET_NAME) {
    // Production: Try GCS bucket
    const bucketName = process.env.GCS_BUCKET_NAME;
    
    // Try per-LOD file first
    const tileFile = await checkGCSFile(bucketName, perLodFilename);
    if (tileFile.exists) return tileFile;
    
    // Fallback to yearly file
    return await checkGCSFile(bucketName, yearlyFilename);
  } else {
    // Development: Use local filesystem
    const tilesDir = getTilesDir();
    
    // Try per-LOD file first
    const perLodPath = path.join(tilesDir, perLodFilename);
    const tileFile = checkLocalFile(perLodPath);
    if (tileFile.exists) return tileFile;
    
    // Fallback to yearly file
    const yearlyPath = path.join(tilesDir, yearlyFilename);
    return checkLocalFile(yearlyPath);
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
export async function downloadTileFile(tileFile: TileFile): Promise<string> {
  if (tileFile.isLocal) {
    return tileFile.path;
  }
  
  // For GCS files, download to a temporary location
  const gcsPath = tileFile.path.replace('gs://', '');
  const [bucketName, ...filePathParts] = gcsPath.split('/');
  const filename = filePathParts.join('/');
  
  try {
    const storageClient = getStorageClient();
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(filename);
    
    // Create temp file path
    const tmpDir = '/tmp';
    const localPath = path.join(tmpDir, `${Date.now()}-${path.basename(filename)}`);
    
    // Download file
    await file.download({ destination: localPath });
    
    return localPath;
  } catch (error) {
    throw new Error(`Failed to download tile file from GCS: ${error}`);
  }
}

/**
 * Clean up temporary files
 */
export function cleanupTempFile(filePath: string): void {
  if (filePath.startsWith('/tmp/') && !filePath.includes('..')) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}