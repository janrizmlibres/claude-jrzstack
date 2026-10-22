import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runScript, scriptsDir, tempDir, writeFiles, type Files } from "./test/harness.ts";
import type { PortEntry } from "./test/port-fixture.ts";

const render = (cwd: string, ...args: string[]) => runScript("render-readme.ts", args, { cwd });

const snapshotRecord = {
  repo: "https://github.com/cursor/plugins",
  commit: "df581122cde17e6e27686b5a448bde23e4ad4318",
  version: "0.15.15",
  paths: ["jrzstack", "kit/skills/deslop"],
  taken: "2026-10-08T07:02:12.180Z",
};

const entries: PortEntry[] = [
  { path: "jrzstack/skills/setup-jrzstack/SKILL.md", kind: "override", why: "shows the settings" },
  { path: "jrzstack/automations/benny", kind: "dropped", why: "Cursor Slack automations" },
  { path: "jrzstack/agents/work.md", kind: "port-only", why: "the Work setting's writer" },
  {
    path: "jrzstack/skills/deslop",
    kind: "translated",
    why: "vendored from the kit",
    sources: ["upstream/kit/skills/deslop"],
  },
];

const readme = [
  "# jrzstack for Claude Code",
  "",
  "<!-- BEGIN generated from upstream/snapshot.json — do not edit by hand -->",
  "stale version line",
  "<!-- END generated -->",
  "Credit to Lauren Tan.",
  "",
  "## How the port differs",
  "",
  "Hand-written prose.",
  "",
  "<!-- BEGIN generated from port.json — do not edit by hand -->",
  "stale table",
  "<!-- END generated -->",
  "",
  "## Keeping up with upstream",
  "",
].join("\n");

const tree: Files = {
  "upstream/pstack/automations/benny/README.md": "Benny.\n",
  "upstream/pstack/skills/setup-pstack/SKILL.md": "Setup.\n",
  "upstream/kit/skills/deslop/SKILL.md": "Deslop.\n",
  "jrzstack/skills/setup-jrzstack/SKILL.md": "Setup, overridden.\n",
  "jrzstack/agents/work.md": "Work.\n",
  "jrzstack/skills/deslop/SKILL.md": "Deslop.\n",
};

/** A repo root holding the fixture tree, snapshot.json, port.json and README.md, each overridable. */
function repo(options: { readme?: string; entries?: PortEntry[]; record?: object } = {}): string {
  const root = tempDir("jrzstack-readme-");
  writeFiles(root, {
    ...tree,
    "upstream/snapshot.json": JSON.stringify(options.record ?? snapshotRecord, null, 2) + "\n",
    "port.json": JSON.stringify({ entries: options.entries ?? entries }, null, 2) + "\n",
    "README.md": options.readme ?? readme,
  });
  return root;
}

const readReadme = (root: string) => readFileSync(join(root, "README.md"), "utf8");

/** The lines between a block's BEGIN marker (matched by `source`) and its END marker. */
function block(text: string, source: string): string[] {
  const lines = text.split("\n");
  const begin = lines.findIndex((line) => line.startsWith(`<!-- BEGIN generated from ${source}`));
  const end = lines.findIndex((line, index) => index > begin && line === "<!-- END generated -->");
  return lines.slice(begin + 1, end);
}

describe("render-readme", () => {
  test("writes the tracked upstream version and commit from snapshot.json", () => {
    const root = repo();

    const result = render(root);

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(block(readReadme(root), "upstream/snapshot.json")).toEqual([
      "**Tracks upstream pstack v0.15.15** (`cursor/plugins@df58112`).",
    ]);
  });

  test("writes a table of overrides, port-only and dropped files with their why, paths relative to jrzstack/", () => {
    const root = repo();

    render(root);

    const table = block(readReadme(root), "port.json");
    expect(table.slice(0, 5)).toEqual([
      "| File | Kind | Why |",
      "|---|---|---|",
      "| `skills/setup-jrzstack/SKILL.md` | override | shows the settings |",
      "| `agents/work.md` | port-only | the Work setting's writer |",
      "| `automations/benny/` | dropped | Cursor Slack automations |",
    ]);
    expect(table.join("\n")).not.toContain("| translated |");
  });

  test("names the translated path exceptions and their sources below the table", () => {
    const root = repo();

    render(root);

    const after = block(readReadme(root), "port.json").slice(5).join("\n");
    expect(after).toContain("`skills/deslop/` (from `kit/skills/deslop/`)");
  });

  test("orders rows by code point, whatever the locale", () => {
    const root = repo({
      entries: [
        { path: "jrzstack/agents/apple.md", kind: "port-only", why: "lower" },
        { path: "jrzstack/agents/Zebra.md", kind: "port-only", why: "upper" },
      ],
    });

    render(root);

    expect(block(readReadme(root), "port.json").slice(2, 4)).toEqual([
      "| `agents/Zebra.md` | port-only | upper |",
      "| `agents/apple.md` | port-only | lower |",
    ]);
  });

  test("escapes a pipe in a why so the row keeps its columns", () => {
    const root = repo({
      entries: [{ path: "jrzstack/agents/work.md", kind: "port-only", why: "reader | writer" }],
    });

    render(root);

    expect(block(readReadme(root), "port.json")).toContain("| `agents/work.md` | port-only | reader \\| writer |");
  });

  test("leaves everything outside the generated blocks as it was", () => {
    const root = repo();

    render(root);

    const outside = (text: string) =>
      text.replace(/(<!-- BEGIN generated[^\n]*\n)[\s\S]*?(<!-- END generated -->)/g, "$1$2");
    expect(outside(readReadme(root))).toBe(outside(readme));
  });

  test("is idempotent", () => {
    const root = repo();
    render(root);
    const once = readReadme(root);

    render(root);

    expect(readReadme(root)).toBe(once);
  });

  describe("--check", () => {
    test("passes on a README whose blocks are current", () => {
      const root = repo();
      render(root);

      const result = render(root, "--check");

      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    });

    test("fails on a stale version line, naming its source, and writes nothing", () => {
      const root = repo();
      render(root);
      writeFileSync(
        join(root, "upstream/snapshot.json"),
        JSON.stringify({ ...snapshotRecord, version: "0.16.0", commit: "abcdef0123456789" }) + "\n",
      );
      const before = readReadme(root);

      const result = render(root, "--check");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("upstream/snapshot.json");
      expect(result.stdout).not.toContain("from port.json");
      expect(readReadme(root)).toBe(before);
    });

    test("fails on a stale file table, naming its source", () => {
      const root = repo();
      render(root);
      writeFileSync(
        join(root, "port.json"),
        JSON.stringify({ entries: [...entries, { path: "jrzstack/x.md", kind: "dropped", why: "gone" }] }) + "\n",
      );

      const result = render(root, "--check");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("port.json");
      expect(result.stdout).not.toContain("upstream/snapshot.json");
    });
  });

  describe("fails with exit 2", () => {
    test("on a README missing a block's markers", () => {
      const root = repo({ readme: readme.replace(/<!-- BEGIN generated from port\.json.*\n/, "") });

      const result = render(root, "--check");

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("port.json");
    });

    test("on a block whose END marker is missing", () => {
      const root = repo({ readme: readme.replace(/<!-- END generated -->\n\n## Keeping/, "\n## Keeping") });

      const result = render(root);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("END");
    });

    test("on a malformed port.json", () => {
      const root = repo({ entries: [{ path: "jrzstack/x", kind: "patched", why: "?" }] });

      const result = render(root);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("port.json");
    });

    test("on an unknown option", () => {
      const result = render(repo(), "--stale");

      expect(result.exitCode).toBe(2);
    });
  });

  test("the repo's own README is current", () => {
    const result = render(join(scriptsDir, ".."), "--check");

    expect(result.stdout + result.stderr).toContain("README");
    expect(result.exitCode).toBe(0);
  });
});
