---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

Invoke when the user says "reflect" or "/jrzstack:reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## 1. Locate the active transcript

Before fanning out, find this conversation's transcript. It is `~/.claude/projects/<slug>/${CLAUDE_SESSION_ID}.jsonl`, where `<slug>` is the active workspace's absolute path with every character that isn't a letter or digit turned into "-". Do not glob across `~/.claude/projects/*/`. That crosses workspace boundaries and reads private chats from unrelated projects.

```bash
ls -t ~/.claude/projects/<slug>/*.jsonl ~/.claude/projects/<slug>/*/subagents/*.jsonl 2>/dev/null | head -10
```

That covers the session (`<id>.jsonl`) and subagent (`<id>/subagents/<child>.jsonl`) layouts. When the session ID didn't resolve to a file, check each candidate: find its first user line (`"type":"user"`) and take the file whose `message.content` contains the conversation's opening user prompt. If none matches, pass a tight digest of the session instead.

## 2. Spawn three reviewers in parallel

One message, three `Agent` calls, `subagent_type: savvy-reader`, with `model` and `effort` set as below. Reviewers need MCP access to look up the tickets, chat threads, and observability traces the transcript references, and `savvy-reader` keeps it.

Each reviewer and the synthesizer name an agent and their setting's model and effort. Pass both on every spawn, as `model:` and `effort:`. A literal placeholder or an empty value means the setting's default: Work `opus` at `medium`, Judgement `opus` at `high`. Pick each subagent's effort for the job, per the Subagents section of the **savvy-mode** skill (read ${CLAUDE_PLUGIN_ROOT}/skills/savvy-mode/SKILL.md).

| Lens | Agent | `model` | `effort` | Prompt template |
|---|---|---|---|---|
| Judgment | `savvy-reader` | `${user_config.work_model}` | `${user_config.work_effort}` | `references/judgment-reviewer.md` |
| Tooling | `savvy-reader` | `${user_config.work_model}` | `${user_config.work_effort}` | `references/tooling-reviewer.md` |
| Divergent | `savvy-reader` | `${user_config.work_model}` | `${user_config.work_effort}` | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in the `Agent` response body.

## 3. Synthesize

One `Agent` call, `subagent_type: savvy-reader`, `model` `${user_config.judgement_model}` and `effort` `${user_config.judgement_effort}` under the same rule. It spot-verifies citations through MCP, and `savvy-reader` keeps it. Pass `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. It returns an Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. See the **encode-lessons-in-structure** principle skill (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-encode-lessons-in-structure/SKILL.md).

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

File each Backlog item to your team's devex or backlog tracker without waiting. Only the Accepted list waits for approval.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the parent does it directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): hand to a skill-authoring skill if one is installed (such as `skill-creator`) and run its draft / test / iterate loop; otherwise write the SKILL.md edit directly.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): hand to the skill-authoring skill and run its description-optimization loop; otherwise rewrite the description directly.
- `new skill: <kebab-name>`: hand creation to the skill-authoring skill rather than inventing the shape ad hoc; otherwise write the SKILL.md directly.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
