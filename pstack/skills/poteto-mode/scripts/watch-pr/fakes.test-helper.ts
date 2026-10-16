import type {
  Check,
  ChecksFastPath,
  CommitRollup,
  GitHubReader,
  OpenPullRequest,
  PrContext,
  PullRequestFacts,
  Repository,
  RawReviewThread,
  ReviewThread,
  ReviewThreadPage,
  RollupPage,
} from "./types.ts";
import { WatcherQueryError } from "./github.ts";
import { parsePrNumber } from "./types.ts";

export interface FakeReaderOptions {
  readonly facts?: Partial<Omit<PullRequestFacts, "context">>;
  readonly fastPath?: ChecksFastPath;
  readonly rollupPages?: readonly RollupPage[];
  readonly threads?: readonly ReviewThread[];
  readonly threadPages?: readonly ReviewThreadPage[];
  readonly commitRollups?: readonly CommitRollup[];
  readonly openPullRequests?: readonly OpenPullRequest[];
  readonly origin?: Repository | null;
  readonly current?: PrContext;
}

function toRawThread(thread: ReviewThread): RawReviewThread {
  return { id: thread.id, firstComment: thread.firstComment, resolved: false };
}

export function passingCheck(name = "ci"): Check {
  return {
    kind: "passed",
    name,
    reportedState: "SUCCESS",
    description: "",
    link: "",
    workflow: "",
  };
}

export function pendingCheck(name = "ci"): Check {
  return {
    kind: "pending",
    name,
    reportedState: "PENDING",
    description: "",
    link: "",
    workflow: "",
  };
}

export function failedCheck(name = "ci"): Check {
  return {
    kind: "failed",
    name,
    reportedState: "FAILURE",
    description: "",
    link: "",
    workflow: "",
  };
}

export function fakeReader(
  options: FakeReaderOptions = {}
): GitHubReader & { readonly calls: readonly string[] } {
  const calls: string[] = [];
  const context = options.current ?? {
    owner: "owner",
    repo: "repo",
    number: parsePrNumber(1),
  };
  const defaults: PullRequestFacts = {
    context,
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
  let page = 0;
  let threadPage = 0;
  return {
    calls,
    async originRepo() {
      calls.push("originRepo");
      return options.origin === undefined
        ? { owner: "owner", repo: "repo" }
        : options.origin;
    },
    async currentPr(pr) {
      calls.push("currentPr");
      return { ...context, number: pr ?? context.number };
    },
    async pullRequest(requested) {
      calls.push("pullRequest");
      return { ...defaults, ...options.facts, context: requested };
    },
    async openPullRequests() {
      calls.push("openPullRequests");
      return options.openPullRequests ?? [];
    },
    async checksFastPath() {
      calls.push("checksFastPath");
      return options.fastPath ?? { kind: "checks", checks: [passingCheck()] };
    },
    async checkRollupPage(_requested, after) {
      calls.push(`checkRollupPage:${after ?? "null"}`);
      return options.rollupPages?.[page++] ?? { checks: [], endCursor: null };
    },
    async reviewThreadPage(_requested, after) {
      calls.push(`reviewThreadPage:${after ?? "null"}`);
      return options.threadPages?.[threadPage++] ?? {
        threads: (options.threads ?? []).map(toRawThread),
        endCursor: null,
      };
    },
    async commitRollups() {
      calls.push("commitRollups");
      return options.commitRollups ?? [{ oid: "head", state: "SUCCESS" }];
    },
  };
}

/** One thread as the cloud proxy's `/ccr/review_threads` route returns it. */
export interface CcrThread {
  readonly resolved: boolean;
  readonly outdated: boolean;
  readonly path: string;
  readonly line: number | null;
  readonly comment_ids: readonly number[];
}

/** One review comment as REST `GET …/pulls/{n}/comments` returns it. */
export interface RestComment {
  readonly id: number;
  readonly user: { readonly login: string } | null;
  readonly body: string;
  readonly path: string;
  readonly line: number | null;
  readonly created_at: string;
}

export interface RestReview {
  readonly user: { readonly login: string } | null;
  readonly state: string;
}

export interface RestCheckRun {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly details_url?: string;
}

export interface RestStatus {
  readonly context: string;
  readonly state: string;
  readonly target_url?: string;
  readonly description?: string;
}

export interface RestPullSummary {
  readonly number: number;
  readonly head: { readonly ref: string };
  readonly base: { readonly ref: string };
}

export interface FakeRestOptions {
  readonly pull?: Record<string, unknown>;
  readonly reviews?: readonly RestReview[];
  readonly threads?: readonly CcrThread[];
  readonly comments?: readonly RestComment[];
  readonly checkRuns?: readonly RestCheckRun[];
  readonly statuses?: readonly RestStatus[];
  readonly openPulls?: readonly RestPullSummary[];
  /** The checked-out branch the `{branch}` placeholder names. */
  readonly branch?: string;
}

/**
 * A fake of the REST API as `gh api` serves it behind the cloud proxy: the
 * pull request, its reviews, review comments, check runs and statuses, and
 * the proxy-only `/ccr/review_threads` route. List routes page by
 * `per_page`/`page`; `{owner}`, `{repo}` and `{branch}` resolve as gh resolves
 * them from the checkout; any other path fails as gh's HTTP 404 does.
 */
export function fakeRestApi(options: FakeRestOptions = {}): {
  readonly calls: readonly string[];
  get(path: string): Promise<unknown>;
} {
  const calls: string[] = [];
  const pull = {
    number: 1,
    html_url: "https://github.com/owner/repo/pull/1",
    state: "open",
    draft: false,
    merged_at: null,
    mergeable: true,
    mergeable_state: "clean",
    head: { sha: "head", ref: "feature" },
    base: { ref: "main" },
    ...options.pull,
  };
  const head = (pull.head as { readonly sha: string }).sha;
  const pr = `repos/owner/repo/pulls/${pull.number}`;
  const page = <V>(items: readonly V[], query: URLSearchParams): V[] => {
    const size = Number(query.get("per_page") ?? 30);
    const index = Number(query.get("page") ?? 1);
    return items.slice((index - 1) * size, index * size);
  };
  return {
    calls,
    async get(path) {
      calls.push(path);
      const resolved = path
        .replaceAll("{owner}", "owner")
        .replaceAll("{repo}", "repo")
        .replaceAll("{branch}", options.branch ?? "feature");
      const [route, search = ""] = resolved.split("?", 2);
      const query = new URLSearchParams(search);
      switch (route) {
        case pr:
          return pull;
        case `${pr}/reviews`:
          return page(
            options.reviews ?? [
              { user: { login: "reviewer" }, state: "APPROVED" },
            ],
            query
          );
        case `${pr}/ccr/review_threads`:
          return options.threads ?? [];
        case `${pr}/comments`:
          return page(options.comments ?? [], query);
        case `repos/owner/repo/commits/${head}/check-runs`: {
          const runs = options.checkRuns ?? [
            { name: "ci", status: "completed", conclusion: "success" },
          ];
          return { total_count: runs.length, check_runs: page(runs, query) };
        }
        case `repos/owner/repo/commits/${head}/status`: {
          const statuses = options.statuses ?? [];
          return {
            state: "success",
            total_count: statuses.length,
            statuses: page(statuses, query),
          };
        }
        case "repos/owner/repo/pulls": {
          const open = options.openPulls ?? [];
          if (query.get("head") !== null)
            return query.get("head") === `owner:${pull.head.ref}` ? [pull] : [];
          return page(open, query);
        }
      }
      throw new WatcherQueryError({
        kind: "command-exit",
        retryable: true,
        code: 1,
        detail: `gh: Not Found (HTTP 404): ${path}`,
      });
    },
  };
}
