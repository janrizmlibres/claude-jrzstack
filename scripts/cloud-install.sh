#!/usr/bin/env bash
# The setup line's installer: puts pstack on a cloud environment's VM.
#
#   cloud-install.sh [ref] [--config KEY=VALUE]...
#
# Run from the clone the setup line makes. It checks the clone out at ref (a
# branch, default main), then writes a marketplace beside it whose pstack entry
# is a command source: the command fast-forwards the clone on ref and prints
# its pstack directory. Claude Code copies that directory into the plugin
# cache, and every cloud session starts from the environment's snapshot, so a
# plain install would stay at the snapshot's commit. The command source is what
# keeps it current: Claude Code reruns the command once per session, shortly
# after start, and reloads the plugin in that session when the files changed.
# It installs pstack from that marketplace at user scope with the --config
# values, then merges, never replaces, into the VM's user settings: subagent
# spawn depth 3 and a Read rule for the plugin cache. Last, it installs
# Playwright Chromium, warning but still exiting 0 when that fails.
set -euo pipefail

usage() {
  echo "usage: cloud-install.sh [ref] [--config KEY=VALUE]..." >&2
  exit 2
}

main() {
  local clone ref="" market command settings_dir settings
  local -a configs=()
  clone="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

  while (($#)); do
    case $1 in
      --config)
        (($# >= 2)) || usage
        configs+=(--config "$2")
        shift 2
        ;;
      -*) usage ;;
      *)
        [[ -z $ref ]] || usage
        ref=$1
        shift
        ;;
    esac
  done
  ref=${ref:-main}

  git -C "$clone" fetch -q --depth 1 origin "$ref"
  git -C "$clone" checkout -q -B "$ref" FETCH_HEAD

  # The command must print only the directory, so the pull's output goes
  # nowhere, and a failed pull still loads the clone as it is.
  market="$clone-marketplace"
  command="git -C $(printf %q "$clone") pull --ff-only -q origin $(printf %q "$ref") >/dev/null 2>&1; echo $(printf %q "$clone/pstack")"
  mkdir -p "$market/.claude-plugin"
  jq -n --arg command "$command" '{
    name: "claude-pstack",
    owner: {name: "Janriz Libres"},
    description: "pstack for cloud sessions, pulled to the current ref at each session start.",
    plugins: [{name: "pstack", source: {source: "command", command: $command, timeout: 60}}]
  }' >"$market/.claude-plugin/marketplace.json"

  # -y accepts the command just written; setup has no terminal to confirm it in.
  claude plugin marketplace add "$market" --scope user </dev/null
  claude plugin install pstack@claude-pstack --scope user -y ${configs[@]+"${configs[@]}"} </dev/null

  settings_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
  settings="$settings_dir/settings.json"
  mkdir -p "$settings_dir"
  [[ -f $settings ]] || echo '{}' >"$settings"
  jq --arg rule "Read(/$settings_dir/plugins/cache/claude-pstack/**)" '
    .env = ((.env // {}) + {CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "3"})
    | .permissions.allow = ((.permissions.allow // []) | if any(. == $rule) then . else . + [$rule] end)
  ' "$settings" >"$settings.tmp"
  mv "$settings.tmp" "$settings"

  if ! npx --yes playwright install --with-deps chromium </dev/null; then
    echo "cloud-install: warning: Playwright Chromium did not install; browser checks in this environment will fail until it does." >&2
  fi
}

main "$@"
