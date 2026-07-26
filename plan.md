# Single access-scope implementation plan

**Status:** Proposed; not yet implemented

**Purpose:** Replace Furby Open's safe/coding modes with one always-capable assistant whose filesystem reach is confined by default and explicitly, temporarily expandable by the authorized owner.

## 1. Desired owner experience

Furby should not require the owner to think about “coding mode” versus “safe mode.” Memory, schedules, media, Telegram delivery, skills, workspace operations, and ordinary file work should be available whenever relevant.

The only user-facing security choice should be **where Furby may operate**:

```text
/access status     Show current scope and expiration
/access project    Confine access to Furby Open; this is always the default
/access outside    Begin an explicit temporary outside-access confirmation
/access revoke     Immediately return to project scope
```

Proposed behavior:

- Furby starts in `project` scope after every process start.
- `project` scope remains active indefinitely unless the owner explicitly expands it.
- `outside` scope lasts 30 minutes, is held only in memory, and is never persisted.
- Restarting Furby, resetting its session, revoking access, or reaching the deadline returns it to `project` scope.
- A model, skill, scheduled task, A2A request, or tool call cannot grant itself outside access.

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

Outside scope must not silently change the permissions of scheduled or A2A work.

### Scheduled work

Scheduled tasks always execute in `project` scope, even if the interactive owner currently has temporary outside access. A future per-task capability design may permit broader automation, but interactive access must never leak into unattended work.

### A2A work

A2A remains a purpose-specific restricted runtime with only `write_a2a_response` and `list_a2a_pending`. This is protocol isolation, not a user-selectable safe/coding mode. A2A stays disabled by default, loopback-only, and unable to elevate access.

## 4. Sensitive paths in project scope

The project root contains both public source and private runtime data. Project confinement alone is not enough to prevent accidental credential or database damage.

Recommended project-scope policy:

### Read and write denied

- `.env`
- `.env.*` except the public `.env.example`
- `.data/furby-open.db` and SQLite sidecar files
- `.data/backups/`
- backup archives
- private keys, certificates, and common credential filenames
- `~/.pi/agent/auth.json` is already outside the project and therefore unreachable

### Read allowed but write denied

- `package-lock.json` unless the owner explicitly asks for a dependency change
- installer release checksums
- `.git/` internals should never be edited through file tools

### Read and write allowed

- Public source and documentation
- Tests
- Project-local starter/imported skill files, subject to existing skill rules
- `furby-open-workspace/`
- `.data/personality.md` through the intended customization workflow
- Other explicitly supported local configuration files

The final implementation should centralize this policy rather than scatter filename checks across tools.

## 5. Elevation UX

`/access outside` should not elevate immediately. Proposed two-step flow:

1. Owner sends `/access outside`.
2. Furby explains that outside access can read, modify, or delete any OS-account-accessible file and run shell commands.
3. Furby generates a short-lived confirmation challenge, for example:

   ```text
   /access confirm 482731
   ```

4. The challenge expires after 60 seconds and can be used once.
5. Successful confirmation creates a 30-minute in-memory grant, resets the interactive Pi session, and reports the exact expiration time.
6. Five minutes before expiration, Furby may notify the owner once.
7. Expiration or `/access revoke` disposes the unrestricted session and creates a fresh project-scoped session on the next request.

Security properties:

- Only native Telegram command handling can create a challenge or grant.
- Unknown commands must not be forwarded to Pi when they begin with `/access`.
- The model receives no access-elevation tool.
- Challenges and grants are keyed to the authorized Telegram user.
- Challenges and grants are not stored in SQLite, Pi sessions, `.env`, or logs.
- Logs may record elevation/revocation timestamps and correlation IDs, never confirmation codes.

## 6. Proposed modules

### `src/runtime/access-policy.ts`

A deep module that owns:

- `AccessScope`
- Project-root path validation
- Sensitive-path policy
- Effective built-in/custom tool selection
- Human-readable access summaries
- Invariants for interactive, scheduled, and A2A purposes

Its interface should let callers ask what access applies without knowing filename rules or Pi tool assembly details.

### `src/runtime/access-grants.ts`

An in-memory grant module that owns:

- Pending confirmation challenges
- One-time challenge validation
- Expiration timestamps
- Revocation
- Fake-clock support for tests
- No persistence

### `src/runtime/project-file-tools.ts`

Build confined `read`, `edit`, and `write` adapters using Pi's pluggable file operations. Every operation revalidates the canonical path immediately before filesystem access. It must use the same path-policy implementation for reads and writes.

### `src/runtime/pi-session.ts`

Change session records from `toolMode` to `accessScope`. Session identity should include purpose and effective scope so elevation/revocation necessarily disposes stale tools. Tool construction becomes:

- interactive/project: confined project tools + all Furby tools
- interactive/outside: unrestricted Pi coding tools + all Furby tools
- scheduled: confined project tools + all Furby tools appropriate for unattended work
- A2A: no filesystem tools; task-response tools only

### `src/bot/commands.ts`

Replace `/security safe|coding` with the native `/access` command family. Keep a temporary compatibility response for `/security` that explains the migration without changing access.

### `src/storage/preferences.ts`

Stop reading or writing `toolMode`. Outside grants must never enter preferences. A migration should preserve model preferences while removing or ignoring the legacy field safely.

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
- `/status` reports access scope and expiration rather than configured/active tool mode.

## 8. Tool and shell implementation details

### Confined file adapters

Use Pi's pluggable `ReadOperations`, `EditOperations`, and `WriteOperations` rather than wrapping model output after execution. Required checks:

1. Resolve the requested path against the canonical project root.
2. Reject any path outside the root.
3. Find the nearest existing ancestor and resolve its real path.
4. Reject ancestor or target symlink escapes.
5. Apply sensitive-path policy.
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

All are bypassable. Host Bash belongs only to confirmed outside scope until a real sandbox is available.

## 9. Test plan

### Access policy unit tests

- Project paths are accepted.
- Parent traversal and outside absolute paths are rejected.
- Existing and nearest-ancestor symlink escapes are rejected.
- Sensitive paths are denied according to read/write policy.
- Project scope returns confined file tools and every expected Furby tool.
- Outside scope returns unrestricted Pi coding tools and every expected Furby tool.
- Scheduled scope never inherits an interactive outside grant.
- A2A receives only task-response tools.

### Grant unit tests

- Challenge codes expire after 60 seconds.
- Codes are one-use and user-specific.
- Wrong codes do not grant access.
- Outside grants expire after 30 minutes.
- Revocation is immediate and idempotent.
- Restart/new store means project scope.
- Fake time makes every expiration test deterministic.

### Command tests

- `/access status` reports project by default.
- `/access outside` creates but does not activate a challenge.
- `/access confirm <code>` activates and resets the session.
- `/access revoke` resets the session and reports project scope.
- `/security` gives migration guidance and cannot change access.
- The model never receives an access command as Pi passthrough.

### File-operation integration tests

- Confined read/edit/write work on real temporary project files.
- Attempts against an external temporary directory fail.
- A symlink swapped or introduced between validation and operation is rejected where the OS permits the test.
- `.env` and SQLite files remain protected.
- Outside adapters are used only after a valid grant.

### Runtime tests

- Scope changes dispose stale sessions.
- Status truthfully reports the active scope and expiration.
- Scheduled sessions remain project-confined during an interactive grant.
- Shutdown clears pending grants and challenges.

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
- `SECURITY.md` — explain project confinement, temporary outside access, shell limitations, and sensitive-path exclusions.
- `docs/ARCHITECTURE.md` — replace capability mode with access policy and grant lifecycle.
- `docs/SETUP.md` — explain the always-capable assistant and default project scope.
- `docs/CUSTOMIZATION.md` — replace `/security` guidance.
- `docs/EXTENDING.md` — explain that skill creation works in project scope while host package installation may require outside access.
- `docs/OPERATIONS.md` — describe expiration, revocation, and recovery.
- `docs/ROADMAP.md` — mark the mode simplification and scheduled-permission separation when complete.
- `tree.md` — add the new modules and update affected descriptions.
- `AGENTS.md` and `CLAUDE.md` — require installation agents to preserve project scope and never confirm outside access for the user.
- `CHANGELOG.md` — document migration and security impact.

## 11. Implementation sequence

### Phase 1 — policy foundation

1. Add `AccessScope` and purpose-specific policy.
2. Add project path and sensitive-file checks.
3. Build confined file adapters.
4. Add focused unit/integration tests.

### Phase 2 — runtime wiring

1. Replace `ToolMode` in session records and prompt calls.
2. Build purpose/scope-specific tool sets.
3. Ensure scope changes dispose old sessions.
4. Keep scheduled and A2A sessions restricted independently.

### Phase 3 — grants and commands

1. Add in-memory challenge/grant store.
2. Implement `/access status|outside|confirm|project|revoke`.
3. Add expiration and optional warning notification.
4. Add `/security` compatibility guidance.

### Phase 4 — migration

1. Ignore legacy environment and preference mode values safely.
2. Remove mode controls from setup and help.
3. Update status output.
4. Add doctor migration warnings.

### Phase 5 — documentation and release

1. Update every document listed above.
2. Run full validation and private-data scans.
3. Test clean install and upgrade from the last tagged alpha.
4. Publish as a clearly documented breaking alpha or beta migration.

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
- Sensitive private runtime files receive explicit protection.
- Host Bash is absent in project scope.
- Outside access requires a user-specific, short-lived confirmation.
- Outside grants expire, revoke, and disappear on restart.
- Scheduled and A2A work cannot inherit outside access.
- Status output accurately reports access and expiry.
- Legacy configuration upgrades without startup failure.
- Tests cover path escapes, symlinks, grants, expiry, session reset, and purpose isolation.
- Documentation never calls a cwd-only host shell “confined.”

## 13. Open decisions before implementation

Recommended defaults are shown in bold:

1. Outside grant duration: 15 minutes, **30 minutes**, or until manual revoke?
2. Should project scope block reading `.env` as well as writing it? **Yes.**
3. Should `.data/personality.md` remain writable through general file tools or only the customization workflow? **Customization workflow only.**
4. Should dependency changes require outside access even though files are in the project? **File edits may occur in project scope, but package installation requires outside/Bash access.**
5. Should expiration send a Telegram notice? **Yes, once, without interrupting unrelated work.**
6. Should `/access project` and `/access revoke` be aliases? **Yes.**
7. Should a restart ever restore outside scope? **No.**
8. Should real sandboxed project Bash be required for the first release of this design? **No; ship confined file tools first and add sandboxed shell separately.**

## 14. Recommended decision

Implement one always-capable assistant with **project scope by default**, confined project file tools, no host Bash in project scope, and a **30-minute in-memory outside grant** protected by a one-time confirmation challenge. Keep scheduled work project-confined and A2A task-only. Treat a real project shell as a later OS-sandbox feature.
