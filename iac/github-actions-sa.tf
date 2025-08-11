# Service Account for GitHub Actions CI/CD
resource "google_service_account" "github_actions" {
  account_id   = "github-actions-ci-cd"
  display_name = "GitHub Actions CI/CD Service Account"
  description  = "Service account used by GitHub Actions for automated deployments"

  depends_on = [google_project_service.required_apis]
}

# Grant necessary IAM roles to the GitHub Actions service account
resource "google_project_iam_member" "github_actions_roles" {
  for_each = toset([
    "roles/run.developer",            # Deploy to Cloud Run
    "roles/storage.objectViewer",     # Read from GCS bucket
    "roles/cloudbuild.builds.editor", # Use Cloud Build
    "roles/storage.admin",            # Push to Container Registry (GCS-backed)
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.github_actions.email}"

  depends_on = [google_service_account.github_actions]
}

# Workload Identity Pool for GitHub Actions OIDC
resource "google_iam_workload_identity_pool" "github_actions_pool" {
  workload_identity_pool_id = "github-actions-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Workload Identity Pool for GitHub Actions"
  disabled                  = false

  depends_on = [google_project_service.required_apis]
}

# Workload Identity Pool Provider for GitHub
resource "google_iam_workload_identity_pool_provider" "github_actions_provider" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_actions_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions-provider"
  display_name                       = "GitHub Actions Provider"
  description                        = "OIDC identity pool provider for GitHub Actions"
  disabled                           = false

  # Configure GitHub as the identity provider
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  # Map GitHub token claims to Google Cloud attributes
  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.actor"            = "assertion.actor"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
    "attribute.ref"              = "assertion.ref"
  }

  # Only allow access from the specific repository and main branch
  attribute_condition = <<-EOT
    assertion.repository_owner == "willhs" &&
    assertion.repository == "willhs/footsteps" &&
    assertion.ref == "refs/heads/main"
  EOT
}

# Bind the service account to the workload identity pool
resource "google_service_account_iam_member" "github_actions_workload_identity" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_actions_pool.name}/attribute.repository/willhs/footsteps"

  depends_on = [
    google_service_account.github_actions,
    google_iam_workload_identity_pool_provider.github_actions_provider
  ]
}

# Allow GitHub Actions SA to act as Cloud Build service account
data "google_project" "current" {
  project_id = var.project_id
}

# Ensure Cloud Build service account exists and fetch its email
# Grant Service Account User at project level so GitHub Actions can act as required service accounts (Cloud Build, runtime SA)
resource "google_project_iam_member" "github_actions_sa_user_project" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# Allow GitHub Actions SA to act as the app runtime service account used by Cloud Run
resource "google_service_account_iam_member" "github_actions_act_as_app_sa" {
  service_account_id = google_service_account.app_service_account.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_actions.email}"
}
