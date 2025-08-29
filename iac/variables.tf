variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "footsteps-earth"
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "bucket_name" {
  description = "Name of the GCS bucket for MBTiles storage"
  type        = string
  default     = "footsteps-earth-tiles"
}

variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
  default     = "footsteps-time-app"
}

variable "container_image" {
  description = "Container image URL"
  type        = string
  default     = "gcr.io/footsteps-earth/footsteps-time-app:latest"
}

variable "service_account_name" {
  description = "Name for the service account"
  type        = string
  default     = "footsteps-app-service-account"
}

variable "min_instances" {
  description = "Minimum number of instances (0 for cost optimization)"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 100
}

variable "container_concurrency" {
  description = "Maximum concurrent requests per container instance"
  type        = number
  default     = 80
}

variable "cpu_limit" {
  description = "CPU limit for Cloud Run service"
  type        = string
  default     = "2000m"
}

variable "memory_limit" {
  description = "Memory limit for Cloud Run service"
  type        = string
  default     = "2Gi"
}

variable "timeout_seconds" {
  description = "Request timeout in seconds"
  type        = number
  default     = 300
}

variable "bucket_location" {
  description = "Location for GCS bucket (multi-region)"
  type        = string
  default     = "US"
}

variable "enable_persistent_cache" {
  description = "Enable persistent disk for tile caching (recommended for production)"
  type        = bool
  default     = true
}

variable "cache_disk_size_gb" {
  description = "Size of persistent disk for tile cache in GB"
  type        = number
  default     = 20
}

## Cache warmer variables removed (deprecated)

# Cloudflare (optional)
variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS + Workers permissions"
  type        = string
  default     = null
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID"
  type        = string
  default     = null
}

variable "cloudflare_zone_name" {
  description = "Cloudflare Zone name (example.com)"
  type        = string
  default     = null
}

variable "cloudflare_tiles_hostname" {
  description = "Hostname to serve PMTiles via Cloudflare (default pmtiles.<zone_name>)"
  type        = string
  default     = ""
}
