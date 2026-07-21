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

npm install
npm run build
npm test
npm run skills:import -- --list

printf '\nBootstrap complete. Next steps:\n'
echo "1. Choose identity in .env and optional private personality in .data/personality.md."
echo "2. Run npm run setup:telegram from an interactive terminal."
echo "3. Authenticate a model with 'npx pi', /login, and /model."
echo "4. Optional: review/import Codex or Claude Code skills with npm run skills:import."
echo "5. Run npm run doctor and npm run verify:telegram."
echo "6. Optional: bash scripts/setup-local-whisper.sh."
echo "7. Start only after validation with npm start or npx pm2 start ecosystem.config.cjs."
