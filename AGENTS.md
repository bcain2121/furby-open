# Furby Open Project Context

Furby Open is the public, reusable edition of a minimal Telegram personal assistant built on the Pi SDK.

## Project boundaries

- This repository must remain independent from any private Furby Assistant installation.
- Never copy private `.env` files, databases, sessions, logs, uploads, OAuth files, or personal skills into this repository.
- Do not add machine-specific absolute paths or personal names, addresses, email addresses, phone numbers, account IDs, or business data.
- Public defaults must remain safe: safe tool mode, A2A disabled, localhost binding when enabled, and empty credentials.

## Architecture

- Pi SDK provides the agent runtime, auth/model registry, sessions, built-in tools, and skill loading.
- Telegram is the transport and single-user authentication boundary.
- SQLite stores assistant-owned memory, media metadata, schedules, and preferences.
- Pi session files store active conversation continuity.
- The configured workspace stores uploads and user-facing files.
- Project-local starter skills live under `.pi/skills/`.

## Installation assistance

When a user asks you to install this repository:

1. Read `README.md`, `docs/SETUP.md`, `SECURITY.md`, and `.env.example` before acting.
2. Check Node.js and system dependencies with `bash scripts/check-system-deps.sh`.
3. Run `bash scripts/bootstrap.sh`; do not start the bot yet.
4. Guide the user through `npx pi` and the interactive `/login` flow. The user must complete provider/browser authentication themselves.
5. Guide the user through creating a dedicated bot with Telegram `@BotFather` and finding their numeric Telegram user ID. The user must paste both values into their local `.env` themselves unless they explicitly ask for help editing it.
6. Never request that credentials be pasted into chat, print `.env`, echo secret values, or commit credentials.
7. Run `npm run skills:import -- --list`. Explain that external skills may contain scripts or provider-specific instructions. Import nothing unless the user reviews the candidates and approves the import.
8. Run `npm run doctor`, explain each failure/warning, then run the build and tests.
9. Start with `npm start` only after doctor has no blocking failures and the user approves startup.
10. Keep safe mode as the default. Explain coding mode before enabling it.
11. Never reuse another assistant's Telegram token, database, workspace, sessions, process name, or A2A port.

A web-only agent without shell access can provide commands and guidance but cannot perform the local installation. A coding agent with terminal access can perform the non-interactive steps.

## Validation

Before committing:

```bash
npm run build
npm test
npm run test:coverage
npm audit --omit=dev --audit-level=critical
```

Run a secret and personal-data scan before every public release.
