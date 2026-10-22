import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runScript, scriptsDir } from "./test/harness.ts";
import { portRepo, type PortEntry } from "./test/port-fixture.ts";

const check = (cwd: string, ...args: string[]) => runScript("check-port-json.ts", args, { cwd });

const snapshot = {
  "upstream/pstack/README.md": "# jrzstack\n",
  "upstream/pstack/skills/a/SKILL.md": "Skill a.\n",
  "upstream/pstack/skills/arena/SKILL.md": "Arena.\n",
  "upstream/pstack/skills/arena/references/rubric.md": "Rubric.\n",
  "upstream/pstack/automations/benny/README.md": "Benny.\n",
  "upstream/pstack/automations/benny/skills/setup/SKILL.md": "Setup.\n",
  "upstream/kit/skills/deslop/SKILL.md": "Deslop.\n",
  "upstream/kit/skills/deslop/references/x.md": "X.\n",
};

const entries: PortEntry[] = [
  { path: "jrzstack/automations/benny", kind: "dropped", why: "Cursor Slack automations" },
  {
    path: "jrzstack/skills/arena/SKILL.md",
    kind: "override",
    why: "directions and a blind judge",
    depends_on: ["upstream/pstack/skills/arena/references/rubric.md"],
  },
  { path: "jrzstack/hooks/hooks.json", kind: "port-only", why: "the compaction hook" },
  {
    path: "jrzstack/skills/deslop",
    kind: "translated",
    why: "vendored from the kit",
    sources: ["upstream/kit/skills/deslop"],
  },
];

const port = {
  "jrzstack/README.md": "# jrzstack\n",
  "jrzstack/skills/a/SKILL.md": "Skill a.\n",
  "jrzstack/skills/arena/SKILL.md": "Arena, overridden.\n",
  "jrzstack/skills/arena/references/rubric.md": "Rubric.\n",
  "jrzstack/hooks/hooks.json": "{}\n",
  "jrzstack/skills/deslop/SKILL.md": "Deslop.\n",
  "jrzstack/skills/deslop/references/x.md": "X.\n",
};

/** The fixture with `entries` changed by `edit`. */
const withEntries = (edit: (entries: PortEntry[]) => PortEntry[]) => edit(structuredClone(entries));

describe("check-port-json", () => {
  test("passes when every port file is a counterpart or listed, and every listed path exists", () => {
    const result = check(portRepo({ ...snapshot, ...port }, entries));

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("port.json");
  });

  test("fails on a listed port path that doesn't exist", () => {
    const { "jrzstack/hooks/hooks.json": _, ...rest } = port;

    const result = check(portRepo({ ...snapshot, ...rest }, entries));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("jrzstack/hooks/hooks.json");
  });

  test("accepts a dropped entry whose port path doesn't exist", () => {
    const result = check(portRepo({ ...snapshot, ...port }, entries));

    expect(result.stdout).not.toContain("jrzstack/automations/benny");
  });

  test("fails on a listed upstream path missing from the snapshot", () => {
    const listed = withEntries((e) => {
      e[1]!.depends_on = ["upstream/pstack/skills/arena/references/gone.md"];
      e[3]!.sources = ["upstream/kit/skills/missing"];
      return e;
    });

    const result = check(portRepo({ ...snapshot, ...port }, listed));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("upstream/pstack/skills/arena/references/gone.md");
    expect(result.stdout).toContain("upstream/kit/skills/missing");
  });

  test("fails on a dropped or overridden path whose upstream counterpart is missing", () => {
    const listed = withEntries((e) => [
      ...e,
      { path: "jrzstack/automations/gone", kind: "dropped", why: "never existed" },
      { path: "jrzstack/skills/new/SKILL.md", kind: "override", why: "no counterpart" },
    ]);

    const result = check(portRepo({ ...snapshot, ...port, "jrzstack/skills/new/SKILL.md": "New.\n" }, listed));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("upstream/pstack/automations/gone");
    expect(result.stdout).toContain("upstream/pstack/skills/new/SKILL.md");
  });

  test("fails on an unlisted port file with no counterpart", () => {
    const result = check(portRepo({ ...snapshot, ...port, "jrzstack/skills/a/extra.md": "Extra.\n" }, entries));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("jrzstack/skills/a/extra.md");
  });

  test("ignores port files git ignores", () => {
    const ignored = { ".gitignore": "node_modules/\n", "jrzstack/node_modules/x/index.js": "x\n" };

    const result = check(portRepo({ ...snapshot, ...port, ...ignored }, entries));

    expect(result.exitCode).toBe(0);
  });

  describe("rejects a malformed port.json with exit 2", () => {
    const malformed: Record<string, (e: PortEntry[]) => PortEntry[]> = {
      "an unknown kind": (e) => [...e, { path: "jrzstack/x", kind: "patched", why: "?" }],
      "a missing why": (e) => [...e, { path: "jrzstack/x", kind: "port-only", why: "" }],
      "a port path outside jrzstack/": (e) => [...e, { path: "docs/x.md", kind: "port-only", why: "?" }],
      "an upstream path outside upstream/": (e) => {
        e[1]!.depends_on = ["jrzstack/skills/arena/references/rubric.md"];
        return e;
      },
      "sources on a port-only file": (e) => {
        e[2]!.sources = ["upstream/pstack/README.md"];
        return e;
      },
      "depends_on on a translated file": (e) => {
        e[3]!.depends_on = ["upstream/pstack/README.md"];
        return e;
      },
      "a path listed twice": (e) => [...e, { ...e[0]! }],
      "an unknown field": (e) => [...e, { path: "jrzstack/x", kind: "port-only", why: "?", note: "?" } as PortEntry],
    };

    for (const [name, edit] of Object.entries(malformed)) {
      test(name, () => {
        const result = check(portRepo({ ...snapshot, ...port }, withEntries(edit)));

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain("port.json");
      });
    }
  });

  test("fails with exit 2 when there is no port.json", () => {
    const result = check(portRepo({ ...snapshot, ...port }));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("port.json");
  });

  describe("--coverage", () => {
    test("lists each upstream file not yet translated, overridden or dropped", () => {
      const { "jrzstack/skills/a/SKILL.md": _, "jrzstack/skills/deslop/references/x.md": __, ...rest } = port;

      const result = check(portRepo({ ...snapshot, ...rest }, entries), "--coverage");

      expect(result.exitCode).toBe(1);
      const listed = result.stdout.split("\n").filter((line) => line.startsWith("upstream/"));
      expect(listed).toEqual(["upstream/kit/skills/deslop/references/x.md", "upstream/pstack/skills/a/SKILL.md"]);
      expect(result.stdout).toContain("2 of 8");
    });

    test("exits 0 when every upstream file is accounted for", () => {
      const result = check(portRepo({ ...snapshot, ...port }, entries), "--coverage");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("0 of 8");
    });
  });

  describe("the repo's own port.json", () => {
    const repoRoot = join(scriptsDir, "..");
    const repoEntries = (JSON.parse(readFileSync(join(repoRoot, "port.json"), "utf8")) as { entries: PortEntry[] })
      .entries;

    test("passes the check", () => {
      const result = check(repoRoot);

      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    });

    test("carries the spec's dropped files, each with a reason", () => {
      const dropped = repoEntries.filter((e) => e.kind === "dropped").map((e) => e.path);

      expect(dropped).toEqual(
        expect.arrayContaining([
          "jrzstack/automations/benny",
          "jrzstack/skills/savvy-mode/scripts/bootstrap.ts",
          "jrzstack/skills/savvy-mode/scripts/package.json",
          "jrzstack/skills/savvy-mode/scripts/bun.lock",
        ]),
      );
    });
  });
});
