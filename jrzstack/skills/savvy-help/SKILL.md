---
name: savvy-help
description: Guides users through jrzstack setup, /jrzstack:savvy-mode, and picking the skill, playbook, or principle for a task. Type /jrzstack:savvy-help with a question.
disable-model-invocation: true
---

# Savvy help

Answer the user's question about jrzstack, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a jrzstack run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use jrzstack to fix this bug", is not a help question. Read ${CLAUDE_PLUGIN_ROOT}/skills/savvy-mode/SKILL.md, do the work under it, and mention once that `/jrzstack:savvy-mode` stays on for the rest of the session once typed.

This file maps questions to the skills and guide pages that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. The links here are relative to this file, under `${CLAUDE_PLUGIN_ROOT}/skills/savvy-help/`. They point into the installed plugin, which the user may not be able to open, so give the user the file's public copy: `https://github.com/janrizmlibres/claude-jrzstack/blob/main/jrzstack/` followed by its path.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with `AskUserQuestion`, with these options, then answer only the section they pick:

- Get set up
- Start a task with `/jrzstack:savvy-mode`
- Pick a skill for a situation
- Fix a run that went wrong
- Make jrzstack my own

Check the state that changes the answer, and mention it only when it does:

- The settings now: Work `${user_config.work_model}` at `${user_config.work_effort}`, Judgement `${user_config.judgement_model}` at `${user_config.judgement_effort}`, Volume `${user_config.volume_model}` at `${user_config.volume_effort}`. A literal placeholder or an empty value means that model or effort is unset and takes its default: Work `opus` at `medium`, Judgement `opus` at `high`, Volume `sonnet` at `high`.
- The `jrzstack: surface=<cloud|local> mode=<permission_mode>` line the reminder hook prints. On the cloud surface, settings come from the setup line's `--config` values, not `/config`. In the default permission mode, reads of jrzstack's own files can prompt the user or be denied in subagents until they add the `Read` rule under Get set up.
- No `verify-*` skill or other app harness in the project means agents have no scripted way to drive the app. Mention `/jrzstack:create-verification-skill` when the question is about proving a change works.
- No formal verification skill in the project means no property is checked past what tests reach. Mention `/jrzstack:create-formal-verification-skill` when the question is about a race, an invariant, or another case tests rarely hit. When one exists and the code it covers changed after the commit it records as last in sync, mention `/jrzstack:maintain-formal-verification-skill` if the question touches that code.

When every setting is unset and it matters, offer once to pick models now. It matters when the user is new, the question is about setup or cost, or the answer depends on which models run. Ask at most once per session. If the need is also unclear, ask both questions together. Offer two choices:

- Now: tell them to pick each setting's model in `/config`, and answer their question too.
- Later: answer their question, and add one line saying every setting keeps its default model until they pick one in `/config`.

## Get set up

1. Install locally with two commands in a Claude Code session: `/plugin marketplace add janrizmlibres/claude-jrzstack`, then `/plugin install jrzstack@claude-jrzstack`. In `/plugin`, turn on auto-update for the `claude-jrzstack` marketplace so every release reaches them.
2. In the default permission mode, add `Read(~/.claude/plugins/cache/claude-jrzstack/**)` to `permissions.allow` in the user settings, so jrzstack's reads of its own files don't prompt or get denied in subagents.
3. Optionally pick a model for each setting in `/config` or `/plugin configure`. Run [`/jrzstack:setup-jrzstack`](../setup-jrzstack/SKILL.md) to see the settings. It also prints the setup line filled in with them. Then it offers once each to generate a verification skill and a formal verification skill for the project, unless the project already has one.
4. For cloud sessions, paste that setup line into the setup script of every cloud environment that should carry jrzstack.
5. Start a real task with `/jrzstack:savvy-mode`, a goal, and a check that can pass or fail.

Some playbooks need `gh`. Orchestrate, babysit, shipping and multi-phase plans run scripts on Bun, or Node 22.18 or later; without either, the step that needs one stops and prints the install line.

Installing changes nothing until the user invokes a skill. Only `/jrzstack:setup-jrzstack` loads from the user's words. The [README](../../README.md) and [guide page 1](../../docs/guide/01-setup.md) have the details. Offer to word their first prompt with them, per [`references/prompting.md`](references/prompting.md).

If cost is the worry, say where the tokens go and how to spend fewer. jrzstack spends extra tokens on subagents and review panels. Pick cheaper models in `/config`, such as `sonnet` on Work; each setting's effort is fixed by the port, so the model is the lever. The user can waive a panel in their own words, and the run records the step as `skip: user waived`; jrzstack never skips one on its own judgment. Save `/jrzstack:savvy-mode` for work that needs rigor.

jrzstack is the Claude Code port of Lauren Tan's Cursor plugin. It runs on Claude models only, locally and in claude.ai cloud sessions, and gets the breadth upstream got from a second model family from distinct prompts instead: arena directions, interrogate lenses and fresh-context reviews.

## Start a task with `/jrzstack:savvy-mode`

`/jrzstack:savvy-mode` matches the task to a playbook, copies the playbook's steps into the todo list, and runs the other skills as the steps need them. A step it skips stays in the list as `skip: <reason>`. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read [`references/prompting.md`](references/prompting.md) before you help word one. [Guide page 2](../../docs/guide/02-savvy-mode.md) has examples.

How long `/jrzstack:savvy-mode` stays on:

- Typed once, it stays on for the rest of the session. Its reminder hook brings it back on every turn, typed or not (worker results, loop fires, messages), and stays out of casual turns.
- After compaction the hook points back to the full skill file, so the session re-reads it.
- A resumed session (`--resume`) loses the hook. Type `/jrzstack:savvy-mode` again.
- The user turns it off by saying so. To have it on in every session, they can say so in their own `CLAUDE.md`.

Mid-session, "new task" makes the mode match a fresh playbook. The user's own instructions, the request and `CLAUDE.md`, outrank jrzstack's text. `/jrzstack:savvy-mode` already uses `savvy-agent` for the subagents its playbook steps spawn. To get the same style from a subagent of your own, spawn it on `savvy-agent`.

A spec works as the task: an issue that says what to build. Handing it in is the go to execute it. "plan only" stops after the plan is posted on the issue. Landing is withheld unless the request grants it.

## Pick a skill

The default answer is `/jrzstack:savvy-mode`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | [`/jrzstack:savvy-mode`](../savvy-mode/SKILL.md) |
| Check that the agent understood their goal and the problem before it starts | [`/jrzstack:in-your-own-words`](../in-your-own-words/SKILL.md) |
| Get a prompt rewritten deeper, not bigger, before sending it: what a top professional would add, their raw material and methods, and an outside check. It returns the prompt and doesn't do the task | [`/jrzstack:sharpen`](../sharpen/SKILL.md) |
| Know how code works now, or where new code should live | [`/jrzstack:how`](../how/SKILL.md) |
| Know why code is shaped this way, or where a number came from | [`/jrzstack:why`](../why/SKILL.md) |
| Understand a change or subsystem, explained plainly | [`/jrzstack:teach`](../teach/SKILL.md) |
| Catch up on their own recent work on a topic | [`/jrzstack:recall`](../recall/SKILL.md) |
| Catch up on what changed in this session since their last message, in plain words and small visuals, with every item waiting on them listed and decidable from the reply alone | [`/jrzstack:ketchup`](../ketchup/SKILL.md) |
| Know what a small diff could break outside itself | [`/jrzstack:blast-radius`](../blast-radius/SKILL.md) |
| Settle types and module shape before code that crosses a function boundary | [`/jrzstack:architect`](../architect/SKILL.md) |
| Get several attempts at one brief, each in its own direction, merged into the best one | [`/jrzstack:arena`](../arena/SKILL.md) |
| Run parallel checks over slices, or race workers | [`/jrzstack:swarm`](../swarm/SKILL.md) |
| Have three reviewers, one lens each, review a diff and try to break it | [`/jrzstack:interrogate`](../interrogate/SKILL.md) |
| Fix a bug test-first when a cheap local test exists | [`/jrzstack:tdd`](../tdd/SKILL.md) |
| Apply TypeScript rules to `.ts` or `.tsx` work | [`/jrzstack:typescript-best-practices`](../typescript-best-practices/SKILL.md) |
| Strip comments before review, using a reviewer that didn't write them | [`/jrzstack:no-comments`](../no-comments/SKILL.md) |
| Clean AI tells out of prose | [`/jrzstack:unslop`](../unslop/SKILL.md) |
| Clean slop out of a code diff | [`/jrzstack:deslop`](../deslop/SKILL.md) |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | [`/jrzstack:technical-writing`](../technical-writing/SKILL.md) |
| Hear the last reply again in plain words | [`/jrzstack:bro`](../bro/SKILL.md) |
| Give agents a scripted way to drive the app and prove behavior | [`/jrzstack:create-verification-skill`](../create-verification-skill/SKILL.md) |
| Bring a verification skill and its feature map back in line with the app | [`/jrzstack:maintain-verification-skill`](../maintain-verification-skill/SKILL.md) |
| Formally verify a race, invariant, or other property that tests rarely reach | [`/jrzstack:create-formal-verification-skill`](../create-formal-verification-skill/SKILL.md) |
| Bring a formal verification back in line after the code it covers changed, and learn whether a failure is drift or a bug | [`/jrzstack:maintain-formal-verification-skill`](../maintain-formal-verification-skill/SKILL.md) |
| Vet a performance number before reporting or acting on it | [`/jrzstack:benchmark-checklist`](../benchmark-checklist/SKILL.md) |
| Run a large or cross-cutting change, or one to review after stepping away | [`/jrzstack:figure-it-out`](../figure-it-out/SKILL.md) |
| Keep a decision log during a run, and review it afterward | [`/jrzstack:show-me-your-work`](../show-me-your-work/SKILL.md) |
| See the three settings and get the cloud setup line | [`/jrzstack:setup-jrzstack`](../setup-jrzstack/SKILL.md) |
| Turn their own working habits into a personal mode skill | [`/jrzstack:automate-me`](../automate-me/SKILL.md) |
| Turn what a finished task taught into skill edits | [`/jrzstack:reflect`](../reflect/SKILL.md) |
| Stop agents from repeating the same mistakes in this repo | [`/jrzstack:correct`](../correct/SKILL.md) |
| Build a page whose buttons wake a Grok Bot over a webhook | [`/jrzstack:make-bot-ui`](../make-bot-ui/SKILL.md) |
| Find their way around jrzstack | `/jrzstack:savvy-help` |

If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- `/jrzstack:how` explains what the code does. `/jrzstack:why` explains the reasons. `/jrzstack:teach` runs one or both and explains the result plainly.
- `/jrzstack:arena` gives every runner the same brief in its own direction and merges the best parts. `/jrzstack:swarm` splits work into slices or a race and returns one report.
- `/jrzstack:architect` implements right after it settles the design. Add "with checkpoint" to review the design before it writes code.
- `/jrzstack:interrogate` reviews the diff. `/jrzstack:blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/jrzstack:recall` rebuilds context across recent sessions. `/jrzstack:ketchup` covers only this session since the user's last message. Resuming one specific session or branch is the Session pickup playbook.
- `/jrzstack:figure-it-out` designs one rigorous run. The Orchestrate playbook runs a program that spans days and many PRs. The Autonomous run playbook drives one task to a finish condition.

Shipped hidden, or not in jrzstack:

- `/jrzstack:deslop`, `control-cli`, and `control-ui` ship with jrzstack, vendored from the `cursor-team-kit` plugin. Playbooks read them; the user can type `/jrzstack:deslop`.
- `/loop` and `/goal` are Claude Code built-ins. Claude Code ships no skill-authoring skill; the authoring playbook uses one if the user has it installed, such as `skill-creator`.
- jrzstack has no `/orchestrate` skill. Orchestrate is a `/jrzstack:savvy-mode` playbook. If the slash menu shows `/orchestrate`, another plugin provides it.

## Playbooks and principles

Playbooks are step lists inside `/jrzstack:savvy-mode`, not skills, so they have no slash command. Inside `/jrzstack:savvy-mode`, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit. It drives the PR to merge-ready and stops there. It doesn't merge unless the user asks to merge, land, or ship.
- "land the stack" runs Shipping.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "hand this off" or "run it in the cloud" runs Hand-off, which passes the run to a cloud lead and prints the session link.
- "full autopilot on this queue" runs Autopilot-full. "stack them, don't ship" runs Autopilot-stack.
- "run the eval playbook" runs Eval.

Without `/jrzstack:savvy-mode`, a phrase such as "babysit this pr" can start another installed skill whose description matches the same words. The Playbooks section of [`savvy-mode`](../savvy-mode/SKILL.md) lists every playbook and when it applies. [Guide page 6](../../docs/guide/06-verify-and-ship.md) covers opening, babysitting, and landing a PR.

jrzstack has no planning skill. For work that spans phases or stacked PRs, asking `/jrzstack:savvy-mode` for a plan runs the [Multi-phase plan playbook](../savvy-mode/playbooks/multi-phase-plan.md), which writes the plan and doesn't implement it. For a design question, the Prototype playbook or `/jrzstack:architect` settles it in code first.

Principles are one-rule skills that `/jrzstack:savvy-mode` reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." Typing `/jrzstack:principle-<name>` still loads one on demand. [Guide page 8](../../docs/guide/08-principles.md) lists them.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying after a resume | `--resume` drops the reminder hook. Type `/jrzstack:savvy-mode` again. |
| The mode stopped applying in a new session | It is on per session. Type `/jrzstack:savvy-mode` at the start of each, or ask for it in `CLAUDE.md`. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode. |
| A new model choice had no effect | Run `/jrzstack:setup-jrzstack` to see what the session has, and start a new session if it still shows the old model. In cloud, settings come from the setup line's `--config` values, so edit the setup line. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | Only `/jrzstack:setup-jrzstack` loads from the user's words. The others load when the user types them or when `/jrzstack:savvy-mode` reads them, and it doesn't read every skill. |
| jrzstack's reads prompt the user, or a subagent's read was denied | Add the `Read` rule under Get set up. |
| A local run didn't start cloud workers | They need Auto mode on the account and a default cloud environment (`/remote-env`). The run falls back to local worktrees and says so once. "local only" asks for that up front. |
| Parallel agents overwrote each other | Give each agent its own worktree, or run them as cloud workers, which each get their own machine. |
| An overnight run moved but finished nothing | `/goal` needs a condition that can pass or fail, not a duration. See [guide page 7](../../docs/guide/07-overnight.md). |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's the prove-it-works principle. |

For a run that drifts, [`references/prompting.md`](references/prompting.md) has one-line steers. [Guide page 10](../../docs/guide/10-recipes-and-pitfalls.md) has more pitfalls and the recipes worth copying.

## Make jrzstack my own

- [`/jrzstack:automate-me`](../automate-me/SKILL.md) drafts a personal mode skill from the user's own history, to use alongside `/jrzstack:savvy-mode`.
- [`/jrzstack:reflect`](../reflect/SKILL.md) after a session turns its lessons into skill edits the user approves.
- `/jrzstack:savvy-mode write a skill for <workflow>` runs the authoring playbook. The eval playbook tests a skill change blind.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.
- The user's `CLAUDE.md` outranks jrzstack's text, so a rule there (a merge method, a PR title style, a stacking tool) changes what the playbooks do.

[Guide page 9](../../docs/guide/09-make-it-yours.md) covers each of these.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from [`references/recipes.md`](references/recipes.md) when one fits, then the link to that file. Keep it short unless the user asked for the whole map.
