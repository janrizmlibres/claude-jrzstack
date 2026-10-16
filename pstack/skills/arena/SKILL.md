---
name: arena
description: "Spawn N parallel candidates at the same task, each runner building its own whole-shape direction or a fourth way outside them, have a blind judge read them all, pick a base, graft the strongest parts of the losers into it. Use for /pstack:arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

# Arena

Fan out N parallel attempts at the same task, each runner building a different whole shape. Read every candidate end to end while a blind judge reads them too. Pick the strongest as the base. Graft the best ideas from the others into it. Verify the synthesized result.

Every runner is on one model family, so breadth comes from the briefs: each runner gets a direction the others don't have.

## Start

Open a todolist with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Blind judge
4. Pick
5. Graft
6. Verify

## Phase A: Frame

Every runner receives the same task and a brief of its own, so the task and the directions together are the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric. State what success looks like for *this* task, then turn it into 3-6 concrete gradeable criteria. The rubric is the picker's and the judge's tool in Phase C and D. Runners never see it.
3. Name the directions. A direction is one whole shape for the artifact, written as a block: a short name and one paragraph stating its load-bearing idea. Name at least two that are structurally distinct whole shapes, not point fixes inside one shape. Add a direction whenever you can name another structurally distinct whole shape. The only cap is the concurrency window: at most 10 direct children in flight, refilled as they finish.
4. Add the fourth-way seat: one runner told every direction, which builds a structurally different whole shape outside all of them. The N runners are the directions plus the fourth-way seat; the default is three: two directions and the fourth way.
5. Pick the agents. Runners run on Work: `poteto-agent`, with `model:` `${user_config.work_model}` and `effort:` `${user_config.work_effort}`, or the setting's defaults (`opus`, `medium`) for a literal placeholder or an empty value.
6. Label and place the candidates. Give each runner a neutral label (X, Y, Z…) in an order unrelated to the directions; the fourth-way seat gets one like the rest. Each candidate writes to its own location, per the **separate-before-serializing-shared-state** principle skill (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-separate-before-serializing-shared-state/SKILL.md). A runner that writes code gets its own git worktree: spawn it with `isolation: "worktree"`, name the commit to start from in its brief, and make its first step a reset to it. Any other runner writes to `/tmp/arena-<slug>/<label>/`.

## Phase B: Fan out

Spawn the runners in one message with `run_in_background: true`, up to the window, and spawn the rest as earlier ones finish. Each brief carries the task, the path to the shared grounding, its own output path, and instructions to produce both the artifact and a short rationale, followed by either the directed block with its one direction or the fourth-way block with every direction. A directed runner never sees the other directions. No runner sees the rubric.

Each rationale names the alternatives the candidate considered and what it rejected, and lists under "Tradeoffs accepted" the weaknesses its shape keeps. Neither the artifact nor the rationale names the runner's direction: a blind judge reads them.

The directed block, one per direction:

> **Your direction.** The parent has assigned you one whole shape. Other runners have other shapes. Your job is the strongest possible version of *this* shape, not the best design overall. Don't drift toward a middle ground, and don't borrow another shape's load-bearing idea to patch a weakness; name the weakness instead under "Tradeoffs accepted".
>
> <direction block>
>
> **If the direction can't work.** Make a real attempt first. A soft weakness is not a failure. If the shape can't meet a hard constraint, return instead:
> ```
> DIRECTION FAILS
> Constraint: <the constraint it can't meet>
> Because: <the concrete mechanism, with an example>
> Nearest viable variant: <one line — what would have to change about the direction>
> ```

The fourth-way block, for the one fourth-way seat:

> **Fourth way.** These directions are already taken: <direction blocks>. Build a structurally different whole shape outside all of them. If none exists, return instead:
> ```
> NO FOURTH WAY
> Closest direction: <name>
> What I would change about it: <one paragraph>
> ```

A `DIRECTION FAILS` or `NO FOURTH WAY` return is not a candidate. Record it in the synthesis note: a `DIRECTION FAILS` rules its shape out with evidence, and a `NO FOURTH WAY` change is weighed in Phase E like any other graft. Proceed with the candidates left. When no runner returns a candidate, Phase A was under-specified. Reframe and re-run.

If a runner fails to produce output, retry it once on the same model and effort. If it fails again, proceed with N-1 and note the dropout in the synthesis record.

## Phase C: Blind judge

Every arena gets a blind judge, whatever the number of candidates. After every runner has returned, spawn one judge on `poteto-reader` on the Judgement setting, with `model:` `${user_config.judgement_model}` and `effort:` `${user_config.judgement_effort}`, or the setting's defaults (`opus`, `high`) for a literal placeholder or an empty value. It gets the shared grounding, the rubric and every candidate by its neutral label, and reads every candidate end to end. It never sees the direction names, the parent's scores or which candidate the parent leans toward. If a candidate names its direction anyway, give the judge a copy with the name stripped.

The judge scores each candidate criterion by criterion, citing the passage that earns each score, and recommends a base with rationale. It runs in parallel with the parent's reading in Phase D, not with the runners themselves. Don't spawn the judge while runners are still writing.

## Phase D: Pick a base

Read every candidate end to end before picking.

Score each candidate against the rubric criterion by criterion, not on holistic feel. Compare against the judge. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base on which candidate a future maintainer can extend most easily without breaking invariants. Prefer the cleaner boundary or smaller API when two feel tied, per the Laziness Protocol (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-laziness-protocol/SKILL.md).

Record the pick and the reason in a short synthesis note alongside the base artifact, including the judge's verdict and which label built which direction.

## Phase E: Graft

Walk each losing candidate once more and identify what is worth porting into the base. The signal is usually one or two things per candidate, not most of it.

Fold each graft in by hand, per the **redesign-from-first-principles** principle skill (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-redesign-from-first-principles/SKILL.md). Don't paste mechanically. The result has to remain coherent under one mental model.

Record what was grafted, from which candidate, and what was rejected and why. Once the grafts are in, remove each runner's worktree and keep its branch.

When N candidates converge on the same shape, that is a strong agreement signal. Note the convergence in the record and ship the consensus shape. No graft is needed. When N candidates wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

The synthesized artifact has to hold up under the same scrutiny as any other output, per the **prove-it-works** principle skill (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-prove-it-works/SKILL.md).

If verification surfaces a problem the arena did not catch, either Phase A was wrong (re-frame and re-run) or one candidate caught it and you missed the graft (go back to Phase E). Don't paper over.

## Outputs

One synthesized artifact. One short synthesis note alongside, naming the base, the directions and which label built each, the judge's verdict, the grafts (with source candidate), the rejections, any `DIRECTION FAILS` or `NO FOURTH WAY` returns, the dropouts if any, and the verification result.
