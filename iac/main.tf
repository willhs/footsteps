# Enable required Google Cloud APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "run.googleapis.com",
    "storage.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "containerregistry.googleapis.com",
    "iam.googleapis.com"
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

# Persistent disk for tile caching (optional)
resource "google_compute_disk" "tile_cache_disk" {
  count = var.enable_persistent_cache ? 1 : 0

  name = "${var.service_name}-tile-cache"
  type = "pd-standard" # Standard persistent disk (most cost-effective)
  zone = "${var.region}-a"
  size = var.cache_disk_size_gb

  # Labels for organization
  labels = {
    environment = "production"
    purpose     = "tile-cache"
    service     = var.service_name
  }

  depends_on = [google_project_service.required_apis]
}

# Cloud Run Job for cache warming
resource "google_cloud_run_v2_job" "cache_warmer" {
  count = var.enable_cache_warming && var.enable_persistent_cache ? 1 : 0

  name     = "${var.service_name}-cache-warmer"
  location = var.region

  template {
    template {
      # Use same service account as main app
      service_account = google_service_account.app_service_account.email

      # Task configuration
      max_retries = 3

      containers {
        image = "${var.container_image}-cache-warmer"

        # Resource limits for cache warming (increased for large file downloads)
        resources {
          limits = {
            cpu    = "2000m"
            memory = "4Gi"
          }
        }

        # Environment variables for cache warming
        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }

        env {
          name  = "GCS_BUCKET_NAME"
          value = google_storage_bucket.data_bucket.name
        }

        env {
          name  = "CACHE_WARMING_CONCURRENCY"
          value = "1"
        }

        # Note: Cache warming job downloads directly to GCS
        # Main service will cache from GCS to persistent disk
      }
    }
  }

  depends_on = [
    google_project_service.required_apis,
    google_service_account.app_service_account,
    google_compute_disk.tile_cache_disk
  ]
}

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

      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.data_bucket.name
      }

      # Tiles redirection config for API
      env {
        name  = "GCS_TILES_BUCKET"
        value = google_storage_bucket.data_bucket.name
      }
      env {
        name  = "TILES_BASE_URL"
        value = "https://storage.googleapis.com/${google_storage_bucket.data_bucket.name}/tiles/humans"
      }

      env {
        name  = "HUMANS_TILES_DIR"
        value = "/data/tiles/humans"
      }

      env {
        name  = "TILE_CACHE_DIR"
        value = "/data/tiles/humans"
      }

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

      # Note: Volume mounts disabled temporarily due to Cloud Run v2 syntax complexity
      # Will implement persistent disk mounting in future iteration
    }

    # Request timeout
    timeout = "${var.timeout_seconds}s"

    # Execution environment
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    # Volumes for persistent cache
    # Note: Persistent disk mounting in Cloud Run v2 has complex requirements
    # For now, we'll use the simple approach of downloading from GCS to local cache
    # TODO: Implement proper persistent disk mounting when syntax is stable
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
resource "google_cloud_run_service_iam_member" "public_invoker" {
  location = google_cloud_run_v2_service.app.location
  service  = google_cloud_run_v2_service.app.name
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
