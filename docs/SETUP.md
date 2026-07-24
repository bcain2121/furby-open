# Setup

## 1. Requirements

Required:

- macOS, Windows 10/11, or a mainstream Linux distribution
- Node.js 22.19+ and npm; the guided installer can add them
- Telegram account
- access to a Pi-supported model provider

Optional feature dependencies:

- `ffmpeg` for voice and media conversion
- Poppler's `pdftotext` for PDF extraction
- PM2 for daemon mode
- CMake and a C/C++ toolchain for local Whisper

Text chat works without the optional feature dependencies.

## 2. Install

The easiest path is the double-click or terminal installer in [`INSTALLER.md`](INSTALLER.md). It installs prerequisites, application files, and locked npm dependencies, then opens the shared setup wizard.

Manual installation remains available:

```bash
git clone https://github.com/bcain2121/furby-open.git
cd furby-open
bash scripts/bootstrap.sh
npm run setup
```

Bootstrap creates private local files and runs the build and tests. `npm run setup` guides identity, personality, Telegram, Pi login, and validation. Neither starts the bot automatically.

Check macOS/Linux system tools manually with:

```bash
bash scripts/check-system-deps.sh
```

## 3. Create a dedicated Telegram bot

The shared `npm run setup` wizard launches this stage automatically. To run only the private Telegram helper from your own terminal:

```bash
npm run setup:telegram
```

It explains the BotFather steps, hides your token while you enter it, verifies the new bot, asks you to send `/start`, discovers your numeric Telegram user ID from that private message, asks you to confirm the account, and writes both credentials directly to ignored `.env`.

Verify later with:

```bash
npm run verify:telegram
```

Use a new bot token for this deployment. Never paste it into an AI-agent chat or share one token between multiple assistants.

## 4. Configure identity

The guided setup asks these questions and writes only targeted local values. Manual equivalents are:

```env
ASSISTANT_NAME=My Assistant
ASSISTANT_OWNER_NAME=Alex
ASSISTANT_TIMEZONE=America/New_York
ASSISTANT_LOCATION=Brooklyn, NY
```

Use an IANA timezone such as `UTC`, `America/Los_Angeles`, or `Europe/London`.

For private behavioral customization, use ignored `.data/personality.md`. The guided setup interviews you about tone, initiative, boundaries, interests, and pet peeves, shows the summary before saving it, and preserves the public security rules. See [`CUSTOMIZATION.md`](CUSTOMIZATION.md).

## 5. Authenticate a model

OAuth-backed setup:

```bash
npx pi
```

Enter `/login`, choose a provider, and complete authentication. Use `/model` to select a model, then `/quit` to return to the setup wizard. Pi stores credentials outside this repository under `~/.pi/agent/`.

You may instead set a supported API key in `.env`. Never commit `.env`.

Use Pi's `enabledModels` setting for the `/model` quick selector. Furby Open falls back to the first authenticated model when its configured defaults are unavailable.

By default, Furby Open loads only project-local skills committed under `.pi/skills/`. To deliberately include skills from `~/.pi/agent/skills/`, set `FURBY_OPEN_LOAD_GLOBAL_SKILLS=true` after reviewing those skills.

## 6. Optional: import existing agent skills

Furby Open detects these standard personal skill locations:

```text
~/.codex/skills/
~/.claude/skills/
~/.agents/skills/
```

Preview detected agents and compatible skills:

```bash
npm run skills:import -- --list
```

Run the interactive importer:

```bash
npm run skills:import
```

Target one source or skill when preferred:

```bash
npm run skills:import -- --source=codex
npm run skills:import -- --skill=my-skill
```

The importer never silently trusts a skill. It excludes hidden Codex system skills, validates required Pi frontmatter, rejects symlinks and bounded-resource violations, warns about Claude-specific syntax, and asks for explicit confirmation. Imported skills are copied to `.pi/skills/`, recorded in a local ignored manifest, and ignored by Git.

Review imported `SKILL.md` files and scripts before use. Restart the app or reset the Pi session after importing.

## 7. Voice transcription

Local Whisper is the default. Install it with:

```bash
bash scripts/setup-local-whisper.sh
```

Or opt into OpenAI transcription:

```env
TRANSCRIPTION_PROVIDER=openai
OPENAI_API_KEY=your-key
```

## 8. Validate

```bash
npm run doctor
npm run build
npm test
npm run smoke:pi
```

Doctor may warn about optional components. Fix every `FAIL` before startup.

## 9. Start

Foreground:

```bash
npm start
```

PM2:

```bash
npx pm2 start ecosystem.config.cjs
npx pm2 logs furby-open
```

## 10. Telegram smoke test

Send:

```text
/help
/status
/models
/skills
hello
```

Then test optional features:

- upload an image
- upload a PDF and ask for a summary
- send a voice note
- `/schedule in 1m do reply with scheduler test`

## Install with a coding agent

If you are using Codex, Claude Code, or another terminal-capable coding agent, give it the repository URL and ask it to follow [`INSTALL_WITH_AI.md`](INSTALL_WITH_AI.md). That runbook requires the agent to handle ordinary terminal work, explain BotFather and Pi authentication one step at a time, protect credentials, configure personality, validate the installation, and wait for approval before startup.

## 11. Keep the deployment isolated

Each checkout should use its own:

- `.env`
- Telegram bot token
- `.data/furby-open.db`
- `.data/sessions/`
- `furby-open-workspace/`
- PM2 process name (`furby-open`)
- A2A port (`3013` by default)

Do not point `FURBY_OPEN_ROOT_DIR` at another assistant installation.
