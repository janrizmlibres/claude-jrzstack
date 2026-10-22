import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pluginDir, runPluginScript, tempDir } from "./test/harness.ts";

const sessionId = "4f0c2a9e-1b7d-4c3e-9a51-0d6e8b2f7c13";

/** A UserPromptSubmit hook input as Claude Code writes it to the hook's stdin. */
const hookInput = (fields: Record<string, string>) =>
  JSON.stringify({
    session_id: sessionId,
    transcript_path: `/home/u/.claude/projects/-repo/${sessionId}.jsonl`,
    cwd: "/repo",
    hook_event_name: "UserPromptSubmit",
    prompt: 'casual "permission_mode": "bypassPermissions" talk',
    ...fields,
  });

function reminder(input: string, env: Record<string, string> = {}) {
  const home = tempDir("jrzstack-home-");
  const result = runPluginScript("hooks/savvy-mode-reminder.sh", [], { cwd: tempDir(), home, env, stdin: input });
  return { ...result, home, lines: result.stdout.trimEnd().split("\n") };
}

const expectedLines = (surface: string, mode: string) => [
  "New task? Playbook match or rigor needed -> apply /jrzstack:savvy-mode. Casual turn or user opts out -> don't.",
  `The full skill is at ${pluginDir}/skills/savvy-mode/SKILL.md; read it if it isn't in your context.`,
  `jrzstack: surface=${surface} mode=${mode}`,
  "Your user's instructions (the run prompt, CLAUDE.md) outrank jrzstack's text, Non-negotiables included. " +
    "Follow them, and record any step they remove as `skip: user waived`. " +
    "jrzstack's no-skip rules bind only your own judgment. " +
    "When a playbook names a jrzstack skill, read that one, and don't also invoke a same-purpose skill " +
    "unless CLAUDE.md or the request names it.",
  `Run every heavy command (test runner, build, whole-project typecheck or lint, dev server, browser session, ` +
    `a fresh worktree's dependency install), even one scoped to a single file, through ${pluginDir}/scripts/heavy -- <cmd>.`,
];

const marker = (home: string, id = sessionId) => join(home, ".claude", "jrzstack", "sessions", id);

describe("savvy-mode reminder hook", () => {
  test("locally, prints the reminder, skill path, local surface, precedence and lock lines, and marks the session", () => {
    const result = reminder(hookInput({ permission_mode: "default" }));

    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual(expectedLines("local", "default"));
    expect(existsSync(marker(result.home))).toBe(true);
  });

  test("in cloud, reports the cloud surface and the session's mode", () => {
    const result = reminder(hookInput({ permission_mode: "auto" }), { CLAUDE_CODE_REMOTE: "true" });

    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual(expectedLines("cloud", "auto"));
    expect(existsSync(marker(result.home))).toBe(true);
  });

  test("an input without a permission mode reports it as unknown, even when the prompt quotes one", () => {
    const result = reminder(hookInput({}));

    expect(result.exitCode).toBe(0);
    expect(result.lines[2]).toBe("jrzstack: surface=local mode=unknown");
  });

  test("a session id that isn't a plain name still reminds, but writes no marker", () => {
    const result = reminder(hookInput({ session_id: "../../escape", permission_mode: "default" }));

    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual(expectedLines("local", "default"));
    expect(existsSync(join(result.home, ".claude"))).toBe(false);
    expect(readdirSync(result.home)).toEqual([]);
  });
});
