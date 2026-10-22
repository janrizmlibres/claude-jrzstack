import { describe, expect, test } from "bun:test";
import { utimesSync } from "node:fs";
import { join } from "node:path";
import { git, runPluginScript, tempDir, writeFiles } from "./test/harness.ts";

const audit = "skills/savvy-mode/scripts/worktree-audit.sh";

/** Claude Code's project directory name for a path: every character that isn't a letter or digit becomes "-". */
const slug = (path: string) => path.replace(/[^A-Za-z0-9]/g, "-");

const day = 86_400;

/** A transcript line as Claude Code writes one, recorded in `cwd`. */
const line = (cwd: string, text = "ok") =>
  JSON.stringify({ type: "user", cwd, sessionId: "s", message: { role: "user", content: text } });

/** A repo with an origin, and a `gh` on PATH that knows no PRs. */
function fixture() {
  const root = tempDir("jrzstack-audit-");
  const home = tempDir("jrzstack-home-");
  const repo = join(root, "repo");
  const origin = join(root, "origin.git");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  git(root, "init", "-q", "-b", "main", repo);
  git(repo, "config", "user.name", "Lead");
  git(repo, "config", "user.email", "lead@example.com");
  git(repo, "commit", "-q", "--allow-empty", "-m", "base");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-q", "origin", "main");

  const bin = join(root, "bin");
  writeFiles(bin, { gh: { content: "#!/bin/sh\necho '[]'\n", executable: true } });

  /** Add a worktree on its own branch with one commit of its own; returns its path. */
  const worktree = (path: string, branch: string) => {
    git(repo, "worktree", "add", "-q", "-b", branch, path, "main");
    git(path, "commit", "-q", "--allow-empty", "-m", `work on ${branch}`);
    return path;
  };

  /** Write a transcript under the project directory of `project`, last modified `ageDays` ago. */
  const transcript = (project: string, file: string, lines: string[], ageDays: number) => {
    const dir = join(home, ".claude", "projects", slug(project));
    writeFiles(dir, { [file]: lines.join("\n") + "\n" });
    const path = join(dir, file);
    const when = Date.now() / 1000 - ageDays * day;
    utimesSync(path, when, when);
    return path;
  };

  const run = (args: string[] = []) =>
    runPluginScript(audit, args, { cwd: repo, home, env: { PATH: `${bin}:${process.env.PATH ?? ""}` } });

  return { root, repo, worktree, transcript, run };
}

type Row = Record<string, string>;

/** The audit's rows keyed by worktree path, below its `# base:` line. */
function rows(stdout: string): Map<string, Row> {
  const [header, ...body] = stdout
    .trimEnd()
    .split("\n")
    .filter((text) => !text.startsWith("# "));
  const columns = header!.split("\t");
  return new Map(
    body.map((text) => {
      const cells = text.split("\t");
      const row = Object.fromEntries(columns.map((column, i) => [column, cells[i] ?? ""]));
      return [row.WORKTREE!, row];
    }),
  );
}

describe("worktree-audit.sh", () => {
  test("attributes each worktree to the transcript whose cwd is that worktree", () => {
    const f = fixture();
    const feature = f.worktree(join(f.repo, ".claude", "worktrees", "feature"), "feature");
    const runner = f.worktree(join(f.repo, ".claude", "worktrees", "feature-r37"), "feature-r37");
    const sibling = f.worktree(join(f.root, "repo sibling"), "sibling");

    // The lead's session in the main checkout, its worktree subagent's transcript
    // under it, and a session started in the sibling worktree, in its own project.
    const lead = f.transcript(f.repo, "lead.jsonl", [line(f.repo), line(feature)], 1);
    const sub = f.transcript(f.repo, "lead/subagents/agent-r37.jsonl", [line(runner)], 0);
    const own = f.transcript(sibling, "own.jsonl", [line(sibling)], 10);

    const result = f.run();

    expect(result.exitCode).toBe(0);
    const table = rows(result.stdout);
    expect(table.get(feature)).toMatchObject({ TRANSCRIPT: lead, BUCKET: "verify-recent-chat" });
    expect(table.get(runner)).toMatchObject({ TRANSCRIPT: sub, BUCKET: "verify-recent-chat" });
    expect(table.get(sibling)).toMatchObject({ TRANSCRIPT: own, BUCKET: "review" });
    expect(table.has(f.repo)).toBe(false);
  });

  test("picks the newest of several transcripts recorded in one worktree", () => {
    const f = fixture();
    const feature = f.worktree(join(f.repo, ".claude", "worktrees", "feature"), "feature");
    f.transcript(f.repo, "older.jsonl", [line(feature)], 6);
    const newer = f.transcript(f.repo, "newer.jsonl", [line(feature)], 2);

    const row = rows(f.run().stdout).get(feature);

    expect(row).toMatchObject({ TRANSCRIPT: newer, BUCKET: "verify-recent-chat" });
    expect(row!.LAST_CHAT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("counts a session that worked in a folder inside the worktree", () => {
    const f = fixture();
    const feature = f.worktree(join(f.repo, ".claude", "worktrees", "feature"), "feature");
    const inside = f.transcript(f.repo, "lead.jsonl", [line(join(feature, "packages", "app"))], 0);

    const row = rows(f.run().stdout).get(feature);

    expect(row).toMatchObject({ TRANSCRIPT: inside, BUCKET: "verify-recent-chat" });
  });

  test("flags a worktree no transcript of this repo was recorded in as a stray", () => {
    const f = fixture();
    const stray = f.worktree(join(f.repo, ".claude", "worktrees", "stray"), "stray");
    // Naming the path in a message isn't working in it, and another project's
    // transcripts are never read.
    f.transcript(f.repo, "lead.jsonl", [line(f.repo, `look at ${stray}/notes.md`)], 0);
    f.transcript(join(f.root, "elsewhere"), "other.jsonl", [line(stray)], 0);

    const row = rows(f.run().stdout).get(stray);

    expect(row).toMatchObject({ LAST_CHAT: "-", TRANSCRIPT: "-", BUCKET: "stray" });
  });

  test("still holds a stray with uncommitted work", () => {
    const f = fixture();
    const stray = f.worktree(join(f.repo, ".claude", "worktrees", "stray"), "stray");
    writeFiles(stray, { "tracked.txt": "one\n" });
    git(stray, "add", "tracked.txt");

    const row = rows(f.run().stdout).get(stray);

    expect(row).toMatchObject({ DIRTY: "wip:1", TRANSCRIPT: "-", BUCKET: "hold-wip" });
  });

  test("checks MERGED against origin/main by default and names the base", () => {
    const f = fixture();
    const feature = f.worktree(join(f.repo, ".claude", "worktrees", "feature"), "feature");

    const result = f.run();

    expect(result.exitCode).toBe(0);
    expect(result.stdout.split("\n")[0]).toBe("# base: origin/main");
    expect(rows(result.stdout).get(feature)).toMatchObject({ MERGED: "no" });
  });

  test("checks MERGED against the base -b names, fetching it first", () => {
    const f = fixture();
    const feature = f.worktree(join(f.repo, ".claude", "worktrees", "feature"), "feature");
    git(feature, "push", "-q", "origin", "feature:integration");

    const result = f.run(["-b", "origin/integration"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.split("\n")[0]).toBe("# base: origin/integration");
    expect(rows(result.stdout).get(feature)).toMatchObject({ MERGED: "YES" });
  });

  test("exits 2 on an unknown option", () => {
    expect(fixture().run(["--nope"]).exitCode).toBe(2);
  });
});
