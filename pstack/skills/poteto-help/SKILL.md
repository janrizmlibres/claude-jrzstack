---
name: poteto-help
description: Guides users through pstack setup, /pstack:poteto-mode, and picking the skill, playbook, or principle for a task. Type /pstack:poteto-help with a question.
disable-model-invocation: true
---

# Poteto help

Answer the user's question about pstack, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a pstack run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use pstack to fix this bug", is not a help question. Read ${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/SKILL.md, do the work under it, and mention once that `/pstack:poteto-mode` stays on for the rest of the session once typed.

This file maps questions to the skills and guide pages that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. The links here are relative to this file, under `${CLAUDE_PLUGIN_ROOT}/skills/poteto-help/`. They point into the installed plugin, which the user may not be able to open, so give the user the file's public copy: `https://github.com/janrizmlibres/claude-pstack/blob/main/pstack/` followed by its path.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with `AskUserQuestion`, with these options, then answer only the section they pick:

- Get set up
- Start a task with `/pstack:poteto-mode`
- Pick a skill for a situation
- Fix a run that went wrong
- Make pstack my own

Check the state that changes the answer, and mention it only when it does:

- The settings now: Work `${user_config.work_model}` at `${user_config.work_effort}`, Judgement `${user_config.judgement_model}` at `${user_config.judgement_effort}`, Volume `${user_config.volume_model}` at `${user_config.volume_effort}`. A literal placeholder or an empty value means that model or effort is unset and takes its default: Work `opus` at `medium`, Judgement `opus` at `high`, Volume `sonnet` at `high`.
- The `pstack: surface=<cloud|local> mode=<permission_mode>` line the reminder hook prints. On the cloud surface, settings come from the setup line's `--config` values, not `/config`. In the default permission mode, reads of pstack's own files can prompt the user or be denied in subagents until they add the `Read` rule under Get set up.
- No `verify-*` skill or other app harness in the project means agents have no scripted way to drive the app. Mention `/pstack:create-verification-skill` when the question is about proving a change works.

When every setting is unset and it matters, offer once to pick models now. It matters when the user is new, the question is about setup or cost, or the answer depends on which models run. Ask at most once per session. If the need is also unclear, ask both questions together. Offer two choices:

- Now: tell them to pick each setting's model in `/config`, and answer their question too.
- Later: answer their question, and add one line saying every setting keeps its default model until they pick one in `/config`.

## Get set up

1. Install locally with two commands in a Claude Code session: `/plugin marketplace add janrizmlibres/claude-pstack`, then `/plugin install pstack@claude-pstack`. In `/plugin`, turn on auto-update for the `claude-pstack` marketplace so every release reaches them.
2. In the default permission mode, add `Read(~/.claude/plugins/cache/claude-pstack/**)` to `permissions.allow` in the user settings, so pstack's reads of its own files don't prompt or get denied in subagents.
3. Optionally pick a model for each setting in `/config` or `/plugin configure`. Run [`/pstack:setup-pstack`](../setup-pstack/SKILL.md) to see the settings. It also prints the setup line filled in with them.
4. For cloud sessions, paste that setup line into the setup script of every cloud environment that should carry pstack.
5. Start a real task with `/pstack:poteto-mode`, a goal, and a check that can pass or fail.

Some playbooks need `gh`. Orchestrate, babysit, shipping and multi-phase plans run scripts on Bun, or Node 22.18 or later; without either, the step that needs one stops and prints the install line.

Installing changes nothing until the user invokes a skill. Only `/pstack:setup-pstack` loads from the user's words. The [README](../../README.md) and [guide page 1](../../docs/guide/01-setup.md) have the details. Offer to word their first prompt with them, per [`references/prompting.md`](references/prompting.md).

If cost is the worry, say where the tokens go and how to spend fewer. pstack spends extra tokens on subagents and review panels. Pick cheaper models in `/config`, such as `sonnet` on Work; each setting's effort is fixed by the port, so the model is the lever. The user can waive a panel in their own words, and the run records the step as `skip: user waived`; pstack never skips one on its own judgment. Save `/pstack:poteto-mode` for work that needs rigor.

pstack is the Claude Code port of Lauren Tan's Cursor plugin. It runs on Claude models only, locally and in claude.ai cloud sessions, and gets the breadth upstream got from a second model family from distinct prompts instead: arena directions, interrogate lenses and fresh-context reviews.

## Start a task with `/pstack:poteto-mode`

`/pstack:poteto-mode` matches the task to a playbook, copies the playbook's steps into the todo list, and runs the other skills as the steps need them. A step it skips stays in the list as `skip: <reason>`. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read [`references/prompting.md`](references/prompting.md) before you help word one. [Guide page 2](../../docs/guide/02-poteto-mode.md) has examples.

How long `/pstack:poteto-mode` stays on:

- Typed once, it stays on for the rest of the session. Its reminder hook brings it back on every turn, typed or not (worker results, loop fires, messages), and stays out of casual turns.
- After compaction the hook points back to the full skill file, so the session re-reads it.
- A resumed session (`--resume`) loses the hook. Type `/pstack:poteto-mode` again.
- The user turns it off by saying so. To have it on in every session, they can say so in their own `CLAUDE.md`.

Mid-session, "new task" makes the mode match a fresh playbook. The user's own instructions, the request and `CLAUDE.md`, outrank pstack's text. `/pstack:poteto-mode` already uses `poteto-agent` for the subagents its playbook steps spawn. To get the same style from a subagent of your own, spawn it on `poteto-agent`.

A spec works as the task: an issue that says what to build. Handing it in is the go to execute it. "plan only" stops after the plan is posted on the issue. Landing is withheld unless the request grants it.

## Pick a skill

The default answer is `/pstack:poteto-mode`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | [`/pstack:poteto-mode`](../poteto-mode/SKILL.md) |
| Know how code works now, or where new code should live | [`/pstack:how`](../how/SKILL.md) |
| Know why code is shaped this way, or where a number came from | [`/pstack:why`](../why/SKILL.md) |
| Understand a change or subsystem, explained plainly | [`/pstack:teach`](../teach/SKILL.md) |
| Catch up on their own recent work on a topic | [`/pstack:recall`](../recall/SKILL.md) |
| Know what a small diff could break outside itself | [`/pstack:blast-radius`](../blast-radius/SKILL.md) |
| Settle types and module shape before code that crosses a function boundary | [`/pstack:architect`](../architect/SKILL.md) |
| Get several attempts at one brief, each in its own direction, merged into the best one | [`/pstack:arena`](../arena/SKILL.md) |
| Run parallel checks over slices, or race workers | [`/pstack:swarm`](../swarm/SKILL.md) |
| Have three reviewers, one lens each, review a diff and try to break it | [`/pstack:interrogate`](../interrogate/SKILL.md) |
| Fix a bug test-first when a cheap local test exists | [`/pstack:tdd`](../tdd/SKILL.md) |
| Apply TypeScript rules to `.ts` or `.tsx` work | [`/pstack:typescript-best-practices`](../typescript-best-practices/SKILL.md) |
| Strip comments before review, using a reviewer that didn't write them | [`/pstack:no-comments`](../no-comments/SKILL.md) |
| Clean AI tells out of prose | [`/pstack:unslop`](../unslop/SKILL.md) |
| Clean slop out of a code diff | [`/pstack:deslop`](../deslop/SKILL.md) |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | [`/pstack:technical-writing`](../technical-writing/SKILL.md) |
| Hear the last reply again in plain words | [`/pstack:bro`](../bro/SKILL.md) |
| Give agents a scripted way to drive the app and prove behavior | [`/pstack:create-verification-skill`](../create-verification-skill/SKILL.md) |
| Bring a verification skill and its feature map back in line with the app | [`/pstack:maintain-verification-skill`](../maintain-verification-skill/SKILL.md) |
| Vet a performance number before reporting or acting on it | [`/pstack:benchmark-checklist`](../benchmark-checklist/SKILL.md) |
| Run a large or cross-cutting change, or one to review after stepping away | [`/pstack:figure-it-out`](../figure-it-out/SKILL.md) |
| Keep a decision log during a run, and review it afterward | [`/pstack:show-me-your-work`](../show-me-your-work/SKILL.md) |
| See the three settings and get the cloud setup line | [`/pstack:setup-pstack`](../setup-pstack/SKILL.md) |
| Turn their own working habits into a personal mode skill | [`/pstack:automate-me`](../automate-me/SKILL.md) |
| Turn what a finished task taught into skill edits | [`/pstack:reflect`](../reflect/SKILL.md) |
| Stop agents from repeating the same mistakes in this repo | [`/pstack:correct`](../correct/SKILL.md) |
| Build a page whose buttons wake a Grok Bot over a webhook | [`/pstack:make-bot-ui`](../make-bot-ui/SKILL.md) |
| Find their way around pstack | `/pstack:poteto-help` |

If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- `/pstack:how` explains what the code does. `/pstack:why` explains the reasons. `/pstack:teach` runs one or both and explains the result plainly.
- `/pstack:arena` gives every runner the same brief in its own direction and merges the best parts. `/pstack:swarm` splits work into slices or a race and returns one report.
- `/pstack:architect` implements right after it settles the design. Add "with checkpoint" to review the design before it writes code.
- `/pstack:interrogate` reviews the diff. `/pstack:blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/pstack:recall` rebuilds context across recent sessions. Resuming one specific session or branch is the Session pickup playbook.
- `/pstack:figure-it-out` designs one rigorous run. The Orchestrate playbook runs a program that spans days and many PRs. The Autonomous run playbook drives one task to a finish condition.

Shipped hidden, or not in pstack:

- `/pstack:deslop`, `control-cli`, and `control-ui` ship with pstack, vendored from the `cursor-team-kit` plugin. Playbooks read them; the user can type `/pstack:deslop`.
- `/loop` and `/goal` are Claude Code built-ins. Claude Code ships no skill-authoring skill; the authoring playbook uses one if the user has it installed, such as `skill-creator`.
- pstack has no `/orchestrate` skill. Orchestrate is a `/pstack:poteto-mode` playbook. If the slash menu shows `/orchestrate`, another plugin provides it.

## Playbooks and principles

Playbooks are step lists inside `/pstack:poteto-mode`, not skills, so they have no slash command. Inside `/pstack:poteto-mode`, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit. It drives the PR to merge-ready and stops there. It doesn't merge unless the user asks to merge, land, or ship.
- "land the stack" runs Shipping.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "hand this off" or "run it in the cloud" runs Hand-off, which passes the run to a cloud lead and prints the session link.
- "full autopilot on this queue" runs Autopilot-full. "stack them, don't ship" runs Autopilot-stack.
- "run the eval playbook" runs Eval.

Without `/pstack:poteto-mode`, a phrase such as "babysit this pr" can start another installed skill whose description matches the same words. The Playbooks section of [`poteto-mode`](../poteto-mode/SKILL.md) lists every playbook and when it applies. [Guide page 6](../../docs/guide/06-verify-and-ship.md) covers opening, babysitting, and landing a PR.

pstack has no planning skill. For work that spans phases or stacked PRs, asking `/pstack:poteto-mode` for a plan runs the [Multi-phase plan playbook](../poteto-mode/playbooks/multi-phase-plan.md), which writes the plan and doesn't implement it. For a design question, the Prototype playbook or `/pstack:architect` settles it in code first.

Principles are one-rule skills that `/pstack:poteto-mode` reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." Typing `/pstack:principle-<name>` still loads one on demand. [Guide page 8](../../docs/guide/08-principles.md) lists them.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying after a resume | `--resume` drops the reminder hook. Type `/pstack:poteto-mode` again. |
| The mode stopped applying in a new session | It is on per session. Type `/pstack:poteto-mode` at the start of each, or ask for it in `CLAUDE.md`. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode. |
| A new model choice had no effect | Run `/pstack:setup-pstack` to see what the session has, and start a new session if it still shows the old model. In cloud, settings come from the setup line's `--config` values, so edit the setup line. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | Only `/pstack:setup-pstack` loads from the user's words. The others load when the user types them or when `/pstack:poteto-mode` reads them, and it doesn't read every skill. |
| pstack's reads prompt the user, or a subagent's read was denied | Add the `Read` rule under Get set up. |
| A local run didn't start cloud workers | They need Auto mode on the account and a default cloud environment (`/remote-env`). The run falls back to local worktrees and says so once. "local only" asks for that up front. |
| Parallel agents overwrote each other | Give each agent its own worktree, or run them as cloud workers, which each get their own machine. |
| An overnight run moved but finished nothing | `/goal` needs a condition that can pass or fail, not a duration. See [guide page 7](../../docs/guide/07-overnight.md). |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's the prove-it-works principle. |

For a run that drifts, [`references/prompting.md`](references/prompting.md) has one-line steers. [Guide page 10](../../docs/guide/10-recipes-and-pitfalls.md) has more pitfalls and the recipes worth copying.

## Make pstack my own

- [`/pstack:automate-me`](../automate-me/SKILL.md) drafts a personal mode skill from the user's own history, to use alongside `/pstack:poteto-mode`.
- [`/pstack:reflect`](../reflect/SKILL.md) after a session turns its lessons into skill edits the user approves.
- `/pstack:poteto-mode write a skill for <workflow>` runs the authoring playbook. The eval playbook tests a skill change blind.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.
- The user's `CLAUDE.md` outranks pstack's text, so a rule there (a merge method, a PR title style, a stacking tool) changes what the playbooks do.

[Guide page 9](../../docs/guide/09-make-it-yours.md) covers each of these.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from [`references/recipes.md`](references/recipes.md) when one fits, then the link to that file. Keep it short unless the user asked for the whole map.
