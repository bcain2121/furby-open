# Privacy

Furby Open is local-first, but privacy still depends on your model provider, Telegram, installed skills, and how you operate the machine.

## Private local data

The following are ignored by Git:

- `.env`
- `.data/furby-open.db`
- `.data/sessions/`
- `.data/a2a/`
- `.data/local/`
- logs
- Telegram uploads and generated workspace files

Pi credentials and global resources live outside the repository under `~/.pi/agent/`.

## Third parties

Prompts and tool results may be sent to the active model provider. Telegram carries inbound and outbound messages and media. Weather requests use `wttr.in`. Optional transcription may use OpenAI when configured.

Review provider privacy terms before sending sensitive information.

## Reset

Preview the reset script in source, then run:

```bash
bash scripts/reset-private-data.sh
```

It requires typing `DELETE`. Optional flags:

```bash
bash scripts/reset-private-data.sh --include-env
bash scripts/reset-private-data.sh --include-whisper
```

For automation, add `--yes` only after reviewing the target list.

The reset does not delete `~/.pi/agent/auth.json` or rewrite Git history.

## Before sharing a fork

1. Stop the bot.
2. Confirm `.env` and runtime data are ignored.
3. Run `git status --ignored` and inspect staged files.
4. Scan the entire Git history with a secret scanner.
5. Search for names, emails, phone numbers, addresses, IDs, absolute home paths, and internal business terms.
6. Rotate any credential that was ever committed, even if later deleted.
