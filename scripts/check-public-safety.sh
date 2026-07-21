#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failures=0
fail() { echo "FAIL $1"; failures=$((failures + 1)); }
pass() { echo "PASS $1"; }

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  tracked="$(git ls-files)"
else
  tracked="$(find . -type f -not -path './node_modules/*' -not -path './.git/*' -printf '%P\n')"
fi

for forbidden in '.env' '.data/furby-open.db'; do
  if grep -Fxq "$forbidden" <<<"$tracked"; then fail "$forbidden must not be tracked"; else pass "$forbidden is not tracked"; fi
done

runtime_paths="$(grep -E '^(logs/|furby-open-workspace/)' <<<"$tracked" | grep -v '^furby-open-workspace/README\.md$' || true)"
if [ -n "$runtime_paths" ]; then
  fail "runtime logs or workspace content appear to be tracked"
else
  pass "runtime logs and workspace content are not tracked"
fi

scan_files=()
while IFS= read -r file; do
  [ -f "$file" ] && scan_files+=("$file")
done <<<"$tracked"

if [ "${#scan_files[@]}" -gt 0 ]; then
  if grep -IlE '(-----BEGIN ([A-Z ]+)?PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|[0-9]{8,10}:[A-Za-z0-9_-]{30,})' "${scan_files[@]}" | grep -q .; then
    fail "a tracked file matches a high-risk secret pattern"
  else
    pass "no high-risk secret patterns found"
  fi

  if grep -IlE '/(home|Users)/[^ /]+' "${scan_files[@]}" | grep -v '^scripts/check-public-safety\.sh$' | grep -q .; then
    fail "a tracked file contains an absolute user home path"
  else
    pass "no absolute user home paths found"
  fi
fi

if [ "$failures" -gt 0 ]; then
  echo "Public safety check failed with $failures issue(s)."
  exit 1
fi

echo "Public safety check passed. This complements, but does not replace, a full-history secret scanner."
