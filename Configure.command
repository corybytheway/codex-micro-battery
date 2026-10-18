#!/bin/zsh
# Author: Cory McCabe
set -eu
cd -- "${0:A:h}"
task_node_bin=""
for task_candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
  if [[ -x "$task_candidate" ]]; then task_node_bin="$task_candidate"; break; fi
done
if [[ -z "$task_node_bin" ]] && command -v node >/dev/null 2>&1; then task_node_bin="$(command -v node)"; fi
if [[ -z "$task_node_bin" ]]; then
  print "Install Node.js 22 or newer from https://nodejs.org/en/download, then run this again."
  read "?Press Return to close."
  exit 1
fi
"$task_node_bin" bin/micro-battery.cjs configure
read "?Press Return to close."
