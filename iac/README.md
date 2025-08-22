# Infrastructure as Code (IaC) for Footsteps of Time

This directory contains Terraform configuration and deployment scripts for hosting the Footsteps of Time application on Google Cloud Platform.

## Architecture

- **Cloud Run**: Serverless Next.js application with 0-100 instance scaling
- **Google Cloud Storage**: Data storage for ~1.1GB of MBTiles files containing vector tiles
- **Container Registry**: Docker image storage
- **Public CDN**: Global content delivery via Google Cloud CDN

## Prerequisites

1. **Google Cloud SDK**: Install and authenticate
   ```bash
   curl https://sdk.cloud.google.com | bash
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Terraform**: Install Terraform >= 1.0
   ```bash
   # macOS
   brew install terraform
   
   # Or download from https://terraform.io/downloads
   ```

3. **Project Setup**: Set your GCP project
   ```bash
   gcloud config set project footsteps-earth
   ```

## Quick Start

### 1. Initialize Infrastructure

```bash
# Copy and customize variables
cp terraform.tfvars.example terraform.tfvars

# Initialize Terraform
terraform init

# Review planned changes
terraform plan

# Create infrastructure
terraform apply
```

### 2. Deploy Application

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Full deployment (builds container + uploads data)
./scripts/deploy.sh

# Or deploy with options
./scripts/deploy.sh --skip-data    # Skip data upload
./scripts/deploy.sh --skip-build   # Use existing container
```

### 3. Upload Data Only

```bash
# Upload processed data files to GCS bucket
./scripts/upload-data.sh
```

## Configuration

### Terraform Variables

Edit `terraform.tfvars` to customize:

```hcl
project_id      = "footsteps-earth"
region         = "us-central1"
bucket_name    = "footsteps-earth-data"
service_name   = "footsteps-time-app"
min_instances  = 0  # Cost optimization
max_instances  = 100
cpu_limit      = "2000m"  # 2 vCPUs
memory_limit   = "2Gi"    # 2GB RAM
```

### Environment Modes

The application supports two modes:

#### Development Mode
- **Tiles Source**: Local filesystem (`../data/tiles/humans/`)
- **Environment**: `NODE_ENV=development`
- **Usage**: `pnpm dev` in `humans-globe/`
- **API**: Reads MBTiles directly from local files

#### Production Mode  
- **Tiles Source**: GCS bucket (`gs://footsteps-earth-tiles/`)
- **Environment**: `NODE_ENV=production`
- **Usage**: Cloud Run deployment
- **API**: Downloads MBTiles from GCS to `/tmp/` for access, with automatic cleanup

## Cost Optimization

### Current Configuration
- **Minimum Instances**: 0 (scales to zero when idle)
- **Auto-scaling**: 0-100 instances based on traffic
- **Pay-per-use**: Only charged when processing requests

### Estimated Monthly Costs
```
GCS Storage (1.1GB):     ~$0.017/month
GCS Egress:              ~$1-3/month (depending on traffic, tiles cached in /tmp)
Cloud Run:               $0 when idle + ~$0.24 per 100k requests
Total:                   ~$1-5/month for typical usage
```

## Development Workflow

### Local Development
```bash
cd ../footsteps-web
pnpm dev  # Uses local MBTiles files automatically from ../data/tiles/humans/
```

### Testing Production Build
```bash
cd ../footsteps-web
docker build -t footsteps-test .
docker run -p 8080:8080 -e NODE_ENV=production footsteps-test
```

### Updating Application
```bash
# Rebuild and deploy
./scripts/deploy.sh

# Deploy code changes only (skip tiles upload)
./scripts/deploy.sh --skip-data
```

## Monitoring and Logs

### View Logs
```bash
# Real-time logs
gcloud logs tail /projects/footsteps-earth/logs/run.googleapis.com%2Fstdout

# Historical logs  
gcloud logs read /projects/footsteps-earth/logs/run.googleapis.com%2Fstdout --limit 100
```

### Monitor Performance
- **Cloud Console**: [Cloud Run Console](https://console.cloud.google.com/run)
- **Metrics**: CPU, Memory, Request count, Response times
- **Alerts**: Set up alerting for errors or high latency

## Troubleshooting

### Common Issues

1. **Build Failures**
   ```bash
   # Check Cloud Build logs
   gcloud builds list --limit 5
   gcloud builds log BUILD_ID
   ```

2. **Service Won't Start**
   ```bash
   # Check Cloud Run logs
   gcloud logs tail /projects/footsteps-earth/logs/run.googleapis.com%2Fstdout
   ```

3. **Tiles Access Issues**
   ```bash
   # Verify bucket exists and has tiles
   gsutil ls gs://footsteps-earth-tiles/
   gsutil ls gs://footsteps-earth-tiles/*.mbtiles | wc -l
   ```

4. **Permission Issues**
   ```bash
   # Check IAM permissions
   gcloud projects get-iam-policy footsteps-earth
   ```

### Cleanup

To destroy all resources:
```bash
# This will delete ALL infrastructure (be careful!)
terraform destroy
```

## Security Notes

- **Service Account**: Application runs with minimal required permissions
- **Public Access**: GCS bucket allows public read access for data files
- **Authentication**: Cloud Run service allows unauthenticated requests (public app)
- **HTTPS**: All traffic encrypted in transit via Cloud Run's built-in SSL

## File Structure

```
iac/
├── main.tf                 # Main infrastructure resources
├── variables.tf            # Input variables
├── outputs.tf             # Resource outputs
├── versions.tf            # Provider configuration
├── terraform.tfvars.example  # Variable template
├── scripts/
│   ├── deploy.sh          # Complete deployment script
│   └── upload-data.sh     # Data upload script
└── README.md              # This file
```

## Next Steps

After successful deployment:

1. **Custom Domain**: Configure custom domain mapping in Cloud Run
2. **Monitoring**: Set up Cloud Monitoring alerts  
3. **CI/CD**: Integrate with GitHub Actions for automated deployments
4. **Performance**: Monitor and optimize based on actual usage patterns