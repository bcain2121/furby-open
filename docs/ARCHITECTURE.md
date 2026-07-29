# Architecture

## Design goal

Furby Open is intentionally a small application around Pi rather than a replacement agent platform. Pi owns model/provider support, agent sessions, built-in coding tools, and skill discovery. Furby Open owns Telegram transport, local assistant data, scheduling, and a confined user workspace.

## Components

### Guided installation

`install.sh` and `install.ps1` handle platform prerequisites and pinned application checkout. The `.command` and `.cmd` files are thin double-click terminal launchers. After npm installation, every platform delegates identity, personality, Telegram, Pi login guidance, and validation to `src/scripts/setup.ts`; credential entry remains in the dedicated hidden-input Telegram helper or provider-owned Pi flow.

### Telegram transport

`src/bot/` authenticates one configured Telegram user, receives text and media, batches rapid messages, formats model output, and returns replies. Transport concerns are kept separate from runtime and storage.

### Pi runtime

`src/runtime/pi-session.ts` creates purpose-isolated Pi sessions:

- `interactive` for Telegram conversations
- `scheduled` for reminders and automations
- `a2a` for the optional network task endpoint

The runtime loads project-local Pi skills but not global extension lifecycles. Global skills are excluded by default, preventing a public checkout from inheriting unrelated private capabilities. Users may explicitly opt into global skills with `FURBY_OPEN_LOAD_GLOBAL_SKILLS=true`.

### Access policy

`src/runtime/access-policy.ts` owns the persistent `project | outside` vocabulary, purpose-specific tool selection, canonical root checks, and protected-path rules. In project scope, `src/runtime/project-file-tools.ts` injects same-named custom Pi `read`, `edit`, and `write` definitions backed by revalidating filesystem operations; host Bash is absent. In outside scope, Pi's unrestricted `read`, `bash`, `edit`, and `write` are used. All Furby tools remain available in either owner scope.

`src/runtime/access-control.ts` persists immediate `/outside` and `/project` transitions through SQLite preferences and provides warning/recovery messages. Scope changes abort and dispose affected interactive/scheduled sessions before fresh scope-specific sessions are created. Scheduled work follows persisted owner scope; A2A never does.

### SQLite

SQLite stores users, memory, media metadata, scheduled tasks, task runs, and preferences. Migrations are versioned and run when the database opens. Conversation/FTS tables exist for a future opt-in journal, but ordinary runtime exchanges are not yet written to them. Conversation continuity currently remains in Pi session files.

### Workspace

`furby-open-workspace/` stores Telegram uploads and user-facing files. Path resolution rejects traversal and symlink escapes. Runtime workspace content is ignored by Git.

### Scheduler

The scheduler claims due work with leases before execution, uses a separate Pi session purpose, records execution and delivery separately, and applies bounded retry behavior.

### A2A

The optional A2A service exposes JSON-RPC task submission, polling, and streaming on localhost. It is disabled by default and currently unauthenticated. Runtime validation refuses non-loopback binding, and A2A sessions receive only the two task-response tools rather than Telegram, database, memory, workspace, filesystem, or shell tools, regardless of owner scope.

## Request flow

```text
Telegram update
  -> single-user middleware
  -> command handler OR interactive message broker
  -> purpose-isolated Pi runtime session
  -> persistent access policy + project resource policy
  -> model and approved tools
  -> chunked/retried Telegram delivery
```

The scheduler and A2A listener enter at the Pi runtime with separate session purposes. SQLite modules provide assistant state; Pi session files provide conversational continuity; the workspace holds user-facing files. See [`../tree.md`](../tree.md) for every tracked file and its connections.

## Data boundaries

```text
Repository
├── source, tests, docs, starter skills     public
├── .env                                    private, ignored
├── .data/furby-open.db                     private, ignored
├── .data/sessions/                         private, ignored
├── .data/personality.md                    private persona override, ignored
├── logs/                                   private, ignored
└── furby-open-workspace/*                  private, ignored

~/.pi/agent/
├── auth.json                               private, outside repo
├── settings.json                           user-owned, outside repo
└── skills/                                 user-installed, outside repo
```

## Extension model

Project-local skills under `.pi/skills/` are loaded by Pi's resource discovery. They are ordinary Markdown instructions and can include supporting files. Third-party packages and extensions require a higher trust level because they may execute code.
