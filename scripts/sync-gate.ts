#!/usr/bin/env bun
// sync-gate [ref]  decide, without a model, whether a sync run goes ahead
//
// Run from the repo root by the sync workflow, with `gh` authenticated for
// this repo. Sparse-clones upstream at <ref> (default main) and compares it
// with the snapshot under upstream/, under the snapshot paths only:
// - upstream matches the snapshot: nothing to do, and GitHub isn't asked;
// - a sync PR (head `sync/…`) is open: no second sync; if upstream has moved
//   past that PR's own snapshot, say so on it once per upstream commit;
// - otherwise: sync.
// Writes `sync=true|false` to $GITHUB_OUTPUT, plus `version` and `commit` of
// upstream when it is true, and says what it decided on stdout.
// Exit 0 when it decided, 2 on a usage, git or gh failure.
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  git,
  gitRun,
  readRecord,
  readVersion,
  runCommand,
  snapshotTree,
  UsageError,
  withUpstreamClone,
  type SnapshotRecord,
  type UpstreamClone,
} from "./lib/upstream.ts";

type Pr = { number: number; headRefName: string; url: string };

function main(): number {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (positionals.length > 1) throw new UsageError("usage: sync-gate [ref]");
  const ref = positionals[0] ?? "main";

  const root = process.cwd();
  const snapshot = readRecord(root);

  return withUpstreamClone(snapshot.repo, ref, snapshot.paths, (clone) => {
    const target = `${snapshot.repo}@${clone.commit}`;
    if (!differs(clone, snapshotTree(clone, root, snapshot.paths), snapshot.paths)) {
      console.log(`Upstream matches the snapshot: ${target} (${ref}) has nothing new under the snapshot paths.`);
      output({ sync: "false" });
      return 0;
    }

    const version = readVersion(clone.dir, ref);
    const open = (JSON.parse(gh(["pr", "list", "--state", "open", "--json", "number,headRefName,url", "--limit", "100"])) as Pr[])
      .filter((pr) => pr.headRefName.startsWith("sync/"));
    if (open.length === 0) {
      console.log(`Upstream has moved to pstack ${version} (${target}). Starting a sync.`);
      output({ sync: "true", version, commit: clone.commit });
      return 0;
    }

    for (const pr of open) commentOnSyncPr(pr, clone, snapshot, version);
    output({ sync: "false" });
    return 0;
  });
}

/** Say on an open sync PR that upstream has moved past its snapshot, once per upstream commit. */
function commentOnSyncPr(pr: Pr, clone: UpstreamClone, snapshot: SnapshotRecord, version: string): void {
  const record = JSON.parse(
    gh([
      "api",
      `repos/{owner}/{repo}/contents/upstream/snapshot.json?ref=${encodeURIComponent(pr.headRefName)}`,
      "-H",
      "Accept: application/vnd.github.raw+json",
    ]),
  ) as SnapshotRecord;
  git(clone.dir, ["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", record.commit]);
  if (!differs(clone, record.commit, snapshot.paths)) {
    console.log(`Sync PR #${pr.number} already brings the port to upstream's current state. Not starting another sync.`);
    return;
  }

  const comments = JSON.parse(gh(["pr", "view", String(pr.number), "--json", "comments"])) as { comments: { body: string }[] };
  if (comments.comments.some((comment) => comment.body.includes(clone.commit))) {
    console.log(`Sync PR #${pr.number} already says upstream moved on to ${clone.commit}. Not starting another sync.`);
    return;
  }
  const repo = snapshot.repo.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  const body =
    `Upstream has moved on to v${version} (${repo}@${clone.commit}) since this PR's snapshot. ` +
    "A sync won't open another sync PR while this one is open; after it merges, the next run syncs the rest.";
  gh(["pr", "comment", String(pr.number), "--body", body]);
  console.log(`Upstream has moved past sync PR #${pr.number}: said so on ${pr.url}. Not starting another sync.`);
}

/** Whether upstream's checkout differs from `base` (a tree or commit) under `paths`. */
function differs(clone: UpstreamClone, base: string, paths: string[]): boolean {
  const diff = gitRun(clone.dir, ["diff", "--quiet", base, clone.commit, "--", ...paths]);
  if (diff.code > 1) throw new UsageError(`git diff failed:\n${diff.stderr.trim()}`);
  return diff.code === 1;
}

function gh(args: string[]): string {
  const proc = Bun.spawnSync({ cmd: ["gh", ...args], stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new UsageError(`gh ${args.slice(0, 2).join(" ")} failed:\n${proc.stderr.toString().trim()}`);
  return proc.stdout.toString();
}

/** Append `key=value` lines to $GITHUB_OUTPUT, when the workflow set it. */
function output(values: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  appendFileSync(file, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(""));
}

runCommand("sync-gate", main);
