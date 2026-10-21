#!/usr/bin/env bun
// sync-changes [ref] [--out <file>]  what a sync to upstream's <ref> (default main) does, change by change
//
// Run from the repo root, before the snapshot advances. Sparse-clones
// upstream at the ref, diffs it against the snapshot under upstream/ with
// renames detected, and prints the sync PR's per-change table: one row per
// upstream change and port file it reaches, with the kind port.json gives
// that file and the action the sync rules give the change. The Reason column
// is left for the sync to fill. Changes to dropped files are listed only,
// collapsed below the table. --out writes the table to <file> instead of stdout.
// Exit 0 when it ran (nothing to sync included), 2 on a malformed port.json,
// a usage or a git failure.
import { parseArgs } from "node:util";
import { syncRows, upstreamChanges, type SyncRow } from "./lib/changes.ts";
import { readPortRecord } from "./lib/port.ts";
import { outputTo, readRecord, readVersion, runCommand, UsageError, withUpstreamClone } from "./lib/upstream.ts";

function main(): number {
  const { values, positionals } = parseArgs({ options: { out: { type: "string" } }, allowPositionals: true });
  if (positionals.length > 1) throw new UsageError("usage: sync-changes [ref] [--out <file>]");
  const ref = positionals[0] ?? "main";
  const write = outputTo(values.out);

  const root = process.cwd();
  const snapshot = readRecord(root);
  const port = readPortRecord(root);

  return withUpstreamClone(snapshot.repo, ref, snapshot.paths, (clone) => {
    const changes = upstreamChanges(clone, root, snapshot.paths);
    const target = `${snapshot.repo}@${clone.commit}`;
    if (changes.length === 0) {
      write(`Nothing to sync: ${target} (${ref}) matches the snapshot at ${snapshot.commit}.\n`);
      return 0;
    }

    const version = readVersion(clone.dir, ref);
    const rows = syncRows(port, changes, root, clone.dir);
    const acted = rows.filter((row) => row.listedUnder === undefined);
    const listed = rows.filter((row) => row.listedUnder !== undefined);

    write(
      `Upstream ${target} (pstack ${version}), since the snapshot at ${snapshot.commit} (pstack ${snapshot.version}): ` +
        `${changes.length} upstream change${changes.length === 1 ? "" : "s"}.\n\n`,
    );
    write("| Upstream path | Change | Port file | Kind | Action | Reason |\n");
    write("|---|---|---|---|---|---|\n");
    for (const row of acted) write(`| ${row.upstream} | ${row.change} | ${row.port} | ${row.kind} | ${row.action} |  |\n`);
    if (listed.length > 0) write(`\n${droppedBlock(listed)}\n`);
    return 0;
  });
}

/** Changes to dropped files, listed only, collapsed into one line per dropped entry. */
function droppedBlock(rows: SyncRow[]): string {
  const byEntry = Map.groupBy(rows, (row) => row.listedUnder!);
  const lines = [...byEntry].map(
    ([entry, changed]) => `- \`${entry}\`: ${changed.map((row) => `${row.upstream} (${row.change})`).join(", ")}`,
  );
  return [
    "<details>",
    `<summary>Dropped files changed upstream (listed only): ${rows.length}</summary>`,
    "",
    ...lines,
    "",
    "</details>",
  ].join("\n");
}

runCommand("sync-changes", main);
