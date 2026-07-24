#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p .data logs furby-open-workspace
[ -f .data/.gitkeep ] || touch .data/.gitkeep

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo "Created a private .env from .env.example."
else
  echo ".env already exists; leaving it untouched."
fi

npm ci
npm run build
npm test
npm run skills:import -- --list

printf '\nBootstrap complete. Next steps:\n'
echo "1. For guided identity, Telegram, and Pi onboarding, run npm run setup."
echo "2. Optional: review/import Codex or Claude Code skills with npm run skills:import."
echo "3. Optional: bash scripts/setup-local-whisper.sh."
echo "4. Start only after validation with npm start or npx pm2 start ecosystem.config.cjs."
