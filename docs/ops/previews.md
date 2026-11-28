---
id: ops-previews
type: ops
purpose: "Per-PR preview links: how a pull request becomes https://pr-<number>.footsteps.pages.dev, where its data comes from, and how to fix it"
updated: 2026-11-28
---

# PR previews

Every pull request that touches `footsteps-web/` gets a clickable preview, so a visual or UX change can be judged without checking out
the branch: **https://pr-&lt;number&gt;.footsteps.pages.dev**. A "Preview" comment on the PR links it and is edited on each push.

## How it works

- `.github/workflows/preview.yml` builds the PR's static export the same way production does (`deploy/budgie/web/Dockerfile`: same-origin
  `/pmtiles`), then publishes it to the Cloudflare Pages project `footsteps` as a preview deployment on branch `pr-<number>`.
  Pages gives each branch a stable alias, so the link does not change between pushes.
- The data is not in git (grid, terrain, habitat, fauna, food, PMTiles; the day and anthropology API). `deploy/preview/_worker.js`
  serves the PR's own files first and fetches anything else from production, `https://footsteps.willhs.me`, on the same origin. So a
  preview shows the PR's code on production's data. A PR that changes data needs the data published to budgie first.
- Production is untouched: footsteps.willhs.me is served by budgie, and only `main` is the Pages project's production branch.
  `deploy-pages.yml` (manual only) is the one that can re-point the domain; the preview workflow never runs it.
- `/version.txt` on a preview shows the commit it was built from.

## Writing a PR with something to judge

Put the preview link in the PR description under "Preview", with a starting view (`?lat=&lon=&zoom=&year=` and any flags), and a short
"What to judge" note: the one to three things to look at and the options weighed (`.github/pull_request_template.md`).

## Setup and troubleshooting

- Needs the repository secret `CLOUDFLARE_API_TOKEN` (Pages: Edit) and variable `CLOUDFLARE_ACCOUNT_ID`, already used by `deploy-pages.yml`.
  `CLOUDFLARE_PAGES_PROJECT` is read if set, else `footsteps`.
- PRs from forks get no secrets, so they get no preview.
- Re-run for any PR from Actions › PR preview › Run workflow, with the PR number.
- Pages may protect preview URLs with Cloudflare Access if "Preview deployments: access policy" is on for the project; that is a Pages
  setting, not this workflow.
- Old preview deployments are kept by Pages; delete them in the Cloudflare dashboard if they pile up.
