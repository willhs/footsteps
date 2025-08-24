Investigate why the latest deployment via github workflow & terraform didn't work and attempt to fix it.

The app deploys in google cloud platform.
infra:
- nextjs server in cloud run with min instances = 0
- gcs storage for map tiles (data deployed by a local process, not gh)

Follow this diagnostic workflow:

0. Quick health check (saves time):

- Run `pnpm lint` and `npx tsc --noEmit` in footsteps-web/ to catch config and type issues (TypeScript errors are blocking, lint warnings are not)
- Check if recent architecture changes made workflow tests obsolete
- If working with feature branches: check for merge conflicts with main first
- Verify environment variables match current architecture (API vs GCS direct access)

1. Confirm and identify the issue:

- Use the github and/or gcloud cli to find the status of the last workflow that ran. Current workflows are 'ci' and 'deploy'.
- Distinguish between deployment infrastructure issues vs code/branch issues (merge conflicts, linting, test failures)
- Common infrastructure issues: stale terraform state locks (use `terraform force-unlock [LOCK_ID]`)
- If there are any issues, do any investigation needed to understand the problem well enough to come up with a solution to fix it

2. Fix the issue

- Come up with one or more solutions to try
- Try them until the problem is likely to be solved

3. Deploy and evaluate

- Deploy the app by committing your fix in git and deploying. This will trigger the gh workflows
- Monitor both GitHub workflow completion AND actual Cloud Run service status (`gcloud run services list`)
- Test app directly with curl/browser even if workflow still running—deployment often succeeds before workflow completes. Find app URL in deployment logs: `gh run view --log --job=<job-id> | grep "Service deployed at"`
- If success: go to phase 4
- If still failing: go back to phase 1

4. Done

- Read this document at .claude/commands/fix-deploy.md
- In the Guest book section below, 
  - If there are more than 10 entries then delete then delete the top one
  - Add an entry to the bottom: write a few sentences about how this document could be improved, taking into account your experience of this task and how this document could have better prepared you for the task
  - Now, consider the guest book entries and decided whether you think you can improve this document in terms of simplicity, reducing the number of steps to fix a deployment.
  - If so: make any changes you think would improve this document. Don't change the title or main themes.


Guest book:

**Entry 1**: The workflow diagnostics were straightforward—GitHub CLI helped quickly identify recent failures. The fix was simple once I understood that tiles API tests were obsolete after the GCS migration. This document could benefit from: (1) mentioning checking environment variables when API tests fail, (2) noting that architecture changes might make workflow tests outdated, and (3) suggesting to verify what the current deployment actually uses (API vs direct GCS) before assuming test validity.

**Entry 2**: ESLint errors caused CI failure, specifically react/prop-types rule triggering on non-React object properties. Fix was disabling the redundant rule in TypeScript project. Document could be improved by: (1) mentioning common ESLint/TypeScript configuration issues that can block CI, (2) noting that lint errors vs warnings have different CI impacts, and (3) suggesting to run `pnpm lint` locally first to catch config issues before committing.

**Entry 3**: Successfully merged Codex-generated binary tiles branch with minimal issues. Main challenge was merge conflict in tileMetrics.ts requiring manual resolution to preserve both binary implementation and TileMetrics interface. Tests passed, only minor ESLint fix needed. Document could be improved by: (1) adding guidance for feature branch merges vs deployment fixes, (2) recommending test-driven verification of changes before assuming deployment issues, and (3) including merge conflict resolution as a common step when multiple developers/tools modify similar code areas.

**Entry 4**: Primary issue was TypeScript compilation errors blocking CI (FootstepsViz null assertion, missing webworker lib, incomplete PickingInfo mocks). Secondary issue was stale Terraform state lock from 2 days ago preventing deployment. Document improvements: (1) add "run type check" to health checks alongside lint, (2) mention terraform state lock resolution (`force-unlock`) as common infrastructure issue, (3) emphasize checking actual app response even if workflow still running—Cloud Run deployment succeeded before workflow completion.

**Entry 5**: CI failing due to TypeScript compilation errors in NetworkIndicator.tsx—specifically XMLHttpRequest.open() type assertion and unused @ts-expect-error directive. Fix was straightforward once identified: proper type assertion for async parameter and removing redundant comment. Document improvements: (1) the health check step successfully caught both the lint and typecheck issues locally, proving its value, (2) the workflow diagnostics workflow was smooth and effective, (3) might be worth emphasizing that TypeScript errors (vs just warnings) are blocking for CI, and (4) the direct app testing after deployment confirmed functionality even before full workflow completion.

