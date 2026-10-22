#!/usr/bin/env bash
# savvy-mode's UserPromptSubmit hook, registered by its SKILL.md frontmatter
# when the skill is invoked and fired on every turn after, typed or not.
#
# Prints the reminder that keeps the session in savvy-mode, and marks the
# session so the compaction hook knows it was in savvy-mode. Reads the hook
# input JSON on stdin; the surface comes from CLAUDE_CODE_REMOTE, which Claude
# Code sets in cloud sessions. Always exits 0: a hook failure must never block
# the user's prompt.

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
input="$(cat)"

# The value of a top-level string field of the hook input. A key inside a JSON
# string value is escaped (\"key\"), so the prompt can't forge one.
field() {
  if [[ $input =~ \"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

session_id="$(field session_id)"
mode="$(field permission_mode)"
surface=local
[[ -n ${CLAUDE_CODE_REMOTE:-} ]] && surface=cloud

cat <<EOF
New task? Playbook match or rigor needed -> apply /jrzstack:savvy-mode. Casual turn or user opts out -> don't.
The full skill is at $root/skills/savvy-mode/SKILL.md; read it if it isn't in your context.
jrzstack: surface=$surface mode=${mode:-unknown}
Your user's instructions (the run prompt, CLAUDE.md) outrank jrzstack's text, Non-negotiables included. Follow them, and record any step they remove as \`skip: user waived\`. jrzstack's no-skip rules bind only your own judgment. When a playbook names a jrzstack skill, read that one, and don't also invoke a same-purpose skill unless CLAUDE.md or the request names it.
Run every heavy command (test runner, build, whole-project typecheck or lint, dev server, browser session, a fresh worktree's dependency install), even one scoped to a single file, through $root/scripts/heavy -- <cmd>.
EOF

if [[ $session_id =~ ^[A-Za-z0-9_-]+$ ]]; then
  sessions="$HOME/.claude/jrzstack/sessions"
  mkdir -p "$sessions" 2>/dev/null && : >"$sessions/$session_id" 2>/dev/null
fi
exit 0
