# Conversion rules

The rules every translation, sync and re-translation applies to turn upstream pstack into the port. A translated file is its upstream counterpart with these rules applied and nothing else changed; overrides, port-only and dropped files are listed in `port.json` instead.

A sync that finds a missing rule proposes it in the same PR as an edit to this document.

**How the Cursor-ism check reads this document.** `scripts/check-cursorisms.ts` takes every pattern it checks from here. Every `##` heading is a rule, written `## <n>. <title>`, and every rule holds exactly one `detect` block of `key: value` lines, values written raw:

- `pattern: <regex>`: a JavaScript regular expression, matched against each line of every translated file. A rule may have several.
- `before: <line>`: a line the rule rewrites, usually upstream's own wording.
- `after: <line>`: what the rule makes of it.
- `allow: <port file> | <text on the line> | <reason>`: excuses this rule's matches on the one line of one port file that contains the text, such as a deliberate quote of upstream. Allowances are per occurrence: one whose text is on more than one line with a match is too wide, and one that excuses nothing is stale; the check reports both.
- `undetectable: <reason>`: instead of all of the above, for a rule no line pattern can see.

The check self-tests this document before it scans anything and stops with exit 2 when it fails: every pattern must match at least one of its rule's `before` lines (a pattern that matches none is dead), every `before` line must match one of its rule's patterns, and no `after` line may match any rule's pattern. So a pattern can't change without its examples, nor an example without its pattern.

To add a rule, copy the nearest rule, write its prose, paste the upstream line you met as `before` and your rewrite as `after`, and write a pattern that catches the first and not the second.

## 1. Sibling routing

Every model-facing reference to a sibling skill (bold name, slash name, relative link, repo path) keeps upstream's prose and adds `read ${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md`, in skill and agent bodies. The verb is always "read", never "invoke" or "run". User-facing slash references become `/pstack:<name>`.

```detect
pattern: \b(?:[Ii]nvoke|[Rr]un) \$\{CLAUDE_PLUGIN_ROOT\}/skills/
pattern: (?<!\$\{CLAUDE_PLUGIN_ROOT\}/skills/.*)(?<![\w:/.~$}\]-])/(?:poteto-mode|poteto-help|setup-pstack|architect|arena|automate-me|benchmark-checklist|blast-radius|bro|correct|create-verification-skill|figure-it-out|how|in-your-own-words|interrogate|ketchup|maintain-verification-skill|make-bot-ui|no-comments|recall|reflect|sharpen|show-me-your-work|swarm|tdd|teach|technical-writing|typescript-best-practices|unslop|why|deslop|control-ui|control-cli|principle-[a-z-]+)(?![\w-])(?!.*\$\{CLAUDE_PLUGIN_ROOT\}/skills/)
before: Use the **arena** skill: invoke ${CLAUDE_PLUGIN_ROOT}/skills/arena/SKILL.md.
before: [`/poteto-mode`](./skills/poteto-mode/SKILL.md) and the agents route through the same wrapper.
before: Run /setup-pstack once, then /principle-fix-root-causes when a bug recurs.
before: Seed the hypotheses with /how over the affected subsystem.
after: Use the **arena** skill: read ${CLAUDE_PLUGIN_ROOT}/skills/arena/SKILL.md.
after: [`/pstack:poteto-mode`](./skills/poteto-mode/SKILL.md) and the agents route through the same wrapper.
after: Run /pstack:setup-pstack once, then /pstack:principle-fix-root-causes when a bug recurs.
after: Seed the hypotheses with /how over the affected subsystem (read ${CLAUDE_PLUGIN_ROOT}/skills/how/SKILL.md).
allow: pstack/docs/guide/02-poteto-mode.md | departure board listing | the image's alt text quotes the lettering in the picture
allow: pstack/docs/guide/03-understand.md | links clues under | the image's alt text quotes the lettering in the picture
allow: pstack/docs/guide/04-design.md | interrogate panels | the image's alt text quotes the lettering in the picture
allow: pstack/docs/guide/10-recipes-and-pitfalls.md | pinned cards reading | the image's alt text quotes the lettering in the picture
```

## 2. Frontmatter flags stay

Frontmatter flags stay as upstream sets them (`disable-model-invocation` on every skill but `setup-pstack`). Vendored `deslop`, `control-ui` and `control-cli` gain `disable-model-invocation: true`.

```detect
undetectable: a flag's presence is a property of a file's frontmatter, not of any one line
```

## 3. Multi-model steps

Classify each multi-model step by the job left on one family: breadth or fresh context. Drop a step only when what remains duplicates another. Breadth comes from distinct prompts (directions, lenses). Identical briefs only in `first pass` races; `best-of` and `rank all` need distinct arms. Model races stay opt-in and are labelled a cost check. Volume roles never escalate quietly: when none returns `PASS`, the report says so and the parent may rerun on `opus`. A failed worker retries once on the same model and effort; a second failure is `BLOCKED` with evidence (orchestrate's override refines this).

```detect
pattern: \b[Dd]ifferent models\b
pattern: \bon a different model\b(?! famil)
pattern: \b[Mm]odel diversity\b
before: Ask more than one model the same question and merge the answers. Different models catch different real bugs.
before: Network-drop, retry as-is. Tool-error, retry on a different model.
before: Model diversity is the point.
after: Give each reviewer its own lens and merge the answers. Different lenses catch different real bugs.
after: Network drop, retry as-is. Tool error, retry once on the same model and effort.
after: Distinct lenses are the point.
```

## 4. Roles, not model IDs

Text names a setting (Work, Judgement, Volume), never a model ID or `pstack-models.mdc`. Settings travel with each spawn, as ADR 0002 records. `subagent_type: poteto-agent` stays `poteto-agent`, and `generalPurpose` maps to it, or to `poteto-reader` with `readonly` or when the role only reads. The text names the role's setting beside the agent ("on `poteto-reader` on the Judgement setting"). Every spawn passes its setting's model and effort: `${user_config.<setting>_model}` as `model:` and `${user_config.<setting>_effort}` as `effort:`, or the setting's defaults (Work `opus` at `medium`, Judgement `opus` at `high`, Volume `sonnet` at `high`) for a literal placeholder or an empty value. Both agents' frontmatter falls back to Work's defaults, so a spawn that leaves either out runs on Work's. A spawn upstream leaves untyped gets its role's agent and setting: `automate-me`'s transcript miners run on `poteto-reader` on Volume, `maintain-verification-skill`'s per-feature source readers on `poteto-reader` on Work. The six per-setting agents the port once had (`work`, `judgement`, `volume` and their readers) are gone, and a name of theirs is a leftover.

A reasoning level, a speed, or both picked per spawn become the spawn's `effort:`. Upstream's "Match the model to the job" paragraph becomes poteto-mode's "Match the effort to the job": start from the setting's effort, `${user_config.<setting>_effort}` or its default (Work `medium`, Judgement `high`, Volume `high`), raise one step up to `max` for the hardest or subtlest work, lower one step for routine work and two for mechanical work, never below `low`; swarm verifiers stay at the Volume effort; change only `effort:`, never the agent or the model. Its step down for judgment is dropped, since judgment already runs on Judgement and the step would undercut that setting's default. Fast mode is a session toggle in Claude Code with no per-spawn form, so a fast-or-standard choice is dropped. Upstream's per-skill pointer to the Subagents section keeps its place and names effort alone.

```detect
pattern: \bclaude-(?:opus|sonnet|haiku|fable)-\d
pattern: \bgrok-\d
pattern: \bpstack-models\.mdc\b
pattern: \bgeneralPurpose\b
pattern: \binherit-parent\b
pattern: \b[Gg]rok\b(?!-\d| [Bb]ot)
pattern: \b(?:[Oo]pus|[Ss]onnet|[Hh]aiku|[Ff]able) \d
pattern: \breasoning level\b
pattern: \b(?:fast or standard|standard) speed\b
pattern: \bMatch the model to the job\b
pattern: \b(?:work|judgement|volume)-reader\b
pattern: `(?:work|judgement|volume)` agent\b
before: | Reviewer A | `claude-opus-5-5-xhigh` |
before: | Reviewer B | `grok-4.7-xhigh-fast` |
before: Use the `interrogate reviewers` line in `~/.cursor/rules/pstack-models.mdc`, one reviewer per entry.
before: One message, three calls, `subagent_type: generalPurpose`, and the model left unset for `auto` or `inherit-parent`.
before: code delegates (feature, refactoring, bug fix, perf, hillclimb) go to grok, while the hardest changes, prose, and judgment go to opus 5.5.
before: Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section of the **poteto-mode** skill.
before: **Match the model to the job.** Before each spawn, start from the role's line or default and pick the reasoning level and speed the job needs.
before: Otherwise use standard speed, the same slug without `-fast`.
before: Spawn one reviewer per lens on the `judgement-reader` agent.
before: **Use the `work` agent for any subagent you spawn inside a playbook step**
after: | Breakage | `poteto-reader` on Judgement |
after: | Fit | `poteto-reader` on Judgement |
after: Spawn one reviewer per lens on `poteto-reader` on the Judgement setting.
after: **Use `poteto-agent` for any subagent you spawn inside a playbook step**
after: One message, three calls on `poteto-reader` on the Work setting, each passing the setting's `model:` and `effort:`.
after: code delegates (feature, refactoring, bug fix, perf, hillclimb) run on Work, while the hardest changes, prose, and judgment run on Judgement.
after: Pick each subagent's effort for the job, per the Subagents section of the **poteto-mode** skill.
after: **Match the effort to the job.** Before each spawn, start from the setting's effort, chosen in `/config`.
```

## 5. Cross-family review becomes a fresh-context review

Cross-family review becomes a fresh-context review in the Judgement role (or the step's own role), briefed with the artifacts and never the reasoning that produced them. poteto-mode's "diverse-model review" becomes "lens- or source-partitioned review"; its second opinion stays, recast: agreement rules out a fluke, not a shared blind spot.

```detect
pattern: \bdifferent model famil(?:y|ies)\b
pattern: \bdiverse-model\b
pattern: \bagainst a different model\b
pattern: \bcross-judge\b
before: Before handing back, spawn a subagent on a different model family from the one that did the work.
before: Routed workflow skills set their own `subagent_type` for diverse-model review.
before: A second opinion is the same prompt against a different model. Agreement is high-signal.
before: delegate via the **arena** skill instead so the runners surface the alternatives and the cross-judge guards the pick.
after: Before handing back, spawn a fresh-context review on `poteto-reader` on the Judgement setting, given the trail and transcript paths and never your reasoning.
after: Routed workflow skills set their own agents for lens- or source-partitioned review.
after: A second opinion is the same prompt in a fresh context. Agreement rules out a fluke, not a shared blind spot.
after: delegate via the **arena** skill instead so the runners surface the alternatives and the blind judge guards the pick.
```

## 6. Cursor tools and paths

`Task` → `Agent` (with `isolation: "worktree"` wherever upstream says a worker gets its own worktree); `is_background` → `run_in_background`; `AskQuestion` → `AskUserQuestion`, within its limits (1 to 4 questions of 2 to 4 options; `allow_multiple` → `multiSelect`); Cursor's `Shell` tool → `Bash`; `environment` dropped in favour of the worker rules. `.cursor/skills/` → `.claude/skills/`, `~/.cursor/skills/` → `~/.claude/skills/`, `~/.cursor/plugins/` → `~/.claude/plugins/`. `reflect` counts `Skill` tool calls as skill loads alongside `Read`s of a `SKILL.md`.

```detect
pattern: \bTask tool\b
pattern: `Task`
pattern: \bTask (?:subagent|schema|`model`)
pattern: \bAskQuestion\b
pattern: \bis_background\b
pattern: \benvironment: "(?:cloud|local)"
pattern: \.cursor/
pattern: \ballow_multiple\b
pattern: \(Shell,
before: Launch all reviewers in a single message using the Task tool.
before: One message, three `Task` calls, one per reviewer.
before: Spawn one Task subagent that explores and explains.
before: Prefer AskQuestion over free text.
before: is_background: true
before: Spawn all N workers in one message with `environment: "cloud"` and `run_in_background: true`.
before: It writes `.cursor/skills/verify-<app>/`, agent-facing instructions.
before: Shape: one or two questions with 4-6 options each, `allow_multiple: true` for category questions.
before: - Tool calls (Shell, Grep, MCP, etc.) that match a skill's documented commands
after: Launch all reviewers in a single message using the Agent tool.
after: One message, three `Agent` calls, one per reviewer.
after: Spawn one Agent that explores and explains.
after: Prefer AskUserQuestion over free text.
after: run_in_background: true
after: Spawn all N workers in one message with `run_in_background: true`.
after: It writes `.claude/skills/verify-<app>/`, agent-facing instructions.
after: Shape: one or two questions with 2-4 options each (the tool's limit), `multiSelect: true` for category questions.
after: - Tool calls (Bash, Grep, MCP, etc.) that match a skill's documented commands
```

## 7. Transcripts

`agent-transcripts/` → `~/.claude/projects/<slug>/${CLAUDE_SESSION_ID}.jsonl`, subagents under `<id>/subagents/`; upstream's "never glob across projects" guard stays; `recall`'s slug rule becomes Claude Code's: the absolute path with every character that isn't a letter or digit turned into "-". A check of a transcript's opening prompt reads its first user line (`"type":"user"`), since Claude Code's first line may be metadata. `session-pickup`'s sources become a local transcript, a cloud session's URL, a pushed branch or a program's store branch (`pstack/orchestrate/<program-slug>`). Surface line in `recall` and `session-pickup`: in cloud (`pstack: surface=cloud`, or `$CLAUDE_CODE_REMOTE` set when no reminder line is in context), earlier sessions' transcripts aren't available, so fall back to the git trail and pushed branches.

```detect
pattern: \bagent-transcripts\b
pattern: message\.content\[0\]\.text
before: Read this run's transcript under the active workspace's `agent-transcripts/` directory (the system prompt names the path).
before: For each candidate, read the first JSONL line and check that `message.content[0].text` contains the conversation's opening user prompt.
after: Read this run's transcript at `~/.claude/projects/<slug>/${CLAUDE_SESSION_ID}.jsonl`.
after: Check each candidate: find its first user line (`"type":"user"`) and check that its `message.content` contains the conversation's opening user prompt.
```

## 8. Forge

`gh` is the only forge: every Origin branch and Origin-only flag is deleted, as is the "built-in PR tool" branch. `gh pr`/`gh issue` stay as written, with a surface line in poteto-mode: in cloud they fail (GraphQL blocked), so do the same operation with `gh api` REST; draft toggles use the proxy's `…/pulls/{n}/ccr/ready_for_review` and `…/ccr/convert_to_draft`. A refused draft toggle is reported once, like a refused merge, and never retried. Stacks stay upstream's hand-chained base branches; the port never names `gh stack`.

```detect
pattern: \bcommand -v origin\b
pattern: \borigin pr\b
pattern: \bOrigin\b
pattern: \bbuilt-in PR tool\b
pattern: \bgh stack\b
pattern: `gt`
pattern: \bno gt\b
before: If `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation.
before: Use the run's built-in PR tool when it has one, else `gh pr create --base <base-branch>`.
before: Open the stack with `gh stack`.
before: Recompute `frontier.json` from `gt` after every merge and stack mutation.
before: FORBIDDEN    no gt, no rebase, no force-push
after: GitHub CLI (`gh`) is the forge; in cloud, do the same operation with `gh api` REST.
after: Open the PR with `gh pr create --base <base-branch>`.
after: Open the stack as hand-chained base branches.
after: Recompute `frontier.json` from the stacker's declared order after every merge and stack mutation.
after: FORBIDDEN    no rebase, no force-push
```

## 9. Review bots

Bugbot and "the agentic security review" become "review bots (e.g. Claude Code Review, Bugbot, Copilot)" and "security-review bots".

```detect
pattern: (?<!Claude Code Review, )\bBugbot\b
pattern: \bagentic security review\b
before: Bugbot or the agentic security review commented → skeptical posture.
after: Review bots (e.g. Claude Code Review, Bugbot, Copilot) or security-review bots commented → skeptical posture.
```

## 10. Loops

User-facing "/loop until X" → "type `/goal X`" (trigger phrases accept both), and a user-facing "give `/loop` a predicate" → "give `/goal` a condition". A lead's wake becomes a watcher subagent or Monitor for events, and `/loop <interval> <prompt>` through the Skill tool for cadence; a loop prompt reads poteto-mode by path, since a scheduled fire can't run a hidden skill. visual-parity's "`/loop` per component" → "repeat until the diff is zero". Surface line in autonomous-run and autopilot: in cloud, cadence runs from a background wait, since a pending loop won't wake a paused VM.

```detect
pattern: /loop until\b
pattern: `/loop` per component\b
pattern: \b[Gg]ives? `/loop`
before: A long task to drive to completion without stopping ("run until done", "/loop until X").
before: Investigate the pixel delta. `/loop` per component until the diff is zero.
before: Write done as checks every iteration can run, and give `/loop` that predicate.
after: A long task to drive to completion without stopping ("run until done", or type `/goal X`).
after: Investigate the pixel delta. Repeat until the diff is zero.
after: Write done as checks every iteration can run, and give `/goal` that condition.
```

## 11. Other Cursor built-ins

Cursor's `create-skill` → "a skill-authoring skill if one is installed (such as `skill-creator`); otherwise write the SKILL.md directly". `why`'s `mcps/` scan → list MCP servers from your own tool list. Built-ins with no counterpart (Plan Mode, babysit skill, dashboard) are dropped; "a Cursor restart" → "a Claude Code restart". The terminal shows no pictures: a `/visualize` diagram becomes a Mermaid diagram in a fenced block, a `/visualize` chart for numbers becomes a small Markdown table and stops counting as a visual, and a screenshot or video embedded inline becomes a link to its file.

```detect
pattern: \b[Cc]ursor(?:'s| built-in)
pattern: \bCursor restart\b
pattern: \brestart Cursor\b
pattern: \b[Pp]lan [Mm]ode\b
pattern: \bcreate-skill\b
pattern: \bmcps/
pattern: (?<![\w-])/visualize\b
pattern: \b[Ee]mbed (?:screenshots|videos|images)\b
before: Use Cursor's built-in `create-skill` skill to author the skill.
before: Suspending in-flight work cleanly on an explicit pause, going offline, or a Cursor restart.
before: pstack has no planning skill. Plan Mode works alongside it.
before: cursor already has a great plan mode which works great with pstack.
before: Tell the agent you're about to go offline or restart Cursor.
before: Otherwise inspect the `mcps/` directory for enabled MCP servers.
before: `/loop` is a Cursor built-in wake mechanism, not a pstack skill.
before: Draw diagrams and charts from facts you have: a Mermaid diagram for how things connect and a `/visualize` chart for numbers.
before: Embed screenshots and videos inline when the change is visible, not only as links.
after: Use a skill-authoring skill if one is installed (such as `skill-creator`); otherwise write the SKILL.md directly.
after: Suspending in-flight work cleanly on an explicit pause, going offline, or a Claude Code restart.
after: pstack has no planning skill.
after: If you want a plan, ask `/pstack:poteto-mode` for one.
after: Tell the agent you're about to go offline or restart Claude Code.
after: List the MCP servers from your own tool list.
after: `/loop` is a Claude Code built-in, not a pstack skill.
after: Draw diagrams from facts you have: a Mermaid diagram for how things connect, and a small table for numbers.
after: Link the screenshots and videos the work produced when the change is visible.
```

## 12. Compaction

Drop "imminent context compaction" from poteto-mode's Pause safely triggers and the "For the compaction trigger…" sentence from Pause safely step 4. Pause safely writes the resume note into the `wip:` commit's body (`--allow-empty` on a clean tree) instead of `/tmp`, and in cloud pushes that commit to the session's own branch, the one push step 2's no-push rule excepts. Session pickup reads a resume note first, from the body of a `wip:` commit at a branch's tip.

```detect
pattern: \bimminent context compaction\b
pattern: \bcompaction trigger\b
pattern: /tmp/[^\s`]*resume
before: Suspending in-flight work cleanly so it can be resumed, on an explicit pause, going offline, or imminent context compaction.
before: For the compaction trigger write it to a file like `/tmp/<slug>-resume.md`.
after: Suspending in-flight work cleanly so it can be resumed, on an explicit pause or going offline.
after: Write it into the `wip:` commit's body (`--allow-empty` on a clean tree).
```

## 13. Landing and leftover branches

In cloud, `gh pr merge <pr> --squash` → `gh api -X PUT repos/{owner}/{repo}/pulls/<n>/merge -f merge_method=squash`; `--auto` (merge-when-ready) → watch-then-merge from a background wait, never `/ccr/auto_merge`. At every merge step, the first refused merge stops that PR at merge-ready, with the refusal recorded as a gate; no retry, no workaround. Every landing playbook's Reply (Shipping, Autopilot-full, Orchestrate's Close) lists the leftover branches the run pushed (merged heads still present, closed or abandoned unit branches; open-PR heads left out; a store branch listed as kept) and one `git push origin --delete …` line for the user to run locally. No lead deletes a remote branch on either surface. A landing playbook lands only under a landing grant; without one it stops at merge-ready. Babysit and Shipping run `watch-pr` through the runtime launcher, `${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/scripts/run watch-pr/watch-pr`, and hold its watch from a background wait in place of upstream's `/loop`; with no runtime (exit 69) they say so once with the install line and stop before calling a PR ready, never reading the forge by hand in the watcher's place.

```detect
pattern: /ccr/auto_merge\b
pattern: \bscripts/watch-pr/watch-pr\b
pattern: `/loop` in dynamic mode\b
before: In cloud, arm merge-when-ready with `gh api -X PUT repos/{owner}/{repo}/pulls/<n>/ccr/auto_merge`.
before: On GitHub, status comes from `scripts/watch-pr/watch-pr`. Run it directly.
before: Run `drive` and `background` under `/loop` in dynamic mode.
after: In cloud, for merge-when-ready, watch the checks from a background wait, then merge.
after: Status comes from the watcher, run through the runtime launcher: `${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/scripts/run watch-pr/watch-pr`.
after: Run `drive` and `background` from a background wait: run the watcher with `run_in_background: true` or under Monitor.
```

## 14. Agent descriptions

Agent descriptions of translated agents (Comment Sicko) end with "Spawned only by pstack playbooks."

```detect
undetectable: a missing ending is an absence in an agent's frontmatter, which no line pattern can see
```

## 15. poteto-mode-scoped rules

These keep `skills/poteto-mode/SKILL.md` translated:

- frontmatter gains the reminder hook;
- frontmatter's `name` is `poteto-mode`, not upstream's `Poteto Mode`, so the slash menu shows the `/pstack:poteto-mode` every doc names;
- one line, once: pstack skills are reached by reading their `SKILL.md`; the Skill tool refuses them by design, so a read is the intended route, not a workaround;
- the router names `playbooks/hand-off.md` in one line, read by path;
- beside the todolist's `skip: <reason>`, a short passage says a panel step a playbook lists unconditionally, or whose condition holds, is never the agent's to skip and has no size gate, and that only the user can waive it, in the run prompt or `CLAUDE.md`, recorded as `skip: user waived` in the list and the Reply;
- the router sends a spec handed in (`build <issue URL>`, an issue number, a spec file) or a request for a plan ("plan only", "plan #42") to the multi-phase-plan playbook first, whatever its size and ahead of figure-it-out and Orchestrate, in one entry that also says it carries on unless only the plan was asked for;
- "Defaults for every `Agent` call" opens with the brief contract, by path, for every spawn, not only a playbook step's;
- "You own every subagent's work" gains one sentence: a worker's worktree is removed once its result is integrated or discarded, keeping its branch;
- the router's "work the user steps away from goes to `figure-it-out`" clause is narrowed: being handed off doesn't count as stepping away;
- the router gains one line for a run that starts detached at a PR's head (a GitHub-fired routine): it pushes to the PR's head branch, falls back to a `claude/` branch and a PR against the head when that push is refused, and never force-pushes the head;
- beside "Always pause", a short passage holds the lead to the brief contract's missing-files rule for its own setup: a missing gitignored file stops the step and is never created, from a template or otherwise.

```detect
undetectable: each asks for a line to be present in poteto-mode's SKILL.md, and an absence is not a line a pattern can match
```

## 16. Install and settings

`/add-plugin pstack` becomes the two `/plugin` commands, `/plugin marketplace add janrizmlibres/claude-pstack` then `/plugin install pstack@claude-pstack`, with the marketplace's auto-update on. `setup-pstack`'s model rule, its reasoning budgets and the `auto` and `inherit-parent` values become the three settings: the user picks each setting's model and starting effort in `/config` or `/plugin configure` (in cloud, with the setup line's `--config`), and `/pstack:setup-pstack` shows them. Rule 4 adjusts that effort per spawn.

```detect
pattern: (?<![\w-])/add-plugin\b
pattern: \breasoning budgets?\b
before: Install with `/add-plugin pstack` in chat, or from Customize in the sidebar.
before: run /setup-pstack, pick a reasoning budget, and choose which models you want.
after: Install with `/plugin marketplace add janrizmlibres/claude-pstack`, then `/plugin install pstack@claude-pstack`.
after: Pick a model for each of the three settings in `/config`, and run /pstack:setup-pstack to see them.
```

## 17. Staying in the mode

A Custom Mode (Option+Enter or Alt+Enter on the slash menu, or Use as Mode) has no counterpart and needs none: a typed `/pstack:poteto-mode` keeps itself on for the rest of the session through its reminder hook, worker results and loop fires included, and stays out of casual turns. The user opts out by saying so. `--resume` drops the hook, so after a resume the user types `/pstack:poteto-mode` again. A mention of the Agents Window goes with its Custom Mode sentence.

```detect
pattern: \b[Cc]ustom [Mm]odes?\b
pattern: \b(?:[Oo]ption|[Aa]lt)\+[Ee]nter\b
pattern: \bAgents Window\b
before: To keep `/poteto-mode` on for the whole chat, pick it from the `/` menu with Option+Enter (Mac) or Alt+Enter (Windows) instead of Enter.
before: That makes it a Custom Mode, which stays in context on every turn until you exit it. Custom Modes are available in the Agents Window and the CLI.
after: `/pstack:poteto-mode` stays on for the rest of the session: its reminder hook brings it back on every turn.
after: After `--resume`, type `/pstack:poteto-mode` again, because a resume drops the hook.
```

## 18. Cloud workers and other Cursor products

Cursor as the product pstack runs in becomes Claude Code. Cursor cloud agents, cloud subagents and the `/in-cloud` command become cloud workers, placed as ADR 0001 places them: a local lead sends swarm workers, orchestrate units and autopilot owners to cloud workers by default (Auto on the account and a default cloud environment), "local only" keeps them in local worktrees, and "hand this off" moves the whole run to a cloud lead. A Cursor Project becomes one lead session per body of work, local or handed off. Cursor automations become routines (`/schedule`), each a cloud lead as ADR 0001 describes. A Cursor-only habit with no counterpart, such as dragging chats into a Project, goes. A link to cursor.com becomes the matching Claude Code docs page, or goes when none matches.

```detect
pattern: \bCursor cloud agents?\b
pattern: \bcloud subagents?\b
pattern: (?<![\w-])/in-cloud\b
pattern: \bCursor Projects?\b
pattern: \bcursor\.com\b
before: The cleanest isolation is a [cloud subagent](https://cursor.com/docs/subagents#cloud-subagents).
before: Type `/in-cloud` before the task, or ask the parent chat to hand work to cloud subagents.
before: A [Cursor Project](https://cursor.com/blog/projects) gives one coordinator agent a persistent thread.
before: One Cursor cloud agent per PR owns build, the first verification round, and merge.
after: The cleanest isolation is a [cloud worker](https://code.claude.com/docs/en/claude-code-on-the-web), a cloud session on its own VM and branch.
after: Say "local only" to keep a run's workers in local worktrees, or "hand this off" to move the whole run to a cloud lead.
after: Give each body of work its own lead session, local or handed off to the cloud.
after: One cloud worker per PR owns build, the first verification round, and merge.
```

## 19. Vendored and dropped files

`deslop`, `control-ui` and `control-cli` ship inside the port, vendored from `cursor-team-kit` and hidden by rule 2, so a line saying they ship in that plugin, or telling the user to install it, says they ship with pstack instead. A reference to a dropped file (`automations/benny`) goes with its sentence, or with its section when the section is about that file.

```detect
pattern: \bships? in (?:the )?`cursor-team-kit`
pattern: \binstall `cursor-team-kit`
pattern: \b[Bb]enny\b
before: `/deslop` ships in the `cursor-team-kit` plugin, not in pstack.
before: install `cursor-team-kit` alongside pstack if you want the full set.
before: pstack also ships a dormant [benny automation pack](./automations/benny/).
after: `/pstack:deslop` ships with pstack, vendored from the `cursor-team-kit` plugin and hidden until you type it.
after: `control-cli` and `control-ui` ship with pstack too.
```

## 20. Spec intake

These keep `skills/poteto-mode/playbooks/multi-phase-plan.md` translated while it takes a spec to a plan and on to execution:

- a first step reads the input: a spec is read and never edited, and an issue (a URL or a number) is read with `gh api` REST on both surfaces, comments included;
- step 2's one-or-two-file skip never applies to a spec handed in or a request for the plan;
- the plan file goes to `.claude/pstack/plans/<slug>.md` unless the operator names a path, listed in the exclude file `git rev-parse --git-path info/exclude` names, and is never committed on the run branch; the plan keeps `${CLAUDE_PLUGIN_ROOT}` literal;
- `check-plan.mjs` runs through the runtime launcher, `${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/scripts/run`; with no runtime (exit 69) the plan is posted as not linted, never linted by hand;
- the plan is posted beside the input, never in it: as a comment on a spec issue, or for other input on the orphan branch `pstack/plan/<slug>` through git plumbing, with no worktree;
- the hand-back becomes the go: a spec handed in, "run until done" or a brief's go grant carries on under the execution playbook the plan names; only a request for the plan alone ("plan #42", "plan only"), or a plan the operator asked for, stops after posting; landing stays withheld unless granted, and without a landing grant the execution playbook is always Autopilot-stack;
- the skeleton reads the playbooks it names from `${CLAUDE_PLUGIN_ROOT}` instead of `git show origin/main:`, adds the brief contract to that list and to each owner's brief, branches from `<base-branch>` instead of `main`, runs its live lanes on `poteto-agent` on the Volume setting, and its audit tick's prompt reads poteto-mode by path, with rule 10's cloud surface line on the tick;
- `check-plan.mjs` is an override whose markers match this skeleton, so a change to either is carried into the other.

```detect
undetectable: each asks for a step or a skeleton line to be present in multi-phase-plan.md, and an absence is not a line a pattern can match
```

## 21. Worktrees

Worktrees Cursor makes under `~/.cursor/worktrees/<repo>/` become Claude Code's, under the repo's `.claude/worktrees/`, and workers get them where ADR 0001 places them.

- Opening a PR works from a worktree off the PR's base, not off main. Locally that is `git worktree add .claude/worktrees/<name> -b <branch> <base>`, then the `EnterWorktree` tool called with that path before any other step (a `cd` in Bash moves only one shell, not the session or its subagents), so a base other than the default branch works whatever `worktree.baseRef` says; `.claude/worktrees/` goes into the exclude file `git rev-parse --git-path info/exclude` names, and the worktree stays until the PR merges. On the cloud surface the lead works from its own checkout.
- Every step in poteto-mode's playbooks and in `figure-it-out` that hands work to a worker (a delegate, an owner, a parallel attempt) briefs it per the brief contract (read ${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/references/brief-contract.md). A worker that gets its own worktree is an `Agent` with `isolation: "worktree"` whose brief names its start commit; the lead removes that worktree once the result is integrated or discarded and keeps the branch.
- Worktree cleanup's chats become Claude Code sessions, read from the transcripts `worktree-audit.sh` names, and its audit step names the script's `stray` bucket. Its reclaimers drop Cursor's app data. Its simulator step runs only on the local surface, and on the cloud surface, where earlier sessions' transcripts aren't available, a `stray` is unverified rather than abandoned.

```detect
pattern: \bgit worktree off main\b
pattern: Application Support/Cursor\b
before: **Worktree.** Work from a git worktree off main. Subagents inherit it.
before: More when needed: Xcode `DerivedData` and `iOS DeviceSupport`, `~/Library/Application Support/Cursor` (`state.vscdb.backup`), package caches (pnpm, uv, brew, yarn).
after: **Worktree.** Work from a git worktree off the PR's base. Subagents inherit it.
after: More when needed: Xcode `DerivedData` and `iOS DeviceSupport`, package caches (pnpm, uv, brew, yarn).
```

## 22. Big fan-outs

These keep `swarm` and the Autopilot-stack and Autopilot-full playbooks translated:

- workers are placed as ADR 0001 places them, read from the reminder's surface line: a local lead sends swarm workers (races included) and autopilot owners to cloud workers by default, started with `claude --permission-mode auto --cloud` under a pseudo-terminal after pushing the run's base, with `--settings '{"remote":{"defaultEnvironmentId":"<env_ id>"}}'` when the run names an environment; local-only, asked for or fallen back to and said once, runs them in parallel locally, in a worktree each for one that writes or races; a cloud lead runs them as in-VM `Agent`s, `isolation: "worktree"` for one that writes, and an Auto lead adds `create_session` workers for whole-machine work. Cursor's `cloud_base_branch` becomes the start commit the brief names; a local lead reads each cloud worker's result only from the report commit it pushes, found by its `Pstack-Nonce` trailer as the brief contract describes;
- every worker is briefed per the brief contract, swarm workers as leaf workers; swarm workers run on `poteto-agent` on the Volume setting (`poteto-reader` when they only read); autopilot owners are sub-leads on `poteto-agent` on Work that run their own panels and declare their timebox;
- where workers are spawned, the text carries the window (at most 10 direct children in flight, refilled as they finish, never in blocking batches; an in-session owner counts at its peak of 4 and keeps at most 3 workers of its own in flight, waited for inside the owner's own turn since an in-session owner is a subagent, a cloud or `create_session` worker counts as one, and a root's verification swarms share its window with its owners; swarm's N stays the total), backpressure (a refused spawn waits for one of the lead's own in-flight agents, whatever the error says, and never drops a slice, arm, owner or lane; with nothing in flight it is `BLOCKED: concurrency cap`) and the timebox (sized per brief, 30 minutes for a reader and 90 for a code writer without an estimate; at 1.5× the worker is `BLOCKED` with no retry, an in-session one stopped with `TaskStop`, its session URL recorded and the user told once);
- an autopilot owner past 1.5× its timebox is stuck: it is `BLOCKED` and one replacement owner starts from its pushed branch and decision trail; a replacement that also stalls is `BLOCKED` and its item is parked and listed in the Reply, which is how upstream's replace-at-once audit and the no-retry timebox meet;
- an audit tick re-reads its playbook from `${CLAUDE_PLUGIN_ROOT}` instead of `git show origin/main:`, since the plugin isn't in the user's repo;
- Autopilot-full carries rule 13 at its merge step and in its Reply;
- Autopilot-full's pre-merge path check is `git diff --name-only HEAD...origin/main`, one plain command with the same paths as upstream's `$(git merge-base HEAD origin/main)` form, which a worktree-isolated owner's guard refuses.

```detect
pattern: \bgit show origin/main:pstack/
pattern: \bcloud_base_branch\b
pattern: \$\(git merge-base HEAD origin/main\)
before: At each tick, re-read this playbook from trunk with `git show origin/main:pstack/skills/poteto-mode/playbooks/autopilot-stack.md` and audit the operation against it.
before: When a worker must start from a non-default pushed branch, pass `cloud_base_branch`.
before: Also check that no path in `git diff --name-only $(git merge-base HEAD origin/main) origin/main` is a path the PR changes.
after: At each tick, re-read this playbook at `${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/playbooks/autopilot-stack.md` and audit the operation against it.
after: Every worker starts from a commit its brief names.
after: Also check that no path in `git diff --name-only HEAD...origin/main` is a path the PR changes.
```

## 23. Agent stores

Cursor gives each agent a store whose path the system prompt names; Claude Code has none. A decision trail upstream keeps in the agent's store rides in the bodies of the commits its writer pushes (an empty commit is fine), so a replacement reads it from the branch's log and a squash merge, which takes the PR body, never lands it. Orchestrate's store is the orch override's, checkpointed to its orphan branch.

```detect
pattern: \bagent's store\b
before: Assume the VM dies. Soon after starting, push and start a decision trail in the root agent's store (path in the system prompt) per the **show-me-your-work** skill, then push after every unit worth keeping.
after: Assume the VM dies. Soon after starting, push and start a decision trail per the **show-me-your-work** skill, then push after every unit worth keeping. Carry the trail's new rows in the body of each pushed commit (an empty commit is fine).
```
