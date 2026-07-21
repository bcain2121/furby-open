# Architecture

## Design goal

Furby Open is intentionally a small application around Pi rather than a replacement agent platform. Pi owns model/provider support, agent sessions, built-in coding tools, and skill discovery. Furby Open owns Telegram transport, local assistant data, scheduling, and a confined user workspace.

## Components

### Telegram transport

`src/bot/` authenticates one configured Telegram user, receives text and media, batches rapid messages, formats model output, and returns replies. Transport concerns are kept separate from runtime and storage.

### Pi runtime

`src/runtime/pi-session.ts` creates purpose-isolated Pi sessions:

- `interactive` for Telegram conversations
- `scheduled` for reminders and automations
- `a2a` for the optional network task endpoint

The runtime loads project-local Pi skills but not global extension lifecycles. Global skills are excluded by default, preventing a public checkout from inheriting unrelated private capabilities. Users may explicitly opt into global skills with `FURBY_OPEN_LOAD_GLOBAL_SKILLS=true`.

### Capability policy

Safe mode uses an explicit allowlist. Coding mode enables Pi's `read`, `bash`, `edit`, and `write` tools plus all assistant tools. Mode changes reset the interactive session so the active tool set is truthful.

### SQLite

SQLite stores users, memory, media metadata, scheduled tasks, task runs, and preferences. Migrations are versioned and run when the database opens. Conversation continuity itself remains in Pi session files.

### Workspace

`furby-open-workspace/` stores Telegram uploads and user-facing files. Path resolution rejects traversal and symlink escapes. Runtime workspace content is ignored by Git.

### Scheduler

The scheduler claims due work with leases before execution, uses a separate Pi session purpose, records execution and delivery separately, and applies bounded retry behavior.

### A2A

The optional A2A service exposes JSON-RPC task submission, polling, and streaming on localhost. It is disabled by default and currently unauthenticated.

## Data boundaries

```text
Repository
├── source, tests, docs, starter skills     public
├── .env                                    private, ignored
├── .data/furby-open.db                     private, ignored
├── .data/sessions/                         private, ignored
├── logs/                                   private, ignored
└── furby-open-workspace/*                  private, ignored

~/.pi/agent/
├── auth.json                               private, outside repo
├── settings.json                           user-owned, outside repo
└── skills/                                 user-installed, outside repo
```

## Extension model

Project-local skills under `.pi/skills/` are loaded by Pi's resource discovery. They are ordinary Markdown instructions and can include supporting files. Third-party packages and extensions require a higher trust level because they may execute code.
