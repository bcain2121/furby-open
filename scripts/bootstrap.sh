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

printf '\nBootstrap complete. Next steps:\n'
echo "1. Create a dedicated Telegram bot and edit .env."
echo "2. Authenticate a model with 'npx pi' and /login, or configure an API key."
echo "3. Run npm run doctor."
echo "4. Optional: bash scripts/setup-local-whisper.sh."
echo "5. Start with npm start or npx pm2 start ecosystem.config.cjs."
