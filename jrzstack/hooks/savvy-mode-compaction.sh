#!/usr/bin/env bash
# The plugin's SessionStart hook for the `compact` matcher, registered in
# hooks.json: skill frontmatter's SessionStart never fires.
#
# Silent unless the reminder hook marked this session as being in savvy-mode.
# Then it lists the durable state the compacted session should re-read, in
# order and only what exists: the savvy-mode skill, any orchestrate store in
# cwd, the pre-compaction transcript, any show-me-your-work trail, and a
# resume note (the body of a `wip:` commit at HEAD). Reads the hook input JSON
# on stdin. Always exits 0: a hook failure must never block the session.

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
input="$(cat)"

# The value of a top-level string field of the hook input. A key inside a JSON
# string value is escaped (\"key\"), so a value can't forge one.
field() {
  if [[ $input =~ \"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

session_id="$(field session_id)"
[[ $session_id =~ ^[A-Za-z0-9_-]+$ && -e $HOME/.claude/jrzstack/sessions/$session_id ]] || exit 0

transcript="$(field transcript_path)"
cwd="$(field cwd)"
cwd="${cwd:-$PWD}"
shopt -s nullglob

echo "jrzstack: this session was just compacted, and its summary is lossy. Before your next spawn, merge or push, re-read these, in order:"
echo "- the savvy-mode skill: $root/skills/savvy-mode/SKILL.md"
for store in "$cwd"/.claude/jrzstack/orchestrate/*/; do
  echo "- the orchestrate store: $store"
done
if [[ -n $transcript && -f $transcript ]]; then
  echo "- the pre-compaction transcript: $transcript. Read it in a subagent and keep only the timeline it reduces it to."
fi
for trail in "$cwd"/decisions.tsv "$cwd"/.audit/*.tsv; do
  [[ -f $trail ]] && echo "- the show-me-your-work trail: $trail"
done
if read -r sha subject < <(git -C "$cwd" log -1 --format='%h %s' 2>/dev/null) && [[ $subject == wip:* ]]; then
  echo "- the resume note: the body of the \`wip:\` commit $sha (\`git log -1 $sha\`)"
fi
exit 0
