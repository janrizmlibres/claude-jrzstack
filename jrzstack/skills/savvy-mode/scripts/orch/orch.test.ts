import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishBrief, publishPlan } from "./publish.ts";

const SCRIPT = join(import.meta.dir, "orch.ts");
const directories: string[] = [];

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "orch-test-"));
  directories.push(directory);
  return directory;
}

function git({ args, repo }: { args: readonly string[]; repo: string }): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args]);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

async function makeLeadCheckout(directory: string): Promise<{
  readonly repo: string;
  readonly remote: string;
  readonly plans: string;
  readonly briefs: string;
}> {
  const remote = join(directory, "remote.git");
  const repo = join(directory, "lead");
  await mkdir(repo);
  git({ repo: directory, args: ["init", "--bare", remote] });
  git({ repo, args: ["init", "--initial-branch=main"] });
  git({ repo, args: ["config", "user.name", "Orch Test"] });
  git({ repo, args: ["config", "user.email", "orch@example.com"] });
  await writeFile(join(repo, "main.txt"), "main\n");
  git({ repo, args: ["add", "."] });
  git({ repo, args: ["commit", "-m", "main"] });
  git({ repo, args: ["remote", "add", "origin", remote] });
  git({ repo, args: ["push", "--quiet", "origin", "main"] });
  const plans = join(repo, ".claude", "jrzstack", "plans");
  const briefs = join(repo, ".claude", "jrzstack", "briefs", "demo");
  await mkdir(plans, { recursive: true });
  await mkdir(briefs, { recursive: true });
  await writeFile(join(repo, ".git", "info", "exclude"), ".claude/\n");
  return { repo, remote, plans, briefs };
}

function runCli(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env
): { readonly code: number; readonly stdout: string; readonly stderr: string } {
  const result = Bun.spawnSync([process.execPath, SCRIPT, ...args], { env });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("publish", () => {
  it("posts a plan as plan.md to its orphan branch without moving the checkout", async () => {
    const lead = await makeLeadCheckout(await makeDirectory());
    await writeFile(join(lead.plans, "demo.md"), "plan one\n");
    const indexPath = join(lead.repo, ".git", "index");
    const indexBefore = await readFile(indexPath);
    const headBefore = git({ repo: lead.repo, args: ["rev-parse", "HEAD"] });

    const first = await publishPlan({ file: join(lead.plans, "demo.md"), title: "Demo program" });

    const remoteGit = (args: readonly string[]): string => git({ repo: lead.remote, args });
    expect(first).toEqual({
      branch: "jrzstack/plan/demo",
      path: "plan.md",
      commit: remoteGit(["rev-parse", "refs/heads/jrzstack/plan/demo"]),
    });
    expect(remoteGit(["rev-list", "--parents", "-n", "1", first.commit])).toBe(first.commit);
    expect(remoteGit(["show", "--quiet", "--format=%s", first.commit])).toBe("plan: Demo program");
    expect(await readFile(indexPath)).toEqual(indexBefore);
    expect(git({ repo: lead.repo, args: ["rev-parse", "HEAD"] })).toBe(headBefore);
    expect(git({ repo: lead.repo, args: ["status", "--porcelain", "--untracked-files=all"] })).toBe("");
  });

  it("publishes briefs beside the plan and keeps them when the plan is posted again", async () => {
    const lead = await makeLeadCheckout(await makeDirectory());
    await writeFile(join(lead.plans, "demo.md"), "plan one\n");
    const plan = await publishPlan({ file: join(lead.plans, "demo.md") });
    await writeFile(join(lead.briefs, "u1.md"), "brief one\n");
    await writeFile(join(lead.briefs, "u2.md"), "brief two\n");

    const first = await publishBrief({ file: join(lead.briefs, "u1.md"), branch: "jrzstack/plan/demo" });
    const second = await publishBrief({
      file: join(lead.briefs, "u2.md"),
      branch: "refs/heads/jrzstack/plan/demo",
    });

    const remoteGit = (args: readonly string[]): string => git({ repo: lead.remote, args });
    expect(first.path).toBe("briefs/u1.md");
    expect(remoteGit(["rev-parse", `${first.commit}^`])).toBe(plan.commit);
    expect(remoteGit(["rev-parse", `${second.commit}^`])).toBe(first.commit);
    expect(remoteGit(["show", "--quiet", "--format=%s", second.commit])).toBe("orch: brief u2.md");
    expect(
      (await publishBrief({ file: join(lead.briefs, "u2.md"), branch: "jrzstack/plan/demo" })).commit
    ).toBe(second.commit);

    await writeFile(join(lead.plans, "demo.md"), "plan two\n");
    const again = await publishPlan({ file: join(lead.plans, "demo.md") });
    expect(remoteGit(["ls-tree", "-r", "--name-only", again.commit]).split("\n")).toEqual([
      "briefs/u1.md",
      "briefs/u2.md",
      "plan.md",
    ]);
    expect(remoteGit(["show", `${again.commit}:plan.md`])).toBe("plan two");
  });

  it("starts a brief branch that doesn't exist yet as an orphan", async () => {
    const lead = await makeLeadCheckout(await makeDirectory());
    await writeFile(join(lead.briefs, "u1.md"), "brief\n");

    const published = await publishBrief({ file: join(lead.briefs, "u1.md"), branch: "jrzstack/briefs/demo" });

    const remoteGit = (args: readonly string[]): string => git({ repo: lead.remote, args });
    expect(remoteGit(["rev-list", "--parents", "-n", "1", published.commit])).toBe(published.commit);
    expect(remoteGit(["ls-tree", "-r", "--name-only", published.commit])).toBe("briefs/u1.md");
  });

  it("never force pushes over a branch it could not fetch", async () => {
    const directory = await makeDirectory();
    const lead = await makeLeadCheckout(directory);
    await writeFile(join(lead.briefs, "u1.md"), "brief\n");
    git({ repo: lead.repo, args: ["push", "--quiet", "origin", "main:refs/heads/jrzstack/plan/demo"] });
    const before = git({ repo: lead.remote, args: ["rev-parse", "refs/heads/jrzstack/plan/demo"] });
    git({ repo: lead.repo, args: ["update-ref", "-d", "refs/remotes/origin/jrzstack/plan/demo"] });
    git({ repo: lead.repo, args: ["config", "remote.origin.pushurl", lead.remote] });
    git({ repo: lead.repo, args: ["config", "remote.origin.url", join(directory, "missing.git")] });

    await expect(
      publishBrief({ file: join(lead.briefs, "u1.md"), branch: "jrzstack/plan/demo" })
    ).rejects.toThrow("pushing jrzstack/plan/demo failed");
    expect(git({ repo: lead.remote, args: ["rev-parse", "refs/heads/jrzstack/plan/demo"] })).toBe(before);
  });

  it("refuses a missing file, one outside a git checkout and a bad branch", async () => {
    const directory = await makeDirectory();
    await expect(publishPlan({ file: join(directory, "absent.md") })).rejects.toThrow("no plan at");
    await expect(publishBrief({ file: join(directory, "absent.md"), branch: "b" })).rejects.toThrow(
      "no brief at"
    );
    await writeFile(join(directory, "loose.md"), "plan\n");
    await expect(publishPlan({ file: join(directory, "loose.md") })).rejects.toThrow(
      "is not inside a git checkout"
    );
    const lead = await makeLeadCheckout(directory);
    await writeFile(join(lead.briefs, "u1.md"), "brief\n");
    await expect(publishBrief({ file: join(lead.briefs, "u1.md"), branch: "bad..name" })).rejects.toThrow(
      "is not a valid branch name"
    );
  });
});

describe("orch CLI", () => {
  it("posts a plan and a brief with one command of literal arguments each", async () => {
    const lead = await makeLeadCheckout(await makeDirectory());
    await writeFile(join(lead.plans, "demo.md"), "plan\n");
    await writeFile(join(lead.briefs, "u1.md"), "brief\n");

    const posted = runCli(["plan", "publish", join(lead.plans, "demo.md"), "--title", "Demo program"]);
    expect(posted.stderr).toBe("");
    expect(posted.code).toBe(0);
    const planCommit = git({ repo: lead.remote, args: ["rev-parse", "refs/heads/jrzstack/plan/demo"] });
    expect(posted.stdout).toBe(`jrzstack/plan/demo\tplan.md\t${planCommit}\n`);

    const published = runCli([
      "--json",
      "brief",
      "publish",
      join(lead.briefs, "u1.md"),
      "--branch",
      "jrzstack/plan/demo",
    ]);
    expect(published.stderr).toBe("");
    expect(published.code).toBe(0);
    expect(JSON.parse(published.stdout)).toEqual({
      branch: "jrzstack/plan/demo",
      path: "briefs/u1.md",
      commit: git({ repo: lead.remote, args: ["rev-parse", "refs/heads/jrzstack/plan/demo"] }),
    });
  });

  it("requires a branch for a brief and a command at all", () => {
    const brief = runCli(["brief", "publish", "u1.md"]);
    expect(brief.code).toBe(1);
    expect(brief.stderr).toContain("--branch <branch>");
    const bare = runCli([]);
    expect(bare.code).toBe(1);
    expect(bare.stderr).toContain("a valid command is required");
  });

  it("runs under Node's type stripping", async () => {
    const node = Bun.which("node");
    if (node === null) {
      throw new Error("node is not on PATH; this test needs Node 22.18+");
    }
    const lead = await makeLeadCheckout(await makeDirectory());
    await writeFile(join(lead.plans, "demo.md"), "plan\n");
    const run = Bun.spawnSync([node, SCRIPT, "plan", "publish", join(lead.plans, "demo.md")]);
    expect(run.stderr.toString()).toBe("");
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toStartWith("jrzstack/plan/demo\tplan.md\t");
  });
});
