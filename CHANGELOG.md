# Changelog

All notable changes to Furby Open will be documented here.

## Unreleased

## [0.1.0-alpha.4] - 2026-07-27

### Added

- Cross-platform guided setup wizard for identity, private personality, Telegram, Pi login guidance, and validation
- Checksum-verified macOS/Linux terminal installer with optional dependency installation
- Windows PowerShell installer using explicit Windows Package Manager IDs
- Double-click macOS `.command` and Windows `.cmd` launchers
- Detailed installer, resume, troubleshooting, and uninstall documentation
- File-by-file project map in `tree.md`, prioritized maturity roadmap, and approved single access-scope migration plan
- Runtime policy tests for timezone and loopback-only A2A configuration

### Changed

- FFmpeg and Poppler are now correctly treated as optional feature dependencies for text-only installations
- Doctor command detection now works natively on Windows
- Manual bootstrap now installs locked dependencies with `npm ci`

### Fixed

- Telegram polling no longer waits for an active model response, allowing rapid-message batching and steering to work in production
- Owner records are ensured before media or memory writes, preventing first-use foreign-key failures
- Scheduled task times now use the configured assistant timezone instead of a hardcoded timezone
- Pi smoke tests now return a failing exit status when the model invocation fails

### Security

- Safe mode no longer exposes Pi's broad filesystem read tool
- A2A is forced to safe mode, limited to task-response tools, and rejected on non-loopback hostnames

## [0.1.0-alpha.3] - 2026-07-14

### Added

- Nontechnical coding-agent installation runbook with explicit Telegram and Pi authentication gates
- `CLAUDE.md` entry point alongside Codex-compatible `AGENTS.md`
- Secure local Telegram setup and verification commands
- Private, Git-ignored `.data/personality.md` override and guided personality interview
- Guarded tagged-release updater with isolated validation and private-data backup

## [0.1.0-alpha.2] - 2026-07-14

### Added

- Detection of installed Codex CLI and Claude Code
- Optional preview-and-confirm importer for compatible personal `SKILL.md` packages
- Import safety checks for frontmatter, symbolic links, resource bounds, collisions, and provider-specific syntax
- Git-ignore isolation and a local provenance manifest for imported skills
- Installer-agent guidance for reviewing external skills before import

## [0.1.0-alpha.1] - 2026-07-10

### Added

- Public, sanitized Furby Open repository
- Pi SDK Telegram assistant runtime
- Local SQLite memory, schedules, preferences, and media metadata
- Safe-by-default capability policy
- Optional coding mode and localhost A2A endpoint
- Private workspace and local Whisper setup
- Project-local assistant customization and skill-builder starter skills
- CI, security, privacy, setup, architecture, and contribution documentation
