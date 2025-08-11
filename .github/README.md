# GitHub Actions CI/CD Setup

This repository uses GitHub Actions to automatically deploy the Footsteps of Time application to Google Cloud Run whenever code is pushed to the main branch.

## 🚀 Features

- **Automatic Deployment**: Deploys on every push to main branch
- **Zero Downtime**: Uses Cloud Run's rolling deployments
- **Security First**: Uses OIDC authentication (no long-lived keys)
- **Cost Optimized**: FREE for public repositories
- **Fast Builds**: ~3-5 minutes with caching
- **Health Checks**: Automatically verifies deployment success

## 📋 One-Time Setup Required

### 1. Configure GitHub Repository Secrets

Go to your repository → Settings → Secrets and variables → Actions, then add these secrets:

**Secret 1**: `WORKLOAD_IDENTITY_PROVIDER`
```
projects/footsteps-earth/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider
```

**Secret 2**: `SERVICE_ACCOUNT_EMAIL`
```
github-actions-ci-cd@footsteps-earth.iam.gserviceaccount.com
```

### 2. Verify Setup

1. Make a small change to any file in `humans-globe/`
2. Push to main branch
3. Check the Actions tab in GitHub to see the deployment progress

## 🔧 How It Works

### Trigger Conditions
The workflow runs when:
- Code is pushed to the `main` branch
- Changes are made to files in `humans-globe/` directory
- GitHub Actions workflow files are modified

### Build Process
1. **Setup**: Install Node.js, pnpm, and dependencies
2. **Build**: Compile Next.js application 
3. **Docker**: Build image using Google Cloud Build
4. **Deploy**: Deploy to Cloud Run with zero downtime
5. **Verify**: Run health checks on the deployed service

### Security
- Uses Google Cloud Workload Identity Federation
- No long-lived service account keys stored in GitHub
- Restricted to specific repository and branch
- Minimal required GCP permissions

## 📊 Monitoring

### Deployment Status
- Check the **Actions** tab in GitHub for real-time deployment status
- Each deployment shows detailed logs and any errors
- Failed deployments automatically roll back

### Application Logs
- View logs in [Google Cloud Console](https://console.cloud.google.com/run/detail/us-central1/footsteps-time-app/logs?project=footsteps-earth)
- Monitor performance and errors in Cloud Run

### Service URL
- Production: https://footsteps-time-app-621676942682.us-central1.run.app
- Updated automatically after each deployment

## 🛠️ Local Development

For local development, the workflow only affects the main branch. Your local development remains unchanged:

```bash
cd humans-globe
pnpm install
pnpm dev  # Runs on http://localhost:4444
```

## 🚨 Troubleshooting

### Common Issues

**Build Fails**: Check the Actions tab for detailed error logs
- Usually Node.js version or dependency issues
- Check if package.json changes need updates

**Deployment Fails**: Verify GCP permissions and service status
- Check Cloud Run service in Google Cloud Console
- Verify service account has required permissions

**Health Check Fails**: Application not responding correctly
- Check application logs in Cloud Run
- Verify tiles API is working properly

### Manual Override

If needed, you can still deploy manually:
```bash
cd iac
terraform output gcloud_build_command
# Run the output command
```

## 💰 Cost

- **GitHub Actions**: FREE (public repository)
- **Google Cloud Build**: ~$1-2/month (minimal usage)
- **Cloud Run**: Existing cost (no additional charges)

Total additional cost: **~$1-2/month**

## 🔄 Updating the Workflow

To modify the deployment process:
1. Edit `.github/workflows/deploy.yml`
2. Test changes in a feature branch first
3. The workflow will automatically update when merged to main

---

🎉 **That's it!** Your CI/CD pipeline is ready. Every push to main will automatically deploy your changes to production!