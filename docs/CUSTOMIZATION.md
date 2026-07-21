# Customization

## Identity

Edit `.env`:

```env
ASSISTANT_NAME=Nova
ASSISTANT_OWNER_NAME=Alex
ASSISTANT_TIMEZONE=America/New_York
ASSISTANT_LOCATION=Brooklyn, NY
MOBILE_WORKSPACE_ROOT=nova-workspace
```

Changing `MOBILE_WORKSPACE_ROOT` creates a new workspace path; move existing private files manually if needed.

## Private personality

Create this local, Git-ignored file:

```text
.data/personality.md
```

It is loaded after Furby Open's neutral public persona. Put individual preferences here, such as:

- concise versus detailed replies
- formal, relaxed, playful, or direct tone
- how proactive the assistant should be
- interests and recurring workflows
- behaviors, phrases, or habits to avoid
- boundaries for when it should ask before acting

Do not put tokens, passwords, financial details, or unnecessary sensitive facts in the personality file.

The tracked `src/config/system.md` and `src/config/soul.md` define public defaults. Change them only when contributing a generic behavior to the project; personalizing tracked files creates update conflicts and risks accidental disclosure.

You can ask a coding agent to read the bundled `assistant-customizer` skill and interview you. It should show the proposed personality summary before writing `.data/personality.md`.

## Models

Configure startup preferences in `.env`:

```env
DEFAULT_MODEL=provider/model-id
FALLBACK_MODEL=provider/model-id
```

The `/model` command reads Pi's quick-select list from `~/.pi/agent/settings.json` when available.

## Safe and coding modes

The default is:

```env
FURBY_OPEN_TOOL_MODE=safe
```

Use `/security coding` only when filesystem and shell access are needed. Return to `/security safe` afterward.

## Commands

Native commands include:

```text
/help /commands /status /model /models /skills
/files /memories /transcript /sendfile
/schedule /security /reset
```

Unknown slash commands are forwarded to the Pi SDK when supported.
