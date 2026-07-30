# Docker feasibility for Furby Open

**Status:** Recommended as an optional deployment path after a small architecture split; not implemented or locally validated yet.

## Recommendation

Docker can make Furby Open easier to reproduce, update, back up, and move between computers, especially once a prebuilt `linux/amd64` + `linux/arm64` image exists. It should supplement rather than replace the native installer:

- Native installation remains the simplest route for people who do not already have Docker Desktop or Docker Engine.
- Docker becomes the predictable, portable route for owners willing to install Docker once.
- Furby Open and a private companion deployment must use separate Compose project names, state, Telegram bots, and volumes/directories.

Do not publish a Docker image until setup, upgrades, backup/restore, Pi authentication, permissions, and both CPU architectures have been exercised.

## What Docker would improve

- Node.js, npm dependencies, FFmpeg, and Poppler can be pinned in one image.
- `better-sqlite3` can be built for the image's target architecture instead of the host installation varying.
- The process can run as a non-root container user with dropped Linux capabilities.
- A Compose file can define restart behavior, state mounts, and one-off setup commands consistently.
- A documented state export can move an installation to another computer without copying runtime dependencies.
- Container isolation reduces accidental access to the host beyond explicitly mounted paths.

Docker does not eliminate setup. The owner must still install Docker, create a dedicated Telegram bot, complete Pi/provider authentication, protect backups, and understand what host paths are mounted.

## Important conflict with the current architecture

Furby Open currently treats one directory as both:

1. immutable application source and public prompts; and
2. the assistant's writable project/configuration root.

That works in a normal Git checkout. It is awkward in an image because edits to the container's writable layer disappear when the container is recreated or upgraded. Mounting the whole application directory preserves edits but defeats immutable image updates and can obscure image dependencies.

Before calling Docker supported, split these concepts:

```text
applicationRoot   immutable image content: source, public prompts, starter skills
projectRoot       persistent owner content: .env, personality, local skills, configuration, working files
stateRoot         persistent SQLite, sessions, logs, media metadata, A2A task state
workspaceRoot     persistent uploads and user-facing files
piAgentRoot       persistent Pi auth/settings, mounted outside project scope
```

Native installations may default these roots back into the existing checkout, preserving current behavior. A container can place immutable application files under `/opt/furby-open` and persistent roots under `/state`.

This split also solves the current skill-volume problem: public starter skills can ship in the image while imported/private skills live in persistent `projectRoot/.pi/skills` and survive image replacement.

## Access-scope semantics in a container

Docker changes what `outside` means:

- `project` remains confined to the configured persistent project root with no Bash.
- `outside` allows the container's filesystem, host shell tools *inside the container*, and mounted paths.
- `outside` must not be described as unrestricted access to the physical host.
- No host home directory, Docker socket, device, or root filesystem should be mounted by default.
- Mounting `/var/run/docker.sock` would effectively grant host-level control and is prohibited.

Container-aware warning text should say exactly which persistent/mounted roots are reachable. Scheduled tasks continue to follow persisted owner scope.

## Proposed persistent layout

A visible relative host directory is easiest for a first portable implementation:

```text
furby-state/
├── .env
├── data/
│   ├── furby-open.db
│   ├── personality.md
│   ├── sessions/
│   └── a2a/
├── project/
│   └── .pi/skills/
├── workspace/
├── pi-agent/
└── logs/
```

Compose bind mounts can map these directories to the container. Relative paths keep the package movable as a unit, but permissions and Docker Desktop file sharing must be tested on Windows, macOS, and Linux.

Docker-managed named volumes are also viable and are Docker's preferred persistent store. They are less visible to nontechnical owners, so they require first-class export/import commands. A later implementation can choose named volumes if backup/restore UX proves clearer than a visible state directory.

## Target owner workflow

For a local-build proof of concept:

```bash
docker compose build
docker compose run --rm furby npm run setup
docker compose up -d
docker compose logs -f furby
docker compose down
```

`docker compose run` provides a one-off interactive container using the service's configured mounts, which suits hidden Telegram input and Pi `/login`. Browser/device authentication must remain owner-controlled and persist under `piAgentRoot`.

For a future published image:

```bash
docker compose pull
docker compose run --rm furby npm run doctor
docker compose up -d
```

The existing Git fast-forward updater should not run inside an immutable image. Container updates use image tags plus backup, pull, recreate, health validation, and rollback to the prior image tag.

## Image design

Initial technical direction:

- Base on a pinned Node 22 Debian slim image rather than Alpine; native npm dependencies and media packages are less surprising on glibc.
- Multi-stage build with `npm ci`, TypeScript validation, and production dependency pruning where compatible.
- Include FFmpeg and Poppler in the standard image if size remains reasonable.
- Keep local `whisper.cpp` in a separate optional image/profile because models and build tools are large.
- Run as a non-root user.
- Use `init: true`, `restart: unless-stopped`, `cap_drop: [ALL]`, and `no-new-privileges` where supported.
- Publish no ports for normal Telegram long polling. Keep A2A disabled in the first Docker release.
- Never bake `.env`, Telegram tokens, Pi OAuth state, databases, sessions, personality, imported skills, or workspace data into image layers.
- Add a `.dockerignore` that excludes all private and generated paths.

A published image should provide both `linux/amd64` and `linux/arm64`. Docker's multi-platform image format lets clients select the correct variant automatically, but `better-sqlite3` and media dependencies must be tested natively on both architectures.

## Backup and migration requirements

A supported Docker release needs commands that:

1. stop or quiesce writes;
2. run SQLite integrity checks;
3. archive every persistent root with owner-only permissions;
4. exclude no local skills, personality, Pi auth, sessions, or workspace files;
5. restore into an empty destination only after a dry-run manifest check;
6. verify ownership and database integrity after restore; and
7. support moving between amd64 and arm64 because data is architecture-independent even when images are not.

Never tell owners that copying the image alone copies their assistant. Images contain application code; persistent state must be exported separately.

## Phased implementation

### Phase 1 — architecture seam

- Add explicit `applicationRoot`, `projectRoot`, `stateRoot`, `workspaceRoot`, and `piAgentRoot` configuration.
- Preserve current native defaults.
- Load public starter skills from the application root and local/imported skills from the persistent project root.
- Make access policy operate on `projectRoot`, not immutable application source.
- Add migration and regression tests before changing deployment.

### Phase 2 — local proof of concept

- Add `Dockerfile`, `.dockerignore`, and `compose.yaml`.
- Build locally on the current `aarch64` Linux machine after Docker is installed by the owner.
- Test interactive setup, Pi login persistence, Telegram verification, restart, project/outside behavior, scheduling, media tools, and clean teardown.
- Confirm that no private host directory or Docker socket is mounted.

### Phase 3 — portability

- Add checked `docker:backup` and `docker:restore` helpers.
- Move a synthetic installation between fresh Compose project names.
- Test update and rollback between two image tags without losing state.

### Phase 4 — platform validation

- Exercise Docker Desktop on macOS and Windows plus Docker Engine on Linux.
- Test both amd64 and arm64 images.
- Document file sharing, permissions, resource use, sleep/restart behavior, and uninstall without deleting state by default.

### Phase 5 — optional image publication

- Publish signed/checksummed multi-platform images manually or through a separately approved release mechanism.
- Pin image tags in Compose; never default production installs to `latest`.
- Attach SBOM/provenance where practical.

## Go/no-go criteria

Proceed with a local proof of concept if the owner is comfortable installing Docker and accepts that container `outside` is limited to the container plus explicit mounts.

Do not call Docker easier or supported until:

- setup is genuinely shorter than the native route for an existing Docker user;
- all private state survives recreate/update/restore;
- Pi login and Telegram hidden prompts work through Compose;
- project/outside warnings are deployment-accurate;
- local skills persist without masking starter-skill updates;
- amd64 and arm64 tests pass; and
- no privileged, host-root, home-directory, or Docker-socket mount is required.

## Official references

- Docker volumes and migration: <https://docs.docker.com/engine/storage/volumes/>
- Bind-mount behavior and security: <https://docs.docker.com/engine/storage/bind-mounts/>
- Interactive one-off Compose commands: <https://docs.docker.com/reference/cli/docker/compose/run/>
- Multi-platform images: <https://docs.docker.com/build/building/multi-platform/>
