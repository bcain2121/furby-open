# Security Policy

## Supported versions

Furby Open is alpha software. Security fixes target the latest tagged release and the default branch.

## Report a vulnerability

Please use GitHub's **private vulnerability reporting** or a private security advisory for the repository. Do not open a public issue containing credentials, exploit details, private conversations, or user data.

If you accidentally expose a credential, revoke or rotate it immediately. Removing it from a file does not remove it from Git history.

## Known upstream dependency advisories

The current Pi SDK npm package ships its own shrinkwrapped dependency tree. At the first alpha release, npm reports:

- `brace-expansion` denial-of-service advisory through Pi's `minimatch`
- `protobufjs` parser denial-of-service advisory through Pi's Google GenAI dependency

Neither parser is intentionally exposed directly to untrusted Telegram input by Furby Open, but the advisories remain open until an upstream Pi package refreshes its shrinkwrap. CI reports all advisories and blocks critical-severity findings. Dependabot monitors updates.

## Trust model

Furby Open is designed for one trusted operator on one computer.

### Telegram

Only the numeric `TELEGRAM_USER_ID` in `.env` is allowed through the bot middleware. Use a dedicated bot token for each deployment. Do not run two deployments with the same token.

### Safe mode

The public default is `FURBY_OPEN_TOOL_MODE=safe`. It exposes only read-only capabilities selected by an explicit allowlist.

### Coding mode

Coding mode gives the model shell and filesystem modification tools. Commands can leave the repository directory. Enable it only when you trust the active model, prompt, loaded skills, and machine account.

Recommended precautions:

- run under a non-administrator OS account
- keep backups
- review proposed commands and changes
- avoid mounting secrets that the assistant does not need
- switch back to safe mode after customization

### Pi skills and packages

Skills are instructions to the model; Pi extensions/packages may execute code with the process user's permissions. Review third-party resources before installing them. Project-local starter skills in this repository are plain Markdown and should remain reviewable.

### A2A

The A2A endpoint is disabled by default. Its current protocol has no authentication. If enabled, keep `FURBY_OPEN_A2A_HOSTNAME=127.0.0.1` unless you have added an authenticated network boundary.

### Secrets and private data

Never commit:

- `.env`
- API keys or Telegram tokens
- `~/.pi/agent/auth.json`
- databases and Pi sessions
- Telegram uploads or generated workspace files
- logs containing private operational data

Run a full-history secret scanner before every public release.
