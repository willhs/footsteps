
variable "zone_id" {
  description = "Cloudflare Zone ID for your domain"
  type        = string
}

variable "zone_name" {
  description = "Cloudflare Zone name (e.g., example.com)"
  type        = string
}

variable "tiles_hostname" {
  description = "Optional hostname to serve PMTiles (default pmtiles.<zone_name>)"
  type        = string
  default     = ""
}

variable "account_id" {
  description = "Cloudflare account ID for the zone"
  type        = string
}

variable "gcs_bucket" {
  description = "GCS bucket name hosting PMTiles (no gs://, just the name)"
  type        = string
}

variable "pmtiles_prefix" {
  description = "Prefix within the bucket where PMTiles live (default: pmtiles)"
  type        = string
  default     = "pmtiles"
}
