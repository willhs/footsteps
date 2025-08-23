/**
 * HTTP Range-based MBTiles reader for accessing remote SQLite files efficiently
 * without downloading the entire file.
 * 
 * This implementation uses a simplified approach with basic HTTP range requests
 * to avoid complex WASM dependencies while still providing efficient tile access.
 */

// Re-export the simple implementation
export { 
  SimpleMBTilesReader as HTTPRangeMBTilesReader,
  createSimpleMBTilesReader as createMBTilesReader,
  supportsRangeRequests,
  clearTileCache,
  getCacheStats
} from './simpleMbtilesReader';