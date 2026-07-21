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

## Validation

Before committing:

```bash
npm run build
npm test
npm run test:coverage
npm audit --omit=dev --audit-level=critical
```

Run a secret and personal-data scan before every public release.
