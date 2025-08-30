terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = ">= 4.30.0"
    }
  }
}

locals {
  tiles_host = var.tiles_hostname != "" ? var.tiles_hostname : "pmtiles.${var.zone_name}"
}

resource "cloudflare_workers_script" "pmtiles_proxy" {
  account_id  = var.account_id
  script_name = "pmtiles-proxy"
  content     = file("${path.module}/pmtiles_worker.js")
  # Indicate module syntax for `export default { fetch }` Workers
  main_module = "pmtiles_worker.js"

  # Bind bucket and prefix using provider v5 'bindings' list
  bindings = [
    {
      name = "GCS_BUCKET"
      type = "plain_text"
      text = var.gcs_bucket
    },
    {
      name = "PMTILES_PREFIX"
      type = "plain_text"
      text = var.pmtiles_prefix
    }
  ]
}

# Ensure the hostname exists and is proxied so Workers can route
resource "cloudflare_dns_record" "tiles_host" {
  zone_id = var.zone_id
  name    = local.tiles_host
  type    = "A"
  content = "192.0.2.1" # dummy per Cloudflare docs
  proxied = true
  ttl     = 1
}

resource "cloudflare_workers_route" "pmtiles_route" {
  zone_id = var.zone_id
  pattern = "${local.tiles_host}/*"
  script  = cloudflare_workers_script.pmtiles_proxy.script_name
}

output "pmtiles_hostname" {
  value       = local.tiles_host
  description = "Hostname serving PMTiles via Cloudflare Worker"
}
