# Architect runner prompt

The parent passes this file through to every parallel candidate runner during Phase B and fills in the variable inputs around it: the task, the Phase A grounding artifacts, a spec's Implementation Decisions as fixed constraints when the work comes from a spec, the isolated working directory, the path to write outputs, and arena's directed or fourth-way block at the end. A runner that writes code works in its own git worktree (spawned with `isolation: "worktree"`), otherwise in a per-runner subdirectory under the sketch dir. What matters is independence between candidates.

You are producing one candidate design in architect's parallel exploration. Read the **architect** skill in full first (read ${CLAUDE_PLUGIN_ROOT}/skills/architect/SKILL.md). That's the workflow you're inside. Output a candidate design package: type sketch, function signatures, module map, and prose rationale shaped per [`rationale-template.md`](rationale-template.md).

Apply the following discipline. The parent compares candidates on these axes to pick a base.

- Caller's usage first. Write the README-style usage and two or three real call sites before the types, then derive the type sketch from them. The usage is the spec. The two must agree, so reconcile the sketch to the usage, not the reverse.
- Data structures first. Get the core types right and the code becomes obvious. Trace each dominant access pattern through the proposed structure. If the answer is "we'll add a map / index / cache later," the structure is wrong.
- Interface depth. Compare the capability hidden behind the public surface relative to the size of that surface. Prefer a simple interface that pulls complexity into the callee, even when the implementation becomes less simple. Do not put transport or wire types on the public API. Parse into domain types behind the interface.
- Shared state: if two actors might both write, ask "what happens?" If the answer isn't "nothing," default to per-actor state with a merge at the read boundary, per the **separate-before-serializing-shared-state** principle skill (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-separate-before-serializing-shared-state/SKILL.md).
- Make boundaries visible. `not implemented` errors for bodies, `// TODO` pseudocode for tricky logic, doc comments stating intent and invariants. A reader should trace data from input to output by reading types and signatures alone.
- Encode invariants in types: hard-to-misuse types > runtime checks > prose comments, per the **encode-lessons-in-structure** principle skill (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-encode-lessons-in-structure/SKILL.md).
- Validate at boundaries, trust types inside, per the **boundary-discipline** principle skill (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-boundary-discipline/SKILL.md). Business logic as pure functions. The shell stays thin.
- Single source of truth per invariant. Derive instead of sync.
- Idempotent state transitions where applicable, per the **make-operations-idempotent** principle skill (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-make-operations-idempotent/SKILL.md). Ask what happens if the operation runs twice or crashes halfway.
- Short call chains. If tracing the flow needs more than three files, flatten the hierarchy, per the **laziness-protocol** (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-laziness-protocol/SKILL.md) and **minimize-reader-load** (read ${CLAUDE_PLUGIN_ROOT}/skills/principle-minimize-reader-load/SKILL.md) principle skills.

When your brief lists fixed constraints from a spec, every shape stays inside them. A direction that can't meet one is a `DIRECTION FAILS` naming it.

Don't name your direction in the design package: a blind judge reads it. Differences between candidates are the signal used to pick a base and graft. Converging on a safe-looking middle defeats the exploration.

<arena's directed block, naming your direction, or its fourth-way block, naming the directions already taken>
