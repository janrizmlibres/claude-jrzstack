import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { git, pluginDir, runProgram, tempDir } from "./test/harness.ts";

const waitReport = join(pluginDir, "scripts", "wait-report");
const timedOutCode = 75;
const usageCode = 64;

/** A repo whose `main` is the start commit, with a worker branch `worker` checked out in a worktree. */
function workerRepo() {
  const root = tempDir("jrzstack-wait-");
  const repo = join(root, "repo");
  git(root, "init", "-q", "-b", "main", repo);
  git(repo, "config", "user.name", "Lead");
  git(repo, "config", "user.email", "lead@example.com");
  git(repo, "commit", "-q", "--allow-empty", "-m", "start");
  const start = git(repo, "rev-parse", "HEAD");
  const worktree = join(root, "worker");
  git(repo, "worktree", "add", "-q", "-b", "worker", worktree, start);
  return { repo, worktree, start };
}

/** Commit on the worker's branch, with a `Jrzstack-Status` trailer when `status` is given. */
function commit(worktree: string, subject: string, status?: string) {
  const trailer = status ? ["--trailer", `Jrzstack-Status: ${status}`] : [];
  git(worktree, "commit", "-q", "--allow-empty", "-m", subject, ...trailer);
}

/** Run wait-report from `cwd`, polling every second. */
function run(cwd: string, args: string[]) {
  return runProgram([waitReport, ...args], { cwd, env: { JRZSTACK_WAIT_REPORT_INTERVAL_SECONDS: "1" } });
}

describe("wait-report", () => {
  test("prints the status of a report already past the start commit", () => {
    const { repo, worktree, start } = workerRepo();
    commit(worktree, "work");
    commit(worktree, "report", "ISSUES");

    const result = run(repo, [start, "worker", "5"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("ISSUES\n");
  });

  test("keeps waiting until the report commit lands", async () => {
    const { repo, worktree, start } = workerRepo();
    commit(worktree, "work, no report yet");
    const proc = Bun.spawn({
      cmd: [waitReport, start, "worker", "20"],
      cwd: repo,
      env: { PATH: process.env.PATH ?? "", HOME: tempDir("jrzstack-home-"), JRZSTACK_WAIT_REPORT_INTERVAL_SECONDS: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    await Bun.sleep(1500);
    expect(proc.exitCode).toBeNull();

    commit(worktree, "report", "PASS");
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("PASS\n");
  });

  test("past its timeout with no report it exits with the timed-out code", () => {
    const { repo, worktree, start } = workerRepo();
    commit(worktree, "work, no report");

    const result = run(repo, [start, "worker", "2"]);

    expect(result.exitCode).toBe(timedOutCode);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("no report on worker past");
  });

  test("a trailer on the start commit itself is not a report", () => {
    const { repo, worktree } = workerRepo();
    commit(worktree, "an earlier report", "PASS");
    const start = git(worktree, "rev-parse", "HEAD");

    const result = run(repo, [start, "worker", "2"]);

    expect(result.exitCode).toBe(timedOutCode);
  });

  test("a branch that doesn't exist yet counts as no report", () => {
    const { repo, start } = workerRepo();

    const result = run(repo, [start, "not-yet", "2"]);

    expect(result.exitCode).toBe(timedOutCode);
  });

  test.each([
    ["no arguments", []],
    ["a missing branch", ["HEAD"]],
    ["a timeout that isn't a whole number", ["HEAD", "worker", "soon"]],
    ["a start commit that doesn't exist", ["0123456789abcdef0123456789abcdef01234567", "worker"]],
  ])("refuses %s with the usage code", (_, args) => {
    const { repo } = workerRepo();

    const result = run(repo, args);

    expect(result.exitCode).toBe(usageCode);
    expect(result.stderr).toContain("wait-report");
  });
});
