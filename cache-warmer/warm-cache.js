#!/usr/bin/env node

/**
 * Cache Warmer for Footsteps of Time
 * Pre-downloads all MBTiles files from GCS to persistent disk cache
 */

const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');

// Configuration from environment variables
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'footsteps-earth';
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'footsteps-earth-tiles';
const CACHE_DIR = process.env.TILE_CACHE_DIR || '/data/tiles/humans';
const MAX_CONCURRENT = parseInt(process.env.CACHE_WARMING_CONCURRENCY || '3');

// Initialize Google Cloud Storage
const storage = new Storage({ projectId: PROJECT_ID });
const bucket = storage.bucket(BUCKET_NAME);

/**
 * Get list of all combined yearly MBTiles files from GCS
 */
async function getTileFilesList() {
  console.log(`🔍 Scanning bucket gs://${BUCKET_NAME} for tile files...`);
  
  try {
    const [files] = await bucket.getFiles({
      prefix: 'humans_',
      delimiter: '/'
    });
    
    // Filter to only combined yearly files (exclude LOD-specific files)
    const tileFiles = files
      .filter(file => file.name.endsWith('.mbtiles'))
      .filter(file => !file.name.includes('_lod_'))
      .map(file => ({
        name: file.name,
        size: parseInt(file.metadata.size || '0'),
        remotePath: `gs://${BUCKET_NAME}/${file.name}`,
        localPath: path.join(CACHE_DIR, file.name)
      }));
    
    console.log(`📦 Found ${tileFiles.length} tile files to cache`);
    
    // Log file sizes
    const totalSize = tileFiles.reduce((sum, file) => sum + file.size, 0);
    const totalSizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(1);
    console.log(`📊 Total size: ${totalSizeGB}GB`);
    
    return tileFiles;
  } catch (error) {
    console.error('❌ Failed to list files from GCS:', error.message);
    process.exit(1);
  }
}

/**
 * Check if a file already exists and is up-to-date
 */
async function isFileCached(localPath, expectedSize) {
  try {
    const stats = await fs.promises.stat(localPath);
    const sizesMatch = stats.size === expectedSize;
    
    if (sizesMatch) {
      console.log(`✅ ${path.basename(localPath)} already cached`);
      return true;
    } else {
      console.log(`⚠️  ${path.basename(localPath)} exists but size mismatch (${stats.size} vs ${expectedSize})`);
      return false;
    }
  } catch (error) {
    // File doesn't exist
    return false;
  }
}

/**
 * Download a single tile file with progress tracking
 */
async function downloadTileFile(tileFile) {
  const { name, size, remotePath, localPath } = tileFile;
  const fileName = path.basename(name);
  
  // Check if already cached
  if (await isFileCached(localPath, size)) {
    return { success: true, cached: true };
  }
  
  console.log(`⬇️  Downloading ${fileName} (${(size / (1024 * 1024)).toFixed(0)}MB)...`);
  
  try {
    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
    
    // Download file
    const file = bucket.file(name);
    const startTime = Date.now();
    
    await file.download({ destination: localPath });
    
    // Verify download
    const stats = await fs.promises.stat(localPath);
    if (stats.size !== size) {
      throw new Error(`Size mismatch: expected ${size}, got ${stats.size}`);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const speed = (size / (1024 * 1024) / (duration || 1)).toFixed(1);
    console.log(`✅ ${fileName} downloaded in ${duration}s (${speed}MB/s)`);
    
    return { success: true, cached: false, duration: parseFloat(duration) };
  } catch (error) {
    console.error(`❌ Failed to download ${fileName}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Download files with controlled concurrency
 */
async function downloadWithConcurrency(tileFiles, maxConcurrent) {
  const results = [];
  const queue = [...tileFiles];
  const inProgress = new Set();
  
  console.log(`🚀 Starting downloads with max ${maxConcurrent} concurrent requests`);
  
  return new Promise((resolve) => {
    function processNext() {
      // Start new downloads if queue has items and we're under limit
      while (queue.length > 0 && inProgress.size < maxConcurrent) {
        const tileFile = queue.shift();
        const downloadPromise = downloadTileFile(tileFile);
        
        inProgress.add(downloadPromise);
        
        downloadPromise.then((result) => {
          results.push({ ...tileFile, ...result });
          inProgress.delete(downloadPromise);
          
          // Process next file
          processNext();
          
          // Check if we're done
          if (queue.length === 0 && inProgress.size === 0) {
            resolve(results);
          }
        });
      }
    }
    
    processNext();
  });
}

/**
 * Main cache warming function
 */
async function warmCache() {
  console.log('🔥 Starting cache warming process...');
  console.log(`📁 Cache directory: ${CACHE_DIR}`);
  console.log(`🪣 GCS bucket: gs://${BUCKET_NAME}`);
  console.log(`⚡ Max concurrent downloads: ${MAX_CONCURRENT}`);
  
  const startTime = Date.now();
  
  try {
    // Ensure cache directory exists
    await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    
    // Get list of files to cache
    const tileFiles = await getTileFilesList();
    
    if (tileFiles.length === 0) {
      console.log('⚠️  No tile files found to cache');
      return;
    }
    
    // Download files with concurrency control
    const results = await downloadWithConcurrency(tileFiles, MAX_CONCURRENT);
    
    // Report results
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const successful = results.filter(r => r.success).length;
    const cached = results.filter(r => r.cached).length;
    const downloaded = results.filter(r => r.success && !r.cached).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log('');
    console.log('📊 Cache warming summary:');
    console.log(`  ✅ Successful: ${successful}/${results.length}`);
    console.log(`  💾 Already cached: ${cached}`);
    console.log(`  ⬇️  Downloaded: ${downloaded}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  ⏱️  Total time: ${totalTime}s`);
    
    if (failed > 0) {
      console.log('');
      console.log('❌ Failed downloads:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
      process.exit(1);
    }
    
    console.log('');
    console.log('🎉 Cache warming completed successfully!');
    console.log('🚀 All tile files are now cached and ready for instant access');
    
  } catch (error) {
    console.error('💥 Cache warming failed:', error.message);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Cache warming interrupted');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Cache warming terminated');
  process.exit(1);
});

// Run the cache warming
if (require.main === module) {
  warmCache().catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { warmCache };