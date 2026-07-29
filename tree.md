# Furby Open project tree

This is the file-by-file map of the tracked public repository. Generated dependencies, credentials, databases, sessions, logs, uploads, imported personal skills, and release artifacts are intentionally excluded from Git.

## How the main paths interact

### Startup

```text
npm start
  -> src/index.ts
  -> src/config/env.ts validates private .env
  -> src/db/database.ts applies src/db/schema.ts and ensures the owner
  -> src/runtime/pi-session.ts creates Pi sessions and tools
  -> src/bot/telegram.ts starts the authorized Telegram transport
  -> src/scheduler/runner.ts starts scheduled work
  -> src/a2a/service.ts starts only when explicitly enabled
```

### Interactive Telegram request

```text
Telegram
  -> src/bot/telegram.ts authorization/media routing
  -> src/runtime/interactive-message-broker.ts batching or steering
  -> src/runtime/pi-session.ts scope/purpose-specific model session
  -> src/runtime/access-policy.ts access and path policy
  -> src/runtime/project-file-tools.ts confined project operations when applicable
  -> src/runtime/resource-policy.ts project skill/prompt isolation
  -> model and approved runtime tools
  -> src/bot/telegram-delivery.ts
  -> src/bot/telegram-format.ts
  -> Telegram reply
```

### Data and files

```text
src/db/schema.ts
  -> .data/furby-open.db
  -> memory, media metadata, schedules, runs, preferences

Pi SessionManager
  -> .data/sessions/
  -> conversational continuity

src/storage/vault-path.ts
  -> furby-open-workspace/
  -> uploads and user-facing files, confined against traversal/symlinks
```

### Installation and releases

```text
Install-Furby-Open.command -> install.sh --\
                                         -> npm ci -> npm run setup
Install-Furby-Open.cmd     -> install.ps1 /

scripts/package-installers.sh -> release ZIPs + SHA256SUMS.txt
scripts/update.sh -> tagged isolated validation -> private backup -> fast-forward update
```

## Root files

```text
furby-open/
├── .env.example
├── .gitignore
├── AGENTS.md
├── CHANGELOG.md
├── CLAUDE.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── ecosystem.config.cjs
├── Install-Furby-Open.cmd
├── Install-Furby-Open.command
├── install.ps1
├── install.sh
├── LICENSE
├── package-lock.json
├── package.json
├── plan.md
├── README.md
├── SECURITY.md
├── tree.md
└── tsconfig.json
```

- **`.env.example`** — Safe, credential-free configuration template. `src/config/env.ts` loads the private `.env` copied from it by setup/install scripts.
- **`.gitignore`** — Keeps credentials, runtime state, uploads, generated artifacts, Pi package state, and imported personal skills out of Git while retaining public starter skills.
- **`AGENTS.md`** — Repository rules and installation runbook entry point for Codex and other coding agents. Points agents to setup/security docs and credential gates.
- **`CHANGELOG.md`** — Human-readable release history. Installer/release versions should stay synchronized with `package.json` and installer constants.
- **`CLAUDE.md`** — Thin Claude Code entry point that delegates repository and installation behavior to `AGENTS.md`.
- **`CODE_OF_CONDUCT.md`** — Contributor community expectations.
- **`CONTRIBUTING.md`** — Development, privacy, validation, and pull-request requirements.
- **`ecosystem.config.cjs`** — Optional PM2 process definition. Starts `src/index.ts` through the `tsx` loader and sends logs to `logs/`.
- **`Install-Furby-Open.cmd`** — Double-click Windows launcher. Opens PowerShell with a process-local execution-policy bypass and runs `install.ps1`.
- **`Install-Furby-Open.command`** — Double-click macOS launcher. Runs adjacent `install.sh` and keeps the terminal visible for results.
- **`install.ps1`** — Native Windows installer. Installs explicit prerequisites through winget when approved, clones the pinned release, runs locked npm installation/build, and delegates private onboarding to `npm run setup`.
- **`install.sh`** — macOS/Linux installer. Can install a checksum-verified private Node 22, optionally add system media tools, clone the pinned release, run `npm ci`/build, and delegate to the shared setup wizard.
- **`LICENSE`** — MIT license for the public source.
- **`package-lock.json`** — Exact npm dependency graph used by `npm ci`, CI, installers, and updater validation.
- **`package.json`** — Project identity, Node requirement, pinned Pi dependencies, runtime/development dependencies, and all npm command entry points.
- **`plan.md`** — Implemented migration record from safe/coding modes to one always-capable assistant with project-confined file tools and persistent owner-selected outside access with explicit recovery instructions.
- **`README.md`** — Main product explanation, quick install paths, security modes, extension model, updates, and links to detailed docs.
- **`SECURITY.md`** — Threat model, reporting process, known upstream advisories, installer trust, persistent access scopes, path restrictions, A2A isolation, and secret-handling rules.
- **`tree.md`** — This source map; complements `docs/ARCHITECTURE.md` with per-file ownership and interactions.
- **`tsconfig.json`** — Strict NodeNext TypeScript checking, including unused code/parameter detection, for `src/` and `tests/`; currently performs no emit.

## Public placeholders and workspace

```text
├── .data/
│   └── .gitkeep
└── furby-open-workspace/
    └── README.md
```

- **`.data/.gitkeep`** — Retains the private-runtime directory in Git without tracking its contents.
- **`furby-open-workspace/README.md`** — Explains the owner-facing workspace. Every other workspace file is private and ignored.

## GitHub automation and templates

```text
.github/
├── dependabot.yml
├── ISSUE_TEMPLATE/
│   ├── bug.yml
│   └── feature.yml
├── pull_request_template.md
└── workflows/
    └── ci.yml
```

- **`.github/dependabot.yml`** — Schedules npm and GitHub Actions dependency update checks.
- **`.github/ISSUE_TEMPLATE/bug.yml`** — Structured bug report that asks for reproduction and environment details without secrets.
- **`.github/ISSUE_TEMPLATE/feature.yml`** — Structured feature proposal focused on use case, privacy, and security impact.
- **`.github/pull_request_template.md`** — Prompts contributors to explain behavior, risk, tests, and documentation changes.
- **`.github/workflows/ci.yml`** — Existing unchanged Linux automation for safety checks, type checking, tests, and critical audit checks on Node 22/24. Releases do not depend on changing this workflow; installer packaging and platform smoke checks are run separately.

## Project-local Pi skills

```text
.pi/skills/
├── assistant-customizer/
│   └── SKILL.md
└── skill-builder/
    └── SKILL.md
```

- **`.pi/skills/assistant-customizer/SKILL.md`** — Guides safe identity/personality changes into ignored local files without weakening public security rules. Normally defers to `npm run setup`.
- **`.pi/skills/skill-builder/SKILL.md`** — Guides creation and validation of inspectable project-local Pi skills. `src/runtime/resource-policy.ts` permits these project resources while excluding global ones by default.

## Documentation

```text
docs/
├── ARCHITECTURE.md
├── CUSTOMIZATION.md
├── EXTENDING.md
├── INSTALLER.md
├── INSTALL_WITH_AI.md
├── OPERATIONS.md
├── PRIVACY.md
├── ROADMAP.md
└── SETUP.md
```

- **`docs/ARCHITECTURE.md`** — System responsibilities, request flow, purpose-isolated sessions, capability/resource policy, persistence, workspace, scheduler, A2A, and private-data locations.
- **`docs/CUSTOMIZATION.md`** — Supported identity, personality, model, mode, and command customization without editing public security defaults.
- **`docs/EXTENDING.md`** — Skill-first extension guidance, external skill imports, self-extension workflow, and criteria for application code versus a skill.
- **`docs/INSTALLER.md`** — Platform-specific installer behavior, trust, custom locations, resume rules, troubleshooting, checksums, and uninstall instructions.
- **`docs/INSTALL_WITH_AI.md`** — Stage-by-stage runbook for a terminal-capable coding agent helping a nontechnical owner without handling credentials.
- **`docs/OPERATIONS.md`** — Foreground/PM2 operation, validation, backups, cleanup, logs, multiple installations, and guarded updates.
- **`docs/PRIVACY.md`** — Private local paths, third-party data flows, backup sensitivity, reset behavior, and fork-sharing checklist.
- **`docs/ROADMAP.md`** — Prioritized findings from the top-to-bottom architecture/reliability review and recommended beta exit work.
- **`docs/SETUP.md`** — Full manual setup from requirements through Telegram, model login, skills, voice, validation, startup, and smoke testing.

## Shell and operational scripts

```text
scripts/
├── bootstrap.sh
├── check-public-safety.sh
├── check-system-deps.sh
├── furby-open
├── package-installers.sh
├── reset-private-data.sh
├── setup-local-whisper.sh
└── update.sh
```

- **`scripts/bootstrap.sh`** — Manual clone bootstrap: creates private placeholders, runs `npm ci`, build/tests, previews external skills, and points to guided setup.
- **`scripts/check-public-safety.sh`** — Scans tracked files for private runtime paths, high-risk secret patterns, and absolute user home paths. Complements full-history scanning.
- **`scripts/check-system-deps.sh`** — Reports required Node/npm blockers and optional media, Whisper-build, PM2, and Pi commands.
- **`scripts/furby-open`** — Small relocatable launcher that installs locked dependencies with `npm ci` when missing and executes `npm start`.
- **`scripts/package-installers.sh`** — Checks release-version consistency and creates deterministic macOS/Linux and Windows installer ZIPs plus SHA-256 checksums.
- **`scripts/reset-private-data.sh`** — Explicit, reviewable deletion of selected local runtime state; optionally includes `.env` or local Whisper.
- **`scripts/setup-local-whisper.sh`** — Optional clone/build/model-download workflow for local `whisper.cpp` transcription.
- **`scripts/update.sh`** — Clean-tree, tagged, fast-forward updater with isolated worktree validation, private backup, npm reinstall, tests, doctor, and PM2 handling.

## Application source

### Entrypoint and configuration

```text
src/
├── index.ts
└── config/
    ├── env.ts
    ├── soul.md
    └── system.md
```

- **`src/index.ts`** — Composition root. Validates configuration, initializes the owner/database, constructs runtime/transport/scheduler/A2A modules, starts them, and coordinates shutdown.
- **`src/config/env.ts`** — Loads private environment values with Zod, normalizes paths/defaults, validates Telegram/timezone/A2A policy, and exports the runtime configuration snapshot.
- **`src/config/system.md`** — Public operational prompt: useful behavior, skill policy, truthfulness, scope boundaries, secret handling, and Telegram formatting.
- **`src/config/soul.md`** — Neutral public persona loaded after runtime identity context and before ignored `.data/personality.md`.

### Telegram transport

```text
src/bot/
├── commands.ts
├── media.ts
├── telegram-delivery.ts
├── telegram-format.ts
└── telegram.ts
```

- **`src/bot/commands.ts`** — Parses native `/` and legacy `!` commands; handles model, status, skills, media, memory, schedules, native access transitions, reset, and Pi command passthrough using runtime/storage modules.
- **`src/bot/media.ts`** — Downloads bounded Telegram files, sanitizes names, writes through workspace confinement, ensures the owner record, and inserts media metadata.
- **`src/bot/telegram-delivery.ts`** — Sends sequential Telegram chunks with pacing, 429 retries, and formatting-only fallback.
- **`src/bot/telegram-format.ts`** — Escapes HTML, converts supported Markdown, and splits by final Telegram payload size without breaking surrogate pairs.
- **`src/bot/telegram.ts`** — Creates grammY, installs single-user authorization, routes commands/media, starts interactive model work without blocking polling, logs transport errors, and composes broker/runtime/delivery modules.

### Pi runtime and tools

```text
src/runtime/
├── access-control.ts
├── access-policy.ts
├── db-tools.ts
├── info-tools.ts
├── interaction-queue.ts
├── interactive-message-broker.ts
├── media-tools.ts
├── memory-tools.ts
├── pi-session.ts
├── project-file-tools.ts
├── resource-policy.ts
├── schedule-tools.ts
├── telegram-tools.ts
└── vault-tools.ts
```

- **`src/runtime/access-control.ts`** — Persists immediate owner project/outside transitions and supplies truthful status, warning, and `/project` recovery messages.
- **`src/runtime/access-policy.ts`** — Defines access scopes, purpose-specific tool selection, canonical project confinement, and centralized protected-path rules.
- **`src/runtime/db-tools.ts`** — Exposes bounded, query-only SQLite inspection and rejects mutation, PRAGMA, and multiple statements.
- **`src/runtime/info-tools.ts`** — Pi tools for timezone-aware current time and external weather lookup.
- **`src/runtime/interaction-queue.ts`** — Serializes Pi operations by purpose/user key while allowing different keys to run independently.
- **`src/runtime/interactive-message-broker.ts`** — Coalesces rapid Telegram messages, assigns one reply owner, and steers messages arriving during an active Pi run.
- **`src/runtime/media-tools.ts`** — Lists uploaded media and queues bounded text/PDF extraction, updating stored previews.
- **`src/runtime/memory-tools.ts`** — Saves and searches durable owner memories and searches the conversation FTS tables.
- **`src/runtime/pi-session.ts`** — Main Pi orchestration module: auth/model registry, scope/purpose-specific sessions, prompts/personality/resources, tools, serialization, streaming, timeout/abort/reset, and automatic memory/media context.
- **`src/runtime/project-file-tools.ts`** — Builds Pi-compatible confined `read`, `edit`, and `write` definitions with path revalidation and bounded file sizes.
- **`src/runtime/resource-policy.ts`** — Configures Pi resource loading: no extensions/themes, project-local prompts/agent files, and project-only skills unless global skills are explicitly enabled.
- **`src/runtime/schedule-tools.ts`** — Pi tools to create/list/pause/resume/delete scheduled tasks using configured timezone display.
- **`src/runtime/telegram-tools.ts`** — Sends bounded, non-sensitive files from the confined workspace back to the authorized Telegram owner.
- **`src/runtime/vault-tools.ts`** — Bounded read/write/append/list/search tools for the configured workspace; all paths use the confinement module.

### Models, audio, and media

```text
src/
├── audio/
│   └── transcription.ts
├── media/
│   ├── extract.ts
│   └── job-queue.ts
└── models/
    └── model-selection.ts
```

- **`src/audio/transcription.ts`** — Bounded voice transcription through local `whisper.cpp` plus FFmpeg or optional OpenAI, serialized through the media queue.
- **`src/media/extract.ts`** — Reads supported text files or invokes bounded `pdftotext`, cleans output, and truncates model context.
- **`src/media/job-queue.ts`** — Generic bounded asynchronous queue; shared singleton limits expensive media work to two operations.
- **`src/models/model-selection.ts`** — Model aliases, canonical parsing, authenticated availability checks, fallback resolution, Pi quick-select settings, and model summaries.

### SQLite and storage

```text
src/
├── db/
│   ├── database.ts
│   ├── media.ts
│   ├── memory.ts
│   └── schema.ts
└── storage/
    ├── preferences.ts
    └── vault-path.ts
```

- **`src/db/database.ts`** — Opens SQLite, applies migrations, maps Telegram IDs to application user IDs, and idempotently ensures the authorized user/identity.
- **`src/db/media.ts`** — Media hashing, lightweight previews, confined writes, metadata upsert/list/lookup/update operations.
- **`src/db/memory.ts`** — Durable memory save/search, conversation FTS search, and prompt-context formatting.
- **`src/db/schema.ts`** — WAL/foreign-key setup and versioned schema for users, identities, memories/FTS, conversations/FTS, media, schedules/runs, preferences, and import bookkeeping.
- **`src/storage/preferences.ts`** — Per-Telegram-user model and persistent access-scope preferences in SQLite plus one-time migration from legacy JSON.
- **`src/storage/vault-path.ts`** — Canonical workspace confinement that rejects traversal and existing/ancestor symlink escapes.

### Scheduler

```text
src/scheduler/
├── parse.ts
├── runner.ts
└── tasks.ts
```

- **`src/scheduler/parse.ts`** — Parses `in`, `at`, and `every` schedule commands and formats next-run times in a supplied timezone.
- **`src/scheduler/runner.ts`** — Polls due tasks, obtains leases, runs separate scheduled Pi sessions, records execution/delivery, retries failures, and sends results through Telegram delivery.
- **`src/scheduler/tasks.ts`** — SQL lifecycle for task creation/list/update/delete, atomic claims, expired-lease recovery, run records, retries, completion, and delivery status.

### Optional A2A

```text
src/a2a/
├── service.ts
├── store.ts
└── tools.ts
```

- **`src/a2a/service.ts`** — Optional loopback HTTP JSON-RPC/SSE listener, bounded request handling, task queue/concurrency, Pi invocation, health, and agent card.
- **`src/a2a/store.ts`** — Owner-only atomic JSON persistence for pending/completed A2A tasks with validated IDs and cleanup.
- **`src/a2a/tools.ts`** — The only tools exposed in A2A sessions: list pending tasks and write a final task response.

### Observability and retention

```text
src/
├── observability/
│   └── logger.ts
└── operations/
    └── retention.ts
```

- **`src/observability/logger.ts`** — Structured lifecycle logging with recursive redaction for sensitive key names and correlation IDs.
- **`src/operations/retention.ts`** — Finds old logs, sessions, and partial media by category; deletion remains a separate explicit operation.

### Setup, diagnostics, and skill import

```text
src/
├── scripts/
│   ├── cleanup.ts
│   ├── doctor.ts
│   ├── import-agent-skills.ts
│   ├── setup-telegram.ts
│   ├── setup.ts
│   └── smoke-pi.ts
├── setup/
│   └── env-file.ts
└── skills/
    └── external-skill-importer.ts
```

- **`src/scripts/cleanup.ts`** — CLI dry-run/apply wrapper around retention collection and deletion.
- **`src/scripts/doctor.ts`** — Readiness report for credentials, paths, timezone/A2A policy, disk, SQLite integrity/migration, Pi auth/settings, system commands, external skills, and transcription.
- **`src/scripts/import-agent-skills.ts`** — CLI discovery, filtering, review, confirmation, and import flow for Codex/Claude/shared skills.
- **`src/scripts/setup-telegram.ts`** — Hidden token entry, Telegram API verification, private `/start` owner discovery, explicit authorization, secure `.env` update, and later verification.
- **`src/scripts/setup.ts`** — Shared cross-platform interactive wizard for private personality, Telegram helper, Pi `/login`, project-scope guidance, readiness summary, and optional confirmed startup.
- **`src/scripts/smoke-pi.ts`** — Executes one real Pi prompt and now preserves a failing process status for automation.
- **`src/setup/env-file.ts`** — Minimal targeted `.env` reader/updater that rejects key/value line injection without printing unrelated secrets.
- **`src/skills/external-skill-importer.ts`** — Detects agent executables/directories, discovers bounded `SKILL.md` trees, validates frontmatter, rejects symlinks, warns on provider-specific syntax, atomically imports, and records provenance.

## Tests

```text
tests/
├── a2a-service.test.ts
├── access-control.test.ts
├── access-policy.test.ts
├── commands.test.ts
├── config.test.ts
├── control-reliability.test.ts
├── db-tools.test.ts
├── external-skill-importer.test.ts
├── installer.test.ts
├── interaction-queue.test.ts
├── interactive-message-broker.test.ts
├── logger.test.ts
├── media-job-queue.test.ts
├── media.test.ts
├── memory.test.ts
├── model-selection.test.ts
├── preferences.test.ts
├── project-file-tools.test.ts
├── resource-policy.test.ts
├── retention.test.ts
├── scheduler.test.ts
├── setup-env.test.ts
├── telegram-delivery.test.ts
├── telegram-format.test.ts
├── update-safety.test.ts
└── vault.test.ts
```

- **`tests/a2a-service.test.ts`** — Listener lifecycle, JSON-RPC completion, invalid/oversized requests, and pending-task restart recovery.
- **`tests/access-control.test.ts`** — Immediate scope transitions, persistence across restarts, idempotent project revocation, warnings, and recovery instructions.
- **`tests/access-policy.test.ts`** — Scope/purpose tool selection, canonical confinement, protected paths, `.env` access, and symlink escapes.
- **`tests/commands.test.ts`** — Model/reset command side effects, Pi passthrough, and Telegram-size skill pagination.
- **`tests/config.test.ts`** — Timezone validation, loopback-only A2A host policy, and configured-timezone schedule display.
- **`tests/control-reliability.test.ts`** — Prompt security invariants, fresh/stale session guards, public defaults, smoke-test exit behavior, and non-blocking Telegram submission wiring.
- **`tests/db-tools.test.ts`** — Read-only SQL acceptance and mutation/PRAGMA rejection.
- **`tests/external-skill-importer.test.ts`** — Executable detection, discovery/exclusions, imports/provenance/collisions, and symlink rejection.
- **`tests/installer.test.ts`** — Shell syntax, pinned/checksummed Unix installer, explicit Windows packages, optional feature dependencies, and setup TTY/security rules.
- **`tests/interaction-queue.test.ts`** — Same-key serialization, cross-key concurrency, and recovery after failures.
- **`tests/interactive-message-broker.test.ts`** — Coalescing order/ownership, active-run steering, and failed-batch release.
- **`tests/logger.test.ts`** — Recursive sensitive-field redaction in structured logs.
- **`tests/media-job-queue.test.ts`** — Concurrency bounds for expensive media jobs.
- **`tests/media.test.ts`** — Text cleanup/truncation and plain-text extraction.
- **`tests/memory.test.ts`** — Memory FTS save/search/context and conversation FTS querying.
- **`tests/model-selection.test.ts`** — Alias normalization, unavailable-model rejection, and truthful fallback reporting.
- **`tests/preferences.test.ts`** — Legacy JSON migration to default project scope, persistent owner scope/model state, and corrupt-input safety.
- **`tests/project-file-tools.test.ts`** — Real confined read/edit/write behavior, Pi same-name tool replacement, size bounds, protected paths, and outside rejection.
- **`tests/resource-policy.test.ts`** — Project resource isolation, session steering settings, A2A-only tools, and exclusion of global scheduler lifecycle.
- **`tests/retention.test.ts`** — Review-before-delete retention behavior.
- **`tests/scheduler.test.ts`** — Parsing, CRUD, atomic claims, retries, purpose isolation, execution, and lease recovery.
- **`tests/setup-env.test.ts`** — Targeted environment edits, preservation of unrelated values, append behavior, and line-injection rejection.
- **`tests/telegram-delivery.test.ts`** — Chunk order, formatting fallback, 429 retry timing, pacing, and propagation of unrelated errors.
- **`tests/telegram-format.test.ts`** — HTML escaping, Markdown conversion, payload-aware splitting, and Unicode-safe hard splits.
- **`tests/update-safety.test.ts`** — Updater shell syntax and release/clean-tree/backup/worktree/fast-forward guardrails.
- **`tests/vault.test.ts`** — Relative-path acceptance plus traversal, absolute escape, and symlink escape rejection.

## Intentionally untracked runtime tree

```text
.env                              private credentials and identity
.data/furby-open.db               SQLite state
.data/sessions/                   Pi sessions
.data/personality.md              owner-specific persona
.data/a2a/                        A2A task state
.data/local/                      optional local Whisper
logs/                             runtime/PM2 logs
furby-open-workspace/*            uploads and user files
.pi/imported-skills.json          local import provenance
.pi/skills/<imported-skill>/      personal imported skills
node_modules/                     installed dependency graph
coverage/                         generated coverage
release-artifacts/                generated installer ZIPs/checksums
```

These paths interact with the tracked source at runtime but must never be copied into public commits or release source archives.
