Investigate why the latest deployment via github workflow & terraform didn't work and attempt to fix it.

The app deploys in google cloud platform.
infra:
- nextjs server in cloud run with min instances = 0
- gcs storage for map tiles (data deployed by a local process, not gh)

Follow this diagnostic workflow:

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
  - Add an entry to the bottom: write a few sentences about how this document could be improved, taking into account yours and the other members of the guest books experience of this task and how this document could have better prepared them for the task


Guest book:

