import { spawn } from "node:child_process";
import type * as T from "./types.ts";
import { nonEmpty, parsePrNumber } from "./types.ts";
export const REVIEW_THREADS_QUERY =
  "\nquery ReviewThreads($owner: String!, $repo: String!, $pr: Int!, $after: String) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      reviewThreads(first: 100, after: $after) {\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n        nodes {\n          id\n          isResolved\n          comments(first: 10) {\n            nodes {\n              body\n              createdAt\n              path\n              line\n              author { login }\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";
export const PR_COMMIT_STATUS_QUERY =
  "\nquery PrCommitStatuses($owner: String!, $repo: String!, $pr: Int!) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      commits(last: 50) {\n        nodes {\n          commit {\n            oid\n            statusCheckRollup {\n              state\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";
export const PR_CHECK_ROLLUP_QUERY =
  "\nquery PrCheckRollup($owner: String!, $repo: String!, $pr: Int!, $after: String) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      commits(last: 1) {\n        nodes {\n          commit {\n            statusCheckRollup {\n              contexts(first: 100, after: $after) {\n                pageInfo {\n                  hasNextPage\n                  endCursor\n                }\n                nodes {\n                  __typename\n                  ... on CheckRun {\n                    name\n                    status\n                    conclusion\n                    detailsUrl\n                  }\n                  ... on StatusContext {\n                    context\n                    state\n                    targetUrl\n                  }\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";

interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}
export class WatcherQueryError extends Error {
  readonly failure: T.QueryFailure;
  constructor(failure: T.QueryFailure) {
    super(failure.detail);
    this.name = "WatcherQueryError";
    this.failure = failure;
  }
}
export class ChecksUnavailable extends WatcherQueryError {
  constructor(detail: string) {
    super({ kind: "checks-unavailable", retryable: true, detail });
    this.name = "ChecksUnavailable";
  }
}
// The cloud session proxy refuses every GraphQL call, `gh pr` commands
// included, with a 403 whose body says this.
const GRAPHQL_REFUSAL = /GraphQL is not available from Claude Code sessions/i;
export class GraphQLRefused extends WatcherQueryError {
  constructor(detail: string, code = 1) {
    super({ kind: "command-exit", retryable: true, code, detail });
    this.name = "GraphQLRefused";
  }
}
const firstLine = (value: string): string =>
  value.trim().split(/\r?\n/, 1)[0]?.slice(0, 240) ?? "";
export function commandError(
  argv: readonly string[],
  result: CommandResult
): WatcherQueryError {
  const detail =
    firstLine(result.stderr) || `${argv.join(" ")} exited ${result.code}`;
  return GRAPHQL_REFUSAL.test(result.stderr)
    ? new GraphQLRefused(detail, result.code)
    : new WatcherQueryError({
        kind: "command-exit",
        retryable: true,
        code: result.code,
        detail,
      });
}
function run(argv: readonly [string, ...string[]]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}
function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new WatcherQueryError({
      kind: "json-parse",
      retryable: true,
      detail: `${label}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
async function runJson(argv: readonly [string, ...string[]]): Promise<unknown> {
  const result = await run(argv);
  if (result.code !== 0) throw commandError(argv, result);
  return parseJson(result.stdout, argv.join(" "));
}
function raw(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function missing(path: string, value?: unknown): never {
  throw new WatcherQueryError({
    kind: "missing-key",
    retryable: true,
    detail:
      value === undefined
        ? `missing ${path}`
        : `invalid ${path}: ${raw(value)}`,
    ...(value === undefined ? {} : { rawValue: raw(value) }),
  });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) missing(path, value);
  return value;
}
function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) missing(path, value);
  return value;
}
function at(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    const object = record(current, path.join("."));
    if (!(key in object)) missing(path.join("."));
    current = object[key];
  }
  return current;
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string") missing(path, value);
  return value;
}
const optionalString = (value: unknown, path: string): string | null =>
  value === null ? null : string(value, path);
function enumValue<const V extends readonly string[]>(
  value: unknown,
  values: V,
  path: string
): V[number] {
  if (typeof value === "string")
    for (const candidate of values) if (candidate === value) return candidate;
  return missing(path, value);
}
const nullableEnum = <const V extends readonly string[]>(
  value: unknown,
  values: V,
  path: string
): V[number] | null => (value === null ? null : enumValue(value, values, path));
const MERGE_STATES = [
  "BEHIND",
  "BLOCKED",
  "CLEAN",
  "CONFLICTING",
  "DIRTY",
  "DRAFT",
  "HAS_HOOKS",
  "UNKNOWN",
  "UNSTABLE",
] as const satisfies readonly T.MergeStateStatus[];
const ROLLUP_STATES = [
  "ERROR",
  "EXPECTED",
  "FAILURE",
  "PENDING",
  "SUCCESS",
] as const;
const REVIEW_DECISIONS = [
  "APPROVED",
  "CHANGES_REQUESTED",
  "REVIEW_REQUIRED",
] as const;
// `gh pr view` reports no review decision as "", not null. Only this field does
// it, so the normalization stays here rather than in nullableEnum, where it
// would stop a genuinely unexpected rollup state from failing closed.
const reviewDecision = (value: unknown): T.ReviewDecision =>
  nullableEnum(
    value === "" ? null : value,
    REVIEW_DECISIONS,
    "pull request.reviewDecision"
  );
function parseRemote(value: string): T.Repository | null {
  let normalized = value.trim();
  if (normalized.startsWith("git@github.com:"))
    normalized = `https://github.com/${normalized.slice(15)}`;
  if (normalized.startsWith("ssh://git@github.com/"))
    normalized = `https://github.com/${normalized.slice(21)}`;
  try {
    const url = new URL(normalized);
    const parts = url.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 2
    )
      return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}
function parsePrUrl(value: string): T.PrContext {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 4 ||
      parts[2] !== "pull"
    )
      throw new Error("not a canonical GitHub pull URL");
    return {
      owner: parts[0],
      repo: parts[1],
      number: parsePrNumber(Number(parts[3])),
    };
  } catch (error) {
    throw new WatcherQueryError({
      kind: "invalid-context-url",
      retryable: false,
      rawValue: value,
      detail: `could not infer owner/repo from PR URL: ${value} (${error instanceof Error ? error.message : String(error)})`,
    });
  }
}
function checkDetails(value: Record<string, unknown>, nameKey: string) {
  return {
    name: string(value[nameKey], nameKey),
    description: typeof value.description === "string" ? value.description : "",
    link:
      typeof value.link === "string"
        ? value.link
        : typeof value.detailsUrl === "string"
          ? value.detailsUrl
          : "",
    workflow: typeof value.workflow === "string" ? value.workflow : "",
  };
}
export function parseFastCheck(value: unknown): T.Check {
  const object = record(value, "check");
  const details = checkDetails(object, "name");
  const state = string(object.state, "check.state").toUpperCase();
  const bucket = string(object.bucket, "check.bucket");
  if (state === "ACTION_REQUIRED") return gateOr("failed", details, state);
  if (bucket === "fail" || ["FAILURE", "ERROR"].includes(state))
    return { ...details, kind: "failed", reportedState: state };
  if (bucket === "pending") return gateOr("pending", details, state);
  if (bucket === "pass")
    return { ...details, kind: "passed", reportedState: state };
  if (bucket === "skipping")
    return { ...details, kind: "skipped", reportedState: state };
  return { ...details, kind: "failed", reportedState: state };
}
// Every read path classifies the owner-approval gate here, so the rule has one
// home. A gate that is pending or waits on an owner approval must not count as
// pending or failed, or the watcher waits on a human.
function gateOr(
  kind: "pending" | "failed",
  details: {
    readonly name: string;
    readonly description: string;
    readonly link: string;
    readonly workflow: string;
  },
  reportedState: string
): T.Check {
  return details.name === "Code Review Gate"
    ? {
        ...details,
        kind: "code-review-gate",
        name: "Code Review Gate",
        reportedState,
      }
    : { ...details, kind, reportedState };
}
export function mapRollupNode(value: unknown): T.Check | null {
  const object = record(value, "rollup node");
  const typename = object.__typename;
  if (typename !== "CheckRun" && typename !== "StatusContext") return null;
  const details = checkDetails(
    object,
    typename === "CheckRun" ? "name" : "context"
  );
  const link =
    typeof object.targetUrl === "string" ? object.targetUrl : details.link;
  if (typename === "CheckRun") {
    const status =
      typeof object.status === "string" ? object.status.toUpperCase() : "";
    const conclusion =
      typeof object.conclusion === "string"
        ? object.conclusion.toUpperCase()
        : "";
    if (status !== "COMPLETED")
      return gateOr("pending", { ...details, link }, "PENDING");
    if (conclusion === "SUCCESS")
      return { ...details, link, kind: "passed", reportedState: "SUCCESS" };
    if (conclusion === "NEUTRAL" || conclusion === "SKIPPED")
      return { ...details, link, kind: "skipped", reportedState: conclusion };
    if (conclusion === "ACTION_REQUIRED")
      return gateOr("failed", { ...details, link }, conclusion);
    return { ...details, link, kind: "failed", reportedState: "FAILURE" };
  }
  const state =
    typeof object.state === "string" ? object.state.toUpperCase() : "";
  if (state === "PENDING" || state === "EXPECTED")
    return gateOr("pending", { ...details, link }, "PENDING");
  return state === "SUCCESS"
    ? { ...details, link, kind: "passed", reportedState: state }
    : { ...details, link, kind: "failed", reportedState: state || "FAILURE" };
}
function parseComment(value: unknown): T.ReviewComment {
  const object = record(value, "review comment");
  const author =
    object.author === null
      ? null
      : record(object.author, "review comment.author");
  return {
    authorLogin:
      author === null
        ? null
        : optionalString(author.login, "review comment.author.login"),
    body: string(object.body, "review comment.body"),
    path: optionalString(object.path, "review comment.path"),
    line:
      object.line === null
        ? null
        : Number.isInteger(object.line)
          ? Number(object.line)
          : missing("review comment.line", object.line),
    createdAt: string(object.createdAt, "review comment.createdAt"),
  };
}
// Review bots (e.g. Claude Code Review, Bugbot, Copilot), by login. GraphQL
// gives an app's login bare and REST adds "[bot]", so the suffix is dropped
// before matching. Cursor's app also comments for its agents, so a Cursor
// comment counts only when it reads as a Bugbot review.
const REVIEW_BOT_LOGINS = [
  "claude",
  "copilot",
  "copilot-pull-request-reviewer",
] as const;
function isBugbot(comment: T.ReviewComment | null): boolean {
  if (comment === null) return false;
  const author = (comment.authorLogin ?? "")
    .toLowerCase()
    .replace(/\[bot\]$/, "");
  const body = comment.body.toLowerCase();
  return (
    REVIEW_BOT_LOGINS.some((login) => login === author) ||
    author.includes("bugbot") ||
    (author === "cursor" &&
      [
        "bugbot",
        "cursor_automation_id",
        "agentic security review",
        "description start",
        "severity",
      ].some((token) => body.includes(token)))
  );
}
function passKey(comment: T.ReviewComment | null): string | null {
  if (comment === null) return null;
  for (const pattern of [
    /RUN_ID:\s*([a-zA-Z0-9_.:-]+)/,
    /CURSOR_AUTOMATION_ID:\s*([a-zA-Z0-9_.:-]+)/,
  ]) {
    const match = pattern.exec(comment.body);
    if (match?.[1]) return match[1];
  }
  return null;
}
export function parseReviewThreadPage(value: unknown): T.ReviewThreadPage {
  const reviewThreads = record(
    at(value, ["data", "repository", "pullRequest", "reviewThreads"]),
    "reviewThreads"
  );
  const nodes = list(reviewThreads.nodes, "reviewThreads.nodes");
  const threads: T.RawReviewThread[] = [];
  for (const node of nodes) {
    const thread = record(node, "review thread");
    if (typeof thread.isResolved !== "boolean")
      missing("review thread.isResolved", thread.isResolved);
    const comments = list(
      at(thread, ["comments", "nodes"]),
      "review thread.comments.nodes"
    );
    threads.push({
      id: string(thread.id, "review thread.id"),
      firstComment: comments.length === 0 ? null : parseComment(comments[0]),
      resolved: thread.isResolved,
    });
  }
  const page = record(reviewThreads.pageInfo, "reviewThreads.pageInfo");
  if (typeof page.hasNextPage !== "boolean")
    missing("reviewThreads.pageInfo.hasNextPage", page.hasNextPage);
  const cursor = optionalString(
    page.endCursor,
    "reviewThreads.pageInfo.endCursor"
  );
  return { threads, endCursor: page.hasNextPage && cursor ? cursor : null };
}
/** The open threads, each marked as a review bot's or not, with the bots' review-pass count. */
export function buildReviewThreads(
  threads: readonly T.RawReviewThread[]
): readonly T.ReviewThread[] {
  const keys = new Set<string>();
  let keyless = false;
  for (const thread of threads) {
    if (!isBugbot(thread.firstComment)) continue;
    const key = passKey(thread.firstComment);
    if (key === null) keyless = true;
    else keys.add(key);
  }
  const passes = keys.size > 0 ? keys.size : keyless ? 1 : 0;
  return threads
    .filter((thread) => !thread.resolved)
    .map(({ id, firstComment }) => ({
      id,
      firstComment,
      isBugbot: isBugbot(firstComment),
      bugbotReviewPasses: passes,
    }));
}
export function parsePullRequest(
  value: unknown,
  context: T.PrContext
): T.PullRequestFacts {
  const object = record(value, "pull request");
  if (typeof object.isDraft !== "boolean")
    missing("pull request.isDraft", object.isDraft);
  return {
    context,
    mergeable: enumValue(
      object.mergeable,
      ["MERGEABLE", "CONFLICTING", "UNKNOWN"] as const,
      "pull request.mergeable"
    ),
    mergeStateStatus: enumValue(
      object.mergeStateStatus,
      MERGE_STATES,
      "pull request.mergeStateStatus"
    ),
    reviewDecision: reviewDecision(object.reviewDecision),
    headRefOid: optionalString(object.headRefOid, "pull request.headRefOid"),
    headRefName: string(object.headRefName, "pull request.headRefName"),
    baseRefName: string(object.baseRefName, "pull request.baseRefName"),
    state: enumValue(
      object.state,
      ["OPEN", "CLOSED", "MERGED"] as const,
      "pull request.state"
    ),
    mergedAt: optionalString(object.mergedAt, "pull request.mergedAt"),
    isDraft: object.isDraft,
  };
}
function graphqlArgs(
  query: string,
  context: T.PrContext
): [string, ...string[]] {
  return [
    "gh",
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-f",
    `owner=${context.owner}`,
    "-f",
    `repo=${context.repo}`,
    "-F",
    `pr=${context.number}`,
  ];
}

async function originRepo(): Promise<T.Repository | null> {
  const result = await run(["git", "remote", "get-url", "origin"]);
  return result.code === 0 ? parseRemote(result.stdout) : null;
}

export class GraphQLGitHubReader implements T.GitHubReader {
  originRepo(): Promise<T.Repository | null> {
    return originRepo();
  }
  async currentPr(pr: T.PrNumber | null): Promise<T.PrContext> {
    const argv: [string, ...string[]] = ["gh", "pr", "view"];
    if (pr !== null) argv.push(String(pr));
    argv.push("--json", "number,url");
    const object = record(await runJson(argv), "current PR");
    const parsed = parsePrUrl(string(object.url, "current PR.url"));
    return {
      ...parsed,
      number: pr ?? parsePrNumber(object.number, "current PR.number"),
    };
  }
  async pullRequest(context: T.PrContext): Promise<T.PullRequestFacts> {
    return parsePullRequest(
      await runJson([
        "gh",
        "pr",
        "view",
        String(context.number),
        "--repo",
        `${context.owner}/${context.repo}`,
        "--json",
        "mergeable,mergeStateStatus,reviewDecision,headRefOid,headRefName,baseRefName,state,mergedAt,isDraft",
      ]),
      context
    );
  }
  async openPullRequests(
    repository: T.Repository
  ): Promise<readonly T.OpenPullRequest[]> {
    const value = await runJson([
      "gh",
      "pr",
      "list",
      "--repo",
      `${repository.owner}/${repository.repo}`,
      "--state",
      "open",
      "--limit",
      "300",
      "--json",
      "number,headRefName,baseRefName",
    ]);
    return list(value, "open PRs").map((item, index) => {
      const object = record(item, `open PRs[${index}]`);
      return {
        number: parsePrNumber(object.number, `open PRs[${index}].number`),
        headRefName: string(
          object.headRefName,
          `open PRs[${index}].headRefName`
        ),
        baseRefName: string(
          object.baseRefName,
          `open PRs[${index}].baseRefName`
        ),
      };
    });
  }
  async checksFastPath(context: T.PrContext): Promise<T.ChecksFastPath> {
    const result = await run([
      "gh",
      "pr",
      "checks",
      String(context.number),
      "--repo",
      `${context.owner}/${context.repo}`,
      "--json",
      "name,state,description,link,workflow,bucket",
    ]);
    if (GRAPHQL_REFUSAL.test(result.stderr))
      throw commandError(["gh", "pr", "checks"], result);
    if ([0, 1, 8].includes(result.code) && result.stdout.trim()) {
      try {
        const value = parseJson(result.stdout, "gh pr checks");
        if (Array.isArray(value))
          return { kind: "checks", checks: value.map(parseFastCheck) };
      } catch (error) {
        if (!(error instanceof WatcherQueryError)) throw error;
      }
    }
    return { kind: "unusable", exitCode: result.code, stderr: result.stderr };
  }
  async checkRollupPage(
    context: T.PrContext,
    after: string | null
  ): Promise<T.RollupPage> {
    const argv = graphqlArgs(PR_CHECK_ROLLUP_QUERY, context);
    if (after !== null) argv.push("-f", `after=${after}`);
    const value = await runJson(argv);
    const commits = list(
      at(value, ["data", "repository", "pullRequest", "commits", "nodes"]),
      "commits.nodes"
    );
    if (commits.length === 0) return { checks: [], endCursor: null };
    const commit = record(
      at(commits[commits.length - 1], ["commit"]),
      "commit"
    );
    if (commit.statusCheckRollup === null)
      return { checks: [], endCursor: null };
    const contexts = record(
      at(commit, ["statusCheckRollup", "contexts"]),
      "contexts"
    );
    const checks = list(contexts.nodes, "contexts.nodes")
      .map(mapRollupNode)
      .filter((check): check is T.Check => check !== null);
    const page = record(contexts.pageInfo, "contexts.pageInfo");
    if (typeof page.hasNextPage !== "boolean")
      missing("contexts.pageInfo.hasNextPage", page.hasNextPage);
    const cursor = optionalString(
      page.endCursor,
      "contexts.pageInfo.endCursor"
    );
    return { checks, endCursor: page.hasNextPage && cursor ? cursor : null };
  }
  async reviewThreadPage(
    context: T.PrContext,
    after: string | null
  ): Promise<T.ReviewThreadPage> {
    const argv = graphqlArgs(REVIEW_THREADS_QUERY, context);
    if (after !== null) argv.push("-f", `after=${after}`);
    return parseReviewThreadPage(await runJson(argv));
  }
  async commitRollups(
    context: T.PrContext
  ): Promise<readonly T.CommitRollup[]> {
    const value = await runJson(graphqlArgs(PR_COMMIT_STATUS_QUERY, context));
    const commits = list(
      at(value, ["data", "repository", "pullRequest", "commits", "nodes"]),
      "commits.nodes"
    );
    return commits.map((item, index) => {
      const commit = record(at(item, ["commit"]), `commits[${index}].commit`);
      const rollup = commit.statusCheckRollup;
      return {
        oid: string(commit.oid, `commits[${index}].oid`),
        state:
          rollup === null
            ? null
            : nullableEnum(
                at(rollup, ["state"]),
                ROLLUP_STATES,
                `commits[${index}].statusCheckRollup.state`
              ),
      };
    });
  }
}

/** GETs one REST path as `gh api` does, `{owner}`, `{repo}` and `{branch}` resolved from the checkout. */
export interface RestApi {
  get(path: string): Promise<unknown>;
}
export const ghRestApi: RestApi = {
  get: (path) => runJson(["gh", "api", path]),
};

const PAGE_SIZE = 100;
async function restPages(
  api: RestApi,
  path: string,
  items: (page: unknown) => readonly unknown[],
  limit = Number.POSITIVE_INFINITY
): Promise<readonly unknown[]> {
  const all: unknown[] = [];
  for (let page = 1; all.length < limit; page += 1) {
    const batch = items(
      await api.get(
        `${path}${path.includes("?") ? "&" : "?"}per_page=${PAGE_SIZE}&page=${page}`
      )
    );
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return all.slice(0, limit);
}
function integer(value: unknown, path: string): number {
  if (!Number.isInteger(value)) missing(path, value);
  return Number(value);
}
function restMergeable(value: unknown): T.PullRequestFacts["mergeable"] {
  if (value === null) return "UNKNOWN";
  if (typeof value !== "boolean") missing("pull request.mergeable", value);
  return value ? "MERGEABLE" : "CONFLICTING";
}
// A REST user's login; a deleted account comes back as a null user.
function restLogin(value: unknown, path: string): string | null {
  if (value === null) return null;
  return optionalString(record(value, path).login, `${path}.login`);
}
// REST has no reviewDecision. Each reviewer's latest approval, change request
// or dismissal stands, as on GitHub's review summary. REVIEW_REQUIRED depends
// on the base branch's rules, which REST does not join here, so no decisive
// review reads as no decision.
function restReviewDecision(reviews: readonly unknown[]): T.ReviewDecision {
  const latest = new Map<string, string>();
  for (const [index, item] of reviews.entries()) {
    const review = record(item, `reviews[${index}]`);
    const state = string(review.state, `reviews[${index}].state`);
    if (!["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(state))
      continue;
    const login = restLogin(review.user, `reviews[${index}].user`);
    latest.set(login ?? `deleted user ${index}`, state);
  }
  const states = [...latest.values()];
  if (states.includes("CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  return states.includes("APPROVED") ? "APPROVED" : null;
}
export function parseRestPullRequest(
  value: unknown,
  reviews: readonly unknown[],
  context: T.PrContext
): T.PullRequestFacts {
  const object = record(value, "pull request");
  if (typeof object.draft !== "boolean")
    missing("pull request.draft", object.draft);
  const upper = (field: unknown) =>
    typeof field === "string" ? field.toUpperCase() : field;
  const mergedAt = optionalString(object.merged_at, "pull request.merged_at");
  return {
    context,
    mergeable: restMergeable(object.mergeable),
    mergeStateStatus: enumValue(
      upper(object.mergeable_state),
      MERGE_STATES,
      "pull request.mergeable_state"
    ),
    reviewDecision: restReviewDecision(reviews),
    headRefOid: string(at(object, ["head", "sha"]), "pull request.head.sha"),
    headRefName: string(at(object, ["head", "ref"]), "pull request.head.ref"),
    baseRefName: string(at(object, ["base", "ref"]), "pull request.base.ref"),
    state:
      mergedAt === null
        ? enumValue(
            upper(object.state),
            ["OPEN", "CLOSED"] as const,
            "pull request.state"
          )
        : "MERGED",
    mergedAt,
    isDraft: object.draft,
  };
}
function parseRestComment(
  value: unknown,
  path: string
): [number, T.ReviewComment] {
  const object = record(value, path);
  return [
    integer(object.id, `${path}.id`),
    {
      authorLogin: restLogin(object.user, `${path}.user`),
      body: string(object.body, `${path}.body`),
      path: optionalString(object.path, `${path}.path`),
      line: object.line === null ? null : integer(object.line, `${path}.line`),
      createdAt: string(object.created_at, `${path}.created_at`),
    },
  ];
}
// GitHub's rollup of a commit's checks: any failure fails it, then anything
// still running keeps it pending.
function rollupState(checks: readonly T.Check[]): T.RollupState {
  if (checks.length === 0) return null;
  if (checks.some((check) => check.kind === "failed")) return "FAILURE";
  return checks.some(
    (check) => check.kind === "pending" || check.kind === "code-review-gate"
  )
    ? "PENDING"
    : "SUCCESS";
}

/**
 * Reads a pull request through REST alone, for the cloud session proxy, which
 * refuses GraphQL. Review threads come from the proxy-only
 * `…/pulls/{n}/ccr/review_threads` route, with each thread's first comment
 * from `…/pulls/{n}/comments`, so the thread verdict matches GraphQL's.
 *
 * Checks are the head commit's check runs and statuses, answered on the fast
 * path. Only the head commit's rollup is read, so `hadPreviousPassingCi` stays
 * false: reading every earlier commit's checks would cost two calls per commit
 * on every poll.
 */
export class RestGitHubReader implements T.GitHubReader {
  readonly #api: RestApi;
  // The head and its checks as of the latest pullRequest() read, so one poll
  // reads the head's checks once.
  readonly #polls = new Map<
    string,
    { readonly head: string; checks?: Promise<readonly T.Check[]> }
  >();
  constructor(api: RestApi) {
    this.#api = api;
  }
  originRepo(): Promise<T.Repository | null> {
    return originRepo();
  }
  async currentPr(pr: T.PrNumber | null): Promise<T.PrContext> {
    const value =
      pr === null
        ? list(
            await this.#api.get(
              "repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=open"
            ),
            "current PR"
          )[0]
        : await this.#api.get(`repos/{owner}/{repo}/pulls/${pr}`);
    if (value === undefined)
      missing("open pull request for the current branch");
    const object = record(value, "current PR");
    const parsed = parsePrUrl(string(object.html_url, "current PR.html_url"));
    return {
      ...parsed,
      number: pr ?? parsePrNumber(object.number, "current PR.number"),
    };
  }
  async pullRequest(context: T.PrContext): Promise<T.PullRequestFacts> {
    const pull = await this.#api.get(pullPath(context));
    const reviews = await restPages(
      this.#api,
      `${pullPath(context)}/reviews`,
      (page) => list(page, "reviews")
    );
    const facts = parseRestPullRequest(pull, reviews, context);
    if (facts.headRefOid !== null)
      this.#polls.set(pullPath(context), { head: facts.headRefOid });
    return facts;
  }
  async openPullRequests(
    repository: T.Repository
  ): Promise<readonly T.OpenPullRequest[]> {
    const open = await restPages(
      this.#api,
      `repos/${repository.owner}/${repository.repo}/pulls?state=open`,
      (page) => list(page, "open PRs"),
      300
    );
    return open.map((item, index) => {
      const object = record(item, `open PRs[${index}]`);
      return {
        number: parsePrNumber(object.number, `open PRs[${index}].number`),
        headRefName: string(
          at(object, ["head", "ref"]),
          `open PRs[${index}].head.ref`
        ),
        baseRefName: string(
          at(object, ["base", "ref"]),
          `open PRs[${index}].base.ref`
        ),
      };
    });
  }
  async checksFastPath(context: T.PrContext): Promise<T.ChecksFastPath> {
    return { kind: "checks", checks: (await this.#headChecks(context)).checks };
  }
  // REST answers on the fast path; there is no rollup to page through.
  async checkRollupPage(): Promise<T.RollupPage> {
    return { checks: [], endCursor: null };
  }
  // The proxy's route returns every thread at once, so REST is one page. A
  // cursor here is GraphQL's, from a walk refused partway; REST can't resume
  // it, and the next poll starts over on REST.
  async reviewThreadPage(
    context: T.PrContext,
    after: string | null
  ): Promise<T.ReviewThreadPage> {
    if (after !== null)
      throw new WatcherQueryError({
        kind: "command-exit",
        retryable: true,
        code: 1,
        detail: "a GraphQL review-thread cursor reached the REST reader",
      });
    const threads = list(
      await this.#api.get(`${pullPath(context)}/ccr/review_threads`),
      "ccr review threads"
    ).map((item, index) => {
      const path = `ccr review threads[${index}]`;
      const thread = record(item, path);
      if (typeof thread.resolved !== "boolean")
        missing(`${path}.resolved`, thread.resolved);
      const ids = list(thread.comment_ids, `${path}.comment_ids`);
      if (ids.length === 0) missing(`${path}.comment_ids`, ids);
      return {
        firstId: integer(ids[0], `${path}.comment_ids[0]`),
        resolved: thread.resolved,
      };
    });
    if (threads.length === 0) return { threads: [], endCursor: null };
    const comments = new Map(
      (
        await restPages(this.#api, `${pullPath(context)}/comments`, (page) =>
          list(page, "review comments")
        )
      ).map((item, index) =>
        parseRestComment(item, `review comments[${index}]`)
      )
    );
    return {
      threads: threads.map((thread) => ({
        id: String(thread.firstId),
        firstComment: comments.get(thread.firstId) ?? null,
        resolved: thread.resolved,
      })),
      endCursor: null,
    };
  }
  async commitRollups(
    context: T.PrContext
  ): Promise<readonly T.CommitRollup[]> {
    const { head, checks } = await this.#headChecks(context);
    return [{ oid: head, state: rollupState(checks) }];
  }
  async #headChecks(
    context: T.PrContext
  ): Promise<{ readonly head: string; readonly checks: readonly T.Check[] }> {
    const poll = this.#polls.get(pullPath(context));
    if (poll === undefined) {
      const head = string(
        at(await this.#api.get(pullPath(context)), ["head", "sha"]),
        "pull request.head.sha"
      );
      return { head, checks: await this.#readChecks(context, head) };
    }
    poll.checks ??= this.#readChecks(context, poll.head);
    return { head: poll.head, checks: await poll.checks };
  }
  async #readChecks(
    context: T.PrContext,
    sha: string
  ): Promise<readonly T.Check[]> {
    const commit = `repos/${context.owner}/${context.repo}/commits/${sha}`;
    const runs = await restPages(this.#api, `${commit}/check-runs`, (page) =>
      list(at(page, ["check_runs"]), "check_runs")
    );
    const statuses = await restPages(this.#api, `${commit}/status`, (page) =>
      list(at(page, ["statuses"]), "statuses")
    );
    return [
      ...runs.map((item, index) => {
        const run = record(item, `check_runs[${index}]`);
        return mapRollupNode({
          __typename: "CheckRun",
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          detailsUrl: run.details_url,
        });
      }),
      ...statuses.map((item, index) => {
        const status = record(item, `statuses[${index}]`);
        return mapRollupNode({
          __typename: "StatusContext",
          context: status.context,
          state: status.state,
          targetUrl: status.target_url,
          description: status.description,
        });
      }),
    ].filter((check): check is T.Check => check !== null);
  }
}
const pullPath = (context: T.PrContext): string =>
  `repos/${context.owner}/${context.repo}/pulls/${context.number}`;

/**
 * Reads through `primary` until it is refused GraphQL, then answers that call
 * and every later one through `fallback`: the cloud session proxy refuses
 * GraphQL for the whole session.
 */
export class FallbackGitHubReader implements T.GitHubReader {
  readonly #primary: T.GitHubReader;
  readonly #fallback: T.GitHubReader;
  #refused = false;
  constructor(primary: T.GitHubReader, fallback: T.GitHubReader) {
    this.#primary = primary;
    this.#fallback = fallback;
  }
  async #read<R>(call: (reader: T.GitHubReader) => Promise<R>): Promise<R> {
    if (!this.#refused)
      try {
        return await call(this.#primary);
      } catch (error) {
        if (!(error instanceof GraphQLRefused)) throw error;
        this.#refused = true;
      }
    return call(this.#fallback);
  }
  originRepo() {
    return this.#read((reader) => reader.originRepo());
  }
  currentPr(pr: T.PrNumber | null) {
    return this.#read((reader) => reader.currentPr(pr));
  }
  pullRequest(context: T.PrContext) {
    return this.#read((reader) => reader.pullRequest(context));
  }
  openPullRequests(repository: T.Repository) {
    return this.#read((reader) => reader.openPullRequests(repository));
  }
  checksFastPath(context: T.PrContext) {
    return this.#read((reader) => reader.checksFastPath(context));
  }
  checkRollupPage(context: T.PrContext, after: string | null) {
    return this.#read((reader) => reader.checkRollupPage(context, after));
  }
  reviewThreadPage(context: T.PrContext, after: string | null) {
    return this.#read((reader) => reader.reviewThreadPage(context, after));
  }
  commitRollups(context: T.PrContext) {
    return this.#read((reader) => reader.commitRollups(context));
  }
}

/** watch-pr's reader: GraphQL through gh, and REST once GraphQL is refused. */
export class GhGitHubReader extends FallbackGitHubReader {
  constructor() {
    super(new GraphQLGitHubReader(), new RestGitHubReader(ghRestApi));
  }
}

export async function resolveChecks(
  reader: T.GitHubReader,
  context: T.PrContext
): Promise<T.CheckRead> {
  const fast = await reader.checksFastPath(context);
  const direct = fast.kind === "checks" ? nonEmpty(fast.checks) : null;
  if (direct !== null) return { source: "gh-pr-checks", checks: direct };
  const checks: T.Check[] = [];
  let after: string | null = null;
  do {
    const page = await reader.checkRollupPage(context, after);
    checks.push(...page.checks);
    after = page.endCursor;
  } while (after !== null);
  const fallback = nonEmpty(checks);
  if (fallback !== null) return { source: "graphql-rollup", checks: fallback };
  const suffix =
    fast.kind === "unusable"
      ? `fast path exit=${fast.exitCode}; GraphQL rollup was empty${firstLine(fast.stderr) ? `; ${firstLine(fast.stderr)}` : ""}`
      : "fast path and GraphQL rollup were empty";
  throw new ChecksUnavailable(`could not read PR checks: ${suffix}`);
}
export async function resolveReviewThreads(
  reader: T.GitHubReader,
  context: T.PrContext
): Promise<readonly T.ReviewThread[]> {
  const threads: T.RawReviewThread[] = [];
  let after: string | null = null;
  do {
    const page = await reader.reviewThreadPage(context, after);
    threads.push(...page.threads);
    after = page.endCursor;
  } while (after !== null);
  return buildReviewThreads(threads);
}
export async function resolveContext(args: {
  readonly reader: T.GitHubReader;
  readonly owner: string | null;
  readonly repo: string | null;
  readonly pr: T.PrNumber | null;
}): Promise<T.PrContext> {
  if (args.pr !== null && args.owner !== null && args.repo !== null)
    return { owner: args.owner, repo: args.repo, number: args.pr };
  if (args.pr !== null) {
    const origin = await args.reader.originRepo();
    if (origin !== null)
      return {
        owner: args.owner ?? origin.owner,
        repo: args.repo ?? origin.repo,
        number: args.pr,
      };
  }
  const inferred = await args.reader.currentPr(args.pr);
  return {
    owner: args.owner ?? inferred.owner,
    repo: args.repo ?? inferred.repo,
    number: args.pr ?? inferred.number,
  };
}
export function orderStack(
  context: T.PrContext,
  open: readonly T.OpenPullRequest[]
): T.NonEmpty<T.PrContext> {
  const byNumber = new Map(open.map((pr) => [pr.number, pr]));
  const byHead = new Map(open.map((pr) => [pr.headRefName, pr]));
  const children = new Map<string, T.OpenPullRequest[]>();
  for (const pr of open)
    children.set(pr.baseRefName, [...(children.get(pr.baseRefName) ?? []), pr]);
  for (const values of children.values())
    values.sort((a, b) => a.number - b.number);
  const start = byNumber.get(context.number);
  if (start === undefined) return [context];
  const down: T.OpenPullRequest[] = [];
  let current = start;
  while (byHead.has(current.baseRefName)) {
    const parent = byHead.get(current.baseRefName);
    if (parent === undefined) break;
    down.push(parent);
    current = parent;
  }
  const seen = new Set<T.PrNumber>([
    ...down.map((pr) => pr.number),
    start.number,
  ]);
  const up: T.OpenPullRequest[] = [];
  const visit = (parent: T.OpenPullRequest): void => {
    for (const child of children.get(parent.headRefName) ?? []) {
      if (seen.has(child.number)) continue;
      seen.add(child.number);
      up.push(child);
      visit(child);
    }
  };
  visit(start);
  return (
    nonEmpty(
      [...down.reverse(), start, ...up].map((pr) => ({
        ...context,
        number: pr.number,
      }))
    ) ?? [context]
  );
}
export async function discoverStack(
  reader: T.GitHubReader,
  context: T.PrContext
): Promise<T.NonEmpty<T.PrContext>> {
  return orderStack(context, await reader.openPullRequests(context));
}
