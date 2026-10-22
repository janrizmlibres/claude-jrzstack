# Set up jrzstack

In this page you install the plugin, pick which models jrzstack uses, and run your first task. Setup is two commands, and picking models is optional.

## Install the plugin

In a Claude Code session, run:

```text
/plugin marketplace add janrizmlibres/claude-jrzstack
/plugin install jrzstack@claude-jrzstack
```

Claude Code confirms the plugin is installed. Then open `/plugin`, find the `claude-jrzstack` marketplace, and turn on its auto-update, so every release reaches you.

jrzstack's skills read each other's files inside the installed plugin. If you run in the default permission mode, add this rule to `permissions.allow` in your user settings, so those reads don't prompt you or get denied in subagents:

```text
Read(~/.claude/plugins/cache/claude-jrzstack/**)
```

Some playbooks also need `gh`, and orchestrate, babysit, shipping and multi-phase plans run scripts that need Bun or Node 22.18 or later. A step that needs a missing tool stops and says what to install.

## Pick your models and effort

jrzstack has three settings, and every role a skill spawns runs on one of them:

| Setting | Runs | Default model | Default effort |
|---|---|---|---|
| Work | code delegates, arena runners, unit workers, sub-leads | `opus` | medium |
| Judgement | the hardest changes, judges, reviewers, fresh-context reviews | `opus` | high |
| Volume | swarm workers, first-pass race workers | `sonnet` | high |

Pick a model and an effort for any of them in `/config`, or with `/plugin configure`. Each model takes `opus`, `sonnet`, `haiku` or `fable`, and each effort `low`, `medium`, `high`, `xhigh` or `max`. The effort is a starting level: a spawn raises it one step for the hardest work and lowers it for routine work. An unset setting keeps its default, so you only override what you care about.

To see what's set, run:

```text
/jrzstack:setup-jrzstack
```

[`/jrzstack:setup-jrzstack`](../../skills/setup-jrzstack/SKILL.md) shows the three settings, points you to `/config` to change them, and prints the setup line filled in with your models, ready to paste into a cloud environment's setup script so cloud sessions match your machine. It never writes your settings itself.

## Accept the verification offers, or don't

When you run it, `/jrzstack:setup-jrzstack` also looks for a way to prove app behavior in your project, either a `verify-*` skill or an existing harness. If it finds neither, it offers once to generate one with [`/jrzstack:create-verification-skill`](../../skills/create-verification-skill/SKILL.md).

Say yes and it writes `.claude/skills/verify-<app>/`, a project-local skill that teaches agents to drive your app the way a user does. It proves the skill works once before handing it over. Say no and setup moves on. You can run `/jrzstack:create-verification-skill` yourself any time. [Verify and ship](./06-verify-and-ship.md#create-a-project-verification-skill) covers it in depth.

If you're new to jrzstack, say yes. An agent that can check its own work keeps going until the check passes. An agent that can't hands every result back to you to check by hand. Of everything in this guide, the verification skill pays off the most.

Then setup offers once to generate a formal verification skill with [`/jrzstack:create-formal-verification-skill`](../../skills/create-formal-verification-skill/SKILL.md), unless the project already has one. Tests check the cases someone thought to write. A formal verification skill checks one key property of your code, such as "a job never runs twice at once", in every case within a stated scope. Say yes when your code has concurrency, retries, a state machine, or a parser, where a bug is costly and tests rarely reach the case that breaks. Otherwise say no, and run it later if that changes. [Verify and ship](./06-verify-and-ship.md#prove-a-property-with-a-formal-verification-skill) covers it.

## Keep the cost in check

jrzstack spends extra tokens on subagents and review panels. That's the price of the rigor. To spend fewer:

- Pick cheaper models in `/config`. A strong model in the main session with `sonnet` on Work is a good split.
- Waive a panel in your own words when the change doesn't need it. The run records the step as `skip: user waived`. jrzstack never skips a panel on its own judgment.
- Save `/jrzstack:savvy-mode` for work that needs rigor. A small, obvious edit doesn't.

Heavy commands, such as test runners, builds and dev servers, run one at a time per machine across every jrzstack session, so parallel workers don't exhaust your RAM.

## Run your first task

Pick something real but small, and describe it the way you'd describe it to a colleague:

```text
/jrzstack:savvy-mode add a --json flag to this command. text output stays byte-identical. verify both.
```

Watch the todo list. Its first items are the matched playbook's steps copied in, the Feature playbook for this prompt. If `/jrzstack:savvy-mode` skips a step, the step stays in the list with `skip: <reason>`, so you can see what it chose not to do.

From here you can type normal follow-ups. `/jrzstack:savvy-mode` stays on for the rest of the session: its reminder hook brings it back on every turn, and it stays out of casual turns. Say so to opt out. A resumed session (`--resume`) loses the hook, so type `/jrzstack:savvy-mode` again after a resume.

Next: [Route work through `/jrzstack:savvy-mode`](./02-savvy-mode.md).
