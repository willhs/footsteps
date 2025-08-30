// Preserve state when adding count to cloudflare_pmtiles module
moved {
  from = module.cloudflare_pmtiles
  to   = module.cloudflare_pmtiles[0]
}

