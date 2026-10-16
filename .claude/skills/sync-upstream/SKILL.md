---
name: sync-upstream
description: Bring the port up to upstream pstack in one PR, re-translate after a conversion rule changed, or oversee the sync workflow's run and review its PR. `/sync-upstream [dry run] [ref]`, `/sync-upstream retranslate <rule>`, `/sync-upstream oversee`.
disable-model-invocation: true
---

# Sync upstream

Two modes open one PR each, and a third reviews the sync workflow's. Vocabulary is `CONTEXT.md`'s.

- **Sync** (`/sync-upstream [dry run] [ref]`, ref default `main`): carry what upstream changed since the snapshot into the port, then advance the snapshot.
- **Re-translation** (`/sync-upstream retranslate <rule>`): carry a changed conversion rule into every translated file it touches. The snapshot stays where it is.
- **Oversight** (`/sync-upstream oversee`): settle with the maintainer the calls the sync workflow shouldn't make alone, then start it, watch its run, and review the PR it opens. It never merges.

The sources of truth: `docs/conversion-rules.md` (every rule, applied to every file you translate), `port.json` (each file's kind; an unlisted `pstack/` file is a translated file of its counterpart under `upstream/`), and the scripts under `scripts/`, each documented in its header. The base branch is the branch checked out when you start. `<scratch>` is `.sync-upstream/` (create it), which git ignores.

In Sync and Re-translation, the sync workflow runs this skill with no one in the loop until its PR, and you may be running unattended too. Settle every call yourself: make the best call, mark its row ⚠️ and say why in the row's Reason. The PR is where the maintainer reviews.

## Sync

1. **Pin upstream.** Run `bun scripts/sync-changes.ts [ref] > <scratch>/changes.md`. Its first line names upstream's commit and pstack version; that commit is the target for the whole run, even if upstream moves meanwhile. "Nothing to sync" ends the run: say so and stop. A **dry run** ends here too: print the table and stop, with no branch, no edits and no PR.
2. **Branch.** `git switch -c sync/<version>` from the base. If `sync/<version>` already exists on `origin`, use `sync/<version>-<first 7 of the commit>`.
3. **Read the change and its intent.** Run `bun scripts/upstream-diff.ts <commit> > <scratch>/upstream.diff` now, while the snapshot still holds the old side. Read intent from upstream's commit messages and PR bodies: for each snapshot path, `gh api repos/cursor/plugins/commits -X GET -f sha=<commit> -f path=<path> -F per_page=100`, down to the snapshot's commit, then `gh api repos/cursor/plugins/commits/<sha>/pulls` for each commit's PR. Intent decides how a change lands in the port; the diff only says what moved.
4. **Carry every row.** The table has one row per upstream change and port file it reaches, with the kind and the action. Do each action under these rules:
   - **Translated file changed:** patch the port file forward, applying the conversion rules to the new hunks. When upstream mostly rewrote the file, re-translate it whole from the new counterpart; the Reason says "re-translated" or "patched".
   - **Override changed, or a file in its `depends_on` changed:** edit the override as its intent requires. The Reason records the call: **absorbed**, **partly absorbed** or **ignored**, and why. The override's body carries no sync notes.
   - **New file:** translate it at its path by default. Propose it as an override or as dropped instead, with a one-line `why` in a new `port.json` entry, when a translation can't serve it.
   - **Deleted file:** delete its translated file. Propose deleting an override, or keep it by changing its entry to `port-only` (removing `sources` and `depends_on`). Remove a dropped entry that no longer covers anything.
   - **Renamed file:** `git mv` the port file and move its `port.json` entry, repointing every `sources` and `depends_on` that named the old path; then patch forward any edits.
   - **Dropped file changed:** listed only, collapsed below the table as the script prints it.
   - **⚠️ rows** (an upstream file at a port-only or vendored path, a rename across kinds): decide, do it, and keep the ⚠️.
   - **Upstream's `commander` pin moved** (its `skills/poteto-mode/scripts/package.json` or `bun.lock` shows among the dropped files; read the hunk): re-copy the vendored `pstack/skills/poteto-mode/scripts/node_modules/commander` at the new version, licence included, and update the version in that entry's `why`.

   Done when every row's action is carried out and its Reason is filled.
5. **Fan out above a handful of files.** When more than 5 rows need edits, spawn one subagent per skill directory (`pstack/skills/<name>/`; other files grouped by their top directory under `pstack/`), all in one message. Keep overrides and `skills/poteto-mode/SKILL.md` in this session, on Opus. Give small translated hunks to `model: "sonnet"` and full re-translations to `model: "opus"`. Each brief holds that directory's rows, their hunks of `upstream.diff`, the intent you read, the path to `docs/conversion-rules.md`, and the rule that it edits only files in its directory. Each subagent returns its rows with Reasons filled and its ⚠️ calls. Read what comes back before step 7.
6. **Propose a missing rule.** When a change needs a Claude Code form that no conversion rule gives, make the best call in the file and add the rule to `docs/conversion-rules.md` in this PR, in the document's own format: prose, then a `detect` block with `before` and `after` lines, or `undetectable:` with the reason. Mark the row ⚠️ and name the new rule.
7. **Advance the snapshot.** `bun scripts/upstream-snapshot.ts <commit>`, the pinned commit, never `main`.
8. **Run the checks**, each to exit 0, fixing the port until it does:
   - `bun scripts/upstream-diff.ts --verify`
   - `bun scripts/check-cursorisms.ts`
   - `bun scripts/check-port-json.ts`
   - `bun scripts/render-readme.ts`, then `bun scripts/render-readme.ts --check`
9. **Open the PR.** Commit `upstream/`, `pstack/`, `port.json`, the README and any rules edit together, with a plain message (`Sync upstream pstack v<version>`) and no attribution lines. Push the branch, then `gh pr create --base <base> --title "Sync upstream pstack v<version>" --body-file <scratch>/body.md`. The body:
   - the script's first line (upstream's commit and version, since the snapshot's);
   - a few lines of upstream's intent, from step 3;
   - the table with every Reason filled, ⚠️ rows kept, and the dropped-files block below it;
   - the files re-translated whole, the rules proposed, and any check you couldn't get to exit 0, with its output.

   Done when the PR is open; reply with its link.

## Re-translation

1. **Name the rule.** `<rule>` is a rule's number or title in `docs/conversion-rules.md`, as it reads on the base branch.
2. **Find every translated file it touches.** The translated files are the `pstack/` files `port.json` doesn't list as override, port-only or dropped. A rule with a `detect` block finds them: `bun scripts/check-cursorisms.ts` lists every leftover line. For an `undetectable` rule, or a rule whose scope widened past its patterns, search the counterparts under `upstream/` for the mechanic the rule converts. Done when every translated file is either on the list or known not to carry the mechanic.
3. **Branch.** `git switch -c retranslate/<rule-slug>` from the base.
4. **Re-apply the rule.** For each listed file, apply the rule as it now reads, from the counterpart's text, leaving the rest of the file as it is. Fan out as in step 5 of Sync. Overrides are hand-written: an override the rule bears on gets a ⚠️ row, never an edit.
5. **Run the checks** of Sync step 8. The snapshot doesn't move: `git diff --stat <base> -- upstream/` must print nothing.
6. **Open the PR** as in Sync step 9, titled `Re-translate for rule <n>: <title>`, its body a row per file (port file · lines changed · Reason) and the ⚠️ override rows.

## Oversight

You run in the maintainer's session, beside the workflow, not inside it. The workflow settles every call on its own, so your first job is to keep the calls it shouldn't make away from it: those are settled with the maintainer before the run starts. You report and recommend; the maintainer decides, and merges.

1. **Check there is work.** Run `bun scripts/sync-changes.ts > <scratch>/changes.md`. "Nothing to sync" ends the run: say so. When a PR from a `sync/` branch is already open (`gh pr list --state open --json number,headRefName,url`), review it from step 5 instead of starting another run.
2. **Preflight: settle what the run shouldn't.** Read the table, upstream's change (`bun scripts/upstream-diff.ts <commit> > <scratch>/upstream.diff`, with the commit from the table's first line) and its intent, read as in Sync step 3. Flag every change the run would have to decide alone:
   - a mechanic no rule in `docs/conversion-rules.md` converts, such as a tool, setting, model option or runtime feature that Claude Code lacks or spells differently;
   - a change to an override, to a file in an override's `depends_on`, or to `skills/poteto-mode/SKILL.md`;
   - a new skill, playbook or agent that leans on a Cursor-only feature;
   - a change to what an agent may do on its own: merge, push, delete, land or spend.

   For each flag, bring the maintainer upstream's change and intent, the Claude Code options, and your recommendation, then wait for their call. Land the decisions before the run, in their own PR: new or changed rules in `docs/conversion-rules.md`, override edits, `port.json` entries. Start the run only once that PR is merged, so the sync applies it. With nothing flagged, say so and go on.
3. **Start and watch the run.** `gh workflow run sync-upstream.yml --ref <base>`, then take its id from `gh run list --workflow sync-upstream.yml --limit 1 --json databaseId,status,url` and wait on `gh run watch <id> --exit-status` in the background. A run takes about 15 to 20 minutes.
4. **Read the run, whatever its colour.** Save `gh run view <id> --log > <scratch>/run.log`, which holds the full transcript. Search it for permission denials (`"subtype": "permission_denied"`) and for the workarounds the model found around them, such as `bun run scripts/x.ts` in place of a denied `bun scripts/x.ts`. A denial means the workflow's `--allowedTools` misses a command the skill needs: fix the pattern in its own PR. A path prefix takes a bare trailing `*`, since `:*` needs a space after the prefix. A failed "Check the sync PR" step means no PR was opened: report the transcript's last turns and stop.
5. **Start CI on the PR.** The workflow opens its PR with `GITHUB_TOKEN`, which starts no other workflow, so CI hasn't run. `gh pr close <n> && gh pr reopen <n>`, then `gh pr checks <n> --watch`.
6. **Review every ⚠️ row** of the PR body. For each one, read upstream's change (`git diff origin/<base>...origin/<branch> -- upstream/<path>`, since the PR advances the snapshot), its intent, read as in Sync step 3, and the port file on the PR branch, then give a verdict: sound, or what is wrong and the fix. Look hardest at overrides, at new conversion rules, and at any change that lets an agent merge, push, delete or land. Spot-check a few translated rows without ⚠️ against `docs/conversion-rules.md` too.
7. **Run the CI steps locally** on the PR branch, as `.github/workflows/ci.yml` runs them, and record each exit code.
8. **Report** to the maintainer: the PR link, the run's turns and cost when the log shows them, every denial and workaround, each ⚠️ row's verdict, the CI results from steps 5 and 7, and the fixes you recommend, each as a commit on the PR branch or a PR of its own. Push a fix only when the maintainer says so. Never merge.
