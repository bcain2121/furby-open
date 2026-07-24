#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
clear
bash "$ROOT/install.sh"
status=$?
printf '\n'
if [[ $status -eq 0 ]]; then
  echo "Furby Open setup finished. You may close this window."
else
  echo "The installer stopped with an error. Read the message above, then press any key to close."
fi
read -r -n 1 -s
exit "$status"
