---
name: architect
description: "Sketch types, signatures, and module structure before code, then stay in the loop while implementation fills in. Use for /jrzstack:architect, 'architect this', 'design this', or non-trivial work where jumping to code would lock in the wrong shape."
disable-model-invocation: true
---

# Architect

Before writing code, trace every system the change touches, then sketch two different shapes for it (types, signatures, module boundaries) and pick the one where each piece of state has one owner, each task has one way to do it, and callers need to know least. Redesign instead of patching if workarounds repeat.

On a spec, its Implementation Decisions are fixed constraints on every shape. The shapes differ inside them and may not move them.

For a large or contested design, run the **arena** skill instead of sketching alone (read ${CLAUDE_PLUGIN_ROOT}/skills/arena/SKILL.md). Its two directions are the two shapes, and a spec's Implementation Decisions go into every runner's brief.
