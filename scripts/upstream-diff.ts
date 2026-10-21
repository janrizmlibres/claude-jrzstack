#!/usr/bin/env bun
// upstream-diff [ref] [--out <file>]  what upstream changed at <ref> (default main) since the snapshot
// upstream-diff --verify fail when upstream/ differs from the commit snapshot.json records
//
// Run from the repo root. Sparse-clones upstream's snapshot paths at the ref
// and diffs the snapshot under upstream/ against them, renames detected.
// --out writes the report to <file> instead of stdout.
// Exit 0 when the diff ran (and, with --verify, nothing differs), 1 when
// --verify found a difference, 2 on a usage or git failure.
import { parseArgs } from "node:util";
import {
  gitRun,
  outputTo,
  readRecord,
  readVersion,
  runCommand,
  snapshotTree,
  strayFiles,
  UsageError,
  withUpstreamClone,
} from "./lib/upstream.ts";

function main(): number {
  const { values, positionals: refs } = parseArgs({
    options: { verify: { type: "boolean" }, out: { type: "string" } },
    allowPositionals: true,
  });
  const verify = values.verify ?? false;
  if (refs.length > (verify ? 0 : 1)) throw new UsageError("usage: upstream-diff [ref] [--out <file>] | upstream-diff --verify");
  const write = outputTo(values.out);

  const root = process.cwd();
  const record = readRecord(root);
  const ref = verify ? record.commit : (refs[0] ?? "main");

  return withUpstreamClone(record.repo, ref, record.paths, (clone) => {
    const tree = snapshotTree(clone, root, record.paths);
    const diff = gitRun(clone.dir, ["diff", "--patch-with-stat", "-M", "--exit-code", tree, clone.commit, "--", ...record.paths]);
    if (diff.code > 1) throw new UsageError(`git diff failed:\n${diff.stderr.trim()}`);
    const changed = diff.code === 1;
    const target = `${record.repo}@${clone.commit}`;

    if (verify) {
      const problems: string[] = [];
      const version = readVersion(clone.dir, ref);
      if (record.version !== version) {
        problems.push(`snapshot.json records version ${record.version}, but ${target} is ${version}.`);
      }
      const strays = strayFiles(root, record.paths);
      if (strays.length > 0) {
        problems.push(`Files outside the recorded paths:\n${strays.map((f) => `  upstream/${f}`).join("\n")}`);
      }
      if (changed) {
        problems.push(`upstream/ differs from ${target}, the commit snapshot.json records:\n\n${diff.stdout}`);
      }
      if (problems.length === 0) {
        write(`upstream/ matches ${target}.\n`);
        return 0;
      }
      write(`The snapshot was edited by hand.\n\n${problems.join("\n\n")}\n`);
      return 1;
    }

    if (!changed) {
      write(`No upstream changes under the snapshot paths: ${record.commit} → ${target} (${ref}).\n`);
      return 0;
    }
    write(`Upstream changes since the snapshot: ${record.commit} → ${target} (${ref}).\n\n`);
    write(diff.stdout);
    return 0;
  });
}

runCommand("upstream-diff", main);
