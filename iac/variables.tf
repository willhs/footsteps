variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "footsteps-earth"
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "australia-southeast1"
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

## Persistent cache variables removed

## Cache warmer variables removed (deprecated)

# Feature flags
variable "enable_cloudflare" {
  description = "Enable Cloudflare PMTiles proxy module (requires Cloudflare variables)"
  type        = bool
  default     = false
}

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

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID (required for Workers)"
  type        = string
  default     = null
}

# Custom domain mapping for Cloud Run (optional)
variable "enable_custom_domain" {
  description = "Create a Cloud Run custom domain mapping for the app"
  type        = bool
  default     = true
}

variable "app_domain_name" {
  description = "Fully-qualified domain name for the app (e.g., footsteps.willhs.me)"
  type        = string
  default     = null
}

# Optional runtime env overrides
// Note: runtime env overrides removed; configure app env via deploy pipeline instead
