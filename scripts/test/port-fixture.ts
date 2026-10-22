// A port checkout in a temp git repo: `upstream/` standing in for the
// snapshot, `jrzstack/` for the port, plus `port.json` and the conversion rules
// document, shared by the port.json and Cursor-ism check tests.
import { git, tempDir, writeFiles, type Files } from "./harness.ts";

export type PortEntry = {
  path: string;
  kind: string;
  why: string;
  sources?: string[];
  depends_on?: string[];
};

/** A git repo holding `files` and, when given, a `port.json` of `entries`. */
export function portRepo(files: Files, entries?: PortEntry[]): string {
  const root = tempDir("jrzstack-port-");
  git(root, "init", "-q");
  writeFiles(root, files);
  if (entries) writeFiles(root, { "port.json": JSON.stringify({ entries }, null, 2) + "\n" });
  return root;
}
