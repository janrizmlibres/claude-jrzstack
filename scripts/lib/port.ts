// `port.json`, the record of every port file that is not a plain translation
// at its counterpart's path, shared by the port.json and Cursor-ism checks.
//
// A port file is a file under `jrzstack/`; its counterpart is the snapshot file
// at the same path under `upstream/` once the port's names are mapped back to
// upstream's (`jrzstack/skills/savvy-mode/x` ↔ `upstream/pstack/skills/poteto-mode/x`).
// A port file port.json doesn't list is a translated file of its counterpart.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { git, UsageError } from "./upstream.ts";

export const kinds = ["translated", "override", "port-only", "dropped"] as const;
export type Kind = (typeof kinds)[number];

/**
 * One entry of port.json. Paths are relative to the repo root; an entry's
 * `path` may name a directory, and then covers every file under it.
 */
export type PortEntry = {
  /** The port path, under `jrzstack/`. A dropped entry names where the file would be. */
  path: string;
  /**
   * `translated`: made by the conversion rules, listed only for a path
   * exception (`sources`) or to record a deviation (`why`).
   * `override`: hand-written in place of translating; a sync never re-translates it.
   * `port-only`: no upstream counterpart.
   * `dropped`: an upstream file the port leaves out.
   */
  kind: Kind;
  /** One line: why this file isn't a plain translation at its counterpart's path. */
  why: string;
  /**
   * Translated and override only: the snapshot paths (under `upstream/`) it is
   * made from, when not its counterpart. A directory source maps file by file
   * onto a directory entry.
   */
  sources?: string[];
  /** Override only: snapshot paths whose change flags it for reconsideration. */
  depends_on?: string[];
};

export type PortRecord = { entries: PortEntry[] };

export const portFile = (root: string) => join(root, "port.json");

/** Each name upstream uses in a path, and the port's name for it (rule 25). */
const names = [
  ["pstack", "jrzstack"],
  ["poteto", "savvy"],
] as const;

const rename = (path: string, from: 0 | 1) =>
  names.reduce((p, pair) => p.replace(new RegExp(`(?<![A-Za-z])${pair[from]}\\b`, "g"), pair[1 - from]!), path);

/** Where an upstream path (relative to upstream's root) lands in the port. */
export const portPath = (upstreamPath: string) => rename(upstreamPath, 0);

/** The snapshot path a port path is the counterpart of. */
export const counterpart = (path: string) => `upstream/${rename(path, 1)}`;

/** Whether `file` is `path` or lies under it. */
export const covers = (path: string, file: string) => file === path || file.startsWith(`${path}/`);

const fields = new Set(["path", "kind", "why", "sources", "depends_on"]);

/** Read and validate port.json; a malformed record throws a UsageError naming the entry. */
export function readPortRecord(root: string): PortRecord {
  const file = portFile(root);
  if (!existsSync(file)) throw new UsageError(`no port.json (looked in ${root})`);
  let record: unknown;
  try {
    record = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new UsageError(`port.json is not valid JSON: ${(error as Error).message}`);
  }
  const entries = (record as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) throw new UsageError("port.json has no `entries` array");

  const seen = new Set<string>();
  for (const [index, entry] of (entries as Record<string, unknown>[]).entries()) {
    const fail = (message: string): never => {
      throw new UsageError(`port.json entry ${index} (${String(entry.path)}): ${message}`);
    };
    for (const key of Object.keys(entry)) if (!fields.has(key)) fail(`unknown field \`${key}\``);
    if (!isPath(entry.path, "jrzstack/")) fail("`path` must be a path under jrzstack/");
    if (!kinds.includes(entry.kind as Kind)) fail(`\`kind\` must be one of ${kinds.join(", ")}`);
    if (typeof entry.why !== "string" || entry.why.trim() === "") fail("`why` must say why");
    for (const key of ["sources", "depends_on"] as const) {
      if (entry[key] === undefined) continue;
      const allowed = key === "sources" ? ["translated", "override"] : ["override"];
      if (!allowed.includes(entry.kind as string)) fail(`\`${key}\` is only for ${allowed.join(" and ")} entries`);
      const paths = entry[key];
      if (!Array.isArray(paths) || paths.length === 0 || !paths.every((p) => isPath(p, "upstream/"))) {
        fail(`\`${key}\` must be a non-empty list of paths under upstream/`);
      }
    }
    if (seen.has(entry.path as string)) fail("listed twice");
    seen.add(entry.path as string);
  }
  return { entries: entries as PortEntry[] };
}

/** A normalised relative path under `prefix`: no `.` or `..` segments, no trailing slash. */
function isPath(value: unknown, prefix: string): value is string {
  if (typeof value !== "string" || !value.startsWith(prefix)) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** The most specific entry covering `file`, if any. */
export function entryFor(record: PortRecord, file: string): PortEntry | undefined {
  return record.entries
    .filter((entry) => covers(entry.path, file))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

/** Port files under `jrzstack/` that git tracks or would track, sorted. */
export function portFiles(root: string): string[] {
  return git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "--deduplicate", "-z", "--", "jrzstack"])
    .split("\0")
    .filter((file) => file !== "" && existsSync(join(root, file)))
    .sort();
}

/** Port files the conversion rules produce: every port file but overrides, port-only and dropped ones. */
export function translatedFiles(root: string, record: PortRecord): string[] {
  return portFiles(root).filter((file) => (entryFor(record, file)?.kind ?? "translated") === "translated");
}
