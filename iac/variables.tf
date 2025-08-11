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