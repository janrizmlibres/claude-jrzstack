import { describe, expect, test } from "bun:test";
import { appendFileSync, chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, runScript } from "./test/harness.ts";
import { fixtureUpstream, portAt } from "./test/upstream-fixture.ts";

const upstreamDiff = (cwd: string, ...args: string[]) => runScript("upstream-diff.ts", args, { cwd });

function upstreamMovedOn() {
  const { upstream, first } = fixtureUpstream();
  upstream.commit({
    write: {
      "pstack/README.md": "# pstack\n\nWorkflows, now faster.\n",
      "pstack/skills/new/SKILL.md": "A new skill.\n",
      "kit/skills/other/SKILL.md": "Still outside the snapshot, but changed.\n",
      "unrelated/file.md": "Changed outside the snapshot.\n",
    },
    remove: ["pstack/skills/a"],
    rename: { "pstack/skills/b/SKILL.md": "pstack/skills/c/SKILL.md" },
  });
  return { upstream, port: portAt(upstream, first) };
}

describe("upstream-diff", () => {
  test("reports what upstream changed under the snapshot paths since the snapshot, renames included", () => {
    const { port } = upstreamMovedOn();

    const result = upstreamDiff(port, "main");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("+Workflows, now faster.");
    expect(result.stdout).toContain("rename from pstack/skills/b/SKILL.md");
    expect(result.stdout).toContain("rename to pstack/skills/c/SKILL.md");
    expect(result.stdout).toContain("b/pstack/skills/new/SKILL.md");
    expect(result.stdout).toContain("a/pstack/skills/a/SKILL.md");
    expect(result.stdout).not.toContain("kit/skills/other");
    expect(result.stdout).not.toContain("unrelated");
  });

  test("diffs against main when no ref is given", () => {
    const { port } = upstreamMovedOn();

    const result = upstreamDiff(port);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("+Workflows, now faster.");
  });

  test("diffs against any named ref", () => {
    const { upstream, first } = fixtureUpstream();
    git(upstream.dir, "checkout", "-q", "-b", "next");
    upstream.commit({ write: { "pstack/README.md": "# pstack next\n" } });
    git(upstream.dir, "checkout", "-q", "main");

    const onMain = upstreamDiff(portAt(upstream, first), "main");
    const onNext = upstreamDiff(portAt(upstream, first), "next");

    expect(onMain.stdout).not.toContain("pstack next");
    expect(onNext.exitCode).toBe(0);
    expect(onNext.stdout).toContain("+# pstack next");
  });

  test("writes the diff to --out instead of stdout, creating its directory", () => {
    const { port } = upstreamMovedOn();

    const result = upstreamDiff(port, "main", "--out", ".sync-upstream/upstream.diff");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(readFileSync(join(port, ".sync-upstream/upstream.diff"), "utf8")).toContain("+Workflows, now faster.");
  });

  test("says so when upstream has not changed", () => {
    const { upstream, first } = fixtureUpstream();

    const result = upstreamDiff(portAt(upstream, first));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No upstream changes");
  });

  test("fails when there is no snapshot record", () => {
    const { upstream, first } = fixtureUpstream();
    const port = portAt(upstream, first);
    rmSync(join(port, "upstream", "snapshot.json"));

    const result = upstreamDiff(port);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("upstream/snapshot.json");
  });

  describe("--verify", () => {
    test("passes on an untouched snapshot even after upstream moved on", () => {
      const { port } = upstreamMovedOn();

      const result = upstreamDiff(port, "--verify");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("matches");
    });

    test("fails on a hand-edited snapshot file and names it", () => {
      const { upstream, first } = fixtureUpstream();
      const port = portAt(upstream, first);
      appendFileSync(join(port, "upstream", "pstack", "README.md"), "A hand edit.\n");

      const result = upstreamDiff(port, "--verify");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("pstack/README.md");
      expect(result.stdout).toContain("A hand edit.");
    });

    test("fails on a file added to the snapshot by hand", () => {
      const { upstream, first } = fixtureUpstream();
      const port = portAt(upstream, first);
      writeFileSync(join(port, "upstream", "kit", "skills", "keep", "extra.md"), "Added by hand.\n");

      const result = upstreamDiff(port, "--verify");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("kit/skills/keep/extra.md");
    });

    test("fails on a file deleted from the snapshot by hand", () => {
      const { upstream, first } = fixtureUpstream();
      const port = portAt(upstream, first);
      rmSync(join(port, "upstream", "pstack", "scripts", "run.sh"));

      const result = upstreamDiff(port, "--verify");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("pstack/scripts/run.sh");
    });

    test("fails when snapshot.json's version was edited by hand", () => {
      const { upstream, first } = fixtureUpstream();
      const port = portAt(upstream, first);
      const file = join(port, "upstream", "snapshot.json");
      writeFileSync(file, readFileSync(file, "utf8").replace('"1.2.3"', '"9.9.9"'));

      const result = upstreamDiff(port, "--verify");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("9.9.9");
      expect(result.stdout).toContain("1.2.3");
    });

    test("fails on files outside the recorded paths", () => {
      const { upstream, first } = fixtureUpstream();
      const port = portAt(upstream, first);
      writeFileSync(join(port, "upstream", "stray.md"), "Not under any recorded path.\n");

      const result = upstreamDiff(port, "--verify");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("stray.md");
    });

    test("fails when an executable bit was changed by hand", () => {
      const { upstream, first } = fixtureUpstream();
      const port = portAt(upstream, first);
      chmodSync(join(port, "upstream", "pstack", "scripts", "run.sh"), 0o644);

      const result = upstreamDiff(port, "--verify");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("pstack/scripts/run.sh");
    });
  });
});
