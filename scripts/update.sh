#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---check}"
BACKUP_ROOT="${FURBY_OPEN_BACKUP_DIR:-$(dirname "$ROOT")/furby-open-backups}"

if [[ "$MODE" != "--check" && "$MODE" != "--apply" ]]; then
  echo "Usage: bash scripts/update.sh [--check|--apply]" >&2
  exit 2
fi

cd "$ROOT"
if [[ ! -d .git ]]; then
  echo "FAIL Updates require a Git clone. Downloaded source archives must be replaced with a fresh clone." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "FAIL Tracked or untracked source changes are present. Local .env, .data, workspace, and imported skills are ignored and do not block updates." >&2
  git status --short
  exit 1
fi

echo "Fetching release information..."
git fetch --tags origin
TARGET_TAG="${FURBY_OPEN_UPDATE_TAG:-$(git tag --list 'v*' --sort=-v:refname | head -n 1)}"
if [[ -z "$TARGET_TAG" ]]; then
  echo "FAIL No release tags were found." >&2
  exit 1
fi
CURRENT_COMMIT="$(git rev-parse HEAD)"
TARGET_COMMIT="$(git rev-parse "${TARGET_TAG}^{commit}")"

echo "Current: $(git describe --tags --always "$CURRENT_COMMIT")"
echo "Latest release: $TARGET_TAG"

if [[ "$CURRENT_COMMIT" == "$TARGET_COMMIT" ]] || git merge-base --is-ancestor "$TARGET_COMMIT" "$CURRENT_COMMIT"; then
  echo "PASS This checkout already includes $TARGET_TAG."
  exit 0
fi
if ! git merge-base --is-ancestor "$CURRENT_COMMIT" "$TARGET_COMMIT"; then
  echo "FAIL The latest release is not a fast-forward from this checkout. Ask an installation agent to inspect the repository; no files were changed." >&2
  exit 1
fi
if [[ "$MODE" == "--check" ]]; then
  echo "UPDATE AVAILABLE Run: bash scripts/update.sh --apply"
  exit 0
fi

TEMP_WORKTREE="$(mktemp -d)"
cleanup() {
  git worktree remove --force "$TEMP_WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$TEMP_WORKTREE"
}
trap cleanup EXIT

echo "Validating $TARGET_TAG in an isolated worktree before changing this installation..."
git worktree add --detach "$TEMP_WORKTREE" "$TARGET_COMMIT" >/dev/null
(
  cd "$TEMP_WORKTREE"
  npm ci
  npm run check:public
  npm run build
  npm test
)

WAS_PM2_RUNNING=false
if command -v pm2 >/dev/null 2>&1; then
  PM2_STATUS="$(pm2 jlist 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const p=JSON.parse(d).find(x=>x.name==='furby-open');process.stdout.write(p?.pm2_env?.status||'')}catch{}})")"
  if [[ "$PM2_STATUS" == "online" ]]; then
    WAS_PM2_RUNNING=true
    pm2 stop furby-open
    echo "PASS PM2 process stopped for a consistent private-data backup."
  fi
fi
if [[ "$WAS_PM2_RUNNING" != "true" ]]; then
  echo "Ensure any foreground npm start process is stopped before backup."
fi

mkdir -p "$BACKUP_ROOT"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_PATH="$BACKUP_ROOT/furby-open-$TIMESTAMP.tar.gz"
PRIVATE_PATHS=()
for item in .env .data furby-open-workspace .pi/imported-skills.json .pi/skills; do
  [[ -e "$item" ]] && PRIVATE_PATHS+=("$item")
done
if [[ ${#PRIVATE_PATHS[@]} -gt 0 ]]; then
  tar -czf "$BACKUP_PATH" "${PRIVATE_PATHS[@]}"
  chmod 600 "$BACKUP_PATH"
  echo "PASS Private-data backup created: $BACKUP_PATH"
else
  echo "WARN No private runtime files existed to back up."
fi

echo "Applying fast-forward update to $TARGET_TAG..."
git merge --ff-only "$TARGET_COMMIT"
npm ci
npm run build
npm test
npm run doctor

if [[ "$WAS_PM2_RUNNING" == "true" ]]; then
  pm2 restart furby-open --update-env
  echo "PASS PM2 process restarted."
else
  echo "The update is installed. Start it with npm start when ready."
fi

echo "PASS Furby Open updated to $TARGET_TAG."
