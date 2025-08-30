output "bucket_name" {
  description = "Name of the created GCS bucket"
  value       = google_storage_bucket.data_bucket.name
}

output "bucket_url" {
  description = "URL of the created GCS bucket"
  value       = google_storage_bucket.data_bucket.url
}

output "bucket_self_link" {
  description = "Self link of the created GCS bucket"
  value       = google_storage_bucket.data_bucket.self_link
}

output "cloud_run_url" {
  description = "URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.app.uri
}

output "cloud_run_service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_v2_service.app.name
}

output "service_account_email" {
  description = "Email of the created service account"
  value       = google_service_account.app_service_account.email
}

output "project_id" {
  description = "GCP Project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP region"
  value       = var.region
}

# Tiles upload command helper
output "gcloud_upload_command" {
  description = "Command to upload MBTiles files to the bucket"
  value       = "gsutil -m rsync -r ../data/tiles/humans/ gs://${google_storage_bucket.data_bucket.name}/"
}

# Build and deploy command helper
output "gcloud_build_command" {
  description = "Command to build and deploy the application"
  value       = "gcloud builds submit --tag ${var.container_image} ../footsteps-web && gcloud run deploy ${google_cloud_run_v2_service.app.name} --image ${var.container_image} --region ${var.region}"
}

# GitHub Actions CI/CD Configuration
output "github_actions_service_account" {
  description = "Email of the GitHub Actions service account for CI/CD"
  value       = google_service_account.github_actions.email
}

output "workload_identity_provider" {
  description = "Workload Identity Provider for GitHub Actions OIDC authentication"
  value       = "projects/${var.project_id}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github_actions_pool.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github_actions_provider.workload_identity_pool_provider_id}"
}

output "github_secrets_setup" {
  description = "Instructions for setting up GitHub repository secrets"
  value       = <<-EOT
    Configure these GitHub repository secrets:
    
    Name: WORKLOAD_IDENTITY_PROVIDER
    Value: projects/${var.project_id}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github_actions_pool.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github_actions_provider.workload_identity_pool_provider_id}
    
    Name: SERVICE_ACCOUNT_EMAIL  
    Value: ${google_service_account.github_actions.email}
  EOT
}

# Persistent disk cache outputs
output "persistent_cache_enabled" {
  description = "Whether persistent disk cache is enabled"
  value       = var.enable_persistent_cache
}

output "cache_disk_name" {
  description = "Name of the persistent disk for tile cache"
  value       = var.enable_persistent_cache ? google_compute_disk.tile_cache_disk[0].name : null
}

output "cache_disk_size" {
  description = "Size of the persistent disk cache in GB"
  value       = var.enable_persistent_cache ? "${var.cache_disk_size_gb}GB" : "N/A"
}

output "cache_disk_cost_estimate" {
  description = "Estimated monthly cost for persistent disk cache (USD)"
  value       = var.enable_persistent_cache ? "$${var.cache_disk_size_gb * 0.040}" : "$0"
}

## Cache warmer outputs removed (deprecated)

output "pmtiles_cdn_hostname" {
  description = "Cloudflare PMTiles hostname (temporary cleanup - will be disabled)"
  value       = try(module.cloudflare_pmtiles.pmtiles_hostname, null)
}
