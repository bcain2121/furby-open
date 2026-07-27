# Single access-scope implementation plan

**Status:** Approved implementation plan; not yet implemented

**Purpose:** Replace Furby Open's safe/coding modes with one always-capable assistant whose filesystem reach is confined by default and explicitly expandable by the authorized owner until they change it back.

## 0. Release checkpoint before implementation

1. Preserve any private companion installation as a separate project; do not read its private runtime data into this repository or modify that checkout.
2. Finish and publish the current Furby Open installer/reliability baseline before introducing the breaking access migration.
3. Move the current `Unreleased` changelog entries into the baseline release notes, run Linux/macOS/Windows CI, attach installer bundles/checksums, and tag the exact validated commit.
4. Start the access-scope work as `v0.2.0-alpha.1` because it changes commands, persisted preferences, tool assembly, configuration, and security semantics.
5. Keep the source tree clean and use focused commits for policy, adapters, runtime wiring, commands/migration, and documentation.

## 1. Desired owner experience

Furby should not require the owner to think about “coding mode” versus “safe mode.” Memory, schedules, media, Telegram delivery, skills, workspace operations, and ordinary file work should be available whenever relevant.

The only user-facing security choice should be **where Furby may operate**:

```text
/access     Show the current persistent scope
/outside    Immediately enable and persist unrestricted outside access
/project    Return to project-confined access
```

Required behavior:

- A new installation starts in `project` scope.
- `project` scope remains active indefinitely unless the owner explicitly changes it.
- `/outside` immediately enables and persists `outside` scope across sessions, resets, updates, and process restarts.
- Outside access remains active until the owner sends `/project`.
- A model, skill, scheduled task, A2A request, or tool call cannot grant or revoke outside access; only the authorized owner's native Telegram command can change the persisted scope.

## 2. Important security constraint

Pi explicitly does not provide a built-in filesystem or shell sandbox. Giving Bash a working directory does **not** prevent commands such as `cd /`, absolute paths, subprocesses, interpreters, package scripts, or symbolic links from reading or changing files elsewhere.

Therefore Furby Open must not claim that an ordinary host Bash process is project-confined. The portable implementation should use these rules:

### Project scope

- All Furby custom tools are available.
- Project-confined `read`, `edit`, and `write` tools replace Pi's unrestricted filesystem tools.
- Every file path is resolved canonically beneath the Furby Open root.
- Traversal, absolute paths outside the root, and symlink escapes are rejected.
- Sensitive runtime paths receive additional protection.
- Unrestricted host Bash is not exposed.

### Outside scope

- Pi's normal unrestricted `read`, `bash`, `edit`, and `write` tools are available.
- They run with the permissions of the OS account that started Furby.
- The existing system prompt continues to prohibit secret disclosure and unnecessary destructive actions, but this scope is intentionally not a sandbox.
- All Furby custom tools remain available.

### Future project-shell option

A genuinely project-confined shell requires an OS/container seam such as Docker, Podman, a VM, or a policy-controlled sandbox. This should be a separate optional feature, not a JavaScript command-text filter presented as security.

## 3. Scope semantics

Introduce one type:

```ts
type AccessScope = 'project' | 'outside';
```

This replaces the user-facing `ToolMode = 'safe' | 'coding'` concept.

### Project scope capabilities

Available:

- Confined project `read`
- Confined project `edit`
- Confined project `write`
- Time and weather
- Memory save/search
- Conversation search when implemented
- Recent media and extraction
- Schedule create/list/update
- Workspace read/write/search/list
- Telegram file delivery from the workspace
- Read-only assistant database queries
- Project-local skills and explicitly approved imported skills

Unavailable:

- Host Bash
- Reads or writes outside the Furby Open root
- Access elevation tools callable by the model
- Non-loopback A2A

### Outside scope capabilities

Available:

- Unrestricted Pi `read`, `bash`, `edit`, and `write`
- Every Furby custom tool above

Outside scope is an owner-level persistent setting. It applies to interactive and scheduled work until the owner returns to project scope. The activation response must clearly warn that recurring tasks may use unrestricted host tools and show the `/project` recovery instruction.

### Scheduled work

Scheduled tasks use the owner's current persisted scope. In `project` scope they receive confined project file tools and no host Bash. In `outside` scope they may use unrestricted Pi `read`, `bash`, `edit`, and `write`. A scheduled task cannot change the scope itself.

### A2A work

A2A remains a purpose-specific restricted runtime with only `write_a2a_response` and `list_a2a_pending`, regardless of the owner's persisted scope. This is protocol isolation, not a user-selectable safe/coding mode. A2A stays disabled by default, loopback-only, and unable to elevate access.

## 4. Project-internal path policy

The project root contains both public source and private runtime data. Project scope intentionally allows Furby to read and update its own configuration, including `.env` and related environment files. This means the active model may receive secrets if it chooses to read those files, so the system prompt must continue to prohibit unnecessary secret access, disclosure, logging, or transmission.

Recommended project-scope policy:

### Read and write denied

- `.data/furby-open.db` and SQLite sidecar files
- `.data/backups/`
- backup archives
- private keys, certificates, and common credential filenames
- `~/.pi/agent/auth.json` is already outside the project and therefore unreachable

### Read allowed but write denied

- `.git/` internals should never be edited through file tools

### Read and write allowed

- `.env`, `.env.*`, and `.env.example`
- `package.json`, `package-lock.json`, and installer release checksums
- Public source and documentation
- Tests
- Project-local starter/imported skill files, subject to existing skill rules
- `furby-open-workspace/`
- `.data/personality.md`, including through general project file tools
- Other project-local configuration files

The final implementation should centralize this policy rather than scatter filename checks across tools.

## 5. Access command UX

`/outside` elevates immediately without any additional confirmation or challenge:

1. The authorized owner sends `/outside`.
2. Furby persists `outside` scope in the owner's preferences.
3. Furby disposes affected Pi sessions so stale project-confined tools cannot remain active.
4. Furby replies with a prominent warning similar to:

   ```text
   ⚠️ Outside access is ON and persists across restarts.

   Furby can now read, modify, or delete files available to this OS account and run host shell commands. Scheduled tasks also use outside access.

   Return to confined project access at any time:
   /project
   ```

5. `/project` immediately persists project scope, disposes unrestricted sessions, and reports that Furby is confined to its project again.

Security properties:

- Only native Telegram command handling for the authorized owner can change scope.
- `/access`, `/outside`, and `/project` are always handled natively and are never forwarded to Pi, including malformed variants.
- The model receives no access-elevation or access-revocation tool.
- The `project` or `outside` scope is stored in SQLite preferences so it survives restart.
- Logs may record scope changes and correlation IDs but not private command context.

## 6. Planned modules

### `src/runtime/access-policy.ts`

A deep module that owns:

- `AccessScope`
- Project-root path validation
- Sensitive-path policy
- Effective built-in/custom tool selection
- Human-readable access summaries
- Invariants for interactive, scheduled, and A2A purposes

Its interface should let callers ask what access applies without knowing filename rules or Pi tool assembly details.

### `src/runtime/access-control.ts`

An access-control module that owns:

- Reading and updating the owner's persisted scope
- Immediate project/outside transitions and revocation
- Scope-change results used to reset stale sessions
- Human-readable warning and recovery instructions
- No timers, expiring grants, or confirmation challenges

### `src/runtime/project-file-tools.ts`

Build confined `read`, `edit`, and `write` adapters using Pi's pluggable file operations. Every operation revalidates the canonical path immediately before filesystem access. It must use the same path-policy implementation for reads and writes.

### `src/runtime/pi-session.ts`

Change session records from `toolMode` to `accessScope`. Session identity should include purpose and effective scope so elevation/revocation necessarily disposes stale tools. Tool construction becomes:

- interactive/project: confined project tools + all Furby tools
- interactive/outside: unrestricted Pi coding tools + all Furby tools
- scheduled/project: confined project tools + all Furby tools appropriate for unattended work
- scheduled/outside: unrestricted Pi coding tools + applicable Furby tools
- A2A: no filesystem tools; task-response tools only, regardless of persisted scope

### `src/bot/commands.ts`

Replace `/security safe|coding` with the native `/access`, `/outside`, and `/project` commands. Keep a temporary compatibility response for `/security` that explains the migration without changing access.

### `src/storage/preferences.ts`

Stop reading or writing `toolMode` and persist `accessScope: 'project' | 'outside'` with the owner's model preference. A migration should preserve model preferences, default legacy installations to project scope, and remove or ignore the legacy field safely.

## 7. Configuration migration

Remove from the public configuration:

```env
FURBY_OPEN_TOOL_MODE=safe
```

No replacement environment variable is required because startup is always project-scoped.

Migration behavior:

- Existing `.env` files containing `FURBY_OPEN_TOOL_MODE` continue to parse for one release but receive a doctor warning that the value is ignored.
- Existing SQLite preference JSON with `toolMode` is read without crashing but the field has no effect.
- A later schema migration may remove legacy preference data after at least one release.
- Setup stops discussing safe/coding modes and instead explains project/outside access.
- `/status` reports the persisted and active access scope rather than configured/active tool mode.

## 8. Tool and shell implementation details

### Confined file adapters

Use Pi's pluggable `ReadOperations`, `EditOperations`, and `WriteOperations` rather than wrapping model output after execution. Required checks:

1. Resolve the requested path against the canonical project root.
2. Reject any path outside the root.
3. Find the nearest existing ancestor and resolve its real path.
4. Reject ancestor or target symlink escapes.
5. Apply the project-internal path policy while explicitly allowing environment/configuration files.
6. Recheck immediately before each read, write, mkdir, or edit operation.
7. Preserve existing file permissions where applicable.
8. Apply bounded file sizes to avoid accidental memory exhaustion.

### Bash

Do not implement “confined Bash” using any of these insufficient approaches:

- checking whether command text contains `..`
- blocking `cd`
- rejecting visible absolute paths
- setting only `cwd`
- changing `HOME`
- maintaining a command allowlist while still permitting interpreters or package scripts

All are bypassable. Host Bash belongs only to outside scope until a real sandbox is available.

## 9. Test plan

### Access policy unit tests

- Project paths are accepted.
- Parent traversal and outside absolute paths are rejected.
- Existing and nearest-ancestor symlink escapes are rejected.
- Environment files can be read and written inside project scope.
- SQLite, backup, key, certificate, and Git-internal restrictions follow the project-internal path policy.
- Project scope returns confined file tools and every expected Furby tool.
- Outside scope returns unrestricted Pi coding tools and every expected Furby tool.
- Scheduled work uses the owner's persisted project/outside scope.
- Scheduled work cannot change its own scope.
- A2A receives only task-response tools regardless of owner scope.

### Access-control unit tests

- Outside transition immediately persists outside scope.
- Restart/new access-control instance restores outside scope from preferences.
- Repeated `/project` transitions are immediate, persisted, and idempotent.
- Scope changes return the correct session-reset instruction.
- Outside activation returns the required warning and `/project` recovery instruction.
- Only the authorized native command path can call scope-changing operations.

### Command tests

- `/access` reports project by default.
- `/outside` immediately persists outside scope, resets affected sessions, and returns the warning plus `/project` instructions.
- `/project` persists project scope, resets affected sessions, and reports project scope.
- Unknown `/outside`, `/project`, or `/access` variants cannot be forwarded to Pi.
- `/security` gives migration guidance and cannot change access.
- The model never receives an access command as Pi passthrough.

### File-operation integration tests

- Confined read/edit/write work on real temporary project files.
- Attempts against an external temporary directory fail.
- A symlink swapped or introduced between validation and operation is rejected where the OS permits the test.
- `.env` and related environment files can be read and written.
- SQLite database files and other explicitly denied internal paths remain protected.
- Outside adapters are used only when persisted scope is outside.

### Runtime tests

- Scope changes dispose stale sessions.
- Status truthfully reports persisted and active scope.
- Scheduled sessions follow persisted project/outside scope.
- A2A remains restricted while owner scope is outside.
- Shutdown leaves persisted scope unchanged.

### Full validation

```bash
npm run check:public
npm run build
npm test
npm run test:coverage
npm audit --omit=dev --audit-level=critical
```

Run clean-checkout Linux, macOS, and Windows CI because path canonicalization and permission behavior differ by OS.

## 10. Documentation changes

Update together with implementation:

- `README.md` — replace security modes with access scopes and show `/access` commands.
- `.env.example` — remove `FURBY_OPEN_TOOL_MODE` after the compatibility period.
- `SECURITY.md` — explain project confinement, project-scope access to `.env`, persistent outside access, shell limitations, scheduled-task implications, and remaining path exclusions.
- `docs/ARCHITECTURE.md` — replace capability mode with access policy and persistent scope lifecycle.
- `docs/SETUP.md` — explain the always-capable assistant and default project scope.
- `docs/CUSTOMIZATION.md` — replace `/security` guidance.
- `docs/EXTENDING.md` — explain that skill creation works in project scope while host package installation may require outside access.
- `docs/OPERATIONS.md` — describe persistent scope, revocation, status checks, and recovery.
- `docs/ROADMAP.md` — mark the mode simplification and persistent scope work when complete.
- `tree.md` — add the new modules and update affected descriptions.
- `AGENTS.md` and `CLAUDE.md` — require installation agents to preserve project scope and never activate outside access unless the owner explicitly sends the command.
- `CHANGELOG.md` — document migration and security impact.

## 11. Implementation sequence

### Phase 1 — policy foundation

1. Add `AccessScope` and purpose-specific policy.
2. Add project path checks and the project-internal allow/deny policy, including explicit `.env` read/write access.
3. Build confined file adapters.
4. Add focused unit/integration tests.

### Phase 2 — runtime wiring

1. Replace `ToolMode` in session records and prompt calls.
2. Build purpose/scope-specific tool sets.
3. Ensure scope changes dispose old sessions.
4. Make scheduled sessions follow persisted owner scope while keeping A2A independently restricted.

### Phase 3 — access control and commands

1. Add persisted scope storage and immediate transition handling.
2. Implement `/access`, `/outside`, and `/project`.
3. Reset affected sessions whenever persisted scope changes.
4. Return a prominent outside-access warning with `/project` recovery instructions.
5. Add `/security` compatibility guidance.

### Phase 4 — migration

1. Ignore legacy environment and preference mode values safely.
2. Remove mode controls from setup and help.
3. Update status output.
4. Add doctor migration warnings.

### Phase 5 — documentation and release

1. Update every document listed above.
2. Run full validation and private-data scans.
3. Test clean install and upgrade from the last tagged alpha.
4. Publish as `v0.2.0-alpha.1` with a clearly documented migration from the baseline release.

### Phase 6 — optional real project shell

1. Evaluate Docker/Podman/OpenShell support.
2. Define image provenance, mounts, network policy, resource limits, and ownership mapping.
3. Add it only as an optional adapter with real cross-platform tests.
4. Never silently fall back from sandboxed shell to host shell.

## 12. Acceptance criteria

The change is complete only when:

- No owner-facing safe/coding mode remains.
- All ordinary Furby custom capabilities work in project scope.
- Project `read`, `edit`, and `write` cannot escape the canonical Furby root.
- Environment and related configuration files are readable/writable in project scope, while active databases, backups, private keys, and Git internals retain explicit protection.
- Host Bash is absent in project scope.
- `/outside` immediately activates without a confirmation challenge.
- Its response prominently warns about host filesystem, shell, and scheduled-task access and explains `/project`.
- Outside scope persists across sessions, resets, updates, and restarts until the owner sends `/project`.
- Scheduled work follows persisted scope; A2A never inherits outside access.
- Status output accurately reports persisted and active access.
- Legacy configuration upgrades without startup failure.
- Tests cover path escapes, symlinks, immediate scope changes, warnings, persistence, revocation, session reset, and purpose isolation.
- Documentation never calls a cwd-only host shell “confined.”

## 13. Decisions locked for implementation

1. `.data/personality.md` is writable through general project file tools.
2. `.env`, related environment files, package manifests, lockfiles, and other project configuration are readable and writable in project scope.
3. Editing dependency files is allowed in project scope, but actually running package managers requires outside scope because project scope has no host Bash.
4. `/outside` immediately persists outside scope with no challenge, timeout, or expiry.
5. `/outside` always responds with a prominent warning and explicit `/project` recovery instructions.
6. `/project` immediately persists project scope and resets stale unrestricted sessions.
7. Persistent outside scope applies to scheduled tasks; the warning must mention unattended tasks.
8. A2A stays independently restricted and cannot inherit or change owner scope.
9. Real sandboxed project Bash is not required for this release; ship confined file tools first and add a genuine OS/container adapter separately.

## 14. Recommended decision

Implement one always-capable assistant with **project scope by default**, confined project file tools that may read and write `.env` and related configuration, no host Bash in project scope, and **persistent outside scope activated immediately by `/outside`**. The activation response must prominently warn what outside access permits and show `/project`. Outside remains active across restarts until the owner changes it; scheduled work follows that persisted scope, while A2A remains task-only. Treat a real project shell as a later OS-sandbox feature.
