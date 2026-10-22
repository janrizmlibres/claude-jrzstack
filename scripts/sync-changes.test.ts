import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeRemote, git, runScript, writeFiles, type Files } from "./test/harness.ts";
import { portAt } from "./test/upstream-fixture.ts";

const syncChanges = (cwd: string, ...args: string[]) => runScript("sync-changes.ts", args, { cwd });

const manifest = (version: string) => JSON.stringify({ name: "pstack", version }, null, 2) + "\n";

/** Upstream's first commit: one file of every kind the port records. */
const firstFiles: Files = {
  "pstack/.cursor-plugin/plugin.json": manifest("1.2.3"),
  "pstack/README.md": "# pstack\n",
  "pstack/skills/plain/SKILL.md": "Plain skill.\n",
  "pstack/skills/plain/rubric.md": "The rubric.\n",
  "pstack/skills/gone/SKILL.md": "Soon deleted.\n",
  "pstack/skills/moved/SKILL.md": Array.from({ length: 20 }, (_, i) => `Line ${i} of moved.`).join("\n") + "\n",
  "pstack/skills/hand/SKILL.md": "Overridden skill.\n",
  "pstack/skills/hand-gone/SKILL.md": "Overridden, soon deleted.\n",
  "pstack/automations/bot/a.md": "Bot a.\n",
  "pstack/automations/bot/b.md": "Bot b.\n",
  "pstack/automations/solo/run.md": "Solo bot.\n",
  "pstack/tool.md": "A dropped tool.\n",
  "kit/skills/keep/SKILL.md": "Vendored skill.\n",
};

const entries = [
  { path: "jrzstack/.claude-plugin/plugin.json", kind: "port-only", why: "the manifest" },
  { path: "jrzstack/extra.sh", kind: "port-only", why: "a port-only script" },
  {
    path: "jrzstack/skills/hand/SKILL.md",
    kind: "override",
    why: "hand-written",
    depends_on: ["upstream/pstack/skills/plain/rubric.md"],
  },
  { path: "jrzstack/skills/hand-gone/SKILL.md", kind: "override", why: "hand-written" },
  { path: "jrzstack/automations/bot", kind: "dropped", why: "Cursor automations" },
  { path: "jrzstack/automations/solo", kind: "dropped", why: "Cursor automations" },
  { path: "jrzstack/tool.md", kind: "dropped", why: "a Cursor-only tool" },
  { path: "jrzstack/skills/keep", kind: "translated", why: "vendored", sources: ["upstream/kit/skills/keep"] },
];

/** The port of `firstFiles`: a translated file per upstream file, plus port-only ones. */
const portFiles: Files = {
  "jrzstack/.claude-plugin/plugin.json": "{}\n",
  "jrzstack/extra.sh": "echo port\n",
  "jrzstack/README.md": "# pstack for Claude Code\n",
  "jrzstack/skills/plain/SKILL.md": "Plain skill, translated.\n",
  "jrzstack/skills/plain/rubric.md": "The rubric, translated.\n",
  "jrzstack/skills/gone/SKILL.md": "Soon deleted, translated.\n",
  "jrzstack/skills/moved/SKILL.md": "Moved, translated.\n",
  "jrzstack/skills/hand/SKILL.md": "Hand-written.\n",
  "jrzstack/skills/hand-gone/SKILL.md": "Hand-written too.\n",
  "jrzstack/skills/keep/SKILL.md": "Vendored skill, translated.\n",
};

/** A port checkout of upstream's first commit, with `port.json` and the port files. */
function fixture() {
  const upstream = new FakeRemote();
  const first = upstream.commit({ write: firstFiles });
  const port = portAt(upstream, first, firstFiles);
  git(port, "init", "-q");
  writeFiles(port, { ...portFiles, "port.json": JSON.stringify({ entries }, null, 2) + "\n" });
  return { upstream, first, port };
}

/** Upstream moves on with a change of every kind. */
function movedOn() {
  const f = fixture();
  const second = f.upstream.commit({
    write: {
      "pstack/.cursor-plugin/plugin.json": manifest("1.3.0"),
      "pstack/README.md": "# pstack\n\nNow faster.\n",
      "pstack/skills/plain/rubric.md": "The rubric, sharper.\n",
      "pstack/skills/hand/SKILL.md": "Overridden skill, changed.\n",
      "pstack/skills/new/SKILL.md": "A new skill.\n",
      "pstack/automations/bot/a.md": "Bot a, changed.\n",
      "pstack/extra.sh": "echo upstream\n",
      "kit/skills/keep/SKILL.md": "Vendored skill, changed.\n",
    },
    remove: ["pstack/skills/gone", "pstack/skills/hand-gone", "pstack/automations/bot/b.md", "pstack/automations/solo"],
    rename: { "pstack/skills/moved/SKILL.md": "pstack/skills/moved-to/SKILL.md" },
  });
  return { ...f, second };
}

const row = (...cells: string[]) => `| ${cells.join(" | ")} |`;

describe("sync-changes", () => {
  test("says there is nothing to sync when upstream matches the snapshot", () => {
    const { port } = fixture();

    const result = syncChanges(port);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Nothing to sync");
  });

  test("names upstream's commit and version against the snapshot's", () => {
    const { port, first, second } = movedOn();

    const result = syncChanges(port);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(second);
    expect(result.stdout).toContain("1.3.0");
    expect(result.stdout).toContain(first);
    expect(result.stdout).toContain("1.2.3");
  });

  test("patches a translated file forward, the vendored ones through their sources", () => {
    const { port } = movedOn();

    const { stdout } = syncChanges(port);

    expect(stdout).toContain(row("pstack/README.md", "modified", "jrzstack/README.md", "translated", "patch forward"));
    expect(stdout).toContain(
      row("kit/skills/keep/SKILL.md", "modified", "jrzstack/skills/keep/SKILL.md", "translated", "patch forward"),
    );
  });

  test("maps upstream's names to the port's", () => {
    const { upstream, port } = fixture();
    upstream.commit({ write: { "pstack/skills/poteto-mode/SKILL.md": "The mode.\n" } });

    const { stdout } = syncChanges(port);

    expect(stdout).toContain(
      row(
        "pstack/skills/poteto-mode/SKILL.md",
        "added",
        "jrzstack/skills/savvy-mode/SKILL.md",
        "translated",
        "translate at its path, or propose it as override or dropped",
      ),
    );
  });

  test("translates a changed file the port hasn't ported yet", () => {
    const { port } = movedOn();

    const { stdout } = syncChanges(port);

    expect(stdout).toContain(
      row(
        "pstack/.cursor-plugin/plugin.json",
        "modified",
        "jrzstack/.cursor-plugin/plugin.json",
        "translated",
        "translate (not yet ported)",
      ),
    );
  });

  test("has an override edited for its own counterpart and reconsidered for what it depends on", () => {
    const { port } = movedOn();

    const { stdout } = syncChanges(port);

    expect(stdout).toContain(
      row(
        "pstack/skills/hand/SKILL.md",
        "modified",
        "jrzstack/skills/hand/SKILL.md",
        "override",
        "edit the override: absorbed, partly absorbed or ignored",
      ),
    );
    expect(stdout).toContain(
      row("pstack/skills/plain/rubric.md", "modified", "jrzstack/skills/plain/rubric.md", "translated", "patch forward"),
    );
    expect(stdout).toContain(
      row(
        "pstack/skills/plain/rubric.md",
        "modified",
        "jrzstack/skills/hand/SKILL.md",
        "override (depends_on)",
        "edit the override: absorbed, partly absorbed or ignored",
      ),
    );
  });

  test("translates a new file at its path by default", () => {
    const { port } = movedOn();

    const { stdout } = syncChanges(port);

    expect(stdout).toContain(
      row(
        "pstack/skills/new/SKILL.md",
        "added",
        "jrzstack/skills/new/SKILL.md",
        "translated",
        "translate at its path, or propose it as override or dropped",
      ),
    );
  });

  test("deletes a translated file, and proposes deleting an override or keeping it as port-only", () => {
    const { port } = movedOn();

    const { stdout } = syncChanges(port);

    expect(stdout).toContain(
      row("pstack/skills/gone/SKILL.md", "deleted", "jrzstack/skills/gone/SKILL.md", "translated", "delete the port file"),
    );
    expect(stdout).toContain(
      row(
        "pstack/skills/hand-gone/SKILL.md",
        "deleted",
        "jrzstack/skills/hand-gone/SKILL.md",
        "override",
        "propose deleting the override, or keep it as port-only",
      ),
    );
  });

  test("moves the port file of a renamed upstream file", () => {
    const { port } = movedOn();

    const { stdout } = syncChanges(port);

    expect(stdout).toContain(
      row(
        "pstack/skills/moved-to/SKILL.md",
        "renamed from pstack/skills/moved/SKILL.md",
        "jrzstack/skills/moved/SKILL.md → jrzstack/skills/moved-to/SKILL.md",
        "translated",
        "move the port file",
      ),
    );
  });

  test("moves and patches forward a file renamed with edits", () => {
    const { upstream, port } = fixture();
    const moved = firstFiles["pstack/skills/moved/SKILL.md"] as string;
    upstream.commit({ rename: { "pstack/skills/moved/SKILL.md": "pstack/skills/moved-to/SKILL.md" } });
    upstream.commit({ write: { "pstack/skills/moved-to/SKILL.md": moved + "One more line.\n" } });

    const { stdout } = syncChanges(port);

    expect(stdout).toContain(
      row(
        "pstack/skills/moved-to/SKILL.md",
        "renamed from pstack/skills/moved/SKILL.md",
        "jrzstack/skills/moved/SKILL.md → jrzstack/skills/moved-to/SKILL.md",
        "translated",
        "move the port file, then patch forward",
      ),
    );
  });

  test("moves an override and its entry when its counterpart is renamed", () => {
    const { upstream, port } = fixture();
    upstream.commit({ rename: { "pstack/skills/hand-gone/SKILL.md": "pstack/skills/hand-moved/SKILL.md" } });

    const { stdout } = syncChanges(port);

    expect(stdout).toContain(
      row(
        "pstack/skills/hand-moved/SKILL.md",
        "renamed from pstack/skills/hand-gone/SKILL.md",
        "jrzstack/skills/hand-gone/SKILL.md → jrzstack/skills/hand-moved/SKILL.md",
        "override",
        "move the override and its entry, then edit the override: absorbed, partly absorbed or ignored",
      ),
    );
  });

  test("moves a dropped file's entry when upstream renames it", () => {
    const { upstream, port } = fixture();
    upstream.commit({ rename: { "pstack/tool.md": "pstack/tools/tool.md" } });

    const { stdout } = syncChanges(port);

    expect(stdout).toContain(
      row("pstack/tools/tool.md", "renamed from pstack/tool.md", "jrzstack/tool.md → jrzstack/tools/tool.md", "dropped", "move the dropped entry"),
    );
  });

  test("asks for a call when a rename crosses into a path of another kind", () => {
    const { upstream, port } = fixture();
    upstream.commit({ rename: { "pstack/skills/plain/SKILL.md": "pstack/automations/bot/plain.md" } });

    const { stdout } = syncChanges(port);

    expect(stdout).toContain(
      row(
        "pstack/automations/bot/plain.md",
        "renamed from pstack/skills/plain/SKILL.md",
        "jrzstack/skills/plain/SKILL.md → jrzstack/automations/bot/plain.md",
        "translated",
        "⚠️ renamed from a translated path to a dropped path: decide its kind",
      ),
    );
  });

  test("flags an upstream file that lands on a port-only path", () => {
    const { port } = movedOn();

    const { stdout } = syncChanges(port);

    expect(stdout).toContain(
      row(
        "pstack/extra.sh",
        "added",
        "jrzstack/extra.sh",
        "port-only",
        "⚠️ upstream added a file at a port-only path: decide which one keeps it",
      ),
    );
  });

  test("lists dropped-file changes only, collapsed out of the table, and removes a dropped entry left empty", () => {
    const { port } = movedOn();

    const { stdout } = syncChanges(port);
    const [table, dropped] = stdout.split("<details>");

    expect(table).not.toContain("pstack/automations/bot/a.md");
    expect(table).not.toContain("pstack/automations/bot/b.md");
    expect(dropped).toContain("pstack/automations/bot/a.md");
    expect(dropped).toContain("pstack/automations/bot/b.md");
    expect(table).toContain(
      row(
        "pstack/automations/solo/run.md",
        "deleted",
        "jrzstack/automations/solo/run.md",
        "dropped",
        "remove the dropped entry jrzstack/automations/solo",
      ),
    );
  });

  test("diffs against a named ref", () => {
    const { upstream, port } = fixture();
    git(upstream.dir, "checkout", "-q", "-b", "next");
    upstream.commit({ write: { "pstack/README.md": "# pstack next\n" } });
    git(upstream.dir, "checkout", "-q", "main");

    expect(syncChanges(port).stdout).toContain("Nothing to sync");
    expect(syncChanges(port, "next").stdout).toContain(
      row("pstack/README.md", "modified", "jrzstack/README.md", "translated", "patch forward"),
    );
  });

  test("writes the table to --out instead of stdout, creating its directory", () => {
    const { port, second } = movedOn();

    const result = syncChanges(port, "--out", ".sync-upstream/changes.md");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    const written = readFileSync(join(port, ".sync-upstream/changes.md"), "utf8");
    expect(written).toContain(second);
    expect(written).toContain("| Upstream path | Change | Port file | Kind | Action | Reason |");
  });

  test("fails on a usage error", () => {
    const { port } = fixture();

    const result = syncChanges(port, "main", "extra");

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("usage");
  });
});
