terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = ">= 4.30.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

locals {
  tiles_host = var.tiles_hostname != "" ? var.tiles_hostname : "pmtiles.${var.zone_name}"
}

resource "cloudflare_workers_script" "pmtiles_proxy" {
  name    = "pmtiles-proxy"
  content = file("${path.module}/pmtiles_worker.js")

  plain_text_binding {
    name = "GCS_BUCKET"
    text = var.gcs_bucket
  }

  plain_text_binding {
    name = "PMTILES_PREFIX"
    text = var.pmtiles_prefix
  }
}

# Ensure the hostname exists and is proxied so Workers can route
resource "cloudflare_dns_record" "tiles_host" {
  zone_id = var.zone_id
  name    = local.tiles_host
  type    = "A"
  value   = "192.0.2.1" # dummy per Cloudflare docs
  proxied = true
  ttl     = 1
}

resource "cloudflare_workers_route" "pmtiles_route" {
  zone_id     = var.zone_id
  pattern     = "${local.tiles_host}/*"
  script_name = cloudflare_workers_script.pmtiles_proxy.name
}

output "pmtiles_hostname" {
  value       = local.tiles_host
  description = "Hostname serving PMTiles via Cloudflare Worker"
}
