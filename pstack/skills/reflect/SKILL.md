---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

## When to invoke

Invoke when the user says "reflect" or "/pstack:reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## Process

### 1. Locate the active transcript

The parent finds its own transcript file before fanning out. It is `~/.claude/projects/<slug>/${CLAUDE_SESSION_ID}.jsonl`, where `<slug>` is the active workspace's absolute path with every character that isn't a letter or digit turned into "-". Use that path. Do not glob across `~/.claude/projects/*/`. That crosses workspace boundaries and reads private chats from unrelated projects.

```bash
ls -t ~/.claude/projects/<slug>/*.jsonl ~/.claude/projects/<slug>/*/subagents/*.jsonl 2>/dev/null | head -10
```

Two transcript layouts: session (`<id>.jsonl`) and subagent (`<id>/subagents/<child>.jsonl`).

When the session ID didn't resolve to a file, check each candidate: find its first user line (`"type":"user"`) and check that its `message.content` contains the conversation's opening user prompt. Take the matching path. If no path resolves, write a tight digest of the session and pass that instead.

### 2. Spawn three reviewers in parallel

One message, three `Agent` calls, `subagent_type: poteto-reader`, with `model` and `effort` set as below. Reviewers need MCP access for context lookups (tickets, chat threads, observability traces referenced in the transcript). `poteto-reader` keeps it.

Each reviewer and the synthesizer name an agent and their setting's model and effort. Pass both on every spawn, as `model:` and `effort:`. A literal placeholder or an empty value means the setting's default: Work `opus` at `medium`, Judgement `opus` at `high`.

| Lens | Agent | `model` | `effort` | Prompt template |
|---|---|---|---|---|
| Judgment | `poteto-reader` | `${user_config.work_model}` | `${user_config.work_effort}` | `references/judgment-reviewer.md` |
| Tooling | `poteto-reader` | `${user_config.work_model}` | `${user_config.work_effort}` | `references/tooling-reviewer.md` |
| Divergent | `poteto-reader` | `${user_config.work_model}` | `${user_config.work_effort}` | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in the `Agent` response body.

### 3. Synthesize

One `Agent` call, `subagent_type: poteto-reader`, with `model` `${user_config.judgement_model}` and `effort` `${user_config.judgement_effort}` under the same rule. The synthesizer's quality check includes spot-verifying citations, which can require MCP access. `poteto-reader` keeps it. Use `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. The synthesizer returns a structured Accepted / Rejected / Backlog list.

### 4. Structural enforcement check

Sanity-check the synthesizer's Accepted list. For any item that would be enforced more reliably by a lint rule, script, metadata flag, or runtime check, move it from Accepted to Backlog. See the **encode-lessons-in-structure** principle skill (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-encode-lessons-in-structure/SKILL.md).

### 5. Apply

Before applying any Accepted edit, present the synthesizer's full Accepted/Rejected/Backlog output to the user and wait for explicit approval. The user picks which subset to apply and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

Backlog items file to whatever devex / backlog tracker your team uses automatically. Only the Accepted list waits for approval.

For each approved Accepted item, follow the Routing field exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): parent does directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): hand to a skill-authoring skill if one is installed (such as `skill-creator`) and run its draft / test / iterate loop; otherwise write the SKILL.md edit directly.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): hand to the skill-authoring skill and run its description-optimization loop; otherwise rewrite the description directly.
- `new skill: <kebab-name>`: hand creation to the skill-authoring skill rather than inventing the shape ad hoc; otherwise write the SKILL.md directly.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done. Skip this step if it doesn't.

### 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
