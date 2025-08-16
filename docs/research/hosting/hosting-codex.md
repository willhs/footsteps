# Hosting Research: Cheap Options for Footsteps of Time

*Analysis conducted August 2025*

## Executive Summary

For the Footsteps of Time app, we can achieve near-zero hosting costs (~$0.36/year) while maintaining excellent global performance. The recommended solution combines GitHub Pages for frontend hosting with Cloudflare R2 for data storage.

## Current Architecture Requirements

- **Frontend**: Next.js app with static site generation capability
- **Data**: 1.7GB of processed HYDE demographic data (84 compressed files)
- **API**: Next.js Tile API serving MVT from MBTiles; legacy NDJSON API removed
- **Traffic**: Estimated 1,000+ daily users at scale

## Recommended Hosting Solutions

### 🏆 Option 1: GitHub Pages + Cloudflare R2
**Monthly Cost: $0.03** | **Annual Cost: $0.36**

| Component | Service | Cost | Notes |
|-----------|---------|------|-------|
| Frontend Hosting | GitHub Pages Free | $0 | 100GB bandwidth/month |
| Data Storage | Cloudflare R2 | $0.025/month | 1.67GB @ $0.015/GB |
| CDN | Cloudflare Free | $0 | Global edge network |
| **Total** | | **$0.03/month** | **~600x cheaper than paid alternatives** |

**Pros:**
- Nearly free hosting with excellent performance
- Zero egress fees for data downloads
- Global CDN with 330+ data centers
- 100GB monthly bandwidth handles ~3,000 daily users

**Cons:**
- Requires adapting Next.js API routes for static deployment
- 100GB bandwidth limit (though generous for most use cases)

### Option 2: Netlify Free + Cloudflare R2
**Monthly Cost: $0.03**

- Same cost structure as Option 1
- Better Next.js deployment experience
- Same bandwidth limitations

### Option 3: Vercel Hobby + Cloudflare R2
**Monthly Cost: $0.03**

- Best Next.js integration available
- Perfect for development and testing
- **Limitation**: No commercial use permitted on free tier

### Option 4: Paid Hosting Solutions
**Monthly Cost: $19-20**

- **Vercel Pro**: $20/month with generous bandwidth
- **Netlify Pro**: $19/month with team features
- Use only when traffic exceeds free tier limits

## Cost Comparison Analysis

### Storage Costs (1.67GB data)
- **Cloudflare R2**: $0.025/month ($0.015/GB)
- **AWS S3**: $0.15/month ($0.09/GB) + egress fees
- **Savings**: 83% cost reduction with R2

### Bandwidth Economics
- **Free tiers**: 100GB/month bandwidth
- **Estimated usage**: 30GB/month for 1,000 daily users
- **At scale**: R2's zero egress fees become crucial advantage
- **Break-even**: Paid tiers worth considering at ~3,000+ daily users

### Annual Cost Comparison
| Solution | Year 1 Cost | At Scale Cost |
|----------|-------------|---------------|
| GitHub Pages + R2 | $0.36 | $0.36 (until bandwidth limits) |
| Paid hosting | $240+ | $240+ |
| **Savings** | **$240** | **Varies by traffic** |

## Technical Migration Requirements

To achieve the cheapest hosting option, the following adaptations are needed:

### 1. Static Site Generation
- Convert Next.js API routes to static data generation
- Pre-build all time-series data during build process
- Generate static JSON files for each LOD level

### 2. Data Deployment Pipeline
```bash
# Example deployment flow
1. Build Next.js app with static export
2. Upload processed data files to R2 bucket
3. Configure Cloudflare CDN for optimal caching
4. Deploy static site to GitHub Pages
```

### 3. API Route Replacement
- Prefer vector tiles: serve `/api/tiles/{year}/single/{z}/{x}/{y}.pbf` (or host yearly `.mbtiles` via a static tile server/CDN)
- If pursuing a pure static site, pre-host PBF tiles or expose MBTiles via a lightweight tile server; keep client-side LOD selection
- Maintain caching and performance optimizations (ETag, immutable caching)

## Traffic Scaling Scenarios

### Startup Phase (0-1,000 daily users)
- **Recommended**: GitHub Pages + R2
- **Monthly bandwidth**: ~30GB
- **Cost**: $0.03/month

### Growth Phase (1,000-3,000 daily users)
- **Still viable**: Free tier covers ~100GB/month
- **Cost**: $0.03/month
- **Monitor**: Bandwidth usage approaching limits

### Scale Phase (3,000+ daily users)
- **Consider upgrade**: Paid hosting tiers
- **Alternatives**: Cloudflare Pages Pro, Vercel Pro
- **Cost**: $19-20/month

## Implementation Timeline

### Phase 1: Static Migration (1-2 weeks)
- Adapt Next.js for static site generation
- Test data serving from R2
- Validate performance maintains current standards

### Phase 2: Deployment Setup (3-5 days)
- Configure R2 bucket and CDN
- Set up GitHub Actions for automated deployment
- Test full deployment pipeline

### Phase 3: Go Live (1 day)
- DNS cutover to new hosting
- Monitor performance and costs
- Document scaling procedures

## Risk Mitigation

### Bandwidth Overages
- **Solution**: Implement Cloudflare caching strategies
- **Fallback**: Quick migration to paid tiers available
- **Monitoring**: Set up usage alerts at 80% of limits

### Performance Concerns
- **Validation**: R2 + Cloudflare typically faster than traditional hosting
- **Backup**: Keep current hosting during transition period
- **Testing**: Load test with production data volumes

## Conclusion

The GitHub Pages + Cloudflare R2 combination offers exceptional value for the Footsteps of Time project. With proper implementation, this solution provides:

- **99.4% cost savings** compared to traditional hosting
- **Global performance** through Cloudflare's edge network
- **Scalability path** to paid tiers as traffic grows
- **Zero vendor lock-in** with standard web technologies

This approach aligns perfectly with the project's goal of making historical data accessible while maintaining sustainable operational costs.

---

*For implementation questions or cost monitoring setup, refer to the technical migration requirements section above.*
