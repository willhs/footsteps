Investigate why the latest deployment via github workflow & terraform didn't work and attempt to fix it.

The app deploys in google cloud platform.
infra:
- nextjs server in cloud run with min instances = 0
- gcs storage for map tiles (data deployed by a local process, not gh)

Follow this diagnostic workflow:

0. Quick health check (saves time):

- Run `pnpm lint` in humans-globe/ to catch config issues
- Check if recent architecture changes made workflow tests obsolete

1. Confirm and identify the issue:

- Use the github and/or gcloud cli to find the status of the last workflow that ran. Current workflows are 'cli' and 'deploy'.
- If there are any issues, do any investigation needed to understand the problem well enough to come up with a solution to fix it

2. Fix the issue

- Come up with one or more solutions to try
- Try them until the problem is likely to be solved

3. Deploy and evaluate

- Deploy the app by committing your fix in git and deploying. This will trigger the gh workflows
- Either poll results or wait for user response
- If success: go to phase 4
- If still failing: go back to phase 1

4. Done

- Read this document at @.claude/commands/fix-deploy.md
- In the Guest book section below, 
  - If there are more than 10 entries then delete then delete the top one
  - Add an entry to the bottom: write a few sentences about how this document could be improved, taking into account your experience of this task and how this document could have better prepared you for the task
  - Now, consider the guest book entries and decided whether you think you can improve this document in terms of simplicity, reducing the number of steps to fix a deployment.
  - If so: make any changes you think would improve this document. Don't change the title or main themes.


Guest book:

**Entry 1**: The workflow diagnostics were straightforward—GitHub CLI helped quickly identify recent failures. The fix was simple once I understood that tiles API tests were obsolete after the GCS migration. This document could benefit from: (1) mentioning checking environment variables when API tests fail, (2) noting that architecture changes might make workflow tests outdated, and (3) suggesting to verify what the current deployment actually uses (API vs direct GCS) before assuming test validity.

**Entry 2**: ESLint errors caused CI failure, specifically react/prop-types rule triggering on non-React object properties. Fix was disabling the redundant rule in TypeScript project. Document could be improved by: (1) mentioning common ESLint/TypeScript configuration issues that can block CI, (2) noting that lint errors vs warnings have different CI impacts, and (3) suggesting to run `pnpm lint` locally first to catch config issues before committing.

