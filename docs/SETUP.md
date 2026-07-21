# Setup

## 1. Requirements

Required:

- Linux or macOS; Windows through WSL is currently experimental
- Node.js 22.19+
- npm
- `ffmpeg`
- `pdftotext` from Poppler
- Telegram account

Optional:

- PM2 for daemon mode
- CMake and a C/C++ toolchain for local Whisper

Check your computer:

```bash
bash scripts/check-system-deps.sh
```

## 2. Install

```bash
git clone https://github.com/bcain2121/furby-open.git
cd furby-open
bash scripts/bootstrap.sh
```

Bootstrap creates a private `.env`, installs npm dependencies, and runs the build and tests. It does not create credentials or start the bot.

## 3. Create a dedicated Telegram bot

1. Message `@BotFather` in Telegram.
2. Run `/newbot` and follow the prompts.
3. Copy the token into `TELEGRAM_BOT_TOKEN` in `.env`.
4. Find your numeric Telegram user ID using a trusted ID bot or Telegram API method.
5. Set `TELEGRAM_USER_ID`.

Use a new bot token for this deployment. Do not share one token between multiple running assistants.

## 4. Configure identity

```env
ASSISTANT_NAME=My Assistant
ASSISTANT_OWNER_NAME=Alex
ASSISTANT_TIMEZONE=America/New_York
ASSISTANT_LOCATION=Brooklyn, NY
```

Use an IANA timezone such as `UTC`, `America/Los_Angeles`, or `Europe/London`.

## 5. Authenticate a model

OAuth-backed setup:

```bash
npx pi
```

Enter `/login`, choose a provider, and complete authentication. Pi stores credentials outside this repository under `~/.pi/agent/`.

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
