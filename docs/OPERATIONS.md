# Operations

## Start and stop

Foreground:

```bash
npm start
```

PM2:

```bash
npx pm2 start ecosystem.config.cjs
npx pm2 status
npx pm2 logs furby-open
npx pm2 restart furby-open --update-env
npx pm2 stop furby-open
```

The PM2 configuration resolves its directory dynamically and does not require an absolute installation path.

## Validate before restart

```bash
npm run doctor
npm run build
npm test
npm audit --omit=dev --audit-level=critical
```

## Access-scope operations

Check the persisted and active scope from Telegram:

```text
/access
/status
```

`/outside` immediately enables unrestricted host filesystem and shell access and persists it across restarts. Scheduled tasks use the same scope. Return to confinement with:

```text
/project
```

Scope changes abort and reset affected interactive and scheduled sessions so stale tool sets are not reused. If a migration leaves `FURBY_OPEN_TOOL_MODE` in `.env`, it is ignored; `npm run doctor` reports a compatibility warning without printing its value.

## Backup

Stop writes or use SQLite's backup facilities, then preserve both database and workspace:

```bash
mkdir -p .data/backups
sqlite3 .data/furby-open.db ".backup '.data/backups/furby-open-$(date +%Y%m%d-%H%M%S).db'"
tar -czf ".data/backups/workspace-$(date +%Y%m%d-%H%M%S).tar.gz" furby-open-workspace
```

Backups are private and ignored by Git.

## Cleanup

Dry run:

```bash
npm run cleanup
```

Apply only after reviewing the exact files:

```bash
npm run cleanup:apply
```

Completed user workspace files are not deleted by cleanup.

## Logs

Runtime logs live under `logs/`. Structured lifecycle logs omit prompt content, credentials, and tool arguments, but operational metadata may still be private.

## Multiple installations

Use a unique Telegram bot token, root directory, database, workspace, PM2 process name, and A2A port for every installation. Never run two pollers with the same Telegram token.

## Safe updates

Check the newest tagged release without modifying the installation:

```bash
bash scripts/update.sh --check
```

Apply it:

```bash
bash scripts/update.sh --apply
```

Before changing the active checkout, the updater:

1. refuses tracked or untracked source changes that could be overwritten
2. fetches release tags from the configured `origin` and selects the newest `v*` tag
3. requires the release to be a fast-forward from the installed commit
4. installs and tests that release in an isolated Git worktree
5. archives `.env`, `.data`, the workspace, and local skills to a private sibling `furby-open-backups/` directory
6. stops an existing PM2 process when detected
7. applies the update, runs `npm ci`, build, tests, and doctor
8. restarts PM2 only after validation succeeds

Ignored local personality, credentials, databases, sessions, workspace files, and imported skills remain outside Git and are included in the backup. The updater will not resolve conflicts, delete local source changes, or silently use an untagged development commit.

Review the release notes before applying. To use a specific release rather than the newest one:

```bash
FURBY_OPEN_UPDATE_TAG=v0.2.0-alpha.1 bash scripts/update.sh --apply
```

If validation fails, do not delete private data or run an improvised hard reset. Keep the backup path printed by the updater and ask an installation agent to inspect the failure.
