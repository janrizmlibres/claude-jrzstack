---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /pstack:swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

Fan out N parallel workers, cloud workers by default when the lead is local. They may cover separate slices, race the same task, or mix both. The parent waits, aggregates, and returns one report.

## Start

Open a todolist with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning. Only a `first pass` race may give its workers identical briefs. A `rank all` or `best-of` race needs distinct arms, each brief naming its own approach.
3. Set N from the user or derive it from the shape. N is total workers, not the concurrency window.
4. Workers run on the Volume setting, on `poteto-agent`, or `poteto-reader` for a worker that only reads. Pass `model:` `${user_config.volume_model}` and `effort:` `${user_config.volume_effort}`, or the setting's defaults (`sonnet`, `high`) for a literal placeholder or an empty value. A model race is opt-in and a cost check: run one only when the user asks, name each arm's model up front, pass it as that arm's `model:`, and label the report a cost check.
5. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.
6. Size a `TIMEBOX` for each brief. Without an estimate, 30 minutes for a worker that only reads and 90 for one that writes code.

## Phase B: Fan out

Brief every worker per the brief contract (read ${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/references/brief-contract.md). Swarm workers are leaf workers. Place them by the reminder's `pstack: surface=` line.

- **Local lead, by default.** Each worker is a cloud worker. Push the run's base first, because a cloud session sees only what is on GitHub. Start each worker under a pseudo-terminal with its brief file as the prompt: `script -q /dev/null claude --permission-mode auto --cloud "$(cat <brief.md>)"` on macOS, `script -qec "claude --permission-mode auto --cloud \"\$(cat <brief.md>)\"" /dev/null` on Linux. When the run names a cloud environment, add `--settings '{"remote":{"defaultEnvironmentId":"<env_ id>"}}'`. Read each result only from the report commit it pushes, found by its nonce trailer. A worker that needs something on the user's computer runs locally, as under local-only.
- **Local-only.** When the user asks for it ("local only", "no cloud workers"), or when cloud workers can't start (no Auto on the account, no default cloud environment, a failed launch), say so once and run every worker locally. Each is an `Agent` with `run_in_background: true`. A worker that writes or races gets `isolation: "worktree"`. Remove each worktree once its result is aggregated, and keep its branch.
- **Cloud lead.** Each worker is an in-VM `Agent` with `run_in_background: true`. A worker that only reads works in your checkout. One that writes or races gets `isolation: "worktree"`. A lead that can call `create_session` (in practice, one in Auto) gives a worker that needs a whole machine, such as a heavy command that can't fit beside your tree, a `create_session` worker instead: push the base first, give each an `outcome_branch`, and poll `get_session` on `status_bucket`. A lead without the tool says once that Auto would allow separate-VM workers and carries on in-VM.

Fan out through the window. Keep at most 10 workers in flight and spawn the next as each finishes, never in blocking batches. A cloud or `create_session` worker counts as one. A refused spawn is backpressure, whatever its error says about retrying: wait for one of your own in-flight workers to finish, then spawn again. Never drop a slice or a race arm. With nothing of yours in flight, return `BLOCKED: concurrency cap`.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, its `TIMEBOX`, and what to report. Every worker starts from a commit its brief names. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

A worker that fails, erroring or returning nothing, retries once on the same model and effort. A second failure is `BLOCKED` with evidence. A worker still running at 1.5× its timebox is `BLOCKED` and gets no retry: stop an in-session subagent with `TaskStop`, record a cloud or `create_session` worker's session URL, and tell the user once. Proceed with the rest and note each dropout.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

Volume workers never escalate quietly. When no worker returns `PASS`, the report says so, and the parent may rerun on `opus`.

Keep a compact result table, one-line evidenced issues, and explicit gaps or dropouts.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.
