---
name: interrogate
description: "Use for \"interrogate\", \"adversarial review\", \"multi-model review\", \"challenge this\", \"stress test this code\", \"find blind spots\", or \"tear this apart\". Three lens adversaries try to break a change or design, and only findings proven by a run survive."
disable-model-invocation: true
---

# Interrogate

Three adversaries try to break a change or a design, each owning one lens. Every adversary runs on one model family, so the breadth comes from the lenses: each spends its whole attack on the failures the other two don't own. A finding survives only when a run proves it. Report the findings. Do not apply fixes.

## Frame

The scope is what the user names. Otherwise it is the branch diff from its merge base with the base branch, through the working tree. State the intent with the **in-your-own-words** skill (read ${CLAUDE_PLUGIN_ROOT}/skills/in-your-own-words/SKILL.md), from the user's message, the commits, and the PR description. Ask the user when the intent is unclear.

## Fan out

Spawn all three adversaries in one message with `run_in_background: true`, always all three, whatever the size of the change. Each runs on `savvy-agent` on the Judgement setting, with `model:` `${user_config.judgement_model}` and `effort:` `${user_config.judgement_effort}`, or the setting's defaults (`opus`, `high`) for a literal placeholder or an empty value, and `isolation: "worktree"`, since it writes repros. Its brief names the commit to start from, and its first step is a reset to it. Copy the scope's uncommitted changes into each worktree. Pick each subagent's effort for the job, per the Subagents section of the **savvy-mode** skill (read ${CLAUDE_PLUGIN_ROOT}/skills/savvy-mode/SKILL.md).

| Lens | What it attacks |
|------|-----------------|
| Breakage | The change's own paths: edge and empty inputs, error handling, wrong results, security. |
| Fit | What the change reaches beyond the diff: callers, callees, type definitions, sibling modules, and the contracts between them. |
| Stress | Time and repetition: reruns, a run that crashed halfway, interleaving and concurrent access, retries, scale. |

Give each adversary the scope, the intent, its lens with the other two lenses named, and this brief:

> Break this change through your lens. Prove each finding with a run against the real code, such as a failing test, a repro script, or command output that shows the wrong behavior. For a design or plan, run a prototype or probe the current tree. Keep repros in your own worktree. Report each finding with a title, the exact command, the output it printed, and the output the intent requires. Outside your lens, report only a failure you proved, in one line with its command. Leave out anything you did not run. That covers style, naming, structure, and risks that need a future change to matter. No findings is a valid result.

If an adversary fails to return, retry it once on the same model and effort. If it fails again, the report names its lens as missing.

## Verify

Verify each finding by rerunning its command in that adversary's worktree, per the **prove-it-works** principle skill (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-prove-it-works/SKILL.md). Keep a finding when the output shows the failure and the failure breaks the intent. Drop the rest. Merge findings that share a root cause, and note each lens that found it. Adversaries find different failures, so the verdict keeps every verified finding, not one lens's list. Remove each adversary's worktree once its findings are verified or dropped.

## Output

- **Intent**: the restatement.
- **Findings**: for each verified finding, the command, its output, how it breaks the intent, and the lenses that found it. Say "no verified findings" when none survive.
- **Dropped**: for each lens, the count of dropped findings and why, and any lens that never returned.
