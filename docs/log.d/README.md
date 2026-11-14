---
id: docs-log-fragments
type: note
purpose: "Per-job log entry fragments, stitched into docs/log.md by the land step: how to write one and why the shared file is off limits"
tags: ["docs", "landing", "conflicts"]
---

# docs/log.d: per-job log fragments

**Do not edit `docs/log.md`.** Write your job's entry to `docs/log.d/<job-id>.md` and commit it on
your branch. The land step stitches every fragment into `docs/log.md` (newest first), deletes the
fragments and folds the result into the branch's last commit. `docs/log.md` is newest-first, so
every job inserted at the top and two jobs conflicted on it by construction; a fragment has one
writer, so it cannot conflict.

Format: exactly what the entry would be inside `log.md`.

```markdown
## [2026-11-15] update | Short title

What changed and why, in the style of the existing entries.
```

- **The heading is ISO, `## [YYYY-MM-DD] verb | title`**, whatever date format the org default uses.
  The stitcher orders entries by that date.
- Never date a heading in the future; use today's date.
- More than one entry per fragment is fine.
- A job that genuinely must edit `docs/log.md` (reordering, pruning) puts a
  `Docs-Shared-Edit: <reason>` trailer in the commit message.

