---
name: assistant-customizer
description: Personalizes a Furby Open installation without exposing private data or weakening security defaults. Use when the user asks to rename the assistant, change its persona, configure identity/timezone/location, or customize the local workspace.
---

# Assistant Customizer

Customize the current Furby Open checkout while preserving privacy and upgradeability.

## Workflow

1. Confirm the requested assistant name, owner display name, timezone, optional location, and desired tone.
2. Read `.env.example`, `src/config/system.md`, `src/config/soul.md`, and `docs/CUSTOMIZATION.md`.
3. Interview the owner in plain language about tone, brevity, initiative, interests, boundaries, humor, and pet peeves. Offer examples when they are unsure.
4. Keep secrets in `.env`; never print, copy, or commit its values. If Telegram credentials are already present, do not read `.env`; use the setup helpers or ask the owner to edit identity fields locally.
5. Put identity and machine-specific values in `.env`.
6. Put the owner's private tone, interests, communication preferences, and behavioral requests in `.data/personality.md`. This ignored local override is loaded after the public default persona.
7. Change `src/config/system.md` or `src/config/soul.md` only when contributing a generic default that belongs in the public project, not for an individual installation.
8. Do not weaken safe mode, Telegram user authentication, workspace confinement, or localhost network defaults.
9. Show the proposed local personality summary before applying broad changes. Do not place secrets or unnecessary sensitive facts in the personality file.
10. After changes, run:

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
