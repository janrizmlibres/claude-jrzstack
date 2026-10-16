# QA checklist

Every check the first release must pass, and every check watched after it, one row each. A **release check** must pass on the release candidate before the first release; a failure blocks it. A **watch check** runs after release; a failure becomes a bug, never a hold. Both terms are in `CONTEXT.md`.

Checks run in the fixture repo, `janrizmlibres/pstack-fixture`, except the dogfood run and the sync CI check. A **local** check runs in a local session on a clone of the fixture, with the candidate installed from the marketplace. A **cloud** release check is the brief `qa/briefs/<check>.md` in the fixture, started unattended with `claude --permission-mode auto --cloud` in the `pstack-qa` environment, whose setup line installs the candidate; `read-rule-cloud` alone starts in default mode, attended. Cloud watch checks are run by hand from the watch-check issue. Every check reports the way a worker does: a final commit on its own branch, subject `qa: <check> <result>`, the evidence in the body, and the trailers `QA-Check: <check>`, `QA-Result: PASS|FAIL|BLOCKED` and `Claude-Session: <url>`. The fixture's `scripts/qa-results.sh` lists every report on its origin, and `scripts/reset.sh` deletes the `qa/*` and `claude/*` branches a round leaves behind, since no cloud session can delete a branch.

Each candidate gets a tracking issue with the release checks as checkboxes, each linked to its report. Watch checks share one long-lived issue.

## Release checks

| Check | Tier | Surface | Passes when |
|---|---|---|---|
| **Install and entry** | | | |
| `install-clean` | release | cloud | The setup line installs cleanly on a newly created environment and finishes although the Chromium download fails. |
| `install-commander` | release | local | A marketplace install keeps `scripts/node_modules/commander`. |
| `launcher-local` | release | local | The launcher picks Bun, else Node ≥22.18, refuses an older Node, and with neither stops the step with the install line. |
| `launcher-cloud` | release | cloud | The launcher picks Bun in cloud, and Node or the install line without Bun as the Node version calls for. |
| `entry-local` | release | local | `/pstack:poteto-mode` enters, and the reminder hook prints `surface=local` and the right mode on every turn, worker results included. |
| `entry-cloud` | release | cloud | The same in cloud, with `surface=cloud`. |
| `env-pick` | release | local | `claude --cloud` picks the named environment from `--settings` with `remote.defaultEnvironmentId`, and from the project's `.claude/settings.local.json`. |
| `local-only-fallback` | release | local | A local lead that can't start cloud workers (no Auto, or no default environment) falls back to local-only and says so once. |
| `pulled-update` | release | cloud | A session started from a snapshot older than main installs pstack at main from its command source and switches its skill list to it within minutes, with no `/reload-plugins`. |
| `read-rule-local` | release | local | In default mode with the README's `Read` rule, the session and a subagent read a hidden sibling skill by path with no prompt or denial. |
| `read-rule-cloud` | release | cloud | The same in a default-mode cloud session, under the setup line's `Read` rule. Started without Auto, so the maintainer approves its report push. |
| `install-probe-local` | release | local | The marketplace and cloud plugin-install probe's local items hold on the candidate's marketplace install. |
| `install-probe-cloud` | release | cloud | The probe's cloud items hold on the candidate's setup-line install, depth 3 included. |
| **Worktrees and workers** | | | |
| `worktree-reset-cloud` | release | cloud | A cloud worktree worker resets to the lead's HEAD, an unpushed commit included, and the lead lists `.claude/worktrees/` in `.git/info/exclude` once. |
| `worktree-reset-local` | release | local | A local worktree worker resets to its named start commit, an unpushed one included. |
| `pr-worktree-develop` | release | local | A PR worktree opens on `develop` with `git worktree add` and `EnterWorktree` by path, and its PR targets `develop`. |
| `sub-lead-worktrees` | release | local | A sub-lead's worker worktrees sit beside its own under `.claude/worktrees/`. |
| `exclude-line` | release | local | The lead adds `.claude/worktrees/` to `.git/info/exclude` once, the first time it creates a worktree. |
| `worktree-removal` | release | local | The lead removes each worker's worktree once its result is integrated or discarded, and keeps the branch. |
| `swarm-local-only` | release | local | Under "local only", a swarm runs in parallel local worktrees. |
| `missing-env` | release | local | A worker in a fresh worktree with `.env.example` but no `.env` returns `BLOCKED: missing .env` and creates or copies nothing. |
| `cloud-worker-nonce` | release | local | A local lead finds its cloud worker's report branch by its `Pstack-Nonce` trailer and reads the trailered report commit. |
| `cloud-sub-lead` | release | cloud | A cloud worktree sub-lead spawns worktree workers of its own, waits for each with pstack's wait command, and the worktree guard refuses none of the commands pstack's text tells it to run. A refused command of the sub-lead's own is recorded, not failed. |
| `swarm-window` | release | cloud | Swarm keeps at most 10 slices in flight, and a refused spawn is backpressure: no slice dropped. |
| **Machine lock** | | | |
| `lock-taskstop` | release | cloud | `TaskStop` on an in-VM subagent holding the lock kills its child processes and frees the lock. |
| `lock-macos-death` | release | local | On macOS, the lock is freed when its holder is killed with `SIGKILL`. |
| `lock-busy` | release | local | The wrapper exits with its busy code after its wait cap, and a re-run after the holder finishes goes through. |
| `foreign-failure` | release | local | A failure already at the base in a file the worker doesn't own comes back as `foreign failure: <file>`, unfixed, and reaches the lead's full gate. |
| **Orchestrate** | | | |
| `orch-store-push` | release | local | `orch` commits the store to its orphan branch by plumbing and pushes it, with no worktree created and the working tree and index untouched. |
| `orch-frontier-drift` | release | local | `frontier set` fails when a PR's base ref has drifted from its parent. |
| `orch-compaction` | release | local | A compacted orchestrate lead re-reads its store and respawns nothing. |
| **Spec intake** | | | |
| `spec-build-cloud` | release | cloud | `/pstack:poteto-mode build <issue URL>` reads the issue and its comments through `gh api` REST, and plans then executes without stopping. |
| `plan-only` | release | local | "plan only" stops once the plan is posted. |
| `plan-placement` | release | local | The plan lands as a comment on the spec issue, or on an orphan branch for a file or verbatim task, and never in a PR's diff. |
| `hand-off-failure` | release | local | A failed hand-off keeps the run local and says why once. |
| **Rules and skills** | | | |
| `rule-tdd` | release | local | The fixture's TDD rule makes a Feature run test-first. |
| `rule-no-ticket-links` | release | local | The fixture's no-ticket-links rule beats Comment Sicko's keep clause for an issue or RFC link. |
| `session-trailer-cloud` | release | cloud | A cloud worker's report commit keeps `Claude-Session:` while the repo sets `attribution.commit` to `""`. |
| `panel-waiver` | release | local | A user's waiver is recorded as `skip: user waived`, and the agent never skips a mandatory panel on its own. |
| `same-purpose-skill` | release | local | With a same-purpose user skill installed, a run loads only pstack's unless `CLAUDE.md` or the request names the other. |
| `vendored-skills` | release | local | The hidden vendored skills (`deslop`, `control-ui`, `control-cli`) are reached by path. |
| `no-pstack-agent` | release | local | A session not in poteto-mode never picks a pstack agent. |
| **Compaction** | | | |
| `compaction-hook-local` | release | local | After a mid-turn auto-compaction on a marketplace install, the compaction hook fires in poteto-mode and stays silent outside it. |
| `compaction-hook-cloud` | release | cloud | The compaction hook fires after a mid-turn auto-compaction in cloud. |
| `transcript-history` | release | local | The `.jsonl` at `transcript_path` still holds the full pre-compaction history. |
| `wip-push-cloud` | release | cloud | A cloud lead's Pause safely pushes its `wip:` commit, resume note in the body, to its own branch. |
| **Scripts** | | | |
| `watch-pr-rest` | release | cloud | `watch-pr`'s REST reader reads `/ccr/review_threads` on a real cloud PR and gives the verdict its threads call for. |
| `worktree-audit` | release | local | `worktree-audit.sh` maps worktrees to Claude Code transcripts by `cwd`. |
| **Landing** | | | |
| `landing-squash` | release | cloud | With a landing grant, a cloud run squash-merges through REST into the fixture's protected `main` once `check` is green, and lists the leftover branches. |
| `landing-refused` | release | cloud | A refused merge (the fixture's `gated` branch needs a review) stops the PR at merge-ready, reported as a gate, never retried or worked around. |
| **Routines** | | | |
| `routine-run-now` | release | cloud | The README's routine with the task in its prompt, fired with Run now, runs start to finish. |
| `routine-label` | release | cloud | The README's GitHub-label routine waits for the trigger context as the next message, then runs start to finish. Its work lands on the PR's head branch. |
| **Last** | | | |
| `dogfood` | release | cloud | A spec issue on one of the maintainer's personal repos runs end to end with `/pstack:poteto-mode build <issue URL>`. Not in the fixture: it has no brief and reports on the tracking issue. |

## Watch checks

| Check | Tier | Surface | Passes when |
|---|---|---|---|
| `goal-compaction` | watch | local | A `/goal` survives compaction. |
| `long-wait-vm` | watch | cloud | An hours-long background wait keeps the cloud VM up. |
| `many-sessions` | watch | local | More than 6 separate-session cloud workers start at once. |
| `lock-two-sessions` | watch | local | Two pstack sessions on one laptop queue on the machine lock. |
| `chromium-trusted` | watch | cloud | The best-effort Chromium download gets through the Trusted network. |
| `project-thread` | watch | cloud | A Project thread loads the setup line's plugin and enters `/pstack:poteto-mode`; its permission mode is recorded. |
| `cloud-node-version` | watch | cloud | The cloud VM's Node minor version is recorded. |
| `routine-cron` | watch | cloud | A cron-fired routine runs start to finish. |
| `routine-model` | watch | cloud | The model a `/schedule` routine stores is the one its run uses. |
| `draft-label-events` | watch | cloud | A label event on a draft PR fires the routine, or the README says it doesn't. |
| `sync-ci` | watch | — (this repo's CI) | CI runs on the first real sync PR once the maintainer approves it. |
| `eval-arena` | watch | local | The eval playbook compares arena's directions plus fourth-way runner against N identical briefs. |
| `eval-interrogate` | watch | local | The eval playbook compares interrogate's three lenses against three whole-rubric reviewers. |
