import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runScript, scriptsDir, type RunResult } from "./test/harness.ts";
import { portRepo, type PortEntry } from "./test/port-fixture.ts";

const check = (cwd: string, ...args: string[]) => runScript("check-cursorisms.ts", args, { cwd });

const rulesPath = "docs/conversion-rules.md";

/** A rules document from `## N. Title` sections, each given as its prose and detect block lines. */
function rulesDoc(rules: Record<string, string[]>): string {
  const sections = Object.entries(rules).map(
    ([heading, block]) => `## ${heading}\n\nWhat the rule says.\n\n\`\`\`detect\n${block.join("\n")}\n\`\`\`\n`,
  );
  return `# Conversion rules\n\nThe preamble.\n\n${sections.join("\n")}`;
}

const tools = [
  String.raw`pattern: \bAskQuestion\b`,
  String.raw`pattern: \.cursor/`,
  "before: Prefer AskQuestion over free text.",
  "before: Write `.cursor/skills/verify-<app>/`.",
  "after: Prefer AskUserQuestion over free text.",
  "after: Write `.claude/skills/verify-<app>/`.",
];
const multiModel = ["undetectable: classifying a step takes reading it"];

const upstreamFile = { "upstream/pstack/skills/a/SKILL.md": "Upstream.\n" };

/** A port checkout with `rules` as its rules document and `files` beside the fixture's upstream. */
function repo(rules: Record<string, string[]>, files: Record<string, string> = {}, entries: PortEntry[] = []) {
  return portRepo({ [rulesPath]: rulesDoc(rules), ...upstreamFile, ...files }, entries);
}

const findings = (result: RunResult) => result.stdout.split("\n").filter((line) => line.startsWith("pstack/"));

describe("check-cursorisms", () => {
  test("passes a translated file with no Cursor-isms", () => {
    const result = check(repo({ "1. Tools": tools, "2. Models": multiModel }, { "pstack/skills/a/SKILL.md": "Clean.\n" }));

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("flags each Cursor-ism in a translated file by line, column and rule", () => {
    const text = "Line one.\nAsk with AskQuestion, then read `~/.cursor/plugins/x`.\n";

    const result = check(repo({ "1. Tools": tools, "2. Models": multiModel }, { "pstack/skills/a/SKILL.md": text }));

    expect(result.exitCode).toBe(1);
    expect(findings(result)).toEqual([
      "pstack/skills/a/SKILL.md:2:10: rule 1 (Tools): AskQuestion",
      "pstack/skills/a/SKILL.md:2:36: rule 1 (Tools): .cursor/",
    ]);
  });

  test("checks only translated files: overrides, port-only and dropped files are skipped", () => {
    const entries: PortEntry[] = [
      { path: "pstack/skills/a/SKILL.md", kind: "override", why: "hand-written" },
      { path: "pstack/hooks", kind: "port-only", why: "the port's hooks" },
      { path: "pstack/skills/a/package.json", kind: "dropped", why: "kept for development" },
      { path: "pstack/skills/kit", kind: "translated", why: "vendored", sources: ["upstream/pstack/skills/a"] },
    ];
    const files = {
      "pstack/skills/a/SKILL.md": "AskQuestion\n",
      "pstack/hooks/remind.sh": "AskQuestion\n",
      "pstack/skills/a/package.json": "AskQuestion\n",
      "pstack/skills/kit/SKILL.md": "AskQuestion\n",
      "pstack/skills/b/SKILL.md": "AskQuestion\n",
    };

    const result = check(repo({ "1. Tools": tools }, files, entries));

    expect(findings(result).map((line) => line.split(":")[0])).toEqual([
      "pstack/skills/b/SKILL.md",
      "pstack/skills/kit/SKILL.md",
    ]);
  });

  test("skips binary files", () => {
    const result = check(repo({ "1. Tools": tools }, { "pstack/assets/logo.png": "\0AskQuestion\n" }));

    expect(result.exitCode).toBe(0);
  });

  test("an allowance excuses one occurrence in one file, and only for its rule", () => {
    const allowed = [...tools, "allow: pstack/README.md | quoting AskQuestion | quotes upstream's wording"];
    const files = {
      "pstack/README.md": "We are quoting AskQuestion here.\nBut AskQuestion here is a leftover.\n",
      "pstack/skills/b/SKILL.md": "Still quoting AskQuestion here.\n",
    };

    const result = check(repo({ "1. Tools": allowed }, files));

    expect(result.exitCode).toBe(1);
    expect(findings(result)).toEqual([
      "pstack/README.md:2:5: rule 1 (Tools): AskQuestion",
      "pstack/skills/b/SKILL.md:1:15: rule 1 (Tools): AskQuestion",
    ]);
    expect(result.stdout).toContain("1 allowance");
  });

  test("fails on an allowance that excuses more than one line, since it must name one occurrence", () => {
    const allowed = [...tools, "allow: pstack/README.md | AskQuestion | quotes upstream's wording"];
    const files = { "pstack/README.md": "Quoting AskQuestion here.\nAnd AskQuestion again.\n" };

    const result = check(repo({ "1. Tools": allowed }, files));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("allowance excuses 2 lines");
    expect(result.stdout).toContain("pstack/README.md | AskQuestion");
  });

  test("fails on an allowance that excuses nothing", () => {
    const allowed = [...tools, "allow: pstack/README.md | quoting AskQuestion | quotes upstream's wording"];

    const result = check(repo({ "1. Tools": allowed }, { "pstack/README.md": "Clean.\n" }));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("stale allowance");
    expect(result.stdout).toContain("pstack/README.md | quoting AskQuestion");
    expect(result.stdout).toMatch(/docs\/conversion-rules\.md:\d+/);
  });

  describe("self-test: a rules document that can't be trusted exits 2 before scanning", () => {
    const invalid: Record<string, Record<string, string[]>> = {
      "a dead pattern, matching none of its rule's before lines": {
        "1. Tools": [...tools, String.raw`pattern: \bis_background\b`],
      },
      "a before line none of its rule's patterns match": {
        "1. Tools": [...tools, "before: Use the Task tool."],
      },
      "an after line any rule's pattern matches": {
        "1. Tools": tools,
        "2. Other": [String.raw`pattern: \bAgent tool\b`, "before: Use the Agent tool.", "after: Prefer AskQuestion."],
      },
      "a detect block that declares nothing": { "1. Tools": tools, "2. Models": [] },
      "a rule with patterns and no before lines": { "1. Tools": [String.raw`pattern: \bAskQuestion\b`] },
      "an undetectable rule that also has patterns": { "1. Tools": [...tools, "undetectable: why not"] },
      "an undetectable rule with no reason": { "1. Tools": ["undetectable:"] },
      "a pattern that doesn't compile": { "1. Tools": [...tools, "pattern: (unclosed"] },
      "an unknown key": { "1. Tools": [...tools, "severity: high"] },
      "an allowance with no reason": { "1. Tools": [...tools, "allow: pstack/README.md | AskQuestion |"] },
      "an allowance with no text": { "1. Tools": [...tools, "allow: pstack/README.md | | quotes upstream"] },
      "a heading that isn't a numbered rule": { "Notes": multiModel },
      "two rules with one number": { "1. Tools": tools, "1. Again": multiModel },
    };

    for (const [name, rules] of Object.entries(invalid)) {
      test(name, () => {
        const result = check(repo(rules, { "pstack/skills/a/SKILL.md": "AskQuestion\n" }));

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain(rulesPath);
        expect(findings(result)).toEqual([]);
      });
    }

    test("names the dead pattern", () => {
      const result = check(repo({ "1. Tools": [...tools, String.raw`pattern: \bis_background\b`] }));

      expect(result.stderr).toContain("dead pattern");
      expect(result.stderr).toContain(String.raw`\bis_background\b`);
    });

    test("a rule with no detect block", () => {
      const doc = rulesDoc({ "1. Tools": tools }) + "\n## 2. Prose only\n\nNo detection.\n";
      const root = portRepo({ [rulesPath]: doc, ...upstreamFile });

      const result = check(root);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("rule 2 (Prose only)");
    });

    test("two detect blocks in one rule", () => {
      const doc = rulesDoc({ "1. Tools": tools }) + "\n```detect\nundetectable: again\n```\n";
      const root = portRepo({ [rulesPath]: doc, ...upstreamFile });

      const result = check(root);

      expect(result.exitCode).toBe(2);
    });

    test("a detect block above the first rule", () => {
      const doc = rulesDoc({ "1. Tools": tools }).replace("The preamble.", "```detect\nundetectable: early\n```");
      const root = portRepo({ [rulesPath]: doc, ...upstreamFile });

      const result = check(root);

      expect(result.exitCode).toBe(2);
    });
  });

  test("ignores ordinary code fences, headings inside them included", () => {
    const doc = rulesDoc({ "1. Tools": tools }).replace("What the rule says.", "```md\n## not a rule\n```");

    const result = check(portRepo({ [rulesPath]: doc, ...upstreamFile }, []));

    expect(result.exitCode).toBe(0);
  });

  test("fails with exit 2 when there is no rules document", () => {
    const result = check(portRepo(upstreamFile));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(rulesPath);
  });

  describe("the repo's conversion rules document", () => {
    const doc = readFileSync(join(scriptsDir, "..", rulesPath), "utf8");
    const examples = (key: "before" | "after") =>
      [...doc.matchAll(new RegExp(`^${key}:(.*)$`, "gm"))].map((match) => match[1]!.trim());

    test("holds rules 1 to 23", () => {
      const numbers = [...doc.matchAll(/^## (\d+)\. /gm)].map((match) => Number(match[1]));

      expect(numbers).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
    });

    test("flags every rule's before lines and passes its after lines", () => {
      const before = examples("before");
      const after = examples("after");
      const root = portRepo({
        [rulesPath]: doc,
        ...upstreamFile,
        "pstack/skills/a/SKILL.md": before.join("\n") + "\n",
        "pstack/skills/a/after.md": after.join("\n") + "\n",
        "port.json": JSON.stringify({ entries: [] }),
      });

      const result = check(root);

      expect(result.stderr).toBe("");
      const flagged = new Set(findings(result).map((line) => line.split(":").slice(0, 2).join(":")));
      expect(before.length).toBeGreaterThan(0);
      expect([...flagged].sort()).toEqual(before.map((_, i) => `pstack/skills/a/SKILL.md:${i + 1}`).sort());
    });

    test("passes in the repo itself", () => {
      const result = check(join(scriptsDir, ".."));

      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    });
  });
});
