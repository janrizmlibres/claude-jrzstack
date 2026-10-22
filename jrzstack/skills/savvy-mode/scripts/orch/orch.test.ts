import { afterEach, describe, expect, it } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NotFoundError,
  UserError,
  openStore,
  parseVerdict,
  type OpenStoreOptions,
  type PullRequest,
  type PullRequestReader,
  type Store,
} from "./store.ts";

const SCRIPT = join(import.meta.dir, "orch.ts");
const directories: string[] = [];
const handles: Store[] = [];

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "orch-test-"));
  directories.push(directory);
  return directory;
}

function useStore(
  directory: string,
  options?: OpenStoreOptions
): Store {
  const store = openStore(directory, options);
  handles.push(store);
  return store;
}

async function initializedStore(options?: OpenStoreOptions): Promise<{
  readonly directory: string;
  readonly store: Store;
}> {
  const directory = await makeDirectory();
  const store = useStore(directory, options);
  await store.init();
  return { directory, store };
}

function git({
  args,
  repo,
}: {
  args: readonly string[];
  repo: string;
}): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args]);
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr.toString()}`
    );
  }
  return result.stdout.toString().trim();
}

async function makeGitStack(directory: string): Promise<{
  readonly repo: string;
  readonly mergedSha: string;
  readonly closedSha: string;
  readonly openSha: string;
}> {
  const repo = join(directory, "repo");
  await mkdir(repo);
  git({ repo, args: ["init", "--initial-branch=main"] });
  git({ repo, args: ["config", "user.name", "Orch Test"] });
  git({ repo, args: ["config", "user.email", "orch@example.com"] });
  await writeFile(join(repo, "main.txt"), "main\n");
  git({ repo, args: ["add", "."] });
  git({ repo, args: ["commit", "-m", "main"] });

  const branches = ["stack/merged", "stack/closed", "stack/open"];
  for (const [index, branch] of branches.entries()) {
    git({ repo, args: ["checkout", "-b", branch] });
    await writeFile(join(repo, `stack-${index}.txt`), `${branch}\n`);
    git({ repo, args: ["add", "."] });
    git({ repo, args: ["commit", "-m", branch] });
  }

  return {
    repo,
    mergedSha: git({ repo, args: ["rev-parse", "stack/merged"] }),
    closedSha: git({ repo, args: ["rev-parse", "stack/closed"] }),
    openSha: git({ repo, args: ["rev-parse", "stack/open"] }),
  };
}

type GitStack = Awaited<ReturnType<typeof makeGitStack>>;

function fakePullRequests(
  pulls: Readonly<Record<number, PullRequest>>
): PullRequestReader {
  return {
    read: async ({ pr }) => {
      const pull = pulls[pr];
      if (pull === undefined) {
        throw new Error(`no fake pull request #${pr}`);
      }
      return pull;
    },
  };
}

async function stackStore(
  pulls: (stack: GitStack) => Readonly<Record<number, PullRequest>>
): Promise<{ readonly stack: GitStack; readonly store: Store }> {
  const directory = await makeDirectory();
  const stack = await makeGitStack(directory);
  const store = useStore(join(directory, "store"), {
    pullRequests: fakePullRequests(pulls(stack)),
  });
  await store.init();
  return { stack, store };
}

async function withFakeGh<T>({
  directory,
  operation,
  responses,
}: {
  directory: string;
  operation: () => Promise<T>;
  responses: Readonly<Record<number, string>>;
}): Promise<T> {
  const bin = join(directory, "bin");
  await mkdir(bin);
  const cases = Object.entries(responses)
    .map(
      ([pr, body]) =>
        `  "api repos/{owner}/{repo}/pulls/${pr}") printf '%s\\n' '${body}' ;;`
    )
    .join("\n");
  const gh = join(bin, "gh");
  await writeFile(
    gh,
    `#!/usr/bin/env bash
case "$*" in
${cases}
  *) printf 'unexpected gh arguments: %s\\n' "$*" >&2; exit 2 ;;
esac
`
  );
  await chmod(gh, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath ?? ""}`;
  try {
    return await operation();
  } finally {
    process.env.PATH = originalPath;
  }
}

function restPull({
  base,
  head,
  mergedAt = null,
  sha,
  state,
}: {
  base: string;
  head: string;
  mergedAt?: string | null;
  sha: string;
  state: "open" | "closed";
}): string {
  return JSON.stringify({
    state,
    merged_at: mergedAt,
    head: { ref: head, sha },
    base: { ref: base },
  });
}

async function makeLeadCheckout(directory: string): Promise<{
  readonly repo: string;
  readonly remote: string;
  readonly store: string;
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
  return {
    repo,
    remote,
    store: join(repo, ".claude", "jrzstack", "orchestrate", "demo"),
  };
}

function runCli(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env
): RunResult {
  const result = Bun.spawnSync([process.execPath, SCRIPT, ...args], { env });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

afterEach(async () => {
  for (const store of handles.splice(0).reverse()) {
    await store.close();
  }
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("Store", () => {
  it("initializes an idempotent plain-file store and releases its lock", async () => {
    const directory = await makeDirectory();
    const store = useStore(directory);

    expect(await store.init()).toEqual({ store: directory });
    const firstUnits = await readFile(join(directory, "units.tsv"), "utf8");
    const firstLedger = await readFile(
      join(directory, "ledger.tsv"),
      "utf8"
    );

    expect(await store.init()).toEqual({ store: directory });
    expect(await readFile(join(directory, "units.tsv"), "utf8")).toBe(
      firstUnits
    );
    expect(await readFile(join(directory, "ledger.tsv"), "utf8")).toBe(
      firstLedger
    );
    expect((await readdir(directory)).sort()).toEqual([
      ".orch.lock",
      "frontier.json",
      "gates.md",
      "inbox",
      "ledger.tsv",
      "preferences.md",
      "units.tsv",
    ]);

    await store.close();
    expect(await readdir(directory)).not.toContain(".orch.lock");
  });

  it("composes unit add, set, get, list, and counts", async () => {
    const { store } = await initializedStore();

    expect(
      await store.units.add({
        id: "u1",
        track: "build",
        brief: "briefs/u1.md",
      })
    ).toMatchObject({ id: "u1", state: "pending" });
    expect(
      await store.units.add({ id: "=SUM(A1)", track: "+build" })
    ).toMatchObject({ id: "'=SUM(A1)", track: "'+build" });

    const updated = await store.units.set({
      id: "u1",
      state: "done",
      branch: "savvy/u1",
      pr: 184530,
      sha: "abc123",
    });
    expect(updated).toEqual({
      id: "u1",
      track: "build",
      state: "done",
      branch: "savvy/u1",
      pr: "184530",
      sha: "abc123",
      brief: "briefs/u1.md",
    });
    expect(await store.units.get("u1")).toEqual(updated);
    expect(
      await store.units.list({ state: "done", track: "build" })
    ).toEqual([updated]);
    expect(await store.units.counts()).toEqual({ done: 1, pending: 1 });
    await expect(
      store.units.add({ id: "u1", track: "build" })
    ).rejects.toThrow("unit u1 already exists");
    await expect(
      store.units.set({ id: "missing", state: "done" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("records, replaces, checks, and summarizes typed ledger verdicts", async () => {
    const { store } = await initializedStore();

    try {
      await store.ledger.check({ pr: 184530, sha: "abc123" });
      throw new Error("expected ledger check to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundError);
      if (error instanceof NotFoundError) {
        expect(error.output).toEqual({
          compact: "NOT-VERIFIED",
          json: {
            pr: "184530",
            sha: "abc123",
            verdict: "NOT-VERIFIED",
          },
        });
      }
    }
    expect(() => parseVerdict("looks-good")).toThrow("verdict must be");

    const recorded = await store.ledger.record({
      pr: 184530,
      sha: "abc123",
      verdict: "unit-test-verified",
      evidence: "reports/verify.md",
      verifier: "opus",
    });
    expect(await store.ledger.check({ pr: 184530, sha: "abc123" })).toEqual(
      recorded
    );
    expect(await store.ledger.summary()).toEqual({
      "unit-test-verified": 1,
    });

    await store.ledger.record({
      pr: 184530,
      sha: "abc123",
      verdict: "live-ui-verified",
      evidence: "reports/live.md",
    });
    expect(await store.ledger.summary()).toEqual({
      "live-ui-verified": 1,
    });
  });

  it("pushes, peeks, and atomically drains inbox pointers", async () => {
    const { directory, store } = await initializedStore();

    const first = await store.inbox.push({
      agent: "worker-1",
      unit: "u1",
      status: "done",
      report: "reports/u1.md",
    });
    expect(first.pointer).toMatchObject({ unit: "u1", status: "done" });
    expect(first.filename).toEndWith(".tsv");
    await store.inbox.push({
      agent: "worker-2",
      unit: "u2",
      status: "failed",
    });

    expect(await store.inbox.count()).toBe(2);
    expect(await store.inbox.peek()).toHaveLength(2);
    expect(await store.inbox.count()).toBe(2);
    expect(await store.inbox.drain()).toHaveLength(2);
    expect(await store.inbox.count()).toBe(0);
    expect(await readdir(join(directory, "inbox"))).toEqual([]);
    expect(
      (await readdir(directory)).filter((name) =>
        name.startsWith(".inbox-drain-")
      )
    ).toEqual([]);
  });

  it("replaces a stale lock whose holder pid is dead", async () => {
    const { directory } = await initializedStore();
    const exited = Bun.spawn(["true"]);
    await exited.exited;
    await writeFile(join(directory, ".orch.lock"), `${exited.pid}\n`);

    const stale: string[] = [];
    const recovered = useStore(directory, {
      onStaleLock: (holder) => stale.push(holder),
    });
    expect(
      await recovered.units.add({ id: "u1", track: "build" })
    ).toMatchObject({ id: "u1" });
    expect(stale).toEqual([String(exited.pid)]);
    await recovered.close();
    expect(await readdir(directory)).not.toContain(".orch.lock");
  });

  it("blocks a writer and steals the pid lock only with force", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    await writeFile(join(directory, ".orch.lock"), `${process.pid}\n`);

    const blocked = useStore(directory);
    await expect(
      blocked.units.add({ id: "u1", track: "build" })
    ).rejects.toThrow(`store lock held by pid ${process.pid}`);

    const stolen: string[] = [];
    const forced = useStore(directory, {
      force: true,
      onLockStolen: (holder) => stolen.push(holder),
    });
    expect(
      await forced.units.add({ id: "u1", track: "build" })
    ).toMatchObject({ id: "u1" });
    expect(stolen).toEqual([String(process.pid)]);
    await forced.close();
    expect(await readdir(directory)).not.toContain(".orch.lock");
  });

  it("parks gates, stores standing orders, and renders status", async () => {
    const { directory, store } = await initializedStore();
    await store.units.add({ id: "u1", track: "build" });
    expect(
      await store.gates.park({
        id: "release",
        question: "Ship now?",
        options: "ship,wait",
        defaultAnswer: "wait",
      })
    ).toMatchObject({ kind: "open", id: "release" });
    expect(
      await store.standing.add({ line: "Never force push." })
    ).toEqual({ number: 1, line: "Never force push." });

    const first = await store.status.render();
    expect(first.changed).toBe("first render");
    expect(first.summary.openGateIds).toEqual(["release"]);
    expect(await readFile(join(directory, "status.md"), "utf8")).toContain(
      "| release | open | Ship now? |"
    );
    expect((await store.status.render()).changed).toBe("no derived changes");

    expect(
      await store.gates.resolve({ id: "release", answer: "ship" })
    ).toMatchObject({ kind: "resolved", answer: "ship" });
    expect((await store.status.render()).changed).toBe("open gates 1->0");
    expect(await store.gates.list()).toEqual([]);
    expect(await store.standing.show()).toEqual([
      { number: 1, line: "Never force push." },
    ]);
  });

  it("resolves the stacker's declared order into a frontier from REST and git", async () => {
    const restMergedSha = "a".repeat(40);
    const restClosedSha = "b".repeat(40);
    const { stack, store } = await stackStore((stack) => ({
      10: { state: "MERGED", head: "stack/merged", base: "main", sha: restMergedSha },
      13: { state: "CLOSED", head: "stack/closed", base: "stack/merged", sha: restClosedSha },
      11: { state: "OPEN", head: "stack/open", base: "main", sha: stack.openSha },
    }));
    git({ repo: stack.repo, args: ["checkout", "--quiet", "main"] });
    git({ repo: stack.repo, args: ["branch", "-D", "stack/merged"] });

    expect(
      await store.frontier.set({ repo: stack.repo, prs: [10, 13, 11] })
    ).toEqual({
      generation: 1,
      prs: [
        { pr: 10, branches: "stack/merged", sha: restMergedSha, state: "MERGED" },
        { pr: 13, branches: "stack/closed", sha: restClosedSha, state: "CLOSED" },
        { pr: 11, branches: "stack/open", sha: stack.openSha, state: "OPEN" },
      ],
      lowestUnmerged: 11,
    });

    const again = await store.frontier.set({ repo: stack.repo });
    expect(again.generation).toBe(2);
    expect(again.prs.map((row) => row.pr)).toEqual([10, 13, 11]);
    expect((await store.frontier.show()).generation).toBe(2);
    await expect(
      store.frontier.set({ repo: stack.repo, prs: [10, 10] })
    ).rejects.toThrow("--prs must not contain duplicates");
  });

  it("takes an open PR's head from origin when it has no local branch", async () => {
    const { stack, store } = await stackStore((stack) => ({
      11: { state: "OPEN", head: "stack/open", base: "main", sha: stack.openSha },
    }));
    git({ repo: stack.repo, args: ["checkout", "--quiet", "main"] });
    git({
      repo: stack.repo,
      args: ["update-ref", "refs/remotes/origin/stack/open", stack.openSha],
    });
    git({ repo: stack.repo, args: ["branch", "-D", "stack/open"] });

    expect(
      (await store.frontier.set({ repo: stack.repo, prs: [11] })).prs
    ).toEqual([
      { pr: 11, branches: "stack/open", sha: stack.openSha, state: "OPEN" },
    ]);
  });

  it("fails frontier set when this checkout's head of an open PR is not GitHub's", async () => {
    const restSha = "c".repeat(40);
    const { stack, store } = await stackStore(() => ({
      11: { state: "OPEN", head: "stack/open", base: "main", sha: restSha },
    }));

    await expect(
      store.frontier.set({ repo: stack.repo, prs: [11] })
    ).rejects.toThrow(
      `PR #11's head on GitHub is ${restSha}, but this checkout has ${stack.openSha} for stack/open; fetch or push it`
    );
  });

  it("fails frontier set when an open PR's base has drifted from its parent", async () => {
    const { stack, store } = await stackStore((stack) => ({
      10: { state: "OPEN", head: "stack/merged", base: "main", sha: stack.mergedSha },
      13: { state: "CLOSED", head: "stack/closed", base: "stack/merged", sha: stack.closedSha },
      11: { state: "OPEN", head: "stack/open", base: "stack/closed", sha: stack.openSha },
      12: { state: "OPEN", head: "stack/open", base: "main", sha: stack.openSha },
    }));

    await expect(
      store.frontier.set({ repo: stack.repo, prs: [10, 13, 11] })
    ).rejects.toThrow(
      "frontier base drift: PR #11 targets stack/closed, expected stack/merged"
    );
    await expect(
      store.frontier.set({ repo: stack.repo, prs: [10, 12] })
    ).rejects.toThrow(
      "frontier base drift: PR #12 targets main, expected stack/merged"
    );
    expect(await store.frontier.show()).toEqual({
      generation: 0,
      prs: [],
      lowestUnmerged: null,
    });
  });

  it("refuses frontier set with no declared order in the store", async () => {
    const { stack, store } = await stackStore(() => ({}));

    await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
      "no stack order in the store; declare it with --prs <n,...>"
    );
  });

  it("reads PR state from gh api by default", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);
    const mergedSha = "a".repeat(40);
    const closedSha = "b".repeat(40);

    await withFakeGh({
      directory,
      responses: {
        10: restPull({
          state: "closed",
          mergedAt: "2026-10-01T00:00:00Z",
          head: "stack/merged",
          base: "main",
          sha: mergedSha,
        }),
        13: restPull({
          state: "closed",
          head: "stack/closed",
          base: "stack/merged",
          sha: closedSha,
        }),
        11: restPull({
          state: "open",
          head: "stack/open",
          base: "main",
          sha: stack.openSha,
        }),
        14: "not json",
      },
      operation: async () => {
        expect(
          (await store.frontier.set({ repo: stack.repo, prs: [10, 13, 11] }))
            .prs
        ).toEqual([
          { pr: 10, branches: "stack/merged", sha: mergedSha, state: "MERGED" },
          { pr: 13, branches: "stack/closed", sha: closedSha, state: "CLOSED" },
          { pr: 11, branches: "stack/open", sha: stack.openSha, state: "OPEN" },
        ]);
        await expect(
          store.frontier.set({ repo: stack.repo, prs: [14] })
        ).rejects.toThrow("gh api returned invalid JSON for pull request #14");
        await expect(
          store.frontier.set({ repo: stack.repo, prs: [15] })
        ).rejects.toThrow("gh api pull request #15 failed");
      },
    });
  });

  it("rejects malformed TSV, verdict, frontier, and inbox data", async () => {
    const { directory, store } = await initializedStore();

    await writeFile(join(directory, "units.tsv"), "wrong\n");
    await expect(store.units.list()).rejects.toThrow(
      "units.tsv has an invalid header"
    );
    await writeFile(
      join(directory, "units.tsv"),
      "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\nshort\trow\n"
    );
    await expect(store.units.list()).rejects.toThrow(
      "units.tsv has a malformed row"
    );

    await writeFile(
      join(directory, "ledger.tsv"),
      "pr\tsha\tverdict\tevidence\tverifier\tts\n1\tsha\tinvalid\treport\tme\tnow\n"
    );
    await expect(store.ledger.summary()).rejects.toThrow(
      "ledger.tsv has invalid verdict invalid"
    );

    await writeFile(join(directory, "frontier.json"), '{"generation":"1"}\n');
    await expect(store.frontier.show()).rejects.toThrow(
      "frontier.json has an invalid shape"
    );

    await writeFile(join(directory, "inbox", "bad.tsv"), "too\tshort\n");
    await expect(store.inbox.peek()).rejects.toThrow(
      "inbox pointer bad.tsv is malformed"
    );
  });

  it("rejects operations after close", async () => {
    const { store } = await initializedStore();
    await store.close();
    await expect(store.units.list()).rejects.toThrow("store is closed");
    await expect(store.status.render()).rejects.toBeInstanceOf(UserError);
  });
});

describe("Store branch", () => {
  it("excludes the store from git at init, once", async () => {
    const lead = await makeLeadCheckout(await makeDirectory());
    const store = useStore(lead.store);

    await store.init();
    await store.init();

    const exclude = await readFile(
      join(lead.repo, ".git", "info", "exclude"),
      "utf8"
    );
    expect(
      exclude
        .split("\n")
        .filter((line) => line === "/.claude/jrzstack/orchestrate/demo/")
    ).toHaveLength(1);
    expect(
      git({ repo: lead.repo, args: ["status", "--porcelain", "--untracked-files=all"] })
    ).toBe("");
  });

  it("commits the drained store to its orphan branch by plumbing and pushes it", async () => {
    const lead = await makeLeadCheckout(await makeDirectory());
    const store = useStore(lead.store);
    await store.init();
    await store.units.add({ id: "u1", track: "build" });
    await store.inbox.push({
      agent: "worker-1",
      unit: "u1",
      status: "done",
    });
    // status refreshes the index's stat cache; settle it before comparing bytes.
    git({ repo: lead.repo, args: ["status", "--porcelain"] });
    const indexPath = join(lead.repo, ".git", "index");
    const indexBefore = await readFile(indexPath);
    const headBefore = git({ repo: lead.repo, args: ["rev-parse", "HEAD"] });

    expect(await store.inbox.drain()).toHaveLength(1);

    const branch = "refs/heads/jrzstack/orchestrate/demo";
    const remoteGit = (args: readonly string[]): string =>
      git({ repo: lead.remote, args });
    const first = remoteGit(["rev-parse", branch]);
    expect(remoteGit(["rev-list", "--parents", "-n", "1", first])).toBe(first);
    expect(
      remoteGit(["ls-tree", "-r", "--name-only", first]).split("\n")
    ).toEqual([
      "frontier.json",
      "gates.md",
      "ledger.tsv",
      "preferences.md",
      "units.tsv",
    ]);
    expect(remoteGit(["show", `${first}:units.tsv`])).toContain("u1\tbuild\tpending");

    expect(await readFile(indexPath)).toEqual(indexBefore);
    expect(git({ repo: lead.repo, args: ["rev-parse", "HEAD"] })).toBe(headBefore);
    expect(git({ repo: lead.repo, args: ["symbolic-ref", "HEAD"] })).toBe(
      "refs/heads/main"
    );
    expect(
      git({ repo: lead.repo, args: ["status", "--porcelain", "--untracked-files=all"] })
    ).toBe("");
    expect(
      git({ repo: lead.repo, args: ["worktree", "list", "--porcelain"] })
        .split("\n")
        .filter((line) => line.startsWith("worktree "))
    ).toHaveLength(1);

    await store.units.set({ id: "u1", state: "done" });
    expect(await store.inbox.drain()).toEqual([]);
    const second = remoteGit(["rev-parse", branch]);
    expect(remoteGit(["rev-list", "--parents", "-n", "1", second])).toBe(
      `${second} ${first}`
    );
    expect(remoteGit(["ls-tree", "-r", "--name-only", second])).not.toContain(
      "inbox/"
    );
    expect(remoteGit(["show", `${second}:units.tsv`])).toContain("u1\tbuild\tdone");

    await store.inbox.drain();
    expect(remoteGit(["rev-parse", branch])).toBe(second);
  });

  it("builds on the remote store branch when it has moved on", async () => {
    const directory = await makeDirectory();
    const lead = await makeLeadCheckout(directory);
    const store = useStore(lead.store);
    await store.init();
    await store.inbox.drain();
    const other = join(directory, "other");
    git({
      repo: directory,
      args: ["clone", "--quiet", "--branch", "jrzstack/orchestrate/demo", lead.remote, other],
    });
    git({ repo: other, args: ["config", "user.name", "Orch Test"] });
    git({ repo: other, args: ["config", "user.email", "orch@example.com"] });
    await writeFile(join(other, "units.tsv"), "moved\n");
    git({ repo: other, args: ["commit", "--quiet", "-am", "moved"] });
    git({ repo: other, args: ["push", "--quiet", "origin", "HEAD"] });
    const moved = git({ repo: other, args: ["rev-parse", "HEAD"] });

    await store.units.add({ id: "u1", track: "build" });
    expect(await store.inbox.drain()).toEqual([]);

    const branch = "refs/heads/jrzstack/orchestrate/demo";
    const head = git({ repo: lead.remote, args: ["rev-parse", branch] });
    expect(git({ repo: lead.remote, args: ["rev-parse", `${head}^`] })).toBe(moved);
    expect(git({ repo: lead.remote, args: ["show", `${head}:units.tsv`] })).toContain(
      "u1\tbuild\tpending"
    );
  });

  it("drains nothing when the store branch cannot be pushed", async () => {
    const lead = await makeLeadCheckout(await makeDirectory());
    git({ repo: lead.repo, args: ["remote", "remove", "origin"] });
    const store = useStore(lead.store);
    await store.init();
    await store.inbox.push({ agent: "worker-1", unit: "u1", status: "done" });

    await expect(store.inbox.drain()).rejects.toThrow(
      "pushing jrzstack/orchestrate/demo failed"
    );
    expect(await store.inbox.count()).toBe(1);
  });
});

describe("orch CLI", () => {
  it("prints commander help and rejects invalid parsing with exit 1", async () => {
    const help = runCli(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Commands:");
    expect(help.stdout).toContain("unit");
    expect(help.stdout).toContain("ledger");

    const frontierHelp = runCli(["frontier", "set", "--help"]);
    expect(frontierHelp.code).toBe(0);
    expect(frontierHelp.stdout).toContain("--repo <dir>");
    expect(frontierHelp.stdout).toContain("--prs <n,...>");

    const directory = await makeDirectory();
    const invalid = runCli(["--store", directory, "unit", "add", "u1"]);
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toContain("required option '--track <track>'");
  });

  it("accepts ORCH_STORE and emits complete JSON", async () => {
    const directory = await makeDirectory();
    const env = { ...process.env, ORCH_STORE: directory };
    expect(runCli(["init"], env).code).toBe(0);

    const added = runCli(
      ["unit", "add", "u1", "--track", "build", "--json"],
      env
    );
    expect(added.code).toBe(0);
    expect(JSON.parse(added.stdout)).toEqual({
      id: "u1",
      track: "build",
      state: "pending",
      branch: "",
      pr: "",
      sha: "",
      brief: "",
    });
  });

  it("maps user and not-found outcomes to the preserved exit codes", async () => {
    const directory = await makeDirectory();
    expect(runCli(["--store", directory, "init"]).code).toBe(0);

    const missingRepo = runCli([
      "--store",
      directory,
      "frontier",
      "set",
    ]);
    expect(missingRepo.code).toBe(1);
    expect(missingRepo.stderr).toContain(
      "set --repo <dir> or ORCH_REPO"
    );

    const userError = runCli([
      "--store",
      directory,
      "unit",
      "add",
      "",
      "--track",
      "build",
    ]);
    expect(userError.code).toBe(1);
    expect(userError.stderr).toContain("unit id must not be empty");

    const missingUnit = runCli([
      "--store",
      directory,
      "unit",
      "get",
      "missing",
    ]);
    expect(missingUnit.code).toBe(2);
    expect(missingUnit.stderr).toContain("unit missing not found");

    const missingLedger = runCli([
      "--store",
      directory,
      "--json",
      "ledger",
      "check",
      "184530",
      "abc123",
    ]);
    expect(missingLedger.code).toBe(2);
    expect(JSON.parse(missingLedger.stdout)).toEqual({
      pr: "184530",
      sha: "abc123",
      verdict: "NOT-VERIFIED",
    });
    expect(missingLedger.stderr).toBe("");
  });

  it("runs under Node's type stripping", async () => {
    const node = Bun.which("node");
    if (node === null) {
      throw new Error("node is not on PATH; this test needs Node 22.18+");
    }
    const directory = await makeDirectory();
    const run = (args: readonly string[]) =>
      Bun.spawnSync([node, SCRIPT, "--store", directory, ...args]);

    const init = run(["init"]);
    expect(init.stderr.toString()).toBe("");
    expect(init.exitCode).toBe(0);
    const added = run(["unit", "add", "u1", "--track", "build", "--json"]);
    expect(added.exitCode).toBe(0);
    expect(JSON.parse(added.stdout.toString())).toMatchObject({ id: "u1" });
    const missing = run(["unit", "get", "missing"]);
    expect(missing.exitCode).toBe(2);
    expect(missing.stderr.toString()).toContain("unit missing not found");
  });
});
