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

## Persona

Edit:

```text
src/config/system.md
src/config/soul.md
```

Keep security and privacy rules in `system.md`. Put tone, interests, and communication preferences in `soul.md`.

You can also ask the assistant to use the bundled `assistant-customizer` skill while coding mode is enabled. Review all proposed changes before accepting them.

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
