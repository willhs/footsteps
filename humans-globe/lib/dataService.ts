import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { createGunzip } from 'zlib';

// Legacy GCS support removed. This file is retained only for reference for the deprecated NDJSON pipeline.
// Any attempt to use GCS helpers will throw.
function getStorageClient(): never {
  throw new Error('GCS access has been removed (legacy NDJSON pipeline deprecated).');
}

export interface DataFile {
  exists: boolean;
  path: string;
  isLocal: boolean;
}

/**
 * Determine the appropriate data file path based on environment
 */
export function getDataFilePath(year: number, lodLevel: number): DataFile {
  const filename = `dots_${year}_lod_${lodLevel}.ndjson.gz`;
  
  if (process.env.NODE_ENV === 'production' && process.env.GCS_BUCKET_NAME) {
    // Production: Use GCS bucket
    return {
      exists: true, // We'll check existence during streaming
      path: `gs://${process.env.GCS_BUCKET_NAME}/${filename}`,
      isLocal: false
    };
  } else {
    // Development: Use local filesystem
    const localPaths = [
      path.join(process.cwd(), '..', 'data', 'processed', filename),
      path.join(process.cwd(), 'data', 'processed', filename)
    ];
    
    for (const localPath of localPaths) {
      if (fs.existsSync(localPath)) {
        return {
          exists: true,
          path: localPath,
          isLocal: true
        };
      }
    }
    
    return {
      exists: false,
      path: localPaths[0], // Return first path for error messages
      isLocal: true
    };
  }
}

/**
 * Get fallback data file paths for when a specific LOD level doesn't exist
 */
export function getFallbackDataFiles(year: number, currentLodLevel: number): DataFile[] {
  const fallbacks: DataFile[] = [];
  
  // Try higher detail levels first (3 -> 2 -> 1 -> 0)
  for (let lod = 3; lod >= 0; lod--) {
    if (lod !== currentLodLevel) {
      const dataFile = getDataFilePath(year, lod);
      fallbacks.push(dataFile);
    }
  }
  
  // Also try legacy format without LOD
  const legacyFilename = `dots_${year}.ndjson.gz`;
  if (process.env.NODE_ENV === 'production' && process.env.GCS_BUCKET_NAME) {
    fallbacks.push({
      exists: true,
      path: `gs://${process.env.GCS_BUCKET_NAME}/${legacyFilename}`,
      isLocal: false
    });
  } else {
    const legacyPaths = [
      path.join(process.cwd(), '..', 'data', 'processed', legacyFilename),
      path.join(process.cwd(), 'data', 'processed', legacyFilename)
    ];
    
    for (const legacyPath of legacyPaths) {
      if (fs.existsSync(legacyPath)) {
        fallbacks.push({
          exists: true,
          path: legacyPath,
          isLocal: true
        });
        break;
      }
    }
  }
  
  return fallbacks;
}

/**
 * Create a readable stream from either local file or GCS bucket
 */
export async function createDataStream(dataFile: DataFile): Promise<NodeJS.ReadableStream> {
  if (dataFile.isLocal) {
    // Local filesystem
    if (!dataFile.exists) {
      throw new Error(`Local file not found: ${dataFile.path}`);
    }
    return fs.createReadStream(dataFile.path).pipe(createGunzip());
  } else {
    // Google Cloud Storage
    // Explicitly disabled
    getStorageClient(); // will throw
    throw new Error('Unreachable');
  }
}

/**
 * Get file stats (for caching/etag purposes)
 */
export async function getDataFileStats(dataFile: DataFile): Promise<{ size: number; mtime: Date } | null> {
  if (dataFile.isLocal) {
    if (!dataFile.exists) return null;
    
    try {
      const stats = fs.statSync(dataFile.path);
      return {
        size: stats.size,
        mtime: stats.mtime
      };
    } catch {
      return null;
    }
  } else {
    // For GCS, we'll use a simplified approach
    // In production, you might want to get actual file metadata
    getStorageClient(); // will throw
    return {
      size: 0,
      mtime: new Date(),
    };
  }
}

/**
 * Create readline interface for line-by-line processing
 */
export async function createDataReader(dataFile: DataFile): Promise<readline.Interface> {
  const stream = await createDataStream(dataFile);
  
  return readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });
}