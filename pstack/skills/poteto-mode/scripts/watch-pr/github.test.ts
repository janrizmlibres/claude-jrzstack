import { describe, expect, it } from "bun:test";
import {
  ChecksUnavailable,
  FallbackGitHubReader,
  GraphQLRefused,
  RestGitHubReader,
  WatcherQueryError,
  buildReviewThreads,
  commandError,
  mapRollupNode,
  orderStack,
  parseFastCheck,
  parsePullRequest,
  parseReviewThreadPage,
  resolveChecks,
  resolveContext,
  resolveReviewThreads,
} from "./github.ts";
import {
  type CcrThread,
  type FakeRestOptions,
  type RestComment,
  fakeReader,
  fakeRestApi,
  failedCheck,
  passingCheck,
  pendingCheck,
} from "./fakes.test-helper.ts";
import { classifyPr, readSnapshot } from "./policy.ts";
import type { GitHubReader, PrContext } from "./types.ts";
import { parsePrNumber } from "./types.ts";

const context = {
  owner: "owner",
  repo: "repo",
  number: parsePrNumber(42),
};

describe("checks fallback chain", () => {
  it("uses a non-empty fast-path result without a rollup query", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [passingCheck("fast")] },
    });
    const read = await resolveChecks(reader, context);
    expect(read.source).toBe("gh-pr-checks");
    expect(read.checks.map((check) => check.name)).toEqual(["fast"]);
    expect(reader.calls).toEqual(["checksFastPath"]);
  });

  it("paginates GraphQL when the fast path is unusable", async () => {
    const reader = fakeReader({
      fastPath: { kind: "unusable", exitCode: 8, stderr: "" },
      rollupPages: [
        { checks: [passingCheck("first")], endCursor: "next" },
        { checks: [failedCheck("second")], endCursor: null },
      ],
    });
    const read = await resolveChecks(reader, context);
    expect(read.source).toBe("graphql-rollup");
    expect(read.checks.map((check) => check.name)).toEqual(["first", "second"]);
    expect(reader.calls).toEqual([
      "checksFastPath",
      "checkRollupPage:null",
      "checkRollupPage:next",
    ]);
  });

  it("falls back when valid fast-path JSON represented an empty list", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [] },
      rollupPages: [{ checks: [pendingCheck("fallback")], endCursor: null }],
    });
    expect((await resolveChecks(reader, context)).checks[0].name).toBe(
      "fallback"
    );
    expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
  });

  it("fails closed when both paths are empty", async () => {
    const reader = fakeReader({
      fastPath: {
        kind: "unusable",
        exitCode: 8,
        stderr: "credential cannot read checks",
      },
    });
    await expect(resolveChecks(reader, context)).rejects.toBeInstanceOf(
      ChecksUnavailable
    );
    expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
  });
});

describe("rollup node mapping", () => {
  it("maps terminal and non-terminal CheckRun states fail closed", () => {
    const cases = [
      ["IN_PROGRESS", null, "pending", "PENDING"],
      ["COMPLETED", "SUCCESS", "passed", "SUCCESS"],
      ["COMPLETED", "NEUTRAL", "skipped", "NEUTRAL"],
      ["COMPLETED", "SKIPPED", "skipped", "SKIPPED"],
      ["COMPLETED", "ACTION_REQUIRED", "failed", "ACTION_REQUIRED"],
      ["COMPLETED", "TIMED_OUT", "failed", "FAILURE"],
      ["COMPLETED", "FUTURE_VALUE", "failed", "FAILURE"],
    ] as const;
    for (const [status, conclusion, kind, reportedState] of cases) {
      expect(
        mapRollupNode({
          __typename: "CheckRun",
          name: "ci",
          status,
          conclusion,
        })
      ).toMatchObject({ kind, reportedState });
    }
  });

  it("classifies an in-progress Code Review Gate from the rollup as the gate", () => {
    expect(
      mapRollupNode({
        __typename: "CheckRun",
        name: "Code Review Gate",
        status: "IN_PROGRESS",
        conclusion: null,
      })
    ).toMatchObject({ kind: "code-review-gate" });
    expect(
      mapRollupNode({
        __typename: "StatusContext",
        context: "Code Review Gate",
        state: "PENDING",
      })
    ).toMatchObject({ kind: "code-review-gate" });
  });

  it("classifies a Code Review Gate waiting on an owner approval as the gate", () => {
    expect(
      mapRollupNode({
        __typename: "CheckRun",
        name: "Code Review Gate",
        status: "COMPLETED",
        conclusion: "ACTION_REQUIRED",
        description: "1 of 2 policies",
      })
    ).toMatchObject({
      kind: "code-review-gate",
      reportedState: "ACTION_REQUIRED",
    });
  });

  it("classifies a fast-path Code Review Gate waiting on an owner approval as the gate", () => {
    expect(
      parseFastCheck({
        name: "Code Review Gate",
        state: "ACTION_REQUIRED",
        bucket: "fail",
      })
    ).toMatchObject({
      kind: "code-review-gate",
      reportedState: "ACTION_REQUIRED",
    });
    expect(
      parseFastCheck({ name: "ci", state: "ACTION_REQUIRED", bucket: "fail" })
    ).toMatchObject({ kind: "failed", reportedState: "ACTION_REQUIRED" });
  });

  it("maps StatusContext states and drops unknown typenames", () => {
    expect(
      mapRollupNode({
        __typename: "StatusContext",
        context: "ci",
        state: "EXPECTED",
      })
    ).toMatchObject({ kind: "pending", reportedState: "PENDING" });
    expect(
      mapRollupNode({
        __typename: "StatusContext",
        context: "ci",
        state: "FUTURE_VALUE",
      })
    ).toMatchObject({ kind: "failed", reportedState: "FUTURE_VALUE" });
    expect(mapRollupNode({ __typename: "FutureNode" })).toBeNull();
  });
});

describe("closed enum parsing", () => {
  const rawPullRequest = {
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "head",
    headRefName: "feature",
    baseRefName: "main",
    state: "OPEN",
    mergedAt: null,
    isDraft: false,
  };

  it("accepts mergeStateStatus CONFLICTING", () => {
    expect(
      parsePullRequest(
        { ...rawPullRequest, mergeStateStatus: "CONFLICTING" },
        context
      ).mergeStateStatus
    ).toBe("CONFLICTING");
  });

  it("reads gh's empty reviewDecision as no decision rather than a parse failure", () => {
    expect(
      parsePullRequest({ ...rawPullRequest, reviewDecision: "" }, context)
        .reviewDecision
    ).toBeNull();
  });

  it("still rejects an unknown reviewDecision", () => {
    expect(() =>
      parsePullRequest({ ...rawPullRequest, reviewDecision: "MAYBE" }, context)
    ).toThrow(WatcherQueryError);
  });

  it("rejects unknown enum values as retryable errors carrying the raw value", () => {
    try {
      parsePullRequest(
        { ...rawPullRequest, mergeStateStatus: "FUTURE_STATE" },
        context
      );
      throw new Error("expected parser to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WatcherQueryError);
      if (!(error instanceof WatcherQueryError)) throw error;
      expect(error.failure).toMatchObject({
        kind: "missing-key",
        retryable: true,
        rawValue: '"FUTURE_STATE"',
      });
    }
  });
});

it("annotates Bugbot threads with distinct review-pass counts", () => {
  const response = {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: "one",
                isResolved: false,
                comments: {
                  nodes: [
                    {
                      body: "RUN_ID: run-1",
                      createdAt: "now",
                      path: "a.ts",
                      line: 1,
                      author: { login: "bugbot" },
                    },
                  ],
                },
              },
              {
                id: "two",
                isResolved: false,
                comments: {
                  nodes: [
                    {
                      body: "CURSOR_AUTOMATION_ID: run-2 severity high",
                      createdAt: "now",
                      path: null,
                      line: null,
                      author: { login: "cursor" },
                    },
                  ],
                },
              },
              {
                id: "resolved",
                isResolved: true,
                comments: {
                  nodes: [
                    {
                      body: "RUN_ID: run-3",
                      createdAt: "now",
                      path: null,
                      line: null,
                      author: { login: "bugbot" },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  };
  const threads = buildReviewThreads(parseReviewThreadPage(response).threads);
  expect(threads).toHaveLength(2);
  expect(threads.map((thread) => thread.isBugbot)).toEqual([true, true]);
  expect(threads.map((thread) => thread.bugbotReviewPasses)).toEqual([3, 3]);
});

describe("review thread pagination", () => {
  const thread = (id: string, resolved = false) => ({
    id,
    firstComment: {
      authorLogin: "someone",
      body: "please fix",
      path: "a.ts",
      line: 1,
      createdAt: "now",
    },
    resolved,
  });

  it("keeps walking pages until the cursor is exhausted", async () => {
    const reader = fakeReader({
      threadPages: [
        { threads: [thread("one")], endCursor: "next" },
        { threads: [thread("two")], endCursor: "last" },
        { threads: [thread("three")], endCursor: null },
      ],
    });
    const threads = await resolveReviewThreads(reader, context);
    expect(threads.map((item) => item.id)).toEqual(["one", "two", "three"]);
    expect(reader.calls).toEqual([
      "reviewThreadPage:null",
      "reviewThreadPage:next",
      "reviewThreadPage:last",
    ]);
  });

  it("sees an unresolved thread that sits past the first page", async () => {
    const reader = fakeReader({
      threadPages: [
        { threads: [thread("early", true)], endCursor: "next" },
        { threads: [thread("late")], endCursor: null },
      ],
    });
    const threads = await resolveReviewThreads(reader, context);
    expect(threads.map((item) => item.id)).toEqual(["late"]);
  });

  it("stops after a single page when the cursor is exhausted", async () => {
    const reader = fakeReader({
      threadPages: [{ threads: [thread("only")], endCursor: null }],
    });
    expect((await resolveReviewThreads(reader, context)).length).toBe(1);
    expect(reader.calls).toEqual(["reviewThreadPage:null"]);
  });

  it("counts Bugbot review passes across every page", async () => {
    const bugbot = (id: string, runId: string) => ({
      id,
      firstComment: {
        authorLogin: "bugbot",
        body: `RUN_ID: ${runId}`,
        path: "a.ts",
        line: 1,
        createdAt: "now",
      },
      resolved: false,
    });
    const reader = fakeReader({
      threadPages: [
        { threads: [bugbot("one", "run-1")], endCursor: "next" },
        { threads: [bugbot("two", "run-2")], endCursor: null },
      ],
    });
    const threads = await resolveReviewThreads(reader, context);
    expect(threads.map((item) => item.bugbotReviewPasses)).toEqual([2, 2]);
  });

  it("drops resolved threads from later pages too", async () => {
    const reader = fakeReader({
      threadPages: [
        { threads: [thread("one")], endCursor: "next" },
        { threads: [thread("two", true)], endCursor: null },
      ],
    });
    expect(
      (await resolveReviewThreads(reader, context)).map((item) => item.id)
    ).toEqual(["one"]);
  });

  it("rejects a page that omits pageInfo instead of assuming one page", async () => {
    const response = {
      data: {
        repository: {
          pullRequest: { reviewThreads: { nodes: [] } },
        },
      },
    };
    expect(() => parseReviewThreadPage(response)).toThrow(WatcherQueryError);
  });
});

describe("context and stack discovery", () => {
  it("returns a fully explicit context without any reader call", async () => {
    const reader = fakeReader();
    expect(
      await resolveContext({
        reader,
        owner: "explicit",
        repo: "repo",
        pr: context.number,
      })
    ).toEqual({ owner: "explicit", repo: "repo", number: context.number });
    expect(reader.calls).toEqual([]);
  });

  it("uses the local origin before currentPr for an explicit number", async () => {
    const reader = fakeReader({ origin: { owner: "local", repo: "checkout" } });
    expect(
      await resolveContext({
        reader,
        owner: null,
        repo: null,
        pr: context.number,
      })
    ).toEqual({ owner: "local", repo: "checkout", number: context.number });
    expect(reader.calls).toEqual(["originRepo"]);
  });

  it("orders the connected stack bottom-to-top", () => {
    const ordered = orderStack(context, [
      {
        number: parsePrNumber(41),
        headRefName: "base-feature",
        baseRefName: "main",
      },
      {
        number: context.number,
        headRefName: "feature",
        baseRefName: "base-feature",
      },
      {
        number: parsePrNumber(43),
        headRefName: "upstack",
        baseRefName: "feature",
      },
    ]);
    expect(ordered.map((item) => Number(item.number))).toEqual([41, 42, 43]);
  });
});

const pr1: PrContext = {
  owner: "owner",
  repo: "repo",
  number: parsePrNumber(1),
};
const restReader = (options: FakeRestOptions = {}) => {
  const api = fakeRestApi(options);
  return { api, reader: new RestGitHubReader(api) };
};
const restComment = (
  id: number,
  login: string,
  body = "please fix",
  line: number | null = 3
): RestComment => ({
  id,
  user: { login },
  body,
  path: "a.ts",
  line,
  created_at: "2026-10-08T00:00:00Z",
});
const ccrThread = (
  ids: readonly number[],
  state: { resolved?: boolean; outdated?: boolean } = {}
): CcrThread => ({
  resolved: state.resolved ?? false,
  outdated: state.outdated ?? false,
  path: "a.ts",
  line: state.outdated ? null : 3,
  comment_ids: ids,
});

describe("REST reader", () => {
  it("reads a pull request's facts from REST", async () => {
    const { reader } = restReader({
      pull: { mergeable_state: "blocked", draft: true },
    });
    expect(await reader.pullRequest(pr1)).toEqual({
      context: pr1,
      mergeable: "MERGEABLE",
      mergeStateStatus: "BLOCKED",
      reviewDecision: "APPROVED",
      headRefOid: "head",
      headRefName: "feature",
      baseRefName: "main",
      state: "OPEN",
      mergedAt: null,
      isDraft: true,
    });
  });

  it("maps REST mergeability and state onto GraphQL's enums", async () => {
    const read = async (pull: Record<string, unknown>) =>
      restReader({ pull }).reader.pullRequest(pr1);
    expect(
      (await read({ mergeable: false, mergeable_state: "dirty" })).mergeable
    ).toBe("CONFLICTING");
    expect(
      (await read({ mergeable: null, mergeable_state: "unknown" })).mergeable
    ).toBe("UNKNOWN");
    expect(
      await read({ state: "closed", merged_at: "2026-10-08T00:00:00Z" })
    ).toMatchObject({ state: "MERGED", mergedAt: "2026-10-08T00:00:00Z" });
    expect((await read({ state: "closed" })).state).toBe("CLOSED");
  });

  it("fails closed on a mergeable_state it does not know", async () => {
    const { reader } = restReader({
      pull: { mergeable_state: "future_state" },
    });
    await expect(reader.pullRequest(pr1)).rejects.toMatchObject({
      failure: { kind: "missing-key", retryable: true },
    });
  });

  it("derives the review decision from each reviewer's latest decisive review", async () => {
    const decision = async (reviews: FakeRestOptions["reviews"]) =>
      (await restReader({ reviews }).reader.pullRequest(pr1)).reviewDecision;
    const by = (login: string, state: string) => ({ user: { login }, state });
    expect(await decision([])).toBeNull();
    expect(await decision([by("a", "COMMENTED")])).toBeNull();
    expect(
      await decision([by("a", "CHANGES_REQUESTED"), by("a", "APPROVED")])
    ).toBe("APPROVED");
    expect(await decision([by("a", "APPROVED"), by("a", "COMMENTED")])).toBe(
      "APPROVED"
    );
    expect(
      await decision([by("a", "APPROVED"), by("b", "CHANGES_REQUESTED")])
    ).toBe("CHANGES_REQUESTED");
    expect(
      await decision([by("a", "CHANGES_REQUESTED"), by("a", "DISMISSED")])
    ).toBeNull();
  });

  it("reads open review threads from /ccr/review_threads with each thread's first comment", async () => {
    const { reader, api } = restReader({
      threads: [
        ccrThread([10, 11]),
        ccrThread([20], { resolved: true }),
        ccrThread([30], { outdated: true }),
      ],
      comments: [
        restComment(10, "octocat", "first"),
        restComment(11, "octocat", "reply"),
        restComment(20, "octocat"),
        restComment(30, "octocat", "outdated", null),
      ],
    });
    const threads = await resolveReviewThreads(reader, pr1);
    expect(threads.map((thread) => thread.id)).toEqual(["10", "30"]);
    expect(threads[0].firstComment).toEqual({
      authorLogin: "octocat",
      body: "first",
      path: "a.ts",
      line: 3,
      createdAt: "2026-10-08T00:00:00Z",
    });
    expect(threads[1].firstComment?.line).toBeNull();
    expect(api.calls).toContain("repos/owner/repo/pulls/1/ccr/review_threads");
  });

  it("finds a thread's first comment on a later page of review comments", async () => {
    const comments = Array.from({ length: 150 }, (_, index) =>
      restComment(index + 1, "octocat", `comment ${index + 1}`)
    );
    const { reader } = restReader({ threads: [ccrThread([140])], comments });
    const [thread] = await resolveReviewThreads(reader, pr1);
    expect(thread.firstComment?.body).toBe("comment 140");
  });

  it("keeps a thread whose first comment is gone, with no first comment", async () => {
    const { reader } = restReader({ threads: [ccrThread([99])], comments: [] });
    expect(await resolveReviewThreads(reader, pr1)).toEqual([
      { id: "99", firstComment: null, isBugbot: false, bugbotReviewPasses: 0 },
    ]);
  });

  it("rejects a /ccr/ thread without the documented fields", async () => {
    const api = fakeRestApi();
    const reader = new RestGitHubReader({
      async get(path) {
        return path.endsWith("/ccr/review_threads")
          ? [{ outdated: false, comment_ids: [1] }]
          : api.get(path);
      },
    });
    await expect(resolveReviewThreads(reader, pr1)).rejects.toBeInstanceOf(
      WatcherQueryError
    );
  });

  it("reads every thread in one page and refuses a GraphQL cursor", async () => {
    const { reader, api } = restReader({
      threads: [ccrThread([10]), ccrThread([20])],
      comments: [restComment(10, "octocat"), restComment(20, "octocat")],
    });
    expect(await reader.reviewThreadPage(pr1, null)).toMatchObject({
      endCursor: null,
    });
    const before = api.calls.length;
    await expect(reader.reviewThreadPage(pr1, "cursor")).rejects.toBeInstanceOf(
      WatcherQueryError
    );
    expect(api.calls.length).toBe(before);
  });

  it("reads the head commit's check runs and statuses as checks", async () => {
    const { reader } = restReader({
      checkRuns: [
        { name: "build", status: "completed", conclusion: "success" },
        { name: "lint", status: "completed", conclusion: "failure" },
        { name: "e2e", status: "in_progress", conclusion: null },
        { name: "Code Review Gate", status: "queued", conclusion: null },
        { name: "docs", status: "completed", conclusion: "skipped" },
      ],
      statuses: [
        { context: "deploy", state: "pending", target_url: "https://ci" },
      ],
    });
    const read = await resolveChecks(reader, pr1);
    expect(read.checks.map((check) => [check.name, check.kind])).toEqual([
      ["build", "passed"],
      ["lint", "failed"],
      ["e2e", "pending"],
      ["Code Review Gate", "code-review-gate"],
      ["docs", "skipped"],
      ["deploy", "pending"],
    ]);
    expect(read.checks[5].link).toBe("https://ci");
  });

  it("fails closed when the head commit has no checks at all", async () => {
    const { reader } = restReader({ checkRuns: [], statuses: [] });
    await expect(resolveChecks(reader, pr1)).rejects.toBeInstanceOf(
      ChecksUnavailable
    );
  });

  it("rolls the head commit's checks up into GitHub's rollup state", async () => {
    const rollup = async (checkRuns: FakeRestOptions["checkRuns"]) =>
      restReader({ checkRuns }).reader.commitRollups(pr1);
    const run = (conclusion: string | null) => ({
      name: `ci-${conclusion}`,
      status: conclusion === null ? "in_progress" : "completed",
      conclusion,
    });
    expect(await rollup([run("success"), run("skipped")])).toEqual([
      { oid: "head", state: "SUCCESS" },
    ]);
    expect(await rollup([run("success"), run(null)])).toEqual([
      { oid: "head", state: "PENDING" },
    ]);
    expect(await rollup([run(null), run("failure")])).toEqual([
      { oid: "head", state: "FAILURE" },
    ]);
    expect(await rollup([])).toEqual([{ oid: "head", state: null }]);
  });

  it("reads the head's checks once per pull request read", async () => {
    const { reader, api } = restReader();
    await reader.pullRequest(pr1);
    await resolveChecks(reader, pr1);
    await reader.commitRollups(pr1);
    const checkReads = () =>
      api.calls.filter((call) => call.includes("/check-runs")).length;
    expect(checkReads()).toBe(1);
    await reader.pullRequest(pr1);
    await reader.commitRollups(pr1);
    expect(checkReads()).toBe(2);
  });

  it("lists open pull requests across pages", async () => {
    const openPulls = Array.from({ length: 120 }, (_, index) => ({
      number: index + 1,
      head: { ref: `head-${index + 1}` },
      base: { ref: "main" },
    }));
    const { reader } = restReader({ openPulls });
    const open = await reader.openPullRequests({
      owner: "owner",
      repo: "repo",
    });
    expect(open).toHaveLength(120);
    expect(open[119]).toEqual({
      number: parsePrNumber(120),
      headRefName: "head-120",
      baseRefName: "main",
    });
  });

  it("finds the current pull request by number or by the checked-out branch", async () => {
    const { reader } = restReader();
    expect(await reader.currentPr(parsePrNumber(1))).toEqual(pr1);
    expect(await reader.currentPr(null)).toEqual(pr1);
    await expect(
      restReader({ branch: "elsewhere" }).reader.currentPr(null)
    ).rejects.toBeInstanceOf(WatcherQueryError);
  });
});

describe("REST and GraphQL readers reach the same verdict on the same threads", () => {
  /** A thread state, read the same way through either reader. */
  interface ThreadState {
    readonly resolved: boolean;
    readonly outdated: boolean;
    readonly graphqlLogin: string;
    readonly restLogin: string;
    readonly body: string;
  }
  const human = { graphqlLogin: "octocat", restLogin: "octocat", body: "nit" };
  const bugbot = {
    graphqlLogin: "cursor",
    restLogin: "cursor[bot]",
    body: "Bugbot found a bug. RUN_ID: run-1",
  };
  const claude = {
    graphqlLogin: "claude",
    restLogin: "claude[bot]",
    body: "Possible null dereference",
  };
  const thread = (
    who: typeof human,
    state: { resolved?: boolean; outdated?: boolean } = {}
  ): ThreadState => ({
    ...who,
    resolved: state.resolved ?? false,
    outdated: state.outdated ?? false,
  });

  function graphqlReader(states: readonly ThreadState[]): GitHubReader {
    const response = {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: states.map((state, index) => ({
                id: `thread-${index}`,
                isResolved: state.resolved,
                comments: {
                  nodes: [
                    {
                      body: state.body,
                      createdAt: "now",
                      path: "a.ts",
                      line: state.outdated ? null : 3,
                      author: { login: state.graphqlLogin },
                    },
                  ],
                },
              })),
            },
          },
        },
      },
    };
    return fakeReader({
      current: pr1,
      threadPages: [parseReviewThreadPage(response)],
    });
  }

  function restParityReader(states: readonly ThreadState[]): GitHubReader {
    return new RestGitHubReader(
      fakeRestApi({
        threads: states.map((state, index) => ccrThread([index + 1], state)),
        comments: states.map((state, index) =>
          restComment(
            index + 1,
            state.restLogin,
            state.body,
            state.outdated ? null : 3
          )
        ),
      })
    );
  }

  async function verdict(reader: GitHubReader) {
    const snapshot = await readSnapshot({
      reader,
      context: pr1,
      pendingHistory: "include",
      allowDraft: false,
    });
    const decision = classifyPr(snapshot);
    return {
      decision:
        decision.kind === "blocker"
          ? `blocker:${decision.blocker.kind}`
          : decision.kind,
      threads:
        snapshot.kind === "open"
          ? snapshot.threads.map((t) => [t.isBugbot, t.bugbotReviewPasses])
          : [],
    };
  }

  const cases: readonly (readonly [string, readonly ThreadState[], string])[] =
    [
      ["no threads", [], "ready"],
      [
        "only resolved threads",
        [thread(human, { resolved: true }), thread(bugbot, { resolved: true })],
        "ready",
      ],
      ["an open human thread", [thread(human)], "blocker:review-threads"],
      [
        "an open outdated thread",
        [thread(human, { outdated: true })],
        "blocker:review-threads",
      ],
      ["an open review-bot thread", [thread(claude)], "blocker:review-threads"],
      [
        "resolved Bugbot and open human threads",
        [thread(bugbot, { resolved: true }), thread(human), thread(bugbot)],
        "blocker:review-threads",
      ],
      [
        "a resolved outdated thread",
        [thread(human, { resolved: true, outdated: true })],
        "ready",
      ],
    ];

  for (const [name, states, expected] of cases)
    it(`agrees on ${name}`, async () => {
      const graphql = await verdict(graphqlReader(states));
      expect(graphql.decision).toBe(expected);
      expect(await verdict(restParityReader(states))).toEqual(graphql);
    });
});

describe("falling back to REST when GraphQL is refused", () => {
  const refusal = () =>
    new GraphQLRefused(
      "GitHub GraphQL is not available from Claude Code sessions"
    );

  function scripted(
    answer: (method: string) => unknown
  ): GitHubReader & { readonly calls: string[] } {
    const calls: string[] = [];
    const reader = fakeReader({ current: pr1 });
    const methods = [
      "originRepo",
      "currentPr",
      "pullRequest",
      "openPullRequests",
      "checksFastPath",
      "checkRollupPage",
      "reviewThreadPage",
      "commitRollups",
    ] as const;
    const wrapped = { calls } as GitHubReader & { calls: string[] };
    for (const method of methods)
      Object.assign(wrapped, {
        async [method](...args: unknown[]) {
          calls.push(method);
          const result = answer(method);
          if (result instanceof Error) throw result;
          return (reader[method] as (...a: unknown[]) => unknown)(...args);
        },
      });
    return wrapped;
  }

  it("reads through GraphQL while GraphQL answers", async () => {
    const primary = scripted(() => null);
    const fallback = scripted(() => null);
    const reader = new FallbackGitHubReader(primary, fallback);
    await reader.pullRequest(pr1);
    await resolveReviewThreads(reader, pr1);
    expect(primary.calls).toEqual(["pullRequest", "reviewThreadPage"]);
    expect(fallback.calls).toEqual([]);
  });

  it("answers a refused call from REST and stays on REST for the rest of the run", async () => {
    const primary = scripted((method) =>
      method === "reviewThreadPage" ? refusal() : null
    );
    const fallback = scripted(() => null);
    const reader = new FallbackGitHubReader(primary, fallback);
    await reader.pullRequest(pr1);
    await resolveReviewThreads(reader, pr1);
    await reader.pullRequest(pr1);
    await reader.commitRollups(pr1);
    expect(primary.calls).toEqual(["pullRequest", "reviewThreadPage"]);
    expect(fallback.calls).toEqual([
      "reviewThreadPage",
      "pullRequest",
      "commitRollups",
    ]);
  });

  it("passes any other failure through and keeps GraphQL", async () => {
    let fail = true;
    const primary = scripted(() =>
      fail
        ? new WatcherQueryError({
            kind: "command-exit",
            retryable: true,
            code: 1,
            detail: "HTTP 502: Bad Gateway",
          })
        : null
    );
    const fallback = scripted(() => null);
    const reader = new FallbackGitHubReader(primary, fallback);
    await expect(reader.pullRequest(pr1)).rejects.toBeInstanceOf(
      WatcherQueryError
    );
    fail = false;
    await reader.pullRequest(pr1);
    expect(fallback.calls).toEqual([]);
  });

  it("reaches a ready verdict in cloud when every GraphQL call is refused", async () => {
    const reader = new FallbackGitHubReader(
      scripted(() => refusal()),
      new RestGitHubReader(
        fakeRestApi({ threads: [ccrThread([1], { resolved: true })] })
      )
    );
    const snapshot = await readSnapshot({
      reader,
      context: pr1,
      pendingHistory: "include",
      allowDraft: false,
    });
    expect(classifyPr(snapshot).kind).toBe("ready");
  });
});

describe("reading a gh failure", () => {
  // The cloud session proxy's reply to any GraphQL call, as gh prints it.
  const proxyRefusal =
    'non-200 OK status code: 403 Forbidden body: "{\\"message\\":\\"GitHub GraphQL is not available from Claude Code sessions; use the REST API (gh api repos/{owner}/{repo}/...). For review threads, auto-merge, and draft/ready-for-review use the CCR routes on api.github.com: GET /repos/{owner}/{repo}/pulls/{n}/ccr/review_threads\\"}"';

  it("reads the proxy's GraphQL refusal as a refusal", () => {
    const error = commandError(["gh", "pr", "view", "1"], {
      code: 1,
      stdout: "",
      stderr: `${proxyRefusal}\n`,
    });
    expect(error).toBeInstanceOf(GraphQLRefused);
    expect(error.failure).toMatchObject({
      kind: "command-exit",
      retryable: true,
      code: 1,
    });
  });

  it("reads any other failure as a retryable command exit", () => {
    for (const stderr of [
      "HTTP 403: Resource not accessible by integration",
      "GraphQL: Could not resolve to a PullRequest",
      "",
    ]) {
      const error = commandError(["gh", "api", "graphql"], {
        code: 1,
        stdout: "",
        stderr,
      });
      expect(error).not.toBeInstanceOf(GraphQLRefused);
      expect(error.failure).toMatchObject({
        kind: "command-exit",
        retryable: true,
      });
    }
  });
});

describe("review-bot logins", () => {
  const firstThread = (login: string, body = "finding") =>
    buildReviewThreads(
      parseReviewThreadPage({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                {
                  id: "t",
                  isResolved: false,
                  comments: {
                    nodes: [
                      {
                        body,
                        createdAt: "now",
                        path: null,
                        line: null,
                        author: { login },
                      },
                    ],
                  },
                },
                ],
              },
            },
          },
        },
      }).threads
    )[0];

  it.each([
    "claude",
    "claude[bot]",
    "copilot-pull-request-reviewer",
    "copilot-pull-request-reviewer[bot]",
    "Copilot",
    "cursor[bot]",
    "bugbot",
  ])("recognises %s as a review bot", (login) => {
    expect(firstThread(login, "Bugbot: finding").isBugbot).toBe(true);
  });

  it("recognises Cursor only on a Bugbot review comment, as upstream does", () => {
    expect(firstThread("cursor", "severity high").isBugbot).toBe(true);
    expect(firstThread("cursor", "I pushed a fix").isBugbot).toBe(false);
  });

  it("does not take a person for a review bot", () => {
    expect(firstThread("octocat", "Bugbot said so").isBugbot).toBe(false);
    expect(firstThread("claudette").isBugbot).toBe(false);
  });
});
