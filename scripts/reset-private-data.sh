#!/usr/bin/env bash
set -euo pipefail

YES=0
INCLUDE_ENV=0
INCLUDE_WHISPER=0
for arg in "$@"; do
  case "$arg" in
    --yes) YES=1 ;;
    --include-env) INCLUDE_ENV=1 ;;
    --include-whisper) INCLUDE_WHISPER=1 ;;
    *) echo "Unknown argument: $arg"; exit 2 ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGETS=(
  ".data/furby-open.db"
  ".data/sessions"
  ".data/a2a"
  ".data/backups"
  ".data/preferences.json"
  "logs"
  "furby-open-workspace/telegram"
)
[ "$INCLUDE_ENV" -eq 1 ] && TARGETS+=(".env")
[ "$INCLUDE_WHISPER" -eq 1 ] && TARGETS+=(".data/local/whisper.cpp")

echo "This removes Furby Open's local runtime data only:"
printf '  - %s\n' "${TARGETS[@]}"
echo "It does not touch Git history, source files, or ~/.pi/agent."

if [ "$YES" -ne 1 ]; then
  echo "Type DELETE to continue:"
  read -r answer
  [ "$answer" = "DELETE" ] || { echo "Aborted."; exit 0; }
fi

for target in "${TARGETS[@]}"; do
  if [ -e "$target" ]; then
    rm -rf "$target"
    echo "Removed $target"
  fi
done

mkdir -p .data logs furby-open-workspace
[ -f .data/.gitkeep ] || touch .data/.gitkeep

echo "Furby Open private runtime reset complete."
