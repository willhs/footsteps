# Cache Warmer

Pre-warms the persistent disk cache with all MBTiles files from Google Cloud Storage, eliminating cold start delays for users.

## Overview

The cache warmer is a Cloud Run Job that downloads all tile files (`humans_*.mbtiles`) from the GCS bucket to the persistent disk cache. This ensures that all historical years are instantly accessible without the ~30 second download delay on first access.

## Architecture

- **Cloud Run Job**: Containerized Node.js application
- **Persistent Disk**: Shared 20GB disk mounted at `/data/tiles/humans`
- **Parallel Downloads**: Configurable concurrency (default: 3 concurrent downloads)
- **Post-Deployment**: Automatically triggered after successful app deployment

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GCP_PROJECT_ID` | `footsteps-earth` | Google Cloud Project ID |
| `GCS_BUCKET_NAME` | `footsteps-earth-tiles` | Source bucket for tile files |
| `TILE_CACHE_DIR` | `/data/tiles/humans` | Target cache directory (persistent disk) |
| `CACHE_WARMING_CONCURRENCY` | `3` | Number of concurrent downloads |

### Terraform Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `enable_cache_warming` | `true` | Enable the cache warming job |
| `cache_warming_timeout` | `1800` | Job timeout in seconds (30 minutes) |

## Usage

### Automatic (Recommended)
Cache warming is triggered automatically after successful deployment:

```bash
cd iac/scripts
./deploy.sh  # Includes cache warming step
```

### Manual Execution
To manually trigger cache warming:

```bash
# Get the job name from Terraform outputs
terraform output cache_warmer_job_name

# Execute the job
gcloud run jobs execute footsteps-time-app-cache-warmer --region us-central1 --wait
```

### Skip Cache Warming
To deploy without cache warming (faster deployment, but users will experience cold starts):

```bash
./deploy.sh --skip-cache-warming
```

## Monitoring

### Job Logs
View cache warming progress:

```bash
# Real-time logs during execution
gcloud run jobs execute footsteps-time-app-cache-warmer --region us-central1 --wait

# Historical logs
gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="footsteps-time-app-cache-warmer"' --limit=50
```

### Expected Output
```
🔥 Starting cache warming process...
📁 Cache directory: /data/tiles/humans
🪣 GCS bucket: gs://footsteps-earth-tiles
⚡ Max concurrent downloads: 3
🔍 Scanning bucket gs://footsteps-earth-tiles for tile files...
📦 Found 21 tile files to cache
📊 Total size: 12.0GB
🚀 Starting downloads with max 3 concurrent requests
⬇️  Downloading humans_-10000.mbtiles (484MB)...
⬇️  Downloading humans_-9000.mbtiles (526MB)...
⬇️  Downloading humans_-8000.mbtiles (562MB)...
✅ humans_-10000.mbtiles downloaded in 45.2s (10.7MB/s)
...
📊 Cache warming summary:
  ✅ Successful: 21/21
  💾 Already cached: 0
  ⬇️  Downloaded: 21
  ❌ Failed: 0
  ⏱️  Total time: 687.3s
🎉 Cache warming completed successfully!
```

## Performance

### Timing
- **Full cache warming**: ~10-15 minutes (12GB download)
- **Incremental warming**: ~1-3 minutes (only new/changed files)
- **Concurrent downloads**: 3 parallel streams for optimal throughput

### Storage
- **Cache size**: ~12GB (all 21 yearly tile files)
- **Disk utilization**: ~60% of 20GB persistent disk
- **File structure**: `/data/tiles/humans/humans_{year}.mbtiles`

### User Experience After Warming
- **All years**: ~10ms response time (direct disk access)
- **No cold starts**: Instant access to any historical period
- **Consistent performance**: Same speed for 10,000 BCE as 1000 CE

## Troubleshooting

### Common Issues

1. **Job timeout**: Increase `cache_warming_timeout` for slower networks
2. **Disk full**: Increase `cache_disk_size_gb` if more data is added
3. **Permission errors**: Check service account has `storage.objectViewer` role
4. **Network issues**: Job will retry failed downloads automatically

### Debugging
```bash
# Check disk usage
gcloud compute ssh --zone=us-central1-a footsteps-time-app-tile-cache
df -h /data

# List cached files
ls -la /data/tiles/humans/

# Check job status
gcloud run jobs describe footsteps-time-app-cache-warmer --region us-central1
```

## Cost Analysis

- **Job execution**: ~$0.01 per warming (15 minutes × small instance)
- **Storage cost**: $0.80/month for 20GB persistent disk
- **Network egress**: Free (internal GCS → Cloud Run transfer)
- **Total impact**: <$1/month additional cost for instant user experience

## Development

### Local Testing
```bash
cd cache-warmer
npm install

# Set environment variables
export GCS_BUCKET_NAME="footsteps-earth-tiles"
export TILE_CACHE_DIR="./local-cache"
export CACHE_WARMING_CONCURRENCY="2"

# Run cache warmer
npm start
```

### Building Container
```bash
cd cache-warmer
gcloud builds submit --tag gcr.io/footsteps-earth/footsteps-time-app-cache-warmer .
```