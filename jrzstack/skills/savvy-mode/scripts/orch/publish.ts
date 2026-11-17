import { execFileSync } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const REMOTE = "origin";

export interface PublishPlanParams {
  readonly file: string;
  readonly branch?: string;
  readonly title?: string;
}

export interface PublishBriefParams {
  readonly file: string;
  readonly branch: string;
}

export interface PublishedFile {
  readonly branch: string;
  readonly path: string;
  readonly commit: string;
}

export class UserError extends Error {}
export class UsageError extends UserError {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failureDetail(error: unknown): string {
  if (isRecord(error) && error.stderr !== undefined) {
    const stderr = String(error.stderr).trim();
    if (stderr.length > 0) {
      return stderr;
    }
  }
  return errorMessage(error);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function requiredLine(value: string, label: string): string {
  const line = value.trim();
  if (line.length === 0 || /[\r\n]/.test(line)) {
    throw new UsageError(`${label} must be one non-empty line`);
  }
  return line;
}

function runGit({
  args,
  cwd,
  env = {},
  input,
}: {
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string>>;
  input?: string;
}): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  }).trim();
}

function gitOrNull(params: { args: readonly string[]; cwd: string }): string | null {
  try {
    return runGit(params);
  } catch {
    return null;
  }
}

function commitOrNull(cwd: string, ref: string): string | null {
  return gitOrNull({
    args: ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
    cwd,
  });
}

function branchTip(cwd: string, branch: string): string | null {
  const remoteRef = `refs/remotes/${REMOTE}/${branch}`;
  gitOrNull({
    args: ["fetch", "--quiet", REMOTE, `+refs/heads/${branch}:${remoteRef}`],
    cwd,
  });
  return commitOrNull(cwd, remoteRef) ?? commitOrNull(cwd, `refs/heads/${branch}`);
}

function branchName(cwd: string, value: string): string {
  const branch = value.trim().replace(/^refs\/heads\//, "");
  if (gitOrNull({ args: ["check-ref-format", `refs/heads/${branch}`], cwd }) === null) {
    throw new UsageError(`${value} is not a valid branch name`);
  }
  return branch;
}

// Writes one file over parent's tree (or an empty one) through a temporary
// index and commit-tree, so the checkout's working tree, index and HEAD never
// move. Returns parent itself when the tree comes out the same.
async function commitFile({
  cwd,
  parent,
  path,
  source,
  message,
}: {
  cwd: string;
  parent: string | null;
  path: string;
  source: string;
  message: string;
}): Promise<string> {
  const scratch = await mkdtemp(join(tmpdir(), "orch-index-"));
  try {
    const index = { GIT_INDEX_FILE: join(scratch, "index") };
    if (parent !== null) {
      runGit({ args: ["read-tree", parent], cwd, env: index });
    }
    const sha = runGit({ args: ["hash-object", "-w", "--no-filters", "--", source], cwd });
    runGit({
      args: ["update-index", "-z", "--add", "--index-info"],
      cwd,
      env: index,
      input: `100644 ${sha}\t${path}\0`,
    });
    const tree = runGit({ args: ["write-tree"], cwd, env: index });
    if (parent !== null && runGit({ args: ["rev-parse", `${parent}^{tree}`], cwd }) === tree) {
      return parent;
    }
    return runGit({
      args: ["commit-tree", tree, ...(parent === null ? [] : ["-p", parent]), "-m", message],
      cwd,
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function checkoutOf(source: string, what: string): Promise<string> {
  if (!(await exists(source))) {
    throw new UserError(`no ${what} at ${source}`);
  }
  const cwd = dirname(source);
  if (gitOrNull({ args: ["rev-parse", "--show-toplevel"], cwd }) === null) {
    throw new UserError(`${source} is not inside a git checkout; there is no remote to post to`);
  }
  return cwd;
}

// Commits one file onto branch's tree at path and pushes it as a
// fast-forward, never a force push, so a lead publishes a brief or a plan with
// one command of literal arguments.
async function publishFile({
  cwd,
  branch,
  path,
  source,
  message,
}: {
  cwd: string;
  branch: string;
  path: string;
  source: string;
  message: string;
}): Promise<PublishedFile> {
  let commit: string;
  try {
    commit = await commitFile({ cwd, parent: branchTip(cwd, branch), path, source, message });
  } catch (error) {
    throw new UserError(`committing ${path} to ${branch} failed: ${failureDetail(error)}`);
  }
  try {
    runGit({ args: ["push", "--quiet", REMOTE, `${commit}:refs/heads/${branch}`], cwd });
  } catch (error) {
    throw new UserError(`pushing ${branch} failed: ${failureDetail(error)}`);
  }
  runGit({ args: ["update-ref", `refs/remotes/${REMOTE}/${branch}`, commit], cwd });
  return { branch, path, commit };
}

// Posts a plan file as plan.md on its orphan branch, jrzstack/plan/<slug> from
// the file's name unless branch is given, keeping the briefs published there.
export async function publishPlan(params: PublishPlanParams): Promise<PublishedFile> {
  const source = resolve(params.file);
  const cwd = await checkoutOf(source, "plan");
  const slug = basename(source).replace(/\.md$/, "");
  const branch = branchName(cwd, params.branch ?? `jrzstack/plan/${slug}`);
  const title = params.title === undefined ? slug : requiredLine(params.title, "title");
  return publishFile({ cwd, branch, path: "plan.md", source, message: `plan: ${title}` });
}

// Commits a brief file as briefs/<its file name> onto branch, such as the
// plan's jrzstack/plan/<slug>, keeping the rest of that branch's tree.
export async function publishBrief(params: PublishBriefParams): Promise<PublishedFile> {
  const source = resolve(params.file);
  const cwd = await checkoutOf(source, "brief");
  const branch = branchName(cwd, params.branch);
  const name = basename(source);
  return publishFile({
    cwd,
    branch,
    path: `briefs/${name}`,
    source,
    message: `orch: brief ${name}`,
  });
}
