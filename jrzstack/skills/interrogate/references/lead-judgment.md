# Lead Judgment Framework

## The Verification Gate

The reviewers share one model family, so two of them agreeing rules out a fluke, not a shared blind spot. Agreement can't carry a finding; verification does.

- **Act on needs a traced path.** Trace the execution path of every finding you would act on, from a real caller to the failure. Run a test or a one-off check when that's cheap. A finding you couldn't verify goes in Consider, marked unverified, with what would verify it.
- **Re-check every critical you would dismiss.** Before dismissing a `critical`, trace it a second time, looking for the path the reviewer saw. Dismiss it only when you can say where that path breaks.
- **Spillover is corroboration.** A lens reporting a critical outside its lens points you at a finding worth tracing. It never stands in for the trace, and a lens that raised no spillover has missed nothing.

## Filtering Principles

### Nitpick Gravity

Reviewers, especially adversarial ones, tend to fill their review. If they don't find critical issues, they'll inflate nits to fill the space. If a reviewer's findings are all nits and style preferences, the code is probably fine. Say so.

### Hypothetical vs. Actual

"What if someone passes null here?" is only a finding if the caller can actually pass null. Trace the call site. If the input is validated upstream or the type system prevents it, dismiss the finding. Reviewers working from a diff can't always see the full call chain. You can.

### Premature Abstraction Warnings

Reviewers often suggest extracting functions, adding interfaces, or creating abstractions. Does this code need to change in a second way? If not, the abstraction is premature. Simple inline code that works beats a clean abstraction that's overkill for the current scope.

### "I Would Have Done It Differently"

This is the most common false positive in code review. A finding that amounts to "I prefer a different approach" is not a bug, not a design flaw, and not actionable unless the reviewer shows a concrete problem with the current approach. Dismiss these, and say why.

### Missing Context Signals

Watch for findings that reveal the reviewer didn't understand the context:
- Suggesting changes to code the author didn't write or modify
- Flagging patterns that are consistent with the rest of the codebase (the reviewer just doesn't know that)
- Recommending approaches that conflict with constraints you know about

These are honest mistakes from reviewers working with limited information. Dismiss them gracefully.

## When Reviewers Are Right

Don't dismiss findings just because they're uncomfortable. The whole point of adversarial review is to catch things you'd miss. Signs a finding deserves attention:

- Another lens raised it too, as spillover or from its own angle (worth tracing first, not proof)
- The finding identifies a concrete execution path, not a hypothetical
- The finding reveals a gap in your mental model of the code
- You read the finding and think "...yeah, actually"

Be especially careful about dismissing security findings and correctness bugs. These deserve more scrutiny even when only one lens raised them.

## Gaps

The Coverage Map's Gaps tell the user what no lens examined, so a clean verdict over code nobody looked at doesn't read as a clean bill of health.
