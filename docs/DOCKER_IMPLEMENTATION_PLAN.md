# Docker implementation plan

**Status:** Deferred owner project. This is an implementation checklist, not a claim that Docker is currently supported.

**Depends on:** finishing and merging `v0.2.0-alpha.1` and the design constraints in [`DOCKER_FEASIBILITY.md`](DOCKER_FEASIBILITY.md).

## Outcome

Create an optional Docker deployment that lets an owner install Docker, initialize Furby interactively, run it in the background, replace or roll back the application image, and move private state to another amd64 or arm64 computer without copying dependencies.

Docker will supplement the native installers. It will not replace them.

## Non-goals

- Do not containerize or modify the private Furby Assistant while developing the public implementation.
- Do not place secrets or owner data in image layers.
- Do not mount the Docker socket, host root, host home directory, devices, or privileged capabilities.
- Do not run the existing Git updater inside the container.
- Do not publish an image before local, migration, rollback, and cross-platform validation.
- Do not claim that container `/outside` provides unrestricted physical-host access.
- Do not enable unauthenticated A2A networking in the initial container release.

## Before starting

### Release and branch

- [ ] Complete final `v0.2.0-alpha.1` checks.
- [ ] Merge the access-scope branch into `main`.
- [ ] Tag/release `v0.2.0-alpha.1` before adding Docker behavior.
- [ ] Create `feat/docker-v0.3` from the updated `main`.
- [ ] Keep each phase in a reviewable commit or pull request.

### Disk and machine preparation

Measured on the initial arm64 Debian 13 host on 2026-07-29:

```text
Root filesystem: 58 GiB total, 51 GiB used, 5.2 GiB available (91% used)
Re-downloadable ~/.cache content: approximately 5.6 GiB
Docker/Compose: not installed
```

- [ ] Reach **at least 10 GiB free**, preferably **12–15 GiB**, before installing/building.
- [ ] Delete only owner-approved, reproducible caches; do not touch projects, recordings, databases, credentials, Pi data, or private assistant state.
- [ ] Record `df -h` before and after cleanup.
- [ ] Install Docker from Docker's official Debian instructions only after explicit owner approval.
- [ ] Confirm `docker version`, `docker compose version`, and `docker run --rm hello-world`.
- [ ] Build arm64 only at first; defer local multi-platform builds until the single-platform image is stable.
- [ ] Track usage with `docker system df`. Prune only unused build cache/images after confirming they are not rollback targets.

## Phase 1 — separate application and persistent roots

The current `config.rootDir` combines application code, owner configuration, runtime state, and Pi's working project. Split it without breaking native installations.

### Target roots

| Root | Purpose | Native default | Container target |
| --- | --- | --- | --- |
| `applicationRoot` | Public source, prompts, built output, starter skills | Checkout root | `/opt/furby-open` |
| `projectRoot` | Owner `.env`, personality, local skills, editable configuration/files | Checkout root | `/state/project` |
| `stateRoot` | Database, preferences, sessions, A2A state, logs, local models | `<checkout>/.data` plus current logs | `/state/data` |
| `workspaceRoot` | Telegram uploads and user-facing files | `<checkout>/furby-open-workspace` | `/state/workspace` |
| `piAgentRoot` | Pi authentication, settings, and model metadata | `~/.pi/agent` | `/state/pi-agent` |

Container project layout:

```text
/state/
├── project/
│   ├── .env
│   ├── .data/personality.md
│   └── .pi/skills/              # imported/private skills only
├── data/
│   ├── furby-open.db
│   ├── preferences.json
│   ├── sessions/
│   ├── a2a/
│   ├── local/
│   └── logs/
├── workspace/
└── pi-agent/
```

### Code changes

- [ ] Replace ambiguous root construction in `src/config/env.ts` with one normalized path snapshot.
- [ ] Load `.env` from `projectRoot`.
- [ ] Load public `system.md`, `soul.md`, and starter skills from `applicationRoot`.
- [ ] Load private personality and local/imported skills from `projectRoot`.
- [ ] Point SQLite, preferences, sessions, A2A, logs, and local Whisper assets at `stateRoot`.
- [ ] Point all vault/media tools at `workspaceRoot`.
- [ ] Keep Pi authentication under `piAgentRoot` and outside project-scope file tools.
- [ ] Make Pi `cwd` and confined `read`/`edit`/`write` operate on `projectRoot`.
- [ ] Deduplicate skills when native defaults place starter and local skill roots together.
- [ ] Update setup, Telegram setup, doctor, cleanup, importer, updater backup, reset, and installers to use the normalized roots.
- [ ] Preserve all current path defaults when no Docker-specific environment variables are set.
- [ ] Reject relative-root traversal and unexpected symlink escapes.

### Required tests

- [ ] Native default paths remain backward-compatible.
- [ ] Distinct-root fixture keeps application files immutable and owner files persistent.
- [ ] Project scope cannot access `stateRoot` database, `piAgentRoot`, or `applicationRoot` through traversal/symlinks.
- [ ] Project scope can edit its `.env`, personality, local skills, and project configuration.
- [ ] Outside scope reaches only what the process/container can reach.
- [ ] Public and local skills both load; duplicate starter skills load once.
- [ ] Setup and doctor agree on every resolved path.
- [ ] Existing Alpha 4/v0.2 database and private-file migration fixtures still pass.

**Phase gate:** Do not create a production Dockerfile until the distinct-root tests pass natively.

## Phase 2 — produce a compiled runtime

The application currently runs TypeScript through `tsx`. A smaller production image should run compiled JavaScript.

- [ ] Add a production TypeScript build configuration that emits `dist/`.
- [ ] Copy required Markdown prompts and other runtime assets into the production artifact or resolve them from `applicationRoot` explicitly.
- [ ] Add a production start script using `node dist/index.js`.
- [ ] Keep test/type-check scripts separate from production compilation.
- [ ] Verify native startup, setup scripts, doctor, cleanup, and Pi smoke behavior from the compiled artifact.
- [ ] Determine which setup/operations scripts belong in the runtime image.
- [ ] Prune development dependencies only after compiled startup and every included script work without `tsx`.

**Phase gate:** A clean `npm ci`, build, production install, and compiled smoke test must pass outside Docker.

## Phase 3 — local arm64 Docker proof of concept

### Files to add

```text
Dockerfile
.dockerignore
compose.yaml
scripts/docker-init.*
scripts/docker-backup.*
scripts/docker-restore.*
docs/DOCKER.md
```

Cross-platform helpers should preferably be Node programs invoked through the container rather than separate Bash and PowerShell implementations.

### Dockerfile design

- [ ] Use a pinned Node 22 Debian slim digest/tag compatible with the declared engine range.
- [ ] Use a multi-stage build.
- [ ] Install compiler tools only in the dependency/build stage.
- [ ] Install runtime `ca-certificates`, FFmpeg, Poppler, and a minimal init process.
- [ ] Build `better-sqlite3` for the target architecture.
- [ ] Copy only production dependencies, compiled files, public prompts, starter skills, license, and necessary package metadata.
- [ ] Create and run as an unprivileged Furby user.
- [ ] Add a health command that checks process/runtime readiness without repeatedly contacting Telegram or exposing a port.
- [ ] Ensure image history contains no `.env`, state, workspace, Pi auth, sessions, backups, or imported skills.

### `.dockerignore` minimum

Exclude:

```text
.env
.env.*
!.env.example
.data/
furby-open-workspace/
logs/
.pi/skills/*/                 # review exception handling for tracked starter skills
node_modules/
dist/
coverage/
release-artifacts/
backups/
.git/
```

Because starter skills are tracked under `.pi/skills`, use precise allow rules or copy them from an explicit build context path. Validate the final context rather than assuming ignore negation works.

### Compose design

- [ ] Use a relative `./furby-state` bind mount or clearly justified named volumes.
- [ ] Initialize private directories/files before Compose attempts file mounts.
- [ ] Run with `init: true`, `restart: unless-stopped`, all Linux capabilities dropped, and `no-new-privileges` where supported.
- [ ] Use a read-only application filesystem after the root split; mount writable state explicitly and provide a bounded `/tmp` tmpfs if needed.
- [ ] Publish no ports for Telegram long polling.
- [ ] Keep A2A disabled.
- [ ] Set a graceful stop period so Telegram/session/SQLite work can finish.
- [ ] Never mount `/var/run/docker.sock`, `/`, `$HOME`, SSH directories, or unrelated host paths.
- [ ] Pin an explicit image version; do not use `latest` in release instructions.

### Intended commands

```bash
docker compose build furby
docker compose run --rm furby npm run setup
docker compose run --rm furby npm run doctor
docker compose up -d furby
docker compose logs -f furby
docker compose stop furby
docker compose down
```

Setup and Pi login must remain interactive. Secrets are typed into provider/local prompts and persisted only in mounted private state.

### Proof-of-concept checks

- [ ] Image builds on the arm64 Debian host.
- [ ] Container reports a non-zero, non-root UID/GID.
- [ ] Telegram setup and verification work through `docker compose run`.
- [ ] Pi provider login survives container deletion/recreation.
- [ ] Bot starts, receives an authorized message, and replies.
- [ ] Unauthorized Telegram users remain blocked.
- [ ] No inbound port is open.
- [ ] Project file tools work only under `projectRoot`.
- [ ] `/outside` warning is container-aware and accurately lists mounted reach.
- [ ] `/project` immediately revokes outside sessions.
- [ ] Scheduled tasks retain scope behavior across restart.
- [ ] Voice/media dependencies work.
- [ ] Container can be deleted and recreated without losing private state.
- [ ] `docker history`, image export inspection, and build logs reveal no secrets/private files.

## Phase 4 — backup, restore, move, and rollback

A portable container is useful only when its state is portable.

### Backup command

- [ ] Quiesce or stop Furby before snapshotting.
- [ ] Use SQLite's backup/integrity mechanisms instead of copying an actively written database.
- [ ] Include project configuration, personality, imported skills, database, preferences, sessions, A2A state, local assets, workspace, and Pi agent state.
- [ ] Write a manifest containing Furby version, schema version, creation time, included roots, sizes, and SHA-256 checksums.
- [ ] Default backup output to an owner-selected host directory outside the mounted live state.
- [ ] Apply owner-only permissions where the platform supports them.
- [ ] Clearly warn that an unencrypted archive contains credentials and private data.
- [ ] Offer documented encryption rather than claiming a plain archive is secure.

### Restore command

- [ ] Require an empty destination by default.
- [ ] Provide `--dry-run` manifest, version, path, and checksum validation.
- [ ] Reject absolute archive paths, traversal, links escaping the destination, unexpected files, and unsupported schema versions.
- [ ] Preserve the existing destination until validation succeeds.
- [ ] Correct ownership/permissions inside the container.
- [ ] Run database integrity and doctor checks after restore.

### Migration drill

- [ ] Create a synthetic installation with `.env`, personality, local skill, sessions, database records, preferences, schedules, and workspace content.
- [ ] Back it up under Compose project A.
- [ ] Restore it into a clean directory and Compose project B.
- [ ] Confirm every synthetic artifact and checksum.
- [ ] Confirm Telegram/Pi secrets are present without printing them.
- [ ] Start B and verify behavior.
- [ ] Repeat across arm64 and amd64 when both are available.

### Upgrade and rollback drill

- [ ] Back up state.
- [ ] Pull/build image version B while version A remains available.
- [ ] Run compatibility/doctor checks against an isolated state copy first.
- [ ] Recreate the service on B.
- [ ] Verify health, Telegram, Pi, schedules, scope, media, and data.
- [ ] Roll back to A without deleting state only if its schema remains compatible; otherwise restore A's backup.
- [ ] Document exact recovery commands and retain the previous image until acceptance.

## Phase 5 — multi-platform validation

- [ ] Build `linux/arm64` and `linux/amd64` images with Buildx after the arm64 implementation is stable.
- [ ] Do not attempt to run amd64 as the primary local validation on arm64 through emulation; obtain a native amd64 smoke result.
- [ ] Validate `better-sqlite3`, FFmpeg, Poppler, Pi provider login, and all included binaries on both architectures.
- [ ] Test Docker Engine on Linux.
- [ ] Test Docker Desktop on macOS.
- [ ] Test Docker Desktop with Linux containers on Windows.
- [ ] Test a supported 64-bit Raspberry Pi OS/Debian environment separately from the current arm64 host.
- [ ] Record CPU, OS, Docker/Compose versions, image digest, test commands, and results.
- [ ] Document Docker Desktop file-sharing and permission differences truthfully.

## Phase 6 — optional image release

- [ ] Choose a registry only after local-build users have validated the workflow.
- [ ] Publish immutable version tags and digests for both architectures.
- [ ] Never make `latest` the documented production default.
- [ ] Generate image checksums/digests, dependency audit results, SBOM, and provenance where practical.
- [ ] Scan the final image for secrets and known vulnerabilities.
- [ ] Attach Docker migration notes to the Furby release.
- [ ] Keep a local-build Compose option for users who do not trust public registry images.

## Documentation and learning path

Create `docs/DOCKER.md` as an owner-facing tutorial that explains:

1. image versus container versus volume/bind mount;
2. why a container shares the Linux kernel and is not a full VM;
3. what survives `stop`, `down`, recreate, and image replacement;
4. initial setup and hidden credential entry;
5. start, stop, status, logs, doctor, and update;
6. backup, encrypted transport, restore, and moving computers;
7. project versus container-outside access;
8. exact mounted host paths;
9. uninstalling the container without deleting state;
10. deliberately deleting all private state.

Use copyable commands and explain each command. Keep troubleshooting sections for disk exhaustion, permissions, Pi login, Telegram conflicts, architecture mismatch, and Docker Desktop file sharing.

## Definition of done

Docker becomes a supported alpha installation path only when:

- [ ] Native installation remains backward-compatible.
- [ ] Clean interactive setup works without credentials entering chat or image layers.
- [ ] Recreate, update, rollback, backup, restore, and cross-computer migration drills pass.
- [ ] Project and outside scope behavior is accurate and tested in-container.
- [ ] No privileged access, Docker socket, host root/home mount, or inbound port is required.
- [ ] Imported skills and every documented private-data category persist.
- [ ] Native arm64 and amd64 results pass.
- [ ] At least one macOS, Windows, Linux, and Raspberry Pi result is recorded before claiming each platform.
- [ ] Final image size, runtime disk use, and minimum free-space guidance are measured rather than estimated.
- [ ] Public-safety scan, build, tests, coverage, dependency gate, image inspection, and documentation-link checks pass.

## Suggested commit sequence

1. `Refactor deployment roots without changing native defaults`
2. `Compile a production Furby runtime`
3. `Add arm64 Docker proof of concept`
4. `Persist container setup and private state`
5. `Add checked Docker backup and restore`
6. `Validate container updates and rollback`
7. `Document optional Docker installation`
8. `Package multi-platform Docker release`

Stop at each phase gate. A smaller verified arm64 proof of concept is preferable to an untested cross-platform image.
