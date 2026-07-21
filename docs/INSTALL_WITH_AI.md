# Install Furby Open with a coding agent

This runbook is for Codex CLI, Claude Code, Pi, or another coding agent with terminal access. Assume the owner is nontechnical. Do not hand them a list of unexplained commands and call the installation complete.

## Instructions for the installation agent

### Communication rules

- Explain one stage at a time in plain language.
- Perform safe terminal work yourself when tools permit it.
- Clearly say when the owner must switch to Telegram, a browser, or their own terminal.
- Pause at each human-authentication gate and wait for the owner to say it is complete.
- Never ask the owner to paste a Telegram token, API key, OAuth code, or `.env` contents into agent chat.
- Never print `.env`, `~/.pi/agent/auth.json`, or secret values.
- Do not start Furby Open or enable coding mode without explicit approval.

## Stage 1: inspect and bootstrap

1. Read `AGENTS.md`, `README.md`, `docs/SETUP.md`, `SECURITY.md`, and `.env.example`.
2. Confirm this is a dedicated Furby Open checkout, not another assistant installation.
3. Run:

```bash
bash scripts/check-system-deps.sh
bash scripts/bootstrap.sh
```

4. Explain and fix required dependency failures. Optional Whisper and PM2 warnings may be deferred.

## Stage 2: choose the assistant's identity and personality

Ask the owner, in conversational language:

1. What should the assistant be called?
2. What name should it use for the owner?
3. What timezone should reminders use?
4. Should weather use a default city or remain blank?
5. Should replies be concise, conversational, detailed, playful, formal, or something else?
6. How proactive should it be?
7. What behaviors should it avoid?
8. Are there recurring interests or workflows it should understand?

Before credentials have been added, write non-secret identity values to `.env`. Write the reviewed private personality summary to `.data/personality.md`; this file is ignored by Git and loaded after the public default persona. Do not put tokens, passwords, account numbers, addresses, or unnecessary sensitive facts in the personality file.

If credentials are already present, do not read or display `.env`. Ask the owner to edit identity values locally or use a targeted helper that does not reveal unrelated values.

## Stage 3: Telegram authentication

Explain that Furby Open needs a newly created, dedicated Telegram bot and will authorize exactly one Telegram user.

Tell the owner to run this command in their own interactive terminal:

```bash
npm run setup:telegram
```

The local helper provides exact BotFather steps, hides the token while it is entered, verifies the token with Telegram, asks the owner to send `/start` to the new bot, discovers their numeric Telegram ID, asks them to confirm it, and writes both values directly to ignored `.env`.

If the coding-agent terminal cannot support interactive input, do not work around that by requesting the token in chat. Ask the owner to open a normal terminal in the Furby Open directory and run the command there. Wait for them to report that it passed.

Then verify without displaying the token:

```bash
npm run verify:telegram
```

If verification says the user is unreachable, ask the owner to open their new bot and send `/start`, then retry. Never reuse an existing assistant's bot token.

## Stage 4: Pi model authentication

Explain the choices before launching Pi:

- ChatGPT Plus/Pro can authenticate the OpenAI Codex provider through `/login`.
- Claude Pro/Max can authenticate Anthropic, but Pi's provider documentation warns that third-party harness usage may draw from paid extra usage rather than normal plan limits.
- GitHub Copilot is another subscription option.
- API-key providers are also supported and may bill separately.

Launch:

```bash
npx pi
```

Inside Pi, guide the owner to:

1. Type `/login` and press Enter.
2. Select the provider they actually have access to.
3. Complete the browser, device-code, or API-key flow themselves.
4. Return to Pi after it reports success.
5. Type `/model`, select an available model, and confirm it appears active.
6. Exit Pi after authentication is complete.

The agent may launch the TUI and describe the next action, but must not operate the owner's provider account, request OAuth codes in chat, or inspect `~/.pi/agent/auth.json`.

Verify model access with:

```bash
npm run doctor
npm run smoke:pi
```

A real smoke test may make a small billable model request. Explain that before running it and ask for approval.

## Stage 5: optional skills

Preview only:

```bash
npm run skills:import -- --list
```

Explain every candidate and warning. Import nothing unless the owner explicitly approves it. Third-party skills may contain executable instructions.

## Stage 6: final validation and first start

Run:

```bash
npm run doctor
npm run build
npm test
npm run verify:telegram
```

Explain warnings versus blocking failures. When checks pass, summarize:

- assistant identity and personality location
- selected provider/model
- safe-mode limitations
- where private data is stored
- how to start and stop the app
- how to update and back up the app

Ask permission before starting:

```bash
npm start
```

Have the owner send these messages to the new bot:

```text
/start
/help
/status
hello
```

Keep `FURBY_OPEN_TOOL_MODE=safe` until the owner deliberately chooses otherwise.

## Future updates

Check without changing anything:

```bash
bash scripts/update.sh --check
```

Apply the latest tagged release:

```bash
bash scripts/update.sh --apply
```

The updater refuses source-code changes, validates the new release in an isolated worktree, backs up private files outside the repository, applies only a fast-forward release update, reinstalls locked dependencies, and runs validation before restarting PM2. Never resolve update conflicts by deleting local data or running an unreviewed `git reset --hard`.
