---
status: accepted
---

# Settings travel with each spawn

A setting's model and effort are the user's choice in `/config`, and every spawn passes them as `model:` and `effort:`; no agent stands for a setting. So two agents serve all three settings: `poteto-agent` writes and `poteto-reader` only reads. The reader exists only because the Agent tool has no per-spawn read-only flag (upstream's `readonly: true`), so read-only has to live in an agent's `disallowedTools`.

The configured effort is a starting level, not a fixed one. Upstream's "Match the model to the job" picks a reasoning level and a speed per spawn, encoded in the model slug; the port keeps its intent as effort alone: one step up for the hardest work, one down for routine and two for mechanical, between `low` and `max`.

## Considered Options

- **One writer and one reader agent per setting** (the port's first shape: `work`, `judgement`, `volume` and their readers, each fixing its setting's default model and effort in frontmatter). Rejected: per-spawn `effort` (Claude Code 2.1.292) and `userConfig` defaults that fill in when nothing is set made the six agents redundant, and as port-only files they kept upstream's edits to `poteto-agent` out of every sync.
- **A fixed effort per setting.** Rejected: upstream's per-job adjustment would have reduced to "use the setting's effort" at two dozen spawn sites.
- **Upstream's adjustment as written, with an `xhigh` baseline.** Rejected: its step down for judgment would undercut Judgement, which already gives judgment its own setting, and an `xhigh` baseline would make every unadjusted spawn costlier. Fast mode is dropped too: in Claude Code it is a session toggle with no per-spawn form.

## Consequences

- Both agents' frontmatter falls back to Work's defaults, so a spawn that leaves out `model:` or `effort:` runs at Work's level, not its own setting's. No line pattern can catch an omission, so rule 4 requires both on every spawn.
- A transcript shows `poteto-agent` or `poteto-reader` and a model, not the setting's name; the brief and the spawn's text name the setting.
- `poteto-agent.md` is an override of upstream's `poteto-agent.md` rather than a dropped file, so a sync flags each upstream edit to it.
- `${user_config.*}` is filled in only in a loaded `SKILL.md`, so each skill that spawns repeats its settings' values and defaults; they can't move to a shared reference file.
