---
title: State of the project — and what revitalising it takes
status: current
created: 2026-08-09
updated: 2026-08-09
owner: agent
---

# Footsteps of Time — State of the Project

**Verdict: the product is dark.** `https://footsteps.willhs.me` renders a blank screen. Not a degraded
experience — literally nothing: no population dots, no basemap, `0 people`. It has almost certainly been
this way for months, and nothing in the codebase noticed.

The good news is that the cause is understood, the codebase is largely healthy, and the fix is bounded.
This is a **revitalise**, not a re-make.

---

## 1. What's actually happening

Two independent faults, either of which alone would break the experience.

### Fault A — the tile data has been deleted

`gs://footsteps-earth-tiles/` is **empty**. Every PMTiles file is gone.

The cause is in our own infrastructure, `iac/main.tf:43-50`:

```hcl
# Lifecycle management to reduce costs
lifecycle_rule {
  condition { age = 90 }
  action    { type = "Delete" }
}
```

A blanket 90-day delete rule on the bucket that holds the **only** copy of the dataset. The tiles aged
past 90 days and GCS deleted them exactly as instructed. Versioning is enabled on the bucket, but
`gcloud storage ls --all-versions` returns nothing, so archived copies are not recoverable from here
either. There is no local copy — `data/` does not exist in the working tree.

The failure is silent by design accident. Requesting a missing object with a `Range` header returns:

```
HTTP/2 206
content-type: application/octet-stream
content-range: bytes 0-16383/*

<?xml version='1.0'?><Error><Code>NoSuchKey</Code>…
```

**HTTP 206 with an XML error body.** Every status-code-based health check passes. The PMTiles parser
receives `<?xml v` where it expects the `PMTiles` magic bytes and throws. The app logs
`[PMTilesTileLayer] Failed to load tile` 48 times per load and renders `0 people`. Reproduced on
localhost against the same CDN, so this is not a deploy-environment quirk.

### Fault B — the production build never renders the globe

On the deployed static export the deck.gl canvas backing store stays at the browser default
**600×300** while its CSS box is **1020×1169**. deck.gl never completes a resize/render pass, so not
even the basemap draws. No JavaScript errors are thrown — it fails silently.

Local `pnpm dev` renders the basemap correctly, so this is specific to the static-export production
build. It is a separate bug from Fault A, and **restoring the data will not fix it**. Both must land.

### Fault C — nothing was watching

- CI's "GCS Tiles Availability" job (`.github/workflows/ci.yml:137`) probes
  `…/tiles/humans/{year}/single/{z}/{x}/{y}.pbf` — a path from the pre-PMTiles architecture that
  hasn't existed since the static migration (`d943dac Server -> static`). It cannot pass and no longer
  describes reality.
- Even if pointed at the right path, it checks HTTP status and content-type. Given the `206 +
  application/octet-stream + XML body` response above, **it would have passed while the data was gone.**
- Playwright is installed, `playwright.config.ts` exists, and `e2e/population.spec.ts` is written — but
  E2E is not wired into any workflow. The test that would have caught this exists and never runs.

### Fault D — no reproducible path from zero to tiles

`setup.sh` says "Ensure HYDE data is available in `data/raw/hyde-3.5/`". That's the whole story: HYDE
acquisition is a manual, undocumented, out-of-band step. There is no download script, no checksum, no
record of which HYDE release was used or which files were needed.

This is why Fault A was fatal rather than annoying. With a scripted acquisition path, losing the bucket
would be a one-command rebuild.

---

## 2. What's healthy

Worth being clear that most of the project is fine. This is a data-and-deploy failure, not rot.

| Area | State |
|---|---|
| Python pipeline | **Working.** `tests/test_basic.py` passes; LOD hierarchy, population conservation, and zoom mapping all verified. |
| Local toolchain | **Present.** `tippecanoe`, `tile-join`, `pmtiles` all installed. |
| Frontend architecture | **Sound.** Hooks/layers/overlays split is clean; `FootstepsViz.tsx` is a tidy 126 lines after the recent refactors. |
| Local dev experience | **Works.** Basemap, slider, toggles, LOD indicator all render. |
| Build & CI | **Green.** Lint, type check, unit tests, Terraform validation all pass. |
| Hosting | **Cheap and appropriate.** Cloudflare Pages static export + GCS/CDN for tiles is the right shape. |
| Dependencies | Current-ish. deck.gl 9.1, Next 15.4, React 18. No urgent upgrades. |

The recent stabilisation commit (`c21b952`) did real good — build checks re-enabled, dead code removed,
worktrees pruned. It just couldn't see the data problem, because the app fails silently.

---

## 3. The gap against the vision

Separate from the outage, there's a scope gap worth naming, because it changes what "restored" should mean.

`lib/constants.ts` ships **21 years: 10,000 BCE → 1000 CE**.

The vision (`docs/philosophy/one-pager.md`, `CLAUDE.md`) promises **100,000 BCE → 2025 CE**, and the
core experience is described as watching humanity "spread, cluster, and **explode into cities**."

That explosion — the agricultural intensification, the industrial revolution, the run from ~300 million
to 8 billion people — is the single most visceral thing this dataset can show, and **it has never
shipped**. The timeline stops a thousand years before the story's climax.

The HYDE 3.3 readme sitting untracked in `docs/research/` covers **10,000 BCE → 2023 CE** at 5 arc-minute
resolution. The data to close the front half of this gap is available and the pipeline already knows how
to process it. (Deep prehistory, 100k–10k BCE, is a genuinely harder problem — HYDE does not cover it,
and it would need a different source and an honest uncertainty treatment.)

---

## 4. Revitalise or re-make?

**Revitalise.** A re-make is not justified:

- The pipeline works and its tests pass.
- The frontend architecture is clean and recently refactored.
- The hosting model (static + object-store tiles) is already the cheap, correct end state — the earlier
  hosting research recommended exactly this and it's implemented.
- Nothing in the failure is architectural. A 90-day delete rule on the master copy of the data is a
  config mistake, not a design flaw.

What a re-make would buy — a fresh year set, a documented data pipeline, a smoke test — is available
inside the existing codebase for a fraction of the cost.

---

## 5. What revitalising takes

Ordered by dependency. Phases 1–3 are the outage; phase 4 is the vision gap.

### Phase 1 — Stop the bleeding (infrastructure)

1. **Delete the lifecycle rule** in `iac/main.tf:43-50`. Nothing else matters if the bucket eats the
   data again in 90 days. If cost control is genuinely wanted, use a storage-class transition, never a
   delete.
2. **Audit the bucket** for any other destructive rules; confirm versioning retention.
3. **Fix Fault B** — the static-export canvas never sizes. Investigate `DeckGLView.tsx` mount/resize
   behaviour under static export.

### Phase 2 — Restore the data

4. **Script HYDE acquisition** — download, verify, and record the release used. This is the fix for
   Fault D and the reason a future loss won't be fatal. Decide HYDE 3.5 (as-was) vs 3.3 (reaches 2023).
5. **Regenerate the tiles** via the existing pipeline. Effort here is largely unknown until the raw data
   is in hand — full-planet processing across 21+ years is measured in hours, not minutes.
6. **Upload to GCS** via `scripts/upload_pmtiles.sh` / the Upload PMTiles workflow.
7. **Keep a second copy.** The whole outage traces to a single copy of an artifact that takes hours to
   rebuild.

### Phase 3 — Make it impossible to miss next time

8. **Fix the CI tiles probe** to check the real path (`/pmtiles/humans_{year}.pmtiles`) and validate the
   **PMTiles magic bytes**, not the HTTP status. The `206 + XML body` response is precisely what a
   status-code check cannot see.
9. **Wire Playwright into CI.** The config and spec already exist. The smoke test asserts, against the
   deployed URL: dots rendered > 0 and total population > 0. That single assertion would have caught
   this outage on day one, and catches Fault B as well.
10. **Fail loudly in the app.** A tile-load failure rate near 100% should surface an error state, not a
    confident `0 people`.

### Phase 4 — Close the vision gap (separate task)

11. **Extend the timeline to the present day.** This is the highest-value feature work available and it's
    cheapest to do while the pipeline is already warm. Needs a decision on year granularity post-1000 CE
    and validation that LOD/performance holds at 8-billion-person densities.

### Agreed housekeeping (cheap, fold into the above)

- **Delete the interpolation dead code**: `FootstepsVizWithInterpolation.tsx`, `useInterpolation.ts`,
  `useYearWithInterpolation.ts`, and the no-op `useYearCrossfade` stub still called by `useHumanLayers`.
  The GPU interpolation research doc stays as the record if the idea is revived properly.
- **Anthrome overlay stays parked.** The `feature/anthrome-overlay` worktree is a spike with open
  questions (only 1800 CE wired, no LOD path, no legend) and it is not what's blocking the product.

---

## 6. Explicitly deferred

These were on the original list and are **noise** next to the above. None of them affect whether the
product works.

- 53 `no-explicit-any` warnings (39 in `pmtilesTileLayer.ts`, 6 in `binaryTileUtils.ts`)
- Stale browserslist data
- Hardcoded CDN fallback URL in `pmtilesClient.ts`
- Mobile experience polish
- Visual/storytelling polish
- GPU interpolation between years

Worth noting: **stale documentation** is a mild hazard here. `footsteps-web/CLAUDE.md` and the root
`README.md` still describe the Cloud Run + Next.js tile API + MVTLayer architecture that was replaced by
the static export. `pyproject.toml` still points its script entry points at a `data.scripts.*` package
that no longer exists. An agent reading these will be misled about where tiles come from.

---

## 7. Decisions still open

1. **HYDE 3.5 or 3.3?** 3.5 restores exactly what was there. 3.3 reaches 2023 CE and closes most of the
   vision gap — but is an older baseline release. Worth confirming what 3.5 actually covers before
   choosing, since the current build stops at 1000 CE for reasons that may be availability or may be a
   past decision.
2. **Year granularity past 1000 CE.** Centuries to 1800 then decades? Every 50 years? This drives both
   regeneration time and total artifact size.
3. **Second copy of the tiles — where?** R2 alongside GCS, or an archived local copy, or accept a
   scripted rebuild as the recovery path.
4. **Deep prehistory (100k–10k BCE)** — still aspirational. Needs a data source and an honest
   fog-of-history treatment. Not in scope for revitalisation.

---

## Appendix — evidence

| Claim | How it was verified |
|---|---|
| Production renders nothing | Browser screenshot of `footsteps.willhs.me`: blank, `0 people`, `Dots drawn: 0`, `Cache: 0/12 (0%)` |
| Bucket is empty | `gcloud storage ls gs://footsteps-earth-tiles/` and `--all-versions` → no objects |
| CDN returns error body with 206 | In-page `fetch` with `Range: bytes=0-16383` → 206, 212 bytes, body starts `<?xml v` |
| Tiles fail locally too | `pnpm dev` on :4444 → 48× `[PMTilesTileLayer] Failed to load tile` |
| Prod canvas never sizes | `document.querySelector('canvas')` → backing `600×300`, CSS box `1020×1169`, `isContextLost() === false`, no errors after 3s |
| Local basemap works | Screenshot of `localhost:4444` → continents render, still `0 people` |
| Pipeline is healthy | `python3 footstep-generator/tests/test_basic.py` → all pass |
| Interpolation code is dead | `grep` across `*.ts`/`*.tsx` → only self-references |
| No raw data on disk | `data/` does not exist; `find / -name 'humans_*.pmtiles'` → nothing |
