# Extending Furby Open

## Prefer skills first

A Pi skill is a directory containing `SKILL.md` and optional supporting files. Project-local skills belong under:

```text
.pi/skills/<skill-name>/SKILL.md
```

Pi discovers them automatically for sessions rooted in this repository.

## Built-in starter skills

- `assistant-customizer` guides safe persona and identity changes.
- `skill-builder` guides creation and validation of a new project-local skill.

## Import skills from other coding agents

Codex CLI and Claude Code use the Agent Skills `SKILL.md` convention, but provider-specific extensions are not always portable. Preview candidates first:

```bash
npm run skills:import -- --list
```

Then run the confirmed importer:

```bash
npm run skills:import
```

The importer checks `~/.codex/skills/`, `~/.claude/skills/`, and `~/.agents/skills/`. It copies compatible skills into `.pi/skills/` without modifying the source. Imported skills and their local provenance manifest are Git-ignored.

Warnings identify Claude-specific substitutions, frontmatter, and shell interpolation that Pi may not support. A copied skill is not automatically safe: inspect its instructions, scripts, dependencies, network access, and secret requirements before enabling it.

## Self-extension workflow

1. Start in safe mode and describe the missing capability.
2. Review the proposed data access, tools, packages, and network services.
3. Enable coding mode only if implementation is necessary.
4. Ask the assistant to read `.pi/skills/skill-builder/SKILL.md`.
5. Create the smallest project-local capability.
6. Review every file and dependency.
7. Run focused validation, then the full build/test suite.
8. Return to safe mode.

Example:

> Design a project-local skill that summarizes Markdown notes in my workspace. Do not install dependencies. Show me the proposed files before creating them.

## When a skill is not enough

Use application code or a Pi extension only when the capability requires deterministic execution, a custom tool schema, event hooks, or process-level behavior.

Third-party extensions and packages can execute arbitrary code. Review their source and pin versions before installation.

## Public contributions

A generally useful, privacy-preserving capability may belong in Furby Open. Personal integrations, private business logic, and credentials should remain in local skills and must never be committed.
