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

## Upgrade

1. Back up `.data/furby-open.db` and `furby-open-workspace/`.
2. Review release notes and dependency changes.
3. Pull the update.
4. Run `npm install`, build, tests, and doctor.
5. Restart with updated environment variables.
