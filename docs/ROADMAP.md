# Furby Open roadmap

This roadmap records the July 2026 top-to-bottom review of the public alpha. It is ordered by risk and leverage rather than novelty.

## Current assessment

Furby Open already has an unusually strong alpha foundation: a small understandable stack, locked dependencies, single-user Telegram authorization, safe defaults, workspace confinement, durable scheduling, local data ownership, explicit private-data boundaries, guarded updates, cross-platform onboarding, and meaningful tests around the failure-prone paths.

The project is not yet a polished general-public product. Its biggest gaps are operational confidence, a few incomplete product promises, and two large modules whose interfaces expose too much implementation detail.

## P0 — release confidence and truthful behavior

1. **Ship and exercise the cross-platform release.** Publish the installer bundles with reproducible local checks, then manually test a clean install, interrupted/resumed install, update, backup, restore, and uninstall on each supported platform before calling the release stable. Do not claim platforms that have not actually been exercised.
2. **Finish conversation history or remove the claim.** SQLite contains conversation tables and `/memories` searches them, but normal runtime exchanges are not currently journaled there; Pi session files are the actual conversation record. Either add an explicit, privacy-documented conversation journal or remove conversation hits from the command until it exists.
3. **Add real transport integration tests.** Unit tests cover batching and delivery well, but a test should drive a fake grammY update through authorization, batching, the runtime seam, and chunked delivery. This protects the production wiring, not just its parts.
4. **Create migration fixtures.** Test opening databases from every published schema version, not only creating a new database in memory. Backward-compatible data is more important once public installations exist.
5. **Verify model-provider compatibility deliberately.** Pi is pinned to `0.80.5` while `0.82.1` is available. Test upgrades in isolation, record supported Pi versions, and keep the two Pi packages on the same version. The latest package still carries a transitive `brace-expansion` advisory, so upgrading alone does not close every advisory.
6. **Make restores first-class.** The updater creates private backups but there is no checked restore command. Add a dry-run restore workflow that validates archive ownership, expected paths, and database integrity before replacing data.

## P1 — security and operations

1. **Authenticate A2A before network expansion.** A2A is disabled by default, forced to loopback, independently purpose-restricted, and limited to response tools. Add a real token or mutually authenticated transport before supporting reverse proxies or non-loopback use.
2. **Exercise the implemented access-scope model.** The [`../plan.md`](../plan.md) migration is implemented: project-confined file tools are default, `/outside` persists with a warning, `/project` revokes it, scheduled work follows owner scope, and A2A stays restricted. Prioritize upgrade fixtures and real platform/security testing before beta.
3. **Add release provenance.** Generate checksums through the local release script, attach an SBOM, sign tags/assets where practical, and publish the exact commit and dependency audit with each release. Hosted workflow automation is optional, not a release prerequisite.
4. **Harden optional source downloads.** Pin `whisper.cpp` to a reviewed tag or commit and verify downloaded model artifacts. The current optional installer follows the upstream default branch.
5. **Add network timeouts and size policy everywhere.** Telegram setup has a timeout, but weather, media download, file send, and OpenAI transcription should share bounded timeout/retry helpers.
6. **Deepen the private-data threat model.** The current policy documents project-scope `.env` access, protected database/key paths, persistent outside reach, and loopback exposure. Add adversarial tests and OS-specific assumptions for local processes and filesystem races.
7. **Make updates equally native on Windows.** Installation is native, while updates, reset, backup examples, and some diagnostics still assume Bash. Provide PowerShell equivalents or a shared Node implementation.

## P2 — deepen the architecture

### 1. Pi runtime module

- **Files:** `src/runtime/pi-session.ts`, tool factories, model selection, memory/media lookup.
- **Problem:** Session creation, model fallback, prompt assembly, resource loading, capability selection, concurrency, streaming, timeout handling, and automatic context recall all live in one module. Understanding or testing one behavior requires knowing most of the implementation.
- **Solution:** Deepen the runtime around a small prompt/session interface while moving session construction, prompt-context assembly, and response extraction into cohesive internal modules.
- **Benefits:** Better locality for provider upgrades and context bugs, more leverage from focused runtime tests, and less reliance on source-text assertions.

### 2. Telegram command module

- **Files:** `src/bot/commands.ts`, `src/bot/telegram.ts`, scheduler and storage callers.
- **Problem:** One long conditional dispatcher knows parsing, HTML presentation, preferences, models, memory, media, schedules, persistent access scopes, and Pi passthrough rules.
- **Solution:** Deepen command dispatch into a registry of command modules with shared formatting and authorization context, while keeping one external command-handler seam.
- **Benefits:** Locality for each command family, simpler help generation, and integration tests that exercise the same interface as production.

### 3. Assistant data module

- **Files:** `src/db/*`, `src/storage/preferences.ts`, scheduler persistence.
- **Problem:** Callers repeatedly open a database, initialize schema, issue SQL, and close it. User identity creation is an ordering invariant that previously leaked into callers.
- **Solution:** Concentrate user-owned memory, media, conversation, preference, and schedule operations behind a small assistant-data module; keep SQLite as its adapter.
- **Benefits:** One place for transactions and invariants, easier migration tests, and a real seam for in-memory testing only if a second adapter is actually needed.

### 4. Configuration and readiness module

- **Files:** `src/config/env.ts`, setup scripts, doctor, installers.
- **Problem:** Parsing, defaults, runtime policy, path resolution, credential readiness, and feature readiness are checked differently in several places.
- **Solution:** Deepen configuration into one normalized snapshot plus named readiness checks used by startup, setup, and doctor.
- **Benefits:** Setup cannot report ready while startup rejects the same configuration; tests gain one authoritative interface.

### 5. External-effects module

- **Files:** Telegram API calls, weather, transcription, media download/send, shell extraction.
- **Problem:** Timeouts, retries, error normalization, limits, and logging are implemented independently.
- **Solution:** Consolidate bounded HTTP and process execution behavior behind shared internal modules without creating hypothetical adapters where only one implementation exists.
- **Benefits:** Consistent failure behavior and one test surface for resource limits.

### 6. Deployment and persistent-root separation

- **Files:** Configuration, resource loading, access policy, setup, skills, storage, and future Docker assets.
- **Problem:** One checkout currently serves as immutable application source and the assistant's writable project/configuration root. Container recreation would discard source-layer edits or require mounting over the application image.
- **Solution:** Follow [`DOCKER_FEASIBILITY.md`](DOCKER_FEASIBILITY.md): separate application, project, state, workspace, and Pi-agent roots while preserving current native defaults.
- **Benefits:** Clean Docker images, portable backups, durable local skills, truthful container access semantics, and simpler moves between computers.

## P3 — product maturity

1. Add explicit memory list/update/delete commands and retention controls; users need selective deletion, not only whole-runtime reset.
2. Offer an opt-in conversation journal with retention settings and a clear distinction from Pi session history.
3. Add timezone-aware calendar schedules, daylight-saving tests, missed-run policy, and next-run previews before saving.
4. Compile production JavaScript instead of requiring the development-time `tsx` loader at runtime; publish a minimal production artifact.
5. Add linting, formatting, coverage thresholds, and architecture tests based on imports/behavior rather than regexes over source text.
6. Add a service installer or supervised background mode for each OS, with clear status/start/stop commands for nontechnical owners.
7. Decide on a durable project name before a stable release because the current name carries acknowledged trademark risk.
8. Define alpha-to-beta exit criteria: supported platforms, backup/restore drill, provider matrix, zero critical advisories, documented known high advisories, migration compatibility, and one-week unattended soak testing.

## Suggested next milestone

Call the next milestone **“trustworthy beta plumbing,”** not a feature release. Complete P0 items 1–4, P1 items 2–5, and the Pi runtime/configuration deepening work before adding major integrations. The project already has enough features to be useful; the next level is making every advertised path dependable, observable, recoverable, and easy to reason about.
