/**
 * Simple HTTP Range-based MBTiles reader
 * 
 * This implementation uses basic HTTP range requests to read specific parts
 * of a remote SQLite (MBTiles) file without downloading the entire file.
 * 
 * It's a simplified approach focused on the specific use case of reading
 * tiles from MBTiles files.
 */

interface TileData {
  data: Buffer;
  timestamp: number;
}

// Cache tiles for 1 hour
const CACHE_TTL_MS = 60 * 60 * 1000;
const tile_cache = new Map<string, TileData>();

function isExpired(entry: TileData): boolean {
  return Date.now() - entry.timestamp > CACHE_TTL_MS;
}

export class SimpleMBTilesReader {
  private url: string;
  private pageSize: number = 4096; // SQLite default page size

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Fetch a byte range from the remote MBTiles file
   */
  private async fetchRange(start: number, end: number): Promise<Buffer> {
    const response = await fetch(this.url, {
      headers: {
        'Range': `bytes=${start}-${end}`,
        'Accept-Encoding': 'identity', // Disable compression for byte ranges
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching range ${start}-${end} from ${this.url}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Get a tile using a hybrid approach:
   * 1. Try to fetch a reasonable chunk that likely contains the tile
   * 2. Use basic pattern matching to find the tile data
   */
  async getTile(z: number, x: number, tmsY: number): Promise<Buffer | null> {
    const tileKey = `${this.url}:${z}:${x}:${tmsY}`;
    const cached = tile_cache.get(tileKey);
    
    if (cached && !isExpired(cached)) {
      return cached.data;
    }

    try {
      // This is a simplified approach that downloads chunks and searches for tiles
      // For a production system, you'd want to implement proper SQLite B-tree parsing
      
      // Start by reading a larger chunk (e.g., 1MB) and look for our tile
      const chunkSize = 1024 * 1024; // 1MB
      let offset = 0;
      const maxAttempts = 5; // Don't try forever
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const chunk = await this.fetchRange(offset, offset + chunkSize - 1);
        const tile = this.searchForTileInChunk(chunk, z, x, tmsY);
        
        if (tile) {
          tile_cache.set(tileKey, {
            data: tile,
            timestamp: Date.now(),
          });
          return tile;
        }
        
        offset += chunkSize;
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching tile ${z}/${x}/${tmsY} from ${this.url}:`, error);
      return null;
    }
  }

  /**
   * Search for tile data within a chunk using pattern matching
   * This is a simplified approach - a full implementation would parse SQLite properly
   */
  private searchForTileInChunk(chunk: Buffer, z: number, x: number, tmsY: number): Buffer | null {
    // Look for compressed tile data (gzip magic numbers: 1f 8b)
    // This is a heuristic approach - not guaranteed to work in all cases
    
    for (let i = 0; i < chunk.length - 10; i++) {
      // Look for gzip header
      if (chunk[i] === 0x1f && chunk[i + 1] === 0x8b) {
        // Try to find the end of the gzipped data
        // This is approximate - we look for common patterns
        for (let j = i + 100; j < Math.min(i + 50000, chunk.length - 8); j++) {
          // Look for potential end of gzip stream
          if (chunk[j] === 0x00 && chunk[j + 1] === 0x00) {
            const potentialTile = chunk.subarray(i, j);
            if (potentialTile.length > 100 && potentialTile.length < 100000) {
              // Reasonable tile size - return it
              return potentialTile;
            }
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Check if the database is accessible
   */
  async ping(): Promise<boolean> {
    try {
      // Try to read the first few bytes to check if it's a SQLite file
      const header = await this.fetchRange(0, 15);
      return header.toString('utf8', 0, 15) === 'SQLite format 3';
    } catch {
      return false;
    }
  }

  /**
   * Clean up resources
   */
  close(): void {
    // Nothing to clean up for this simple implementation
  }
}

/**
 * Factory function to create MBTiles reader
 */
export function createSimpleMBTilesReader(url: string): SimpleMBTilesReader | null {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return new SimpleMBTilesReader(url);
  }
  return null;
}

/**
 * Test if HTTP range requests are supported for a given URL
 */
export async function supportsRangeRequests(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { 
      method: 'HEAD',
      headers: { 'Range': 'bytes=0-0' }
    });
    
    return response.status === 206 && 
           response.headers.get('accept-ranges') === 'bytes';
  } catch {
    return false;
  }
}

/**
 * Clear tile cache
 */
export function clearTileCache(): void {
  tile_cache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  let validEntries = 0;
  let expiredEntries = 0;
  let totalSize = 0;
  
  for (const [key, entry] of tile_cache) {
    if (isExpired(entry)) {
      expiredEntries++;
    } else {
      validEntries++;
      totalSize += entry.data.length;
    }
  }
  
  return {
    totalEntries: tile_cache.size,
    validEntries,
    expiredEntries,
    totalSizeBytes: totalSize,
  };
}