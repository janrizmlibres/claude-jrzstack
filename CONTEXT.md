# claude-pstack

A Claude Code port of pstack, Lauren Tan's Cursor plugin of agent workflows, kept in step with its upstream.

## Language

### Source and port

**Upstream**:
The pstack plugin as published in `cursor/plugins`, the source this repo ports from.
_Avoid_: original, source plugin, Cursor version

**Snapshot**:
The verbatim copy of upstream, at one recorded upstream commit, that the current port was made from. Never edited by hand; only a sync advances it.
_Avoid_: vendor copy, mirror, base

**Port**:
The Claude Code edition of pstack that this repo publishes.
_Avoid_: fork, conversion, adaptation

**Translated file**:
A port file made from its upstream counterpart by applying the conversion rules. A sync re-translates it when its counterpart changes.
_Avoid_: generated file, converted file

**Conversion rule**:
A rule every translation and re-translation applies to turn an upstream mechanic into its Claude Code form, such as converting a multi-model step to one model family.
_Avoid_: mapping, transform

**Override**:
A port file written by hand for Claude Code in place of translating its upstream counterpart. A sync never re-translates it; a change to its counterpart flags it for reconsideration.
_Avoid_: patch, customization, fork

**Port-only file**:
A port file with no upstream counterpart, such as a manifest or a hook the port adds.
_Avoid_: extra, addition

**Dropped file**:
An upstream file the port deliberately leaves out because the effort rules it out, not merely because it is Cursor-specific: a Cursor-only file with a Claude Code equivalent is translated or overridden instead. A sync lists changes to it and otherwise ignores them.
_Avoid_: skipped file, excluded file, unsupported file

**Sync**:
Bringing the port up to a newer upstream: diff upstream against the snapshot, carry each change into the port, then advance the snapshot.
_Avoid_: update, merge, rebase

**Re-translation**:
Carrying a change in the conversion rules into every translated file it touches, with the snapshot left where it is. Not a sync: upstream has not moved.
_Avoid_: re-port, resync

### Execution

**Surface**:
Where a Claude Code session executes: **local** (the user's machine — CLI, desktop or IDE) or **cloud** (a claude.ai/code session on an Anthropic VM). Decided by where the session runs, not where it was launched: `claude --cloud` typed in a local terminal starts a cloud session.
_Avoid_: environment (a cloud environment is the setup-script and network config), platform, host

**Lead**:
The session a run is handed to (a spec, or a task verbatim). It plans the fan-out, starts the workers and integrates what they return. Has a surface of its own, independent of its workers'.
_Avoid_: coordinator (reserved for upstream's `orchestrate`), orchestrator, parent

**Worker**:
A session or subagent a lead starts to carry out one piece of a run.
_Avoid_: child, agent

**Sub-lead**:
A worker that starts workers of its own for its piece of the run, such as an Autopilot owner running its own panels. The lead decides at brief time whether a worker is one.
_Avoid_: sub-coordinator (reserved for upstream's `orchestrate`), nested lead

**Leaf worker**:
A worker that never starts workers of its own. At a panel trigger it returns to its lead, which runs the panel.
_Avoid_: terminal worker, plain worker

**Role**:
The job a worker does in a run: delegate, runner, reviewer, judge or synthesizer. A role, not a worker, is what a model and effort setting attaches to.
_Avoid_: seat, tier, slot

**Setting**:
A named model-and-effort pair that a role runs on: **Work**, **Judgement** or **Volume**. The user chooses a setting's model and its starting effort; each spawn adjusts the effort to its job.
_Avoid_: tier, budget, level

**Volume role**:
A role whose results come from the number of attempts or pages read rather than the depth of each, such as the workers of a race any single success wins.
_Avoid_: cheap role, bulk worker

**Direction**:
The whole shape one arena runner is told to build, distinct from every other runner's. One of the two ways a fan-out gets breadth from prompts rather than models.
_Avoid_: approach, variant, persona

**Lens**:
The part of a review rubric one reviewer owns. The other way a fan-out gets breadth from prompts: reviewers split the rubric instead of each applying all of it.
_Avoid_: angle, focus, perspective

**Panel**:
A fan-out of several workers on one artifact whose results the lead weighs against each other: an arena's runners and judge, or interrogate's reviewers.
_Avoid_: committee, ensemble, council

**Sample**:
One eval candidate's run of the change under test, on the same organic prompt as every other sample. A measurement, not breadth: identical prompts are the point, so the race rules on distinct briefs do not apply.
_Avoid_: candidate, run, arm

**Fresh-context review**:
A review by a worker that is given the work's artifacts but never the reasoning that produced them, such as a blind judge or a trail auditor. What a cross-family review becomes on one model family.
_Avoid_: independent review, cross-model review, second family

**Entry point**:
The session where the user starts a run, on either surface. It is the run's lead unless the user hands the run off.
_Avoid_: launcher, front end

**Hand-off**:
An entry point passing a run to a lead on the other surface, when the user chooses to. The input (a spec, a file, or the task verbatim) is pushed first; the entry point keeps no control afterwards.
_Avoid_: delegation (a lead giving work to its workers), dispatch

**Routine run**:
A cloud session started by a routine set up with the repo and an environment carrying the setup line. An entry point like any other: its input is in the routine's prompt or, when an API call or GitHub event fires it, arrives as the next message.
_Avoid_: scheduled run, triggered session

**Local-only**:
A run in which a local lead starts no cloud workers, so work that would go to them runs in parallel local worktrees instead. The user asks for it per run, or the lead falls back to it, and says so once, when it can't start cloud workers.
_Avoid_: offline, no-cloud mode

**Heavy command**:
A command whose cost is bounded by the machine rather than the model: a test runner, a build, a whole-project typecheck or lint, a dev server, a browser session. Scoped to one file it is still heavy; a dev server or browser session stays heavy for as long as it is up.
_Avoid_: test run, heavy run (a run is a pstack run)

**Machine lock**:
The bound that lets one heavy command at a time run on a machine, shared by every pstack session on it. On the cloud surface the machine is the VM.
_Avoid_: test lock, build lock, mutex

**Full gate**:
A project's whole verification (the full suite, the build, end-to-end checks), run at an integration point by the lead, or by a sub-lead for its piece. Workers run only heavy commands scoped to the files they own.
_Avoid_: CI run, final check, verification pass

**Program**:
A run too large for any single agent, such as a multi-day effort landing many stacked PRs, driven by one lead through orchestrate. A run one agent could finish within its budget is not a program, however it is phrased.
_Avoid_: project (a Claude Project is a claude.ai product), campaign, epic

**Store**:
A program's durable bookkeeping: its standing orders, units, verification ledger, inbox, human gates and status. The lead keeps it and checkpoints it where it outlives the session, so a lead coming back from compaction or a restart rebuilds its view from the store, not from memory.
_Avoid_: state, scratch, notes

**Restart**:
A lead taking a run up again in a new session or through `--resume`. Its in-VM workers are dead and its separate-session workers alive, so it rebuilds from durable state and respawns what died. Contrast compaction, where the same session goes on and its in-VM workers are still running, so it re-reads its durable state and respawns nothing.
_Avoid_: reboot, relaunch, recovery

**Resume note**:
The checkpoint Pause safely writes into the body of its `wip:` commit (pushed to the session's own branch in cloud): intent, progress, what's verified, next steps, key files and gotchas. Session pickup reads it first.
_Avoid_: handoff note, resume file, checkpoint file

**Stacker**:
The one worker allowed to rewrite a stack's topology (rebase, force-push), for conflicted merges and restacks. Clean landings are not its job; the lead or sub-lead does those.
_Avoid_: restacker, topology writer, babysitter (watches one stack's PRs and reports to the stacker)

**Landing**:
Merging a verified PR into its base: through the forge's merge, or, in a program, by the lead pushing a fast-forward or clean cherry-pick of the unit's commit.
_Avoid_: shipping (the playbook), merge (too broad: a stacker's conflicted merge is not a landing)

**Landing grant**:
A request's explicit permission to land. Withheld unless the request gives it; with it, a refused merge still stops that PR at merge-ready for the user, never routed around.
_Avoid_: merge authority, landing authority

**Setup line**:
The command a user pastes into a cloud environment's setup script to install the port there, carrying their model choices. The only way the port reaches the cloud surface.
_Avoid_: cloud line, install command

### Run input

**Spec**:
The planning output a run is handed: a GitHub issue written by the user's planning tools, saying what to build and why but not how to slice it into PRs. pstack reads a spec and never edits it. Handing pstack a spec is the go to execute it, unless the request asks for a plan only.
_Avoid_: PRD, ticket, plan

**Plan**:
The checklist pstack writes from a spec when the work spans several PRs: the PR slicing, their dependencies, each PR's evidence and the playbook that executes it. It lives beside the spec, never in it.
_Avoid_: spec, roadmap

### Release and QA

**Release**:
Any merge to `main`: the port carries no version, so every merge ships. The *first release* is the first merge that puts the plugin on `main`.
_Avoid_: version, publish, deploy

**Release candidate**:
The branch the release checks install the port from, before the first release.
_Avoid_: RC build, staging branch, beta

**Release check**:
A check that must pass on the release candidate before the first release: a failure would break installing or entering pstack on a surface, or let a playbook do the wrong thing without saying so.
_Avoid_: gate (a **Full gate** is a run's verification), blocker, acceptance test

**Watch check**:
A check run after a release, covering scale limits and rare paths. A failure becomes a bug, not a hold on the release.
_Avoid_: post-release test, soak test, nice-to-have

**Fixture repo**:
The throwaway repository release and watch checks run in, carrying everything the checks need (a test suite, a dev server, conflicting rules) so they never touch the user's own repos.
_Avoid_: test repo, sandbox, demo repo
