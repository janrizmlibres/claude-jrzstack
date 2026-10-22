# Design before you write code

One attempt at a hard design locks in the first shape the model thought of. `/jrzstack:architect` settles types and boundaries before implementation. `/jrzstack:arena` runs several attempts at the same brief and merges the best parts. `/jrzstack:interrogate` has reviewers, each owning one lens, try to break the result. When the job is coverage rather than design synthesis, `/jrzstack:swarm` fans out slices or races and aggregates their results.

The two most common design mistakes are taking the agent's first design and polishing a plan that no code has tested. This page fixes both. You plan through code. Prototypes answer the open questions, a README or tutorial sets the target, and the written plan comes last.

![Three robots draft competing bridge models at their own tables under /architect, /arena, and /interrogate panels, while a judge robot with a clipboard inspects skeptically.](./images/design.jpg)

## Settle the shape with `/jrzstack:architect`

```text
/jrzstack:architect design the import pipeline before writing any code. i care most about how callers use it.
```

[`/jrzstack:architect`](../../skills/architect/SKILL.md) grounds itself first, running `/jrzstack:how` over the code the design touches and `/jrzstack:why` when it moves ownership or layers. Then it runs `/jrzstack:arena` to produce competing design sketches, with the caller's usage written first in each, followed by types, signatures, and a module map.

By default it proceeds straight from the synthesized design into implementation. If you want to see the design first, say so:

```text
/jrzstack:architect with checkpoint. stop and show me before implementing.
```

The design isn't sacred once code starts. If implementation shows the same workaround in unrelated places, or types that only compile with `any` or forced casts, `/jrzstack:architect` treats that as proof the design is wrong. It scraps the sketch and starts over instead of patching around it.

## Fan out attempts with `/jrzstack:arena`

```text
/jrzstack:arena take my prompt to the arena verbatim. i want to compare their proposals with yours.
```

[`/jrzstack:arena`](../../skills/arena/SKILL.md) is the general tool underneath. Runners attempt the same design or code brief in parallel, each writing to its own worktree or directory. The lead gives each runner its own direction, a structurally distinct whole shape to build, plus one fourth-way runner that looks for a shape outside all of them. A read-only judge reads every candidate blind, in a fresh context, and scores it against a rubric. The lead reads each candidate end to end too, picks a base, grafts in the best ideas from the losers, and verifies the result.

```mermaid
flowchart LR
    A[One task] --> B[Directions]
    B --> C[Candidate 1]
    B --> D[Candidate 2]
    B --> E[Candidate N]
    C --> F[Blind judge]
    D --> F
    E --> F
    F --> G[Pick a base]
    G --> H[Graft the best parts]
    H --> I[Verify]
```

The runners run on the Work setting, and the judge on Judgement. The lead adds a direction whenever it can name another distinct shape, and you can adjust the count per task. Ask for more candidates when the decision matters, fewer when it doesn't:

```text
/jrzstack:arena this, 5 candidates. the cache key format is expensive to change later.
```

## Cover slices and races with `/jrzstack:swarm`

```text
/jrzstack:swarm check every package under packages/ against its check.sh. one worker per package. one report.
```

[`/jrzstack:swarm`](../../skills/swarm/SKILL.md) fans N workers across independent slices, coverage matrices, gauntlet lanes, exploration partitions, or declared race arms. Each worker gets its own scope and check, then reports `PASS`, `ISSUES`, or `BLOCKED`. The parent waits for the workers and returns one compact report with any gaps or dropouts.

Reach for it when parallelism buys coverage or lets independent checks race. `/jrzstack:arena` gives every worker the same design or code brief, then picks a base and grafts the best parts. `/jrzstack:swarm` covers slices or runs a race with a selection rule declared up front. It does not use the base-selection and grafting ceremony.

## Break it with `/jrzstack:interrogate`

```text
/jrzstack:interrogate the whole branch, but skeptically. no nitpicks unless it's an actual bug or regression.
```

[`/jrzstack:interrogate`](../../skills/interrogate/SKILL.md) sends the same diff and intent to three reviewers, each owning one lens of the rubric: Breakage, Fit, and Simplicity. Distinct lenses are the point. Each reviewer looks deeper at its own part of the rubric than one reviewer could at all of it, and a Coverage Map shows what each lens checked and what no lens examined. The lead verifies every finding it acts on, by tracing the code path or running a test, instead of counting votes. The lead sorts everything into `Act on`, `Consider`, `Noted`, and `Dismissed`, with a reason for each dismissal, and applies nothing automatically.

Read the dismissals too. The lead is a pragmatic senior engineer, not an oracle, and you can override it.

## Prototype instead of debating

Never take the first design. Ask for a few, and pick from evidence you can see:

```text
/jrzstack:savvy-mode prototype a few options for the new dropdown menu. take screenshots or videos for me to compare.
```

The [Prototype playbook](../../skills/savvy-mode/playbooks/prototype.md) builds throwaway sketches in a scratch directory, puts the variants behind one switcher, drives each one, and captures screenshots or timings. It also works for behavior and algorithms, not just UI. Prototypes are planning with code. They let the agent answer its own open questions by running something instead of asking you, and they leave room for an option you wouldn't have thought of.

The same idea scales up to a real design. Pair `/jrzstack:architect` with prototypes and keep a review gate:

```text
/jrzstack:savvy-mode we need rate limiting for external webhooks. /jrzstack:architect it first, and answer open questions with prototypes. let me review before proceeding.
```

Don't spend reviewers on an abstract plan. `/jrzstack:interrogate` belongs on a diff. Point adversarial review at a plan with no code behind it and the reviewers invent theoretical risks and edge cases that will never happen. Let prototypes settle the questions, then review what got built.

## Write the README first for shared code

For a package or API that other code will use, start with the doc a user would read:

```text
/jrzstack:savvy-mode write a tutorial for how i would use the new config package first. then /jrzstack:teach me why it beats the current one.
```

Writing the tutorial first forces the caller's view. You describe the API to a hypothetical user and work back to the implementation. The doc also becomes a concrete target the agent checks its own work against. Name [`/jrzstack:technical-writing`](../../skills/technical-writing/SKILL.md) when the doc itself matters, so a tutorial stays a tutorial instead of drifting into reference and explanation at once.

## Plan after the design settles

jrzstack has no planning skill, on purpose. When you do want a written plan, ask for it once the design is settled:

```text
/jrzstack:savvy-mode turn this design into a plan. small verifiable PRs, each with its own verification steps.
```

The [Multi-phase plan playbook](../../skills/savvy-mode/playbooks/multi-phase-plan.md) settles any remaining open questions by prototype, then writes one section per PR, each ending in proof that the change works. A passing test suite alone doesn't count as that proof. The plan is the deliverable. The playbook doesn't implement it, and it names which execution playbook should run it next.

For a migration, state the bar in the prompt:

```text
/jrzstack:savvy-mode plan the migration of our ui library to the new styling system. small verifiable PRs, each with visual regression checks. the result must match the original exactly, bugs included.
```

"bugs included" keeps the migration from quietly fixing things on the way, which would make the old and new output impossible to compare. For a project that spans many days, you can commit the plan to the repo for a while so other agents see the work in progress. Delete it when the work lands.

## How much design work does a task deserve?

You might be wondering whether every change needs this. No. Most changes need none of it. A rough ladder:

- A small, finished change you're unsure about needs `/jrzstack:interrogate` alone.
- A change that crosses function boundaries or moves ownership earns `/jrzstack:architect`, which brings `/jrzstack:arena` with it.
- A standalone decision where independent attempts would help, like naming, formats, or an algorithm, is `/jrzstack:arena` directly.
- A coverage matrix, set of parallel checks, or race with declared arms is `/jrzstack:swarm`.
- An open question you could answer by running something, like a layout, a timing, or an approach, gets a prototype, not a debate.
- A contested design that's expensive to reverse gets `/jrzstack:architect`, then `/jrzstack:interrogate` before shipping.
- Work that spans several PRs gets a plan, written after the design settles.

`/jrzstack:savvy-mode` already applies this ladder. Boundary-crossing work triggers `/jrzstack:architect` on its own, so you reach for these directly mainly when you want more or less scrutiny than the default.

Next: [Build and clean the change](./05-build-and-clean.md).
