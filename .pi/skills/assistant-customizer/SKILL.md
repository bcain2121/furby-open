---
name: assistant-customizer
description: Personalizes a Furby Open installation without exposing private data or weakening security defaults. Use when the user asks to rename the assistant, change its persona, configure identity/timezone/location, or customize the local workspace.
---

# Assistant Customizer

Customize the current Furby Open checkout while preserving privacy and upgradeability.

## Workflow

1. Confirm the requested assistant name, owner display name, timezone, optional location, and desired tone.
2. Read `.env.example`, `src/config/system.md`, `src/config/soul.md`, and `docs/CUSTOMIZATION.md`.
3. Keep secrets in `.env`; never print, copy, or commit its values.
4. Put identity and machine-specific values in `.env`.
5. Put durable behavioral rules in `src/config/system.md` only when they should apply to every user turn.
6. Put tone, interests, and communication preferences in `src/config/soul.md`.
7. Do not weaken safe mode, Telegram user authentication, workspace confinement, or localhost network defaults.
8. Show the proposed files and summarize changes before applying them when the request is broad.
9. After changes, run:

```bash
npm run build
npm test
npm run doctor
```

Doctor may fail until Telegram/model credentials are configured; report that clearly without revealing values.

## Privacy checklist

- No tokens, API keys, phone numbers, addresses, emails, IDs, or private paths in tracked files.
- No private content copied into example configuration.
- `.env` remains ignored.
- Generated workspace content remains ignored.
- Public documentation stays generic.
