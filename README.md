# pstack for Claude Code

<!-- BEGIN generated from upstream/snapshot.json — do not edit by hand -->
**Tracks upstream pstack v0.15.15** (`cursor/plugins@df58112`).
<!-- END generated -->
pstack is © Lauren Tan, MIT; this port is MIT too (see [License and credit](#license-and-credit)).

A Claude Code port of [pstack](https://github.com/cursor/plugins/tree/main/pstack), Lauren Tan's
Cursor plugin of agent workflows, kept in step with upstream. Type `/pstack:poteto-mode` with a
task, an issue or a spec: pstack picks a playbook (Feature, Bug fix, Refactoring, Orchestrate…),
runs it with parallel workers and review panels, and opens the PRs. It runs the same way on your
machine and in a Claude Code cloud session.

## Install (local)

**Prerequisites**
- Claude Code 2.1.294 or later, the version CI validates the plugin with.
- `gh`, signed in.
- **Bun, or Node ≥ 22.18**, for orchestrate, babysitting PRs, shipping and multi-phase plans.
  Without one, those steps stop and print the install line; the rest of pstack runs.

**Install**

```
/plugin marketplace add janrizmlibres/claude-pstack
/plugin install pstack@claude-pstack
```

**Turn on auto-update.** Claude Code leaves it off for third-party marketplaces: `/plugin` →
Marketplaces → `claude-pstack` → Enable auto-update. Every merge to `main` is a release, so
without auto-update you stay on the commit you installed. `/plugin` shows a commit SHA, not a
version number; the upstream version you're on is the line at the top of this README.

**The `Read` rule** (default permission mode only). pstack's skills read each other by path from
the plugin cache. In default mode those reads prompt you, and a subagent's are denied. Add one
rule to `permissions.allow` in your user settings, `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["Read(~/.claude/plugins/cache/claude-pstack/**)"]
  }
}
```

Auto mode needs nothing, and the cloud setup line adds its own rule.

**Pick models** (optional): `/config` → pstack, or `/plugin configure pstack@claude-pstack`. Each
setting takes `opus`, `sonnet`, `haiku` or `fable`; an unconfigured install runs on the defaults.

| Setting | Runs | Default | Effort (fixed) |
|---|---|---|---|
| Work | code delegates, arena runners, sub-leads | `opus` | medium |
| Judgement | judges, reviewers, the hardest tasks | `opus` | high |
| Volume | swarm and race workers, bulk readers | `sonnet` | high |

`/pstack:setup-pstack` shows your current settings and prints the cloud setup line filled in with
them.

**Worktrees.** A local run gives each parallel code-writing worker its own git worktree under
`.claude/worktrees/` (arena and architect runners, prototypes, figure-it-out and visual-parity
workers), and each PR works from a worktree off its base, `develop` or any other. Your own
checkout is left alone.
- Worktrees hold tracked files only. List the gitignored files workers need, such as `.env`, in a
  `.worktreeinclude` at your repo root. A worker missing one stops with `BLOCKED: missing <file>`
  rather than creating it, even from a template such as `.env.example`.
- `worktree.symlinkDirectories` (for `node_modules`, say) is yours to opt into. pstack never sets
  it, since one worktree's install would then change every other's.
- Worktrees cost disk. The lead removes workers' worktrees once their work is integrated and keeps
  the branches; ask for "worktree cleanup" to reclaim strays.

## Cloud workers from a local run

A local lead sends **swarm workers, orchestrate units and autopilot owners** to Claude Code cloud
sessions by default. That needs:
1. **Auto mode** on your account: the lead starts cloud workers with
   `claude --permission-mode auto --cloud`. Any other mode would stop on a click per worker.
2. A **default cloud environment** that carries the setup line (next section), since cloud workers
   launch there. Pick it with `/remote-env`, which saves it to your user settings.

Say **"local only"** in a request to keep everything on your machine: the big fan-outs then run
in parallel local worktrees. If the lead can't start cloud workers, it falls back to local only
and says so once.

## Install (cloud)

The cloud surface has no `/plugin`, so pstack gets there through the environment's **Setup
script**. Paste this **setup line** into it, or copy it from `/pstack:setup-pstack`, which fills
in your model settings:

```
git clone --depth 1 https://github.com/janrizmlibres/claude-pstack /opt/claude-pstack && bash /opt/claude-pstack/scripts/cloud-install.sh --config work_model=opus --config judgement_model=opus --config volume_model=sonnet
```

It installs the plugin, lets subagents nest three deep, adds the `Read` rule, installs Chromium for
browser checks on a best-effort basis (setup still finishes if the download fails), and adds a
session-start hook that pulls the latest pstack, so cloud sessions stay current without your
editing the line. A pulled update takes effect in the session that pulled it: skill text, hook
output and agent descriptions all come from the new version. Changing a model means editing the
line.

- Put the line in **every environment that should carry pstack.**
- **One environment per repo**, if you keep one for each project: set
  `"remote": { "defaultEnvironmentId": "<env_ id>" }` in that repo's `.claude/settings.local.json`.
  Pick it once with `/remote-env`, then move the key there from `~/.claude/settings.json`; local
  settings outrank user settings. `claude --cloud` and a local lead's cloud workers then use it in
  that repo without your naming it each run.
- Turn on the repo's **Automatically delete head branches** setting. A cloud session can't delete
  branches or change repo settings; with it on, merged heads go and open stacked PRs are
  retargeted. Whatever a run leaves behind is listed in its final reply, with one delete line to
  run locally.

## Running it

```
/pstack:poteto-mode fix the flaky retry test in src/net
/pstack:poteto-mode build #42
```

**Run a spec in the cloud.** Plan locally (with `/to-spec`, for instance), then start a cloud
session with:

```
/pstack:poteto-mode build https://github.com/<you>/<repo>/issues/42
```

- Handing pstack a spec is the go to **execute** it: it posts its plan on the spec's issue (or an
  orphan branch, for a spec that isn't an issue) and carries on. Say **"plan only"** to stop once
  the plan is posted.
- **Landing (merging) stays with you** unless the request grants it ("…and land it").
- **"Hand this off"** in a local run passes it to a cloud lead and ends with the session link. If
  the hand-off fails, the run stays local and says why once.

### From a routine

A routine whose prompt starts with `/pstack:poteto-mode` runs as a full cloud lead.
- Set the routine up with your repo and an environment that carries the setup line. Its workers
  run as subagents in the routine's own VM; it needs no connector.
- Set or check the routine's model with `/schedule`: the claude.ai form may not save its pick.
- A task written into the prompt (fired on a schedule, or with Run now) needs nothing more. For an
  **API or GitHub firing**, the input arrives as the next message, so the prompt has to wait for
  it:

  ```
  /pstack:poteto-mode build the PR in the trigger context. It arrives as the next message: end this turn without acting until it does.
  ```

- Label events on draft PRs may not fire.
- A GitHub-fired run starts detached at the PR's head. It pushes its work to the PR's head branch,
  so the PR updates in place. When that push is refused (a fork's head, branch protection), it
  pushes a `claude/` branch and opens a PR against the head branch.
- The run pushes like any cloud lead, and landing stays withheld unless the prompt grants it.

## What a run costs

A Feature can run up to three panels:

| Panel | Workers |
|---|---|
| architect (an arena) | 3 Work runners + 1 Judgement judge |
| implementation arena | 3 Work runners + 1 Judgement judge |
| interrogate | 3 Judgement reviewers |

On the default settings that is up to **11 Opus workers** for one Feature, plus the lead. Most bug
fixes run no panel. To spend less, waive a panel in the request ("skip the arena") or in your
`CLAUDE.md`; the run records it as `skip: user waived`. pstack never skips one on its own.

Heavy commands (tests, builds, whole-project typechecks, dev servers, browsers) run **one at a
time per machine**, across every pstack session on it, so a wide fan-out is bounded by your test
and build time, not by the number of workers.

## Your rules win

Your request and your `CLAUDE.md` outrank pstack's text, its Non-negotiables included: commit
attribution, TDD, merge method, PR title style, test caps. pstack's defaults (squash merges,
Conventional Commits, hand-chained stacks) apply only where you say nothing. To use `gh stack` for
stacked PRs, for example, say so in your `CLAUDE.md`.

In cloud, your user-level `CLAUDE.md` isn't there: rules come from the request and the repo's own
`CLAUDE.md`.

## How the port differs

- **Claude models only.** Upstream mixes model families for breadth. The port gets breadth from
  distinct prompts instead: arena runners each build a different direction, plus one runner
  that looks outside them all, and interrogate's reviewers split the rubric into lenses. Judges and
  reviewers get fresh context, never the reasoning they judge.
- **Three settings, not a per-role model map.** Work, Judgement and Volume, [above](#install-local).
- **No Cursor dependencies.** Cursor's CLI, modes, Bugbot and Origin are replaced or dropped;
  review-bot triage covers any review bot, and `gh` is the only forge.
- **Cloud is a second surface.** Upstream sends big fan-outs to Cursor cloud agents; the port sends
  the same ones to Claude Code cloud sessions under Auto, and a whole run can start in cloud.
- **Added by the port:** the cloud setup line, the per-turn reminder hook, recovery after context
  compaction, the machine lock on heavy commands, and the hand-off playbook.
- **Left out:** `automations/benny` (Cursor Slack automations), `make-bot-ui` (Cursor Grok Bot
  automations) and external models.

### File by file

<!-- BEGIN generated from port.json — do not edit by hand -->
| File | Kind | Why |
|---|---|---|
| `skills/architect/SKILL.md` | override | Phase B's two distinct candidates come from arena's directions, the architect runners model line goes, and a spec's Implementation Decisions reach every runner as fixed constraints |
| `skills/architect/references/runner-prompt.md` | override | arena's directed or fourth-way block replaces the each-on-a-different-model paragraph, and a spec's Implementation Decisions bind every shape |
| `skills/arena/SKILL.md` | override | runners on Work with two whole-shape directions, a fourth-way seat and their escapes, and a blind judge on every arena, in place of a runner per model family and a cross-family judge |
| `skills/interrogate/SKILL.md` | override | three lens reviewers on judgement-reader, always all three, with critical-only spillover, the lead's verification gate in place of consensus, and a Coverage Map with Checked and Gaps in place of the Agreement Map |
| `skills/interrogate/references/lead-judgment.md` | override | the verification gate replaces the consensus signal: Act on needs a traced path, and every dismissed critical is re-checked |
| `skills/interrogate/references/reviewer-prompt.md` | override | a lens brief: one lens's sections, the other lenses named for critical-only spillover, and a required Checked list |
| `skills/poteto-help/SKILL.md` | override | Cursor-only sections (Custom Mode, Option+Enter, .cursor/rules, /add-plugin) rewritten for Claude Code's install, settings and surfaces, with a row for re-entering the mode after a resume |
| `skills/poteto-mode/playbooks/eval.md` | override | spawns its own blind samples, 3 per variant on the model the change meets in use, with one blind Judgement judge over all of them and an opt-in cross-model sweep, in place of arena's model fan-out and cross-family judge; a user-invoked skill's samples run on the general-purpose agent, which inherits the lead's model, since a setting agent's pstack body would skew them |
| `skills/poteto-mode/playbooks/orchestrate.md` | override | a lead and sub-leads place units by surface (cloud workers, local-only worktrees, in-VM worktree subagents, create_session in Auto), retry by failure mode, take the full gate at landing as the ledger verdict, land only under a landing grant with Close listing leftover branches, run orch through the launcher with its store on an orphan branch, and split restart from compaction |
| `skills/poteto-mode/scripts/check-plan.mjs` | override | its markers match the port's plan wording: live lanes on the `volume` agent instead of a named model, and playbooks read from the plugin instead of from trunk with `git show` |
| `skills/poteto-mode/scripts/orch/` | override | frontier set takes the stacker's PR order from the store, PR state and merged heads from gh api REST and open heads from git rev-parse, in place of Graphite, and fails on a drifted base or a stale head; init excludes the store from git and every drain pushes it to its orphan branch by plumbing; commander imported directly and NotFoundError's parameter property a plain field, for Node's type stripping |
| `skills/poteto-mode/scripts/watch-pr/fakes.test-helper.ts` | override | adds a fake of the REST API serving the proxy's /ccr/review_threads shape |
| `skills/poteto-mode/scripts/watch-pr/github.test.ts` | override | adds tests of the REST reader against a fake of the proxy's routes, its verdicts beside GraphQL's on the same threads, the fallback and the review-bot logins |
| `skills/poteto-mode/scripts/watch-pr/github.ts` | override | adds a REST reader for cloud, where the session proxy refuses GraphQL, reading review threads from the proxy's /ccr/review_threads route, and switches to it at the first refusal; review bots are matched from a list of logins |
| `skills/poteto-mode/scripts/watch-pr/watch-pr` | override | drops the bootstrap.ts install: the launcher runs it with the vendored commander |
| `skills/poteto-mode/scripts/worktree-audit.sh` | override | attributes each worktree to the newest Claude Code transcript whose cwd is that worktree or lies under it, read only from the project directories of the main checkout and its worktrees, in place of a path search of Cursor's agent-transcripts, and buckets a worktree no transcript claims as a stray; it also runs on Linux and takes paths with spaces |
| `skills/setup-pstack/SKILL.md` | override | shows the three settings, points to /config, prints the setup line and shows the Read rule, in place of writing a Cursor model rule |
| `.claude-plugin/plugin.json` | port-only | Claude Code's plugin manifest, with the three model settings as userConfig and no version |
| `agents/judgement-reader.md` | port-only | the Judgement setting's reader, in place of a readonly generalPurpose spawn: no Edit, Write or NotebookEdit, high effort |
| `agents/judgement.md` | port-only | the Judgement setting's writer: upstream's poteto-agent body on the Judgement default model at high effort, in the background |
| `agents/volume-reader.md` | port-only | the Volume setting's reader, in place of a readonly generalPurpose spawn: no Edit, Write or NotebookEdit, high effort |
| `agents/volume.md` | port-only | the Volume setting's writer: upstream's poteto-agent body on the Volume default model at high effort, in the background |
| `agents/work-reader.md` | port-only | the Work setting's reader, in place of a readonly generalPurpose spawn: no Edit, Write or NotebookEdit, medium effort |
| `agents/work.md` | port-only | the Work setting's writer: upstream's poteto-agent body on the Work default model at medium effort, in the background |
| `hooks/hooks.json` | port-only | registers the compaction hook on SessionStart's compact matcher, which skill frontmatter can't: its SessionStart never fires |
| `hooks/poteto-mode-compaction.sh` | port-only | after a compaction in a marked poteto-mode session, lists the durable state to re-read before acting: the skill, any store, the transcript, a trail and a resume note |
| `hooks/poteto-mode-reminder.sh` | port-only | poteto-mode's per-turn reminder hook: upstream's reminder text, the skill path, the surface and mode, precedence and the machine lock, and the session marker the compaction hook reads |
| `scripts/exclude-worktrees` | port-only | adds .claude/worktrees/ to the exclude file once, one plain command a worktree-isolated agent's guard accepts |
| `scripts/heavy` | port-only | the machine lock: runs one heavy command at a time per machine, released by the kernel when its holder dies |
| `scripts/wait-report` | port-only | a sub-lead's wait on a worker's report commit, one plain command a worktree-isolated agent's guard accepts |
| `skills/poteto-mode/playbooks/hand-off.md` | port-only | the Hand-off playbook: on an explicit request only, pushes the input, starts a cloud lead with `claude --permission-mode auto --cloud` and a fixed brief whose first check ends a bundled session with no GitHub remote, then prints the link and ends, or says why once and stays local |
| `skills/poteto-mode/references/brief-contract.md` | port-only | the rules every worker brief carries: entry line, no human asks, own-branch pushes, start commit, the machine lock, missing files, leaf workers, the trailered report commit and the nonce trailer a lead finds a cloud report by, a sub-lead's timebox and in-turn wait, and the lead's worker worktrees: the exclude line and removal |
| `skills/poteto-mode/scripts/node_modules/commander/` | port-only | commander 14.0.0, the version upstream's bun.lock pins, vendored with its MIT licence so upstream's imports resolve without an install |
| `skills/poteto-mode/scripts/run` | port-only | the runtime launcher: runs poteto-mode's scripts with Bun, else Node 22.18+, in place of bootstrap.ts's install |
| `.cursor-plugin/` | dropped | Cursor's plugin manifest, replaced by Claude Code's in .claude-plugin/plugin.json |
| `.gitignore` | dropped | upstream's plugin-level ignore list: its node_modules/ line would hide the vendored commander, and the repo's root .gitignore covers the rest |
| `agents/poteto-agent.md` | dropped | replaced by the three writer agents, which carry its body |
| `automations/benny/` | dropped | Cursor Slack automations, outside the port's scope |
| `skills/make-bot-ui/` | dropped | Cursor Grok Bot automations: the session creates its own webhook routine and wakes on it, and a lead creating its own routines is out of the port's scope |
| `skills/poteto-mode/scripts/bootstrap.ts` | dropped | installs commander at first run; the port vendors commander and runs scripts through its launcher |
| `skills/poteto-mode/scripts/bun.lock` | dropped | a runtime lockfile for bootstrap.ts's install; kept for development only |
| `skills/poteto-mode/scripts/package.json` | dropped | a runtime manifest for bootstrap.ts's install; kept for development only |

Every other file is translated from upstream at the same path, except `skills/control-cli/` (from `cursor-team-kit/skills/control-cli/`), `skills/control-ui/` (from `cursor-team-kit/skills/control-ui/`) and `skills/deslop/` (from `cursor-team-kit/skills/deslop/`).
<!-- END generated -->

## Keeping up with upstream

A weekly GitHub Action checks upstream. When it has moved, Claude opens one sync PR that brings the
port up to date, with a row per upstream change and ⚠️ on the calls it was unsure of. Nothing
merges itself. The snapshot, upstream's verbatim copy, lives in `upstream/`, and the sync re-renders the
version line and file table above. In a checkout of this repo the same sync runs by hand as
`/sync-upstream` (`/sync-upstream dry run` lists the changes and stops), and
`/sync-upstream retranslate <rule>` carries a conversion-rule change into every translated file.
`CONTEXT.md` and `docs/adr/` explain the port's vocabulary and decisions.

## License and credit

pstack is the work of **Lauren Tan**, published in [cursor/plugins](https://github.com/cursor/plugins)
under the MIT License. Its workflows, playbooks and skills are hers; this port translates them to
Claude Code. Upstream's copyright notice is kept in [`pstack/LICENSE`](pstack/LICENSE), and the
port is released under the MIT License too.

Not affiliated with Cursor or Anthropic.
