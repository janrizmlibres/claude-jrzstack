import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, pluginDir, runProgram, tempDir } from "./test/harness.ts";

const excludeWorktrees = join(pluginDir, "scripts", "exclude-worktrees");
const line = ".claude/worktrees/";

/** A repo with one commit, and the path of its shared exclude file. */
function repo() {
  const root = tempDir("jrzstack-exclude-");
  const path = join(root, "repo");
  git(root, "init", "-q", "-b", "main", path);
  git(path, "config", "user.name", "Lead");
  git(path, "config", "user.email", "lead@example.com");
  git(path, "commit", "-q", "--allow-empty", "-m", "start");
  return { root, path, exclude: join(path, ".git", "info", "exclude") };
}

const run = (cwd: string) => runProgram([excludeWorktrees], { cwd });
const lines = (file: string) => readFileSync(file, "utf8").split("\n");

describe("exclude-worktrees", () => {
  test("adds .claude/worktrees/ to the exclude file", () => {
    const { path, exclude } = repo();

    const result = run(path);

    expect(result.exitCode).toBe(0);
    expect(lines(exclude)).toContain(line);
  });

  test("running it again adds no second line", () => {
    const { path, exclude } = repo();

    run(path);
    const again = run(path);

    expect(again.exitCode).toBe(0);
    expect(lines(exclude).filter((l) => l === line)).toHaveLength(1);
  });

  test("from a linked worktree it writes the repository's shared exclude file", () => {
    const { root, path, exclude } = repo();
    const worktree = join(root, "worker");
    git(path, "worktree", "add", "-q", "-b", "worker", worktree);

    const result = run(worktree);

    expect(result.exitCode).toBe(0);
    expect(lines(exclude)).toContain(line);
    expect(git(path, "check-ignore", ".claude/worktrees/x")).toBe(".claude/worktrees/x");
  });

  test("creates the exclude file when it is missing", () => {
    const { path, exclude } = repo();
    rmSync(join(path, ".git", "info"), { recursive: true, force: true });

    const result = run(path);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(exclude, "utf8")).toBe(`${line}\n`);
  });

  test("puts the line on its own line after a file with no trailing newline", () => {
    const { path, exclude } = repo();
    writeFileSync(exclude, "*.log");

    run(path);

    expect(readFileSync(exclude, "utf8")).toBe(`*.log\n${line}\n`);
  });

  test("outside a git repository it fails and writes nothing", () => {
    const dir = tempDir("jrzstack-not-a-repo-");

    const result = run(dir);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("exclude-worktrees");
    expect(existsSync(join(dir, ".git"))).toBe(false);
  });
});
