---
name: interrogate
description: "Use for \"interrogate\", \"adversarial review\", \"multi-model review\", \"challenge this\", \"stress test this code\", \"find blind spots\", or \"tear this apart\". Three lens reviewers challenge changes from independent angles, and the lead verifies what they find."
disable-model-invocation: true
---

# Interrogate

Spawn three reviewers to adversarially review code changes, each owning one lens of the rubric. Every reviewer runs on one model family, so the adversarial signal comes from the lenses: each reviewer spends its whole review on the part of the rubric the other two don't own. The deliverable is a synthesized verdict. Do NOT auto-apply changes.

## Step 1, Scope

Identify what to review from context:

- If the user points at specific files or a diff, use that.
- If on a feature branch, run `git diff main...HEAD` (or the appropriate base branch) for the full changeset.
- If the user's message references recent work, gather the relevant files.

Package the diff or file contents with any surrounding context files the reviewers need to understand the code.

## Step 2, Intent

Before spawning reviewers, state the intent in one clear paragraph from the user's message, commit messages, the PR description if one exists, and the code. If you're unsure about the intent, ask the user before proceeding.

## Step 3, Spawn Reviewers

Launch all three reviewers in a single message using the Agent tool, always all three, whatever the size of the change. Each runs on `savvy-reader` on the Judgement setting, with `model:` `${user_config.judgement_model}` and `effort:` `${user_config.judgement_effort}`, or the setting's defaults (`opus`, `high`) for a literal placeholder or an empty value. Pick each subagent's effort for the job, per the Subagents section of the **savvy-mode** skill (read ${CLAUDE_PLUGIN_ROOT}/skills/savvy-mode/SKILL.md).

The lens table assigns `references/rubric.md` and `references/code-quality-review.md` to the lenses by section heading:

| Lens | Rubric headings | Code-quality lens |
|------|-----------------|-------------------|
| Breakage | Correctness, Security, Verification | none |
| Fit | Root Causes vs. Symptoms, Structural Integrity, and every rubric heading this table doesn't list | none |
| Simplicity | Complexity Budget | all of `references/code-quality-review.md` |

Fit reads beyond the diff: callers, callees, type definitions and sibling modules.

Read `references/reviewer-prompt.md` and fill in the template once per lens with:
1. The lens name
2. The stated intent
3. The diff or file contents
4. The lens's sections, copied verbatim under their headings from `references/rubric.md`, plus all of `references/code-quality-review.md` for Simplicity. Leave out the rubric's opening line: it calls the rubric's own sections lenses, which a reviewer holding one lens would misread
5. The other two lenses' names and headings, so the reviewer knows what lies outside its lens

Outside its lens a reviewer may report only a `critical` finding, in one line with evidence. Spillover counts as corroboration, never as a requirement: a lens that raises none has missed nothing.

If a reviewer fails to return, retry it once on the same model and effort. If it fails again, its lens goes under Gaps with the failure, and the verdict says that lens is missing.

## Step 4, Synthesize

As results come back, build a unified picture:

1. **Parse all findings** from the reviewers, with each lens's Checked list.
2. **Deduplicate**. Different lenses may describe the same issue differently. Merge these and note which lenses raised it, and whether in their lens or as spillover.
3. **Note corroboration**. A spillover finding that matches another lens's finding corroborates it. Corroboration earns a finding attention, never a place in Act on.
4. **Note disagreements**. If one lens flags something and another lens's Checked list says it examined that code and found it clean, that's useful context for the verdict.
5. **Map coverage**. Compare the three Checked lists against the changed files and the behaviour the intent describes. Whatever no lens examined is a Gap.

## Step 5, Lead Judgment

You are the lead reviewer, a pragmatic senior engineer, not a neutral aggregator. Read `references/lead-judgment.md` for the full framework. Run its verification gate before you categorize: on one model family, verification replaces consensus, and an unverified finding can't go in Act on.

Put every finding in one of four buckets, with the lens(es) that raised it, in-lens or as spillover, and a one-line rationale. For Act on and every dismissed `critical`, say how you verified it.

- **Act on**. Real issues affecting correctness, security, or maintainability given the actual goals. They would block a real PR.
- **Consider**. Legitimate, but you're not sure they outweigh the cost of addressing them now. Worth the user's attention.
- **Noted**. Technically valid but not actionable. Context-dependent, premature optimization, or low-impact at this stage.
- **Dismissed**. Wrong, nitpicky, or missing context, with a brief reason.

## Output Format

### Intent
> [The stated intent paragraph from Step 2]

### Reviewers
- [Lens]: [the rubric headings it owned] (one bullet per lens)

### Act On
[Each: description, which lenses raised it, how you verified it, why it matters.]

### Consider
[Each: description, which lenses raised it, the tradeoff, and what would verify it if unverified.]

### Noted
[Brief list.]

### Dismissed
[Each with a brief rationale.]

### Coverage Map

| Lens | Findings | Checked | Spillover |
|------|----------|---------|-----------|
| Breakage | [N] | [what it examined and found clean, files beyond the diff included] | [each spillover finding, and whether you confirmed it] |
| Fit | | | |
| Simplicity | | | |

**Gaps**: [changed files or behaviour no lens examined. Write "none" only when every changed file and the behaviour the intent describes appear under some lens's Checked.]
