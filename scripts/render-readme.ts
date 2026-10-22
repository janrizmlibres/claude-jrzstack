#!/usr/bin/env bun
// render-readme          rewrite README.md's generated blocks from snapshot.json and port.json
// render-readme --check  fail when either generated block is stale
//
// Run from the repo root. README.md carries two blocks, each between a
// `<!-- BEGIN generated from <source> … -->` line and `<!-- END generated -->`:
// the tracked upstream version line from `upstream/snapshot.json`, and the
// file table of overrides, port-only and dropped files from `port.json`.
// Everything outside the blocks is hand-written and left as it is.
// Exit 0 when written (with --check: both blocks current), 1 with --check on a
// stale block, 2 on a missing marker, a malformed port.json or usage.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { counterpart, readPortRecord, type Kind, type PortEntry, type PortRecord } from "./lib/port.ts";
import { readRecord, runCommand, UsageError, type SnapshotRecord } from "./lib/upstream.ts";

const beginMarker = "<!-- BEGIN generated from ";
const endMarker = "<!-- END generated -->";

type Block = { source: string; lines: string[] };

function main(): number {
  const { values, positionals } = parseArgs({ options: { check: { type: "boolean" } }, allowPositionals: true });
  if (positionals.length > 0) throw new UsageError("usage: render-readme [--check]");

  const root = process.cwd();
  const file = join(root, "README.md");
  if (!existsSync(file)) throw new UsageError(`no README.md (looked in ${root})`);
  const blocks: Block[] = [
    { source: "upstream/snapshot.json", lines: versionLine(readRecord(root)) },
    { source: "port.json", lines: fileTable(root, readPortRecord(root)) },
  ];

  const current = readFileSync(file, "utf8");
  let rendered = current;
  const stale: string[] = [];
  for (const block of blocks) {
    const next = replaceBlock(rendered, block);
    if (next !== rendered) stale.push(block.source);
    rendered = next;
  }

  if (!values.check) {
    if (rendered !== current) writeFileSync(file, rendered);
    const done = stale.length === 0 ? "already current" : `rewrote the blocks from ${stale.join(" and ")}`;
    console.log(`README.md: ${done}.`);
    return 0;
  }
  if (stale.length === 0) {
    console.log("README.md: both generated blocks are current.");
    return 0;
  }
  for (const source of stale) console.log(`README.md: the block generated from ${source} is stale.`);
  console.log("\nRun `bun scripts/render-readme.ts` to rewrite it, and commit the result.");
  return 1;
}

/** `text` with the lines of `block`'s generated block replaced by its rendering. */
function replaceBlock(text: string, block: Block): string {
  const lines = text.split("\n");
  const begin = `${beginMarker}${block.source} `;
  const starts = lines.flatMap((line, index) => (line.startsWith(begin) ? [index] : []));
  if (starts.length !== 1) {
    throw new UsageError(`README.md needs exactly one \`${begin}…-->\` line, found ${starts.length}`);
  }
  const start = starts[0]!;
  const stop = lines.findIndex((line, index) => index > start && line === endMarker);
  const nextBegin = lines.findIndex((line, index) => index > start && line.startsWith(beginMarker));
  if (stop === -1 || (nextBegin !== -1 && nextBegin < stop)) {
    throw new UsageError(`README.md: the block generated from ${block.source} has no \`${endMarker}\` line`);
  }
  return [...lines.slice(0, start + 1), ...block.lines, ...lines.slice(stop)].join("\n");
}

function versionLine(record: SnapshotRecord): string[] {
  const repo = record.repo.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  return [`**Tracks upstream pstack v${record.version}** (\`${repo}@${record.commit.slice(0, 7)}\`).`];
}

const tableKinds: Kind[] = ["override", "port-only", "dropped"];

function fileTable(root: string, record: PortRecord): string[] {
  // Code-point order, so a check gives the same answer whatever the machine's locale.
  const entries = record.entries.toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const portPath = (entry: PortEntry) => {
    const directory = isDirectory(root, entry.path) || isDirectory(root, counterpart(entry.path));
    return shortPath(entry.path, "jrzstack/", directory);
  };
  const rows = tableKinds.flatMap((kind) =>
    entries
      .filter((entry) => entry.kind === kind)
      .map((entry) => `| ${portPath(entry)} | ${kind} | ${entry.why.replaceAll("|", "\\|")} |`),
  );
  const pathExceptions = entries
    .filter((entry) => entry.kind === "translated" && entry.sources)
    .map((entry) => {
      const sources = entry.sources!.map((source) => shortPath(source, "upstream/", isDirectory(root, source)));
      return `${portPath(entry)} (from ${sources.join(", ")})`;
    });
  return [
    "| File | Kind | Why |",
    "|---|---|---|",
    ...rows,
    "",
    pathExceptions.length === 0
      ? "Every other file is translated from upstream at the same path."
      : `Every other file is translated from upstream at the same path, except ${list(pathExceptions)}.`,
  ];
}

/** `path` without `prefix`, in backticks, with a trailing slash for a directory. */
function shortPath(path: string, prefix: string, directory: boolean): string {
  return `\`${path.slice(prefix.length)}${directory ? "/" : ""}\``;
}

const isDirectory = (root: string, path: string) =>
  statSync(join(root, path), { throwIfNoEntry: false })?.isDirectory() ?? false;

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  return items.length === 1 ? items[0]! : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

runCommand("render-readme", main);
