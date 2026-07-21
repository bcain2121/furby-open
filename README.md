# Furby Open

**A small, self-hosted personal AI agent for Telegram, powered by the Pi SDK.**

Furby Open keeps the core understandable: one Telegram bot, one local SQLite database, Pi-native model access and sessions, a private file workspace, and an optional path for the assistant to add project-local skills when you explicitly enable coding mode.

> **Alpha software:** review the security model before giving any AI agent access to your computer.

## Why Furby Open?

- **Small core:** inspectable TypeScript instead of a large agent platform.
- **Local ownership:** memories, schedules, sessions, and uploaded files stay on your machine.
- **Bring your own model:** use Pi-supported OAuth providers or API keys.
- **Telegram-native:** talk to your assistant from a phone without hosting a web UI.
- **Expandable:** add ordinary Pi skills under `.pi/skills/`; the assistant can help author them in opt-in coding mode.
- **Safe public defaults:** read-only tool mode and no A2A listener until you enable them.

## Features

- Pi SDK runtime, auth/model registry, and native sessions
- Single-user Telegram authorization
- Local SQLite memories, preferences, uploads, and scheduled tasks
- Text, photo, document, PDF, and voice-note ingestion
- Local Whisper transcription or optional OpenAI transcription
- Private workspace with path and symlink confinement
- Rapid-message batching and reliable chunked Telegram delivery
- Safe and coding capability modes
- Optional localhost A2A JSON-RPC endpoint
- Project-local starter skills for customization and skill creation
- Health checks, retention cleanup, tests, and PM2 configuration

## Dependencies

All JavaScript dependencies are declared in `package.json` and reproducibly locked in `package-lock.json`; `npm install` or `npm ci` installs them. Furby Open does not vendor model credentials or operating-system packages.

Required system dependencies are Node.js 22.19+, npm, `ffmpeg`, and Poppler's `pdftotext`. Local Whisper build tools and PM2 are optional. Run `bash scripts/check-system-deps.sh` or `npm run doctor` for exact detection.

## Quick Start

### Requirements

- Node.js **22.19 or newer**
- npm
- `ffmpeg`
- `pdftotext` from Poppler
- A Telegram bot token and numeric Telegram user ID
- At least one model authenticated through Pi or configured by API key

```bash
git clone https://github.com/bcain2121/furby-open.git
cd furby-open
bash scripts/bootstrap.sh
```

Configure identity in the newly created private `.env`, then run the secure Telegram helper:

```env
ASSISTANT_NAME=My Assistant
ASSISTANT_OWNER_NAME=Alex
ASSISTANT_TIMEZONE=America/New_York
ASSISTANT_LOCATION=Brooklyn, NY
```

```bash
npm run setup:telegram
```

The helper walks through BotFather, hides and verifies the token, discovers the owner's numeric user ID after they send `/start`, and writes credentials directly to ignored `.env`.

Authenticate a model:

```bash
npx pi
# Enter /login in Pi, then exit when authentication is complete.
```

Validate and run:

```bash
npm run doctor
npm run build
npm test
npm start
```

See [`docs/SETUP.md`](docs/SETUP.md) for the complete walkthrough.

### Install with a coding agent

Point an agent with terminal access at the repository and use:

> Install Furby Open from https://github.com/bcain2121/furby-open. After cloning, read `AGENTS.md` and follow `docs/INSTALL_WITH_AI.md` stage by stage. Assume I am nontechnical: perform safe terminal work yourself, explain the exact Telegram BotFather and Pi `/login` actions, pause for me at authentication steps, help me choose the assistant's personality, never ask me to paste secrets into chat, validate everything, and ask before starting the bot.

Codex reads `AGENTS.md`; Claude Code is pointed to the same runbook by `CLAUDE.md`. The agent should own dependency installation and diagnostics while the user completes provider and Telegram authentication locally. A web-only chatbot without terminal access can guide the process but cannot install software on the computer.

## Security Modes

Furby Open starts in **safe mode**:

```env
FURBY_OPEN_TOOL_MODE=safe
```

Safe mode exposes Pi's read tool plus explicitly approved read-only assistant tools. It cannot write files, save memory, change schedules, send files, or execute shell commands.

Coding mode is explicit opt-in:

```text
/security coding
```

Coding mode gives the model `read`, `bash`, `edit`, and `write`, plus all registered assistant tools. This is powerful and can affect files outside the repository. Read [`SECURITY.md`](SECURITY.md) first.

## Extending the Assistant

Project-local Pi skills live in:

```text
.pi/skills/<skill-name>/SKILL.md
```

The repository includes:

- `assistant-customizer` — safely personalize identity and behavior
- `skill-builder` — design, implement, and validate a new local skill

In coding mode, you can ask:

> Create a project-local Pi skill that helps me summarize my weekly notes. Show me the files and validation before using it.

Personal identity values live in ignored `.env`. Private tone and behavioral preferences can live in ignored `.data/personality.md`, which is loaded after the neutral public persona. The bundled customizer can interview the owner and prepare this file without changing public defaults.

See [`docs/CUSTOMIZATION.md`](docs/CUSTOMIZATION.md) and [`docs/EXTENDING.md`](docs/EXTENDING.md).

### Import compatible Codex or Claude Code skills

Furby Open can detect Codex CLI, Claude Code, and standard personal skill directories:

```bash
npm run skills:import -- --list
npm run skills:import
```

The importer accepts compatible `SKILL.md` packages only after confirmation, rejects symlinked or oversized skill trees, warns about Claude-specific features, and never imports hidden Codex system skills. Imported skills are local and Git-ignored. They may contain scripts or powerful instructions, so review them before use.

For agent-driven setup, the installer is instructed to preview candidates and ask before importing anything.

## Updating safely

Check for a newer tagged release without changing the installation:

```bash
bash scripts/update.sh --check
```

Apply it:

```bash
bash scripts/update.sh --apply
```

The updater validates the release in an isolated worktree, backs up private data outside the repository, allows only a clean fast-forward update, reinstalls locked dependencies, and reruns build, tests, and doctor checks. See [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## Architecture

```mermaid
flowchart LR
  U[Telegram user] --> T[grammY transport]
  T --> R[Pi SDK runtime]
  R --> M[Model provider]
  R --> S[Pi skills]
  R --> D[(SQLite)]
  R --> W[Private workspace]
  Q[Scheduler] --> R
  A[Optional localhost A2A] --> R
```

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Private Data

The repository intentionally excludes:

- `.env` and API credentials
- SQLite databases
- Pi sessions
- Telegram uploads and generated workspace files
- logs
- Pi OAuth files and user-installed global skills

Never commit those files. See [`docs/PRIVACY.md`](docs/PRIVACY.md).

## Development

```bash
npm install
npm run check:public
npm run build
npm test
npm run test:coverage
npm audit --omit=dev --audit-level=critical
```

Contributions are welcome; see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT — see [`LICENSE`](LICENSE).

## Name and Affiliation

This independent open-source project is not affiliated with, endorsed by, or sponsored by Hasbro. “Furby” is a trademark of Hasbro and is used here only as the current community project name. A future rename may occur to avoid confusion.
