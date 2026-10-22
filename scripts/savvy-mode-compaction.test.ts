import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { git, pluginDir, runShell, tempDir, writeFiles } from "./test/harness.ts";

const sessionId = "9b2e7d41-0c3a-4f8e-b6d5-71a0e4c2f9d8";

type HookEntry = { matcher?: string; hooks: { type: string; command: string }[] };

/** The command the plugin's hooks.json runs on SessionStart after a compaction. */
function compactCommand(): string {
  const config = JSON.parse(readFileSync(join(pluginDir, "hooks", "hooks.json"), "utf8")) as {
    hooks: Record<string, HookEntry[]>;
  };
  const entries = (config.hooks.SessionStart ?? []).filter((entry) => entry.matcher === "compact");
  expect(entries).toHaveLength(1);
  expect(entries[0]!.hooks).toHaveLength(1);
  return entries[0]!.hooks[0]!.command;
}

const transcriptPath = `.claude/projects/-repo/${sessionId}.jsonl`;

/** A session's workspace and fake HOME, with the durable state each test puts in it. */
function session() {
  const home = tempDir("jrzstack-home-");
  const cwd = tempDir("jrzstack-repo-");
  const transcript = join(home, transcriptPath);
  return { home, cwd, transcript };
}

type Session = ReturnType<typeof session>;

const markSession = (s: Session, id = sessionId) => writeFiles(s.home, { [`.claude/jrzstack/sessions/${id}`]: "" });

const writeTranscript = (s: Session) => writeFiles(s.home, { [transcriptPath]: "{}\n" });

/** Make `cwd` a git repo with one commit of `subject` and `body`; returns its short SHA. */
function repoWithCommit(s: Session, subject: string, body = "") {
  git(s.cwd, "init", "-q", "-b", "work");
  git(s.cwd, "config", "user.name", "Lead");
  git(s.cwd, "config", "user.email", "lead@example.com");
  git(s.cwd, "commit", "-q", "--allow-empty", "-m", subject, ...(body ? ["-m", body] : []));
  return git(s.cwd, "rev-parse", "--short", "HEAD");
}

/** Run the compaction hook as Claude Code runs it after a compaction. */
function compacted(s: Session, fields: Record<string, string> = {}) {
  const input = JSON.stringify({
    session_id: sessionId,
    transcript_path: s.transcript,
    cwd: s.cwd,
    hook_event_name: "SessionStart",
    source: "compact",
    ...fields,
  });
  return runShell(compactCommand(), {
    cwd: s.cwd,
    home: s.home,
    env: { CLAUDE_PLUGIN_ROOT: pluginDir },
    stdin: input,
  });
}

const intro =
  "jrzstack: this session was just compacted, and its summary is lossy. " +
  "Before your next spawn, merge or push, re-read these, in order:";
const skillLine = `- the savvy-mode skill: ${pluginDir}/skills/savvy-mode/SKILL.md`;
const storeLine = (dir: string) => `- the orchestrate store: ${dir}/`;
const transcriptLine = (path: string) =>
  `- the pre-compaction transcript: ${path}. Read it in a subagent and keep only the timeline it reduces it to.`;
const trailLine = (path: string) => `- the show-me-your-work trail: ${path}`;
const resumeLine = (sha: string) => `- the resume note: the body of the \`wip:\` commit ${sha} (\`git log -1 ${sha}\`)`;

const lines = (stdout: string) => stdout.trimEnd().split("\n");

describe("savvy-mode compaction hook", () => {
  test("without the session's marker it prints nothing, whatever state exists", () => {
    const s = session();
    writeTranscript(s);
    writeFiles(s.cwd, { ".claude/jrzstack/orchestrate/migrate/units.tsv": "", "decisions.tsv": "" });
    repoWithCommit(s, "wip: halfway", "resume here");
    markSession(s, "another-session");

    const result = compacted(s);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  test("with a marker and every kind of state, lists them all in order", () => {
    const s = session();
    markSession(s);
    writeTranscript(s);
    writeFiles(s.cwd, {
      ".claude/jrzstack/orchestrate/migrate/units.tsv": "",
      ".claude/jrzstack/orchestrate/rename/units.tsv": "",
      "decisions.tsv": "",
      ".audit/rename.tsv": "",
    });
    const sha = repoWithCommit(s, "wip: halfway through the rename", "Intent: rename the store.");

    const result = compacted(s);

    expect(result.exitCode).toBe(0);
    expect(lines(result.stdout)).toEqual([
      intro,
      skillLine,
      storeLine(join(s.cwd, ".claude/jrzstack/orchestrate/migrate")),
      storeLine(join(s.cwd, ".claude/jrzstack/orchestrate/rename")),
      transcriptLine(s.transcript),
      trailLine(join(s.cwd, "decisions.tsv")),
      trailLine(join(s.cwd, ".audit/rename.tsv")),
      resumeLine(sha),
    ]);
  });

  test("with a marker and nothing else, lists only the skill", () => {
    const s = session();
    markSession(s);

    const result = compacted(s);

    expect(result.exitCode).toBe(0);
    expect(lines(result.stdout)).toEqual([intro, skillLine]);
  });

  test("lists only the state that exists, and no resume note when the last commit isn't a wip: commit", () => {
    const s = session();
    markSession(s);
    writeTranscript(s);
    writeFiles(s.cwd, { ".audit/fix.tsv": "", ".claude/jrzstack/orchestrate/.keep": "" });
    repoWithCommit(s, "Fix the parser", "wip: not a pause");

    const result = compacted(s);

    expect(result.exitCode).toBe(0);
    expect(lines(result.stdout)).toEqual([intro, skillLine, transcriptLine(s.transcript), trailLine(join(s.cwd, ".audit/fix.tsv"))]);
  });

  test("a session id that isn't a plain name prints nothing", () => {
    const s = session();
    writeFiles(s.home, { ".claude/jrzstack/sessions/x": "" });

    const result = compacted(s, { session_id: "../sessions/x" });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });
});
