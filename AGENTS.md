# Furby Open Project Context

Furby Open is the public, reusable edition of a minimal Telegram personal assistant built on the Pi SDK.

## Project boundaries

- This repository must remain independent from any private Furby Assistant installation.
- Never copy private `.env` files, databases, sessions, logs, uploads, OAuth files, or personal skills into this repository.
- Do not add machine-specific absolute paths or personal names, addresses, email addresses, phone numbers, account IDs, or business data.
- Public defaults must remain safe: persistent project scope, no host Bash in project scope, A2A disabled, localhost binding when enabled, and empty credentials.

## Architecture

- Pi SDK provides the agent runtime, auth/model registry, sessions, built-in tools, and skill loading.
- Telegram is the transport and single-user authentication boundary.
- SQLite stores assistant-owned memory, media metadata, schedules, and preferences.
- Pi session files store active conversation continuity.
- The configured workspace stores uploads and user-facing files.
- Project-local starter skills live under `.pi/skills/`.

## Installation assistance

When a user asks you to install this repository, assume they may not understand coding or terminal setup. Follow `docs/INSTALL_WITH_AI.md` stage by stage rather than merely pointing them at documentation.

Required installer behavior:

1. Read `README.md`, `docs/SETUP.md`, `docs/INSTALL_WITH_AI.md`, `SECURITY.md`, and `.env.example` before acting.
2. Prefer the platform installer in `docs/INSTALLER.md`; otherwise perform dependency checks, bootstrap, validation, and ordinary file setup yourself when tools permit it.
3. Hand off to the shared `npm run setup` wizard in a normal user-controlled terminal. It interviews for identity/personality and saves the reviewed private summary in ignored `.data/personality.md`.
4. The wizard launches secure Telegram setup. If the agent terminal is not interactive, ask the user to run `npm run setup` or `npm run setup:telegram` in Terminal/PowerShell/Command Prompt; never ask them to paste the bot token into agent chat.
5. Guide `npx pi` interactively: explain provider choices, ask the user to enter `/login`, wait while they complete browser/device authentication, help them select a model with `/model`, and verify afterward. Mention potential provider billing before a smoke test.
6. Never print `.env`, inspect `~/.pi/agent/auth.json`, echo secret values, request OAuth codes in chat, or commit credentials.
7. Preview external skills with `npm run skills:import -- --list`; import nothing without explicit approval.
8. Run doctor, build, tests, and credential verification. Explain every failure or warning in plain language.
9. Start with `npm start` only after all blocking checks pass and the user approves startup.
10. Keep project scope as the default. Never activate `/outside` on the user's behalf; explain that it is immediate, persistent, applies to scheduled tasks, and returns to confinement only with `/project`.
11. Never reuse another assistant's Telegram token, database, workspace, sessions, process name, or A2A port.
12. Explain safe updates with `bash scripts/update.sh --check` and `bash scripts/update.sh --apply` before finishing.

A web-only agent without shell access can provide commands and guidance but cannot perform the local installation. A coding agent with terminal access should own the non-interactive work and pause only for human authentication or approval.

## Validation

Before committing:

```bash
npm run build
npm test
npm run test:coverage
npm audit --omit=dev --audit-level=critical
```

Run a secret and personal-data scan before every public release.
