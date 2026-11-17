### Opening a PR

Invoked at the end of every other playbook.

Work from a git worktree off the PR's base, and keep unrelated work out of it. On the local surface, create it with `git worktree add .claude/worktrees/<name> -b <branch> <base>`, then call the `EnterWorktree` tool with its path before any other step, so a base other than the default branch works whatever `worktree.baseRef` says. A `cd` in Bash is no substitute, since it moves only that one shell, not the session or its subagents. Add `.claude/worktrees/` to the exclude file `git rev-parse --git-path info/exclude` names the first time, and keep the worktree until the PR merges. On the cloud surface (`jrzstack: surface=cloud`), work from your own checkout. Rebase into small, landable commits. Run `/deslop`, which ships with jrzstack, over the diff before commit (read ${CLAUDE_PLUGIN_ROOT}/skills/deslop/SKILL.md).

Title: `type(scope): subject`, naming a real symbol when one carries the change. Body: a one-minute briefing under 40 lines with these `##` headings in order, dropping empty ones: `## Why`, `## What changed`, `## Scope`, `## Tradeoffs` (only rejected alternatives a reviewer would otherwise ask about), `## Blast Radius`, `## Verification`.

Stack follow-ups by base branch. Open PRs ready, with `gh pr create` without `--draft`. On the cloud surface, `gh pr` fails because GraphQL is blocked, so do the same operation with `gh api` REST. Opening a PR does not start a babysit.
