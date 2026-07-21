---
name: skill-builder
description: Designs and validates small project-local Pi skills for a Furby Open installation. Use when the user asks the assistant to add a capability, create a skill, teach itself a workflow, or extend the agent without modifying the core runtime.
---

# Project Skill Builder

Create the smallest inspectable project-local skill that satisfies the request.

## Before writing

1. Clarify the task, trigger phrases, required inputs/outputs, and success criteria.
2. Identify required filesystem, network, account, package, and credential access.
3. Prefer instructions-only skills. Add scripts only for deterministic repeated operations.
4. Prefer existing system tools and dependencies. Ask before installing a package or enabling a service.
5. Never place secret values in skill files, examples, tests, or logs.

## Structure

```text
.pi/skills/<skill-name>/
├── SKILL.md
├── REFERENCE.md   # optional
└── scripts/       # optional deterministic helpers
```

`SKILL.md` must include YAML frontmatter with:

- a lowercase hyphenated `name`
- a third-person `description` explaining what it does and when to use it

Keep `SKILL.md` concise and move long reference material into one-level-deep supporting files.

## Implementation

1. Show the proposed structure and trust requirements.
2. Create only files needed for the capability.
3. Use paths relative to the skill directory in instructions.
4. Add explicit errors and bounded input/output behavior to scripts.
5. Do not add global Pi resources unless the user explicitly requests them.

## Validation

1. Inspect every created file.
2. Confirm no secrets or personal data were added.
3. Run focused script tests with disposable data.
4. Run `npm run build` and `npm test` if application code changed.
5. Explain how to invoke the skill and how to remove it.
6. Return to safe mode after implementation when coding access is no longer needed.
