// What upstream changed since the snapshot, file by file, and what a sync
// does with each change given port.json: the per-change rules of a sync.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { counterpart, covers, entryFor, portPath, type PortEntry, type PortRecord } from "./port.ts";
import { git, snapshotTree, type UpstreamClone } from "./upstream.ts";

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

/** One upstream file changed since the snapshot; paths are relative to upstream's root. */
export type UpstreamChange = {
  status: ChangeStatus;
  path: string;
  /** Renamed only: the path it had in the snapshot. */
  from?: string;
  /** Renamed only: whether its content changed too. */
  edited?: boolean;
};

const statuses: Record<string, ChangeStatus> = { A: "added", M: "modified", T: "modified", D: "deleted", R: "renamed" };

/** Every file under `paths` that differs between the snapshot under `root` and `clone`, renames detected. */
export function upstreamChanges(clone: UpstreamClone, root: string, paths: string[]): UpstreamChange[] {
  const tree = snapshotTree(clone, root, paths);
  const fields = git(clone.dir, ["diff", "--name-status", "-M", "-z", tree, clone.commit, "--", ...paths]).split("\0");
  const changes: UpstreamChange[] = [];
  for (let i = 0; i < fields.length - 1; ) {
    const code = fields[i++]!;
    const status = statuses[code[0]!];
    if (!status) throw new Error(`unexpected git diff status ${code}`);
    if (status === "renamed") {
      changes.push({ status, from: fields[i++]!, path: fields[i++]!, edited: code !== "R100" });
    } else {
      changes.push({ status, path: fields[i++]! });
    }
  }
  return changes;
}

/** One row of a sync's per-change table: a change and what to do to one port file. */
export type SyncRow = {
  /** Upstream path, relative to upstream's root (a rename's new path). */
  upstream: string;
  change: string;
  /** The port file, or `old → new` for a rename. */
  port: string;
  kind: string;
  action: string;
  /** Set when the change only needs listing: the dropped entry it falls under. */
  listedUnder?: string;
};

const reconsider = "edit the override: absorbed, partly absorbed or ignored";

/** A path relative to upstream's root (`x`) as a snapshot path (`upstream/x`), and back. */
const toSnapshot = (upstreamPath: string) => `upstream/${upstreamPath}`;
const fromSnapshot = (snapshotPath: string) => snapshotPath.slice("upstream/".length);

/** Where a snapshot path lands in the port, and the port.json entry that governs it. */
function portTarget(record: PortRecord, snapshotPath: string): { port: string; entry?: PortEntry } {
  for (const entry of record.entries) {
    const source = entry.sources?.find((s) => covers(s, snapshotPath));
    if (source) return { port: entry.path + snapshotPath.slice(source.length), entry };
  }
  const port = portPath(fromSnapshot(snapshotPath));
  return { port, entry: entryFor(record, port) };
}

/** Whether upstream's file sits where the port keeps a file of its own: a port-only or vendored path. */
function collision(entry: PortEntry | undefined, snapshotPath: string): boolean {
  if (entry?.kind === "port-only") return true;
  return entry?.sources !== undefined && !entry.sources.some((s) => covers(s, snapshotPath));
}

/** "a translated", "an override": a kind with its article. */
const aKind = (kind: string) => `${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}`;

/**
 * The rows a sync acts on for `changes`. `root` is the port checkout; `cloneDir`
 * holds upstream after the changes, to tell whether a deletion emptied an entry.
 */
export function syncRows(record: PortRecord, changes: UpstreamChange[], root: string, cloneDir: string): SyncRow[] {
  const goneUpstream = (entry: PortEntry) =>
    (entry.sources ?? [counterpart(entry.path)]).every((s) => !existsSync(join(cloneDir, fromSnapshot(s))));
  const rows: SyncRow[] = [];

  for (const change of changes) {
    const snapshotPath = toSnapshot(change.path);
    const own = portTarget(record, snapshotPath);
    const changeText = change.status === "renamed" ? `renamed from ${change.from}` : change.status;
    const add = (row: Omit<SyncRow, "upstream" | "change">) => rows.push({ upstream: change.path, change: changeText, ...row });

    if (change.status === "renamed") {
      add(renamedRow(change, portTarget(record, toSnapshot(change.from!)), own, root));
    } else {
      add(changedRow(change.status, snapshotPath, own, root, goneUpstream));
    }

    const touched = [snapshotPath, ...(change.from ? [toSnapshot(change.from)] : [])];
    const follow =
      change.status === "deleted" ? "; drop the path from depends_on" : change.status === "renamed" ? "; repoint depends_on" : "";
    for (const entry of record.entries) {
      if (entry.path === own.entry?.path || !entry.depends_on?.some((d) => touched.some((t) => covers(d, t)))) continue;
      add({ port: entry.path, kind: "override (depends_on)", action: reconsider + follow });
    }
  }

  return rows.sort((a, b) => a.port.localeCompare(b.port) || a.upstream.localeCompare(b.upstream));
}

type Target = ReturnType<typeof portTarget>;
type RowBody = Omit<SyncRow, "upstream" | "change">;

/** The row for an upstream file added, modified or deleted in place. */
function changedRow(
  status: Exclude<ChangeStatus, "renamed">,
  snapshotPath: string,
  own: Target,
  root: string,
  goneUpstream: (entry: PortEntry) => boolean,
): RowBody {
  const { port, entry } = own;
  const kind = entry?.kind ?? "translated";
  if (collision(entry, snapshotPath)) {
    const what = kind === "port-only" ? "port-only" : "vendored";
    return { port, kind, action: `⚠️ upstream ${status} a file at a ${what} path: decide which one keeps it` };
  }
  if (kind === "translated") {
    const actions = {
      added: "translate at its path, or propose it as override or dropped",
      modified: existsSync(join(root, port)) ? "patch forward" : "translate (not yet ported)",
      deleted: `delete the port file${entry && goneUpstream(entry) ? "; remove its entry" : ""}`,
    };
    return { port, kind, action: actions[status] };
  }
  if (kind === "override") {
    return { port, kind, action: status === "deleted" ? "propose deleting the override, or keep it as port-only" : reconsider };
  }
  if (status === "deleted" && goneUpstream(entry!)) return { port, kind, action: `remove the dropped entry ${entry!.path}` };
  return { port, kind, action: "list only", listedUnder: entry!.path };
}

/** The row for a renamed upstream file: its port file, or its entry, moves with it. */
function renamedRow(change: UpstreamChange, old: Target, own: Target, root: string): RowBody {
  const port = `${old.port} → ${own.port}`;
  const kind = old.entry?.kind ?? "translated";
  // An entry naming exactly the old file moves with it, so the new path takes its kind.
  const movesWithIt = old.entry?.path === old.port && own.entry === undefined;
  const newKind = movesWithIt ? kind : (own.entry?.kind ?? "translated");
  if (own.entry !== old.entry && !movesWithIt && newKind !== kind) {
    return { port, kind, action: `⚠️ renamed from ${aKind(kind)} path to ${aKind(newKind)} path: decide its kind` };
  }
  if (kind === "translated") {
    if (!existsSync(join(root, old.port))) return { port, kind, action: "translate at its new path (not yet ported)" };
    const moved = movesWithIt ? "move the port file and its entry" : "move the port file";
    return { port, kind, action: `${moved}${change.edited ? ", then patch forward" : ""}` };
  }
  if (kind === "override") return { port, kind, action: `move the override and its entry, then ${reconsider}` };
  if (kind === "dropped" && movesWithIt) return { port, kind, action: "move the dropped entry" };
  if (kind === "dropped") return { port, kind, action: "list only", listedUnder: old.entry!.path };
  return { port, kind, action: `⚠️ upstream renamed a file at ${aKind(kind)} path: decide which one keeps it` };
}
