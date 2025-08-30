Investigate why the latest deployment via github workflow & terraform didn't work and attempt to fix it.

The app deploys in google cloud platform.
infra:
- nextjs server in cloud run with min instances = 0
- gcs storage for map tiles (data deployed by a local process, not gh)

Follow this diagnostic workflow:

0. Quick health check (saves time):

- **Check git status first**: Run `git status` and `git push --dry-run` to verify local changes are pushed to remote—workflow file differences between local/remote are a common issue
- Run `pnpm lint` and `npx tsc --noEmit` in footsteps-web/ to catch config and type issues **IMPORTANT: TypeScript compilation errors always block CI; lint warnings don't**
- Run `terraform fmt -check -recursive` in project root to catch terraform formatting issues before commit
- **Verify workflow files match architecture**: Check if recent architecture changes made workflow files obsolete or if they still reference old approaches (Node.js/pnpm vs Docker artifacts)
- If working with feature branches: check for merge conflicts with main first
- Verify environment variables match current architecture (API vs GCS direct access)

1. Confirm and identify the issue:

- Use the github and/or gcloud cli to find the status of the last workflow that ran. Current workflows are 'ci' and 'deploy'.
- Distinguish between deployment infrastructure issues vs code/branch issues (merge conflicts, linting, test failures)
- **Common infrastructure issues**: 
  - Stale terraform state locks (use `terraform force-unlock [LOCK_ID]`)
  - ESLint/TypeScript configuration conflicts (especially redundant React rules in TypeScript projects)
  - Missing test environment setup for modern web APIs (Worker, IntersectionObserver need mocking)
  - **Transient network/package installation failures** (Poetry timeouts, npm registry issues) - often resolve by retrying
- If there are any issues, do any investigation needed to understand the problem well enough to come up with a solution to fix it

2. Fix the issue

- Come up with one or more solutions to try
- **For transient infrastructure failures**: Try retrying with a trivial commit (typo fix, whitespace change) to trigger a new workflow run
- Create a git worktree in the project root and navigate to it to develop your idea/s
- Try them until the problem is likely to be solved
- merge in your worktree and remove it

3. Deploy and evaluate

- Deploy the app by committing your fix in git and deploying. This will trigger the gh workflows
- Monitor both GitHub workflow completion AND actual Cloud Run service status (`gcloud run services list`)
- **Test app directly with curl/browser even if workflow still running**—deployment often succeeds before workflow completes, and app may be working despite workflow failures. Find app URL in deployment logs: `gh run view --log --job=<job-id> | grep "Service deployed at"`
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

**Entry 6**: The primary blocking issue was a simple TypeScript compilation error (`TERRAIN_LAYER` not defined) in `backgroundLayers.ts` that was easily caught by the health check `npx tsc --noEmit`. Once fixed, both CI and deployment workflows succeeded immediately. The health check workflow was extremely effective—git status confirmed no push issues, lint passed with only warnings, and typecheck caught the specific error. Document is working well; the health check steps saved significant debugging time and the workflow diagnostics were straightforward. Only minor improvement: emphasize that TypeScript compilation errors are always CI-blocking (unlike lint warnings).

**Entry 7**: Issue was a transient Poetry installation timeout in GitHub Actions (urllib URLError connection timeout). Health checks (git status, lint, typecheck) all passed locally, indicating the problem was infrastructure-related, not code-related. Fix was simply retrying by making a trivial commit (typo fix) to trigger a new workflow run—the second attempt succeeded completely. Document improvements: (1) add guidance for handling transient CI infrastructure failures (network timeouts, package installation failures), (2) suggest that retrying with a trivial commit is often effective for transient issues, (3) emphasize testing the app directly even when workflows show failure, as the app was actually working despite the CI failure.

**Entry 8**: The "terraform fmt check failed" issue was quickly resolved following the diagnostic workflow. Health checks (git status, lint, typecheck) confirmed no local code issues. GitHub CLI easily identified the CI failure in terraform formatting. The fix was straightforward: `terraform fmt iac/cloudflare/main.tf` corrected spacing alignment, and CI immediately passed after commit. Document improvements: (1) mention that `terraform fmt -check -recursive` can be run locally as part of health checks to catch formatting issues before commit, (2) note that terraform formatting failures are typically simple alignment fixes, not complex logic errors, and (3) clarify that CI success is the key metric for terraform fmt issues, even if subsequent deployment steps have unrelated problems.

