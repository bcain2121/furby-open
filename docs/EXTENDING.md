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
