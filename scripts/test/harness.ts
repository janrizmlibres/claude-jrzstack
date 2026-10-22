// Shared harness for testing repo and plugin scripts through their command
// line: each test gets its own temp directory and fake HOME, scripts run as
// child processes, and git remotes are local fake remotes.
import { afterEach } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const scriptsDir = resolve(import.meta.dir, "..");
/** The plugin a marketplace install copies: `jrzstack/` at the repo root. */
export const pluginDir = resolve(scriptsDir, "..", "jrzstack");

const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A fresh directory, removed after the current test. */
export function tempDir(prefix = "jrzstack-test-"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  made.push(dir);
  return dir;
}

export type RunResult = { exitCode: number; stdout: string; stderr: string };

export type RunOptions = {
  cwd: string;
  /** Fake HOME; a fresh empty one when omitted. */
  home?: string;
  env?: Record<string, string>;
  stdin?: string;
};

/** Run `bun <script> ...args`, with `script` relative to `scripts/`. */
export function runScript(script: string, args: string[], options: RunOptions): RunResult {
  return runProgram([process.execPath, join(scriptsDir, script), ...args], options);
}

/** Run `bash <script> ...args`, with `script` relative to the plugin, as Claude Code runs a hook command. */
export function runPluginScript(script: string, args: string[], options: RunOptions): RunResult {
  return runBashScript(join(pluginDir, script), args, options);
}

/** Run `bash <file> ...args`, with `file` an absolute path. */
export function runBashScript(file: string, args: string[], options: RunOptions): RunResult {
  return runProgram(["bash", file, ...args], options);
}

/** Run a command line through `sh -c`, as Claude Code runs a settings hook command. */
export function runShell(command: string, options: RunOptions): RunResult {
  return runProgram(["sh", "-c", command], options);
}

/** Run `cmd` to completion; `options.env` may replace PATH. */
export function runProgram(cmd: string[], options: RunOptions): RunResult {
  const home = options.home ?? tempDir("jrzstack-home-");
  const proc = Bun.spawnSync({
    cmd,
    cwd: options.cwd,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: home,
      GIT_CONFIG_NOSYSTEM: "1",
      ...options.env,
    },
    stdin: options.stdin === undefined ? "ignore" : new TextEncoder().encode(options.stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode ?? -1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

/** Run git, failing the test on a non-zero exit. Returns trimmed stdout. */
export function git(cwd: string, ...args: string[]): string {
  const proc = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd,
    env: { PATH: process.env.PATH ?? "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
  return proc.stdout.toString().trim();
}

/** File contents by path; a `{ content, executable }` entry sets the exec bit. */
export type Files = Record<string, string | { content: string; executable: boolean }>;

export function writeFiles(root: string, files: Files): void {
  for (const [path, entry] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    const { content, executable } = typeof entry === "string" ? { content: entry, executable: false } : entry;
    writeFileSync(file, content);
    chmodSync(file, executable ? 0o755 : 0o644);
  }
}

/**
 * A local git repo standing in for a remote such as `cursor/plugins`, served
 * over file:// with shallow, filtered and by-SHA fetches allowed as GitHub
 * allows them.
 */
export class FakeRemote {
  readonly dir: string;
  readonly url: string;

  constructor() {
    this.dir = tempDir("jrzstack-remote-");
    git(this.dir, "init", "-q", "-b", "main");
    git(this.dir, "config", "user.name", "Fixture");
    git(this.dir, "config", "user.email", "fixture@example.com");
    git(this.dir, "config", "uploadpack.allowFilter", "true");
    git(this.dir, "config", "uploadpack.allowAnySHA1InWant", "true");
    this.url = `file://${this.dir}`;
  }

  /** Write files, delete paths, `git mv` renames, then commit; returns the SHA. */
  commit(change: { write?: Files; remove?: string[]; rename?: Record<string, string> }): string {
    for (const [from, to] of Object.entries(change.rename ?? {})) {
      mkdirSync(dirname(join(this.dir, to)), { recursive: true });
      git(this.dir, "mv", from, to);
    }
    for (const path of change.remove ?? []) git(this.dir, "rm", "-q", "-r", path);
    writeFiles(this.dir, change.write ?? {});
    git(this.dir, "add", "-A");
    git(this.dir, "commit", "-q", "-m", "fixture commit");
    return git(this.dir, "rev-parse", "HEAD");
  }
}
