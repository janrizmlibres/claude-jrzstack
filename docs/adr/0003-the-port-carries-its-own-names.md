---
status: accepted
---

# The port carries its own names

Upstream names pstack and `poteto-mode` for Lauren Tan: poteto is her handle. The port publishes under its maintainer's names instead, in the same pattern: the plugin is `jrzstack` (jrz, his portfolio handle) and the mode and its agents are `savvy-*` (Savvy, his X handle). The repo and marketplace are `claude-jrzstack`, so the install is `jrzstack@claude-jrzstack`.

The renaming is conversion rule 25, so every sync and re-translation applies it, and the scripts map paths the same way: `upstream/pstack/skills/poteto-mode/x` is the counterpart of `jrzstack/skills/savvy-mode/x`. The snapshot stays verbatim. Credit doesn't move: the README, the LICENSE and each place that names Lauren or her project keep `pstack` and `poteto`.

## Considered options

- **Keep upstream's names.** Rejected: the user wanted the port to carry a name of its own.
- **Rename the commands only, keeping `pstack/` and upstream's file names.** Rejected: skill and agent names come from their directory and file names, so `/jrzstack:savvy-mode` needs a `savvy-mode` directory anyway, and one rule covering names, paths and prose is simpler to apply on every sync than a partial one.
- **`sstack`, `savstack`, `cstack`.** Rejected by the user: `sstack` reads like a snake, and `cstack` names nobody.

## Consequences

- Existing installs of `pstack@claude-pstack` don't follow the rename; they reinstall as `jrzstack@claude-jrzstack`, and the `Read` rule and cloud setup line change with it. GitHub redirects the old repo URL.
- A sync translating new upstream text renames as it translates, and `check-cursorisms` flags an upstream name left in a translated file.
- The machine lock, plan and orchestrate branches, trailers and environment variables move to the new names, so a run started before the rename doesn't see one started after it.
