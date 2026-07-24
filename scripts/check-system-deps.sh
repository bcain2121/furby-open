#!/usr/bin/env bash
set -u

failures=0
warns=0

check_required() {
  local cmd="$1" hint="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "PASS $cmd: $(command -v "$cmd")"
  else
    echo "FAIL $cmd: missing. $hint"
    failures=$((failures + 1))
  fi
}

check_optional() {
  local cmd="$1" hint="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "PASS $cmd: $(command -v "$cmd")"
  else
    echo "WARN $cmd: missing. $hint"
    warns=$((warns + 1))
  fi
}

check_required node "Install Node.js 22.19 or newer."
check_required npm "Install npm with Node.js."
check_optional ffmpeg "Needed for voice and media conversion; text chat still works without it."
check_optional pdftotext "Needed for PDF extraction; install Poppler when you need PDFs."
check_optional cmake "Needed only for local whisper.cpp."
check_optional make "Needed only for local whisper.cpp."
check_optional gcc "Needed only for local whisper.cpp."
check_optional g++ "Needed only for local whisper.cpp."
check_optional pm2 "Needed only for daemon mode."
check_optional pi "Use 'npx pi' if the global command is not installed."

if command -v node >/dev/null 2>&1; then
  node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 19)) process.exit(1)" \
    && echo "PASS Node version: $(node --version)" \
    || { echo "FAIL Node $(node --version) is too old; require >=22.19.0."; failures=$((failures + 1)); }
fi

if [ -f .env ]; then
  echo "PASS .env exists"
else
  echo "WARN .env missing; copy .env.example to .env."
  warns=$((warns + 1))
fi

printf '\nSystem dependency check: %s blocker(s), %s warning(s).\n' "$failures" "$warns"
[ "$failures" -eq 0 ]
