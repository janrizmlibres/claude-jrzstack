### Multi-phase or multi-PR plan

**You own the plan, not the code. The plan is a checklist an owner runs box by box and the operator audits from the evidence.** The plan is this playbook's deliverable. Do not implement here. Execution runs after it, under the playbook the plan names.

1. Read the input. A spec is read, never edited. Read an issue, given as a URL or a number, with `gh api` REST on both surfaces, comments included. Run `gh api repos/<owner>/<repo>/issues/<n>`, then `gh api --paginate repos/<owner>/<repo>/issues/<n>/comments`. A repo file is read in place. A task given verbatim is its own input.
2. When the change is one or two files with an obvious approach, skip the plan. Say so and stop, or carry on under the one playbook it needs when the input was the go (step 9). A spec handed in or a request for the plan is never skipped. Write, lint and post the plan whatever its size.
3. Settle open questions by prototype before you write. Run `playbooks/prototype.md` for each. Keep the branch, the SHA, and the screenshots for Appendix A. Ask the operator only about a product or preference call that no run can settle. Give options (the **never-block-on-the-human** principle skill; read ${CLAUDE_PLUGIN_ROOT}/skills/principle-never-block-on-the-human/SKILL.md).
4. Explore in subagents on `poteto-reader` on the Work setting, per the Subagents section (the **guard-the-context-window** principle skill; read ${CLAUDE_PLUGIN_ROOT}/skills/principle-guard-the-context-window/SKILL.md). Pick each subagent's effort for the job, per the Subagents section. Each returns file pointers, conventions, test commands, and entry points. No inlined dumps.
5. Copy the skeleton below into the plan file and fill every placeholder. Unless the operator names a path, write the file at `.claude/pstack/plans/<slug>.md` in your checkout, and first add `.claude/pstack/plans/` to the exclude file `git rev-parse --git-path info/exclude` names (in a linked worktree `.git` is a file), so the plan never lands in a diff. Never commit the plan on the run branch. Keep every heading and every sub-block in the order shown. Keep `${CLAUDE_PLUGIN_ROOT}` literal in the plan, so it reads the same on either surface. One section per PR. One PR is one change with its own evidence (the **sequence-verifiable-units** principle skill; read ${CLAUDE_PLUGIN_ROOT}/skills/principle-sequence-verifiable-units/SKILL.md). Name the execution playbook in **How to read this**. Pick between `playbooks/autopilot-full.md` and `playbooks/autopilot-stack.md` per the rule at the end of `playbooks/autopilot-stack.md`. Without a landing grant in the request, it is always `playbooks/autopilot-stack.md`. A standing program takes `playbooks/orchestrate.md`, and the plan becomes its standing orders.
6. Write under `/technical-writing` (read ${CLAUDE_PLUGIN_ROOT}/skills/technical-writing/SKILL.md) in full, then `/unslop` (read ${CLAUDE_PLUGIN_ROOT}/skills/unslop/SKILL.md). The body is one Diátaxis mode, how-to. Appendices hold explanation and reference. Each heading states the task or the finding. No long dashes. No mid-sentence colons.
7. Run `${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/scripts/run check-plan.mjs <plan.md>` and fix every line it prints (the **encode-lessons-in-structure** principle skill; read ${CLAUDE_PLUGIN_ROOT}/skills/principle-encode-lessons-in-structure/SKILL.md). Exit 69 means no runtime. Say so once with the install line it printed, and post the plan as not linted. Never lint it by hand in the script's place.
8. Post the plan beside the input, never in it. For a spec issue, comment the plan on it with `gh api repos/<owner>/<repo>/issues/<n>/comments -F body=@<plan.md>`. For any other input, push it to the orphan branch `pstack/plan/<slug>` with git plumbing, which touches neither your working tree nor the run branch:

   ```bash
   tree=$(printf '100644 blob %s\tplan.md\n' "$(git hash-object -w <plan.md>)" | git mktree)
   if parent=$(git fetch -q origin pstack/plan/<slug> 2>/dev/null && git rev-parse FETCH_HEAD); then
     commit=$(git commit-tree "$tree" -p "$parent" -m "plan: <title>")
   else
     commit=$(git commit-tree "$tree" -m "plan: <title>")
   fi
   git push origin "${commit}:refs/heads/pstack/plan/<slug>"
   ```

9. Go on or stop. A spec handed in is the go, and so is "run until done" or a go grant in a brief. On the go, carry on under the execution playbook the plan names, with no confirmation. Stop after posting only when the request asks for the plan alone ("plan #42", "plan only"), or when you planned because the operator asked for a plan. Landing stays withheld unless the request grants it.

**Verification.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked (the **prove-it-works** principle skill; read ${CLAUDE_PLUGIN_ROOT}/skills/principle-prove-it-works/SKILL.md). That sentence is the verification rule. Every verification block opens with it. The live block is mandatory. Ten lanes at the PR head drive the real surface through its control skill, per the **swarm** skill (read ${CLAUDE_PLUGIN_ROOT}/skills/swarm/SKILL.md), on `poteto-agent` on the Volume setting. Each lane is one box with a concrete scenario, the screenshot it saves, and its pass predicate. One lane is the **Regression lane against trunk.** It runs the same load-bearing scenario on trunk and head. If trunk does not have the feature, the lane records that fact and gates the behavior the diff adds plus the end state the user waits for instead of inventing a trunk result. The perf gate is dual-sided. Trunk and head must both produce the named metric. If trunk lacks the feature, also isolate the work the diff adds and set an absolute budget for that work plus the end-to-end state the user waits for. Do not claim a ratio between unlike scenarios. The perf block names the metric, the interleaved probe, the trunk baseline measured first, and the rule with the number that fails. A PR that changes an interaction is review-gated. The operator reviews it in chat with screenshots and a video before merge. A PR that changes no interaction writes `**Review gate.** None. <PR id> is not review-gated.` and no boxes under it.

**Control skill.** Pick it by surface. Browser, Electron, and web UIs use `control-ui` (read ${CLAUDE_PLUGIN_ROOT}/skills/control-ui/SKILL.md). CLIs and TUIs use `control-cli` (read ${CLAUDE_PLUGIN_ROOT}/skills/control-cli/SKILL.md). Both ship with pstack. Native mobile uses whatever simulator-driving skill the repo has. A PR that touches two surfaces gets lanes on both. A surface with no control skill is a risk in Appendix C, and its live block still names how each lane drives it.

````markdown
# <Program> plan

<Under ten lines. What changes, for whom, the rule the program enforces, and the PR ids in order.>

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/playbooks/<execution playbook>.md`. <Who merges, and which PR ids are the operator's items that stop at merge-ready.>

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] Start execution only on the go. A spec handed in is the go, as are the operator's explicit go and a go grant in a brief. When the request asked for this plan alone, stop here.
- [ ] Read these at program start. Re-read them at every tick.
  - [ ] `${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/playbooks/<execution playbook>.md`
  - [ ] `${CLAUDE_PLUGIN_ROOT}/skills/swarm/SKILL.md`
  - [ ] `${CLAUDE_PLUGIN_ROOT}/skills/<control skill>/SKILL.md`
  - [ ] `${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/references/brief-contract.md`
  - [ ] `${CLAUDE_PLUGIN_ROOT}/skills/<each other leaf skill the program uses>/SKILL.md`
- [ ] On the go, arm the audit tick as `/loop 1h` with the tick prompt below, through the Skill tool. In cloud (`pstack: surface=cloud`), run the same cadence from a background wait instead, since a pending loop won't wake a paused VM. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Read the poteto-mode skill at ${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/SKILL.md and re-read the execution playbook. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names. Each owner's brief follows the brief contract.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] <PR id> and <PR id> are independent and first. Both branch from `<base-branch>`.
  - [ ] <PR id> after <PR id>.
- [ ] Hold the file boundaries. <PR id or class> touches only `<glob>`.
- [ ] Hold the review gate. <PR ids> change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] GitHub CLI (`gh`) is the forge. In cloud (`pstack: surface=cloud`), do the same operation with `gh api` REST.
- [ ] Open the PR ready, never draft, per **Opening a PR**. Open it with `gh pr create --base <base-branch>`. A stack child targets its parent branch.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` (read ${CLAUDE_PLUGIN_ROOT}/skills/deslop/SKILL.md) before each commit and `/no-comments` (read ${CLAUDE_PLUGIN_ROOT}/skills/no-comments/SKILL.md) before review.
- [ ] Triage every comment from review bots (e.g. Claude Code Review, Bugbot, Copilot) and security-review bots per `${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before the code-ready report and babysit. Keep that merge base in fix rounds. Rebase again only at merge prep, on a `git merge-tree` conflict with trunk, or on a CI failure that comes from a change on trunk.

### Verdict and merge, for every PR

- [ ] A full swarm runs once, at the code-ready head. Another full swarm runs only for new behavior, a redesign, or a large new diff. A rebase, a merge-conflict resolution, or a minor fix gets a single verifier at the new head. Run each full swarm per `${CLAUDE_PLUGIN_ROOT}/skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. Two or more audit lanes, each with its own focus, that read the diff and the receipts and distrust the PR body. The root audits the receipts in the merge-ready report before the verdict.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner, including a defect that a lane filed as a note. A new head gets a fresh verdict, except for results that stay valid under the patch-id rule in `playbooks/shipping.md`.
- [ ] <The merge or append rule from the execution playbook, with the patch-id rule from `playbooks/shipping.md`.>

### Boot recipe, for every live lane

Each live lane runs on its own worker at the PR head, placed as the swarm skill places it. Drive through `control-ui` or `control-cli`.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] <Start the backend and the surface. Wait for ready.>
- [ ] <Deliver input only through the control skill's commands. Name the read-only diagnostics.>
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## <Task as a verb phrase> (<PR id>)

**Depends on.** <PR id, or None.>

**Files.**

- [ ] Edit `<path>`.
- [ ] Create `<path>`.
- [ ] Delete `<path>`.

**Build.**

- [ ] <One change. Name the symbol and the file.>

**You see.**

- [ ] <One observable result, with the exact log line or screen state.>

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] <Test file and the case it gains.> Run `<command>`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `poteto-agent` on the Volume setting at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run <the same load-bearing scenario> at trunk and head. If trunk lacks the feature, record that and gate <the behavior the diff adds plus the end state the user waits for>. Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 2. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 3. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 4. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 5. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 6. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 7. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 8. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 9. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 10. <Scenario.> Save `<slug>.png`. Pass when <predicate>.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. <What is measured at both trunk and head. If trunk lacks the feature, also name the diff-added work and the end-to-end state the user waits for.>
- [ ] Probe. <The command or procedure, run at trunk and at the head, interleaved. Both sides must produce the metric.>
- [ ] Baseline. Record the trunk <value> first.
- [ ] Rule. <Head against trunk, with the number that fails. If the scenarios differ, add absolute budgets for the diff-added work and the user-visible end state instead of an invalid ratio.>

**Review gate.** The operator reviews before merge.

- [ ] Copy lane <n> screenshots into `<media path>/<pr-id>-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the change on a lane worker. Save it as `<media path>/<pr-id>-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Review-bot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] <The owner squash-merges its own PR, or the root appends it to the base-branch stack and the operator lands it bottom-up.>

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

<Each open question a prototype answered, with the branch, the SHA, and the artifact links. Each question that stays unproven.>

## Appendix B. Alternatives rejected

<Each approach weighed and why it lost.>

## Appendix C. Risks

<Each risk with the PR it lands in and what the owner watches.>

## Appendix D. Links and reading list

<Docs to read before editing. Which PRs get `${CLAUDE_PLUGIN_ROOT}/skills/how/SKILL.md` and `${CLAUDE_PLUGIN_ROOT}/skills/interrogate/SKILL.md`. The trail per `${CLAUDE_PLUGIN_ROOT}/skills/show-me-your-work/SKILL.md`.>
````

**Reply:** where the plan was posted (the issue comment's URL or the orphan branch), the PR ids with their dependencies and the review-gated set, what the prototypes proved and what stays unproven, the check script's output, and whether execution carries on or stops at the plan.
