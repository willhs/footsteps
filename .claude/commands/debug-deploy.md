Check why the latest deployment (via github workflow & terraform) didn't work and attempt to fix it.

Follow this diagnostic workflow:

1. **Check terraform configuration**:
   - Run `cd iac && terraform validate` to check for syntax errors
   - Run `terraform fmt -check` to check formatting
   - Run `terraform plan` to see what changes are needed

2. **Check Google Cloud authentication**:
   - Verify `gcloud auth list` shows active account
   - Verify `gcloud config get-value project` matches the project in terraform.tfvars

3. **Check Cloud Run service status**:
   - Run `gcloud run services list --region=us-central1` to see if service exists
   - If service exists, check `gcloud run services describe footsteps-time-app --region=us-central1`

4. **Check recent deployment logs**:
   - Check Cloud Build logs: `gcloud builds list --limit=5`
   - Check Cloud Run logs: `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=footsteps-time-app" --limit=10 --freshness=1h`

5. **Test API endpoints** (if service is running):
   - Get service URL from Cloud Run console or gcloud
   - Test health endpoint: `curl -sf <SERVICE_URL>`
   - Test tiles API: `curl -sf <SERVICE_URL>/api/tiles/0/single/2/1/1`

6. **Common fixes to try**:
   - Infrastructure issues: `cd iac && terraform apply`
   - Authentication issues: `gcloud auth login && gcloud config set project footsteps-earth`
   - Redeploy service: `cd iac/scripts && ./deploy.sh`
   - Manual cache warming: `gcloud run jobs execute footsteps-time-app-cache-warmer --region=us-central1`

7. **Use the diagnostic script**: 
   - Run `cd iac/scripts && ./debug-deploy.sh` for automated diagnosis

Focus on identifying the root cause first, then suggest the most targeted fix.
