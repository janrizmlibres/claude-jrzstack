---
status: accepted
---

# jrzstack adapts to the surface it runs on

No surface is primary. A run's lead is whichever session the user invokes `/jrzstack:savvy-mode` in, local or cloud, and the user may hand the run off to a session on the other surface at any point, with any input: a spec, a file, or the task verbatim. Each playbook adapts to the surface its lead is on and refuses only where that surface genuinely cannot do the work.

Parallel work is isolated the way upstream isolates it: **each parallel code-writing worker gets its own git worktree or its own cloud machine**, never a shared checkout. On the user's machine that means local git worktrees, which cost disk; the worktree cleanup playbook and the lead's own removal of its workers' worktrees keep that bounded.

## Consequences

- **Every worktree worker starts from a named commit.** A Claude Code worktree (`isolation: "worktree"` or `EnterWorktree`) is created under the repo's `.claude/worktrees/` and branches from the default branch's remote head unless the user's `worktree.baseRef` setting says otherwise. So the brief names the commit to start from and the worker's first step resets to it, on both surfaces. Its report is a trailered final commit on its own branch. The lead adds `.claude/worktrees/` to `.git/info/exclude` the first time it creates one.
- **A cloud lead fans out through in-VM subagents by default.** Read-only roles work in the lead's checkout; code-writing and competing roles get `isolation: "worktree"`. The VM pins the spawn depth at 1, so the setup line writes `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=3` into the VM's user settings: a settings-file `env` block overrides the pin, and the in-VM tree then nests like a local one. A sub-lead, such as an Autopilot owner, is an in-VM subagent that runs its own panels. A cloud lead opens PRs from its own checkout, since the VM is already isolated.
- **A cloud lead that can call `create_session`** also starts `create_session` workers, each on its own VM, for a worker that needs a whole machine. In practice that is a lead started in Auto mode. Workers inherit Auto, and the lead reads their transcripts back and polls for completion. Auto is the only route that pre-approves `create_session` and `send_message`. Worker briefs must keep clear of what its classifier refuses (pushes outside the session's branch, credential-adjacent reads), because three consecutive refusals stall a session until a human answers. A worker that asks the human stalls the same way, and the lead can't clear it.
- **A cloud lead that can't call `create_session` unprompted** still runs, on in-VM subagents only, sub-leads included, and says once what is missing. Outside Auto each call would wait on a human click, so the lead never makes one and says Auto would allow separate-VM workers.
- **A routine run is a cloud lead.** A routine set up with the repo and an environment carrying the setup line, whose prompt starts with `/jrzstack:savvy-mode`, gets the plugin, the reminder hook on every turn, depth 3, the repo and Auto. It has no `create_session` unless the user attaches the Claude_Code_Remote connector, so in v1 it runs on in-VM subagents only, swarm included. Input from an API call or a GitHub event reaches it only as a second turn, after its first turn ends, so the routine's prompt tells it to wait for that message.
- **A local lead works from worktrees, as upstream does.** It opens every PR from a worktree it creates off the PR's base (`git worktree add`, then `EnterWorktree` by path), leaving the user's checkout alone. Read-only subagents work in the lead's worktree. Every parallel code-writing worker, competing or not (arena and architect runners, parallel prototypes, figure-it-out and visual-parity workers), is a local `isolation: "worktree"` subagent; a sub-lead's workers get worktrees beside its own. The lead removes each worker's worktree once that worker's result is integrated or discarded and keeps the branch; strays go to the cleanup playbook. Upstream's big fan-outs keep upstream's cloud default: swarm workers (races included), orchestrate units and autopilot owners go to cloud workers, `claude --permission-mode auto --cloud` under a pseudo-terminal in the user's default cloud environment, after the lead pushes the run's base, and the lead reads their results only from what they push. Work that needs the user's machine stays local. The laptop stays on for the run.
- **Local-only is opt-in.** The user asks for it per run in plain words ("local only", "no cloud workers"). The lead also falls back to it, and says so once, when it can't start cloud workers: Auto isn't available on the account, no default cloud environment is set, or a launch fails. Under local-only, the big fan-outs run in parallel in local worktrees too, inside the same in-flight window.
- **One machine lock covers every local worktree.** Heavy commands, a fresh worktree's dependency install included, queue on it however many worktrees exist. A worktree has tracked files only: a worker missing another gitignored file it needs (such as `.env`) reports it and never copies it, and the user's `.worktreeinclude` is the fix.
- **Hand-off is the user's choice, never a default.** The entry point pushes the input first, because a cloud session sees only pushed work, and keeps no control afterwards. A cloud session can't message a local one, so a done status comes back only by polling GitHub or watching the session.

## Not viable

These stay out until Claude Code changes:

- `Agent` with `isolation: "remote"`, on either surface: locally it makes a worktree cut from `main`, and in cloud it shares the lead's checkout.
- A cloud lead running work that needs the user's machine: local UI or CLI checks, simulators, local transcripts, auth that exists only there.
- A cloud session reporting to a local session. Messaging runs only local to cloud.

## Considered options

- **Cloud lead primary, with hand-off as the default** (this ADR's first version). Rejected: the user works from both surfaces and starts runs from either, so a rule that one surface's constraints win made the other a fallback for no reason the facts required.
- **Local lead primary.** Rejected for the same reason.
- **No git worktrees on the user's machine** (this ADR's absolute rule until 2026-10-08), to save local storage. Rejected: it forced competing local work into one-at-a-time branches or cloud workers, while upstream's local path runs on worktrees, and the port now carries upstream's worktree cleanup.
- **A local lead starts cloud workers only when the user asks in that run** (this ADR's second version). Rejected: the user mostly works with cloud workers, and upstream defaults its big fan-outs to cloud, so asking every run made the common case the opt-in.
- **Cloud workers for every competing attempt under a local lead** (this ADR's third version). Rejected: upstream runs arena and architect runners in local worktrees and sends only swarm, orchestrate and the autopilots to cloud; matching it keeps the common panels free of pushes, Auto and a cloud environment.
- **Disjoint-file workers sharing the lead's checkout.** Rejected with the no-worktree rule: siblings' half-written edits break each other's targeted checks, and upstream gives each parallel worker its own worktree.
