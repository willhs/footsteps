# Enable required Google Cloud APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "run.googleapis.com",
    "storage.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "containerregistry.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com"
  ])

  project = var.project_id
  service = each.key

  disable_on_destroy = false
}

# Service Account for Cloud Run
resource "google_service_account" "app_service_account" {
  account_id   = var.service_account_name
  display_name = "Footsteps Time App Service Account"
  description  = "Service account for the Footsteps Time Cloud Run application"

  depends_on = [google_project_service.required_apis]
}

# GCS Bucket for data storage
resource "google_storage_bucket" "data_bucket" {
  name          = var.bucket_name
  location      = var.bucket_location
  force_destroy = false

  # Enable public access
  public_access_prevention = "inherited"

  # Enable versioning for data protection
  versioning {
    enabled = true
  }

  # Lifecycle management to reduce costs
  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }

  # CORS configuration for web access
  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.required_apis]
}

# Make bucket contents publicly readable
resource "google_storage_bucket_iam_member" "public_reader" {
  bucket = google_storage_bucket.data_bucket.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Grant the service account access to the bucket
resource "google_storage_bucket_iam_member" "app_bucket_access" {
  bucket = google_storage_bucket.data_bucket.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.app_service_account.email}"
}

# Allow Cloud Run job/service account to write objects (upload PBF tiles)
resource "google_storage_bucket_iam_member" "app_bucket_writer" {
  bucket = google_storage_bucket.data_bucket.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app_service_account.email}"
}

## Cache warmer job removed (deprecated)

# Cloud Run service
resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = var.region

  template {
    # Service account configuration
    service_account = google_service_account.app_service_account.email

    # Scaling configuration
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    max_instance_request_concurrency = var.container_concurrency

    containers {
      image = var.container_image

      # Resource limits
      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
        # CPU allocated during requests
        cpu_idle = true
        # Enable startup CPU boost for faster cold starts
        startup_cpu_boost = true
      }

      # Environment variables
      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      # GCS bucket config for API tile serving via byte-range requests
      env {
        name  = "GCS_TILES_BUCKET"
        value = google_storage_bucket.data_bucket.name
      }

      env {
        name  = "HUMANS_TILES_DIR"
        value = "/data/tiles/humans"
      }

      env {
        name  = "TILE_CACHE_DIR"
        value = "/data/tiles/humans"
      }

      # ENABLE_HTTP_RANGE no longer needed; HTTP range access is always attempted for remote MBTiles

      # Ports configuration
      ports {
        container_port = 8080
        name           = "http1"
      }

      # Startup and liveness probes
      startup_probe {
        http_get {
          path = "/"
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 5
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/"
        }
        initial_delay_seconds = 30
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3
      }

      # Note: Serving tiles via GCS and local ephemeral cache only
    }

    # Request timeout
    timeout = "${var.timeout_seconds}s"

    # Execution environment
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    # Persistent disks are not used; cache remains ephemeral inside the container
  }

  # Traffic configuration
  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [
    google_project_service.required_apis,
    google_service_account.app_service_account
  ]
}

# Make Cloud Run service publicly accessible
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Optional: Custom domain mapping (commented out)
# resource "google_cloud_run_domain_mapping" "app_domain" {
#   location = var.region
#   name     = "your-custom-domain.com"
# 
#   metadata {
#     namespace = var.project_id
#   }
# 
#   spec {
#     route_name = google_cloud_run_v2_service.app.name
#   }
# }

## Cloudflare PMTiles proxy (pmtiles.<zone>) — optional
module "cloudflare_pmtiles" {
  source = "./cloudflare"
  count  = var.enable_cloudflare ? 1 : 0

  zone_id        = var.cloudflare_zone_id
  zone_name      = var.cloudflare_zone_name
  tiles_hostname = var.cloudflare_tiles_hostname
  account_id     = var.cloudflare_account_id

  gcs_bucket     = google_storage_bucket.data_bucket.name
  pmtiles_prefix = "pmtiles"
}
