# Contributing

Thank you for helping improve Furby Open.

## Before opening a change

1. Search existing issues and pull requests.
2. Keep changes focused and explain the user-facing reason.
3. Do not include personal data, credentials, private prompts, private skills, or machine-specific paths.
4. Preserve safe public defaults unless a security review supports changing them.

## Development

Requires Node.js 22.19 or newer.

```bash
npm install
npm run build
npm test
npm run test:coverage
npm audit --omit=dev --audit-level=critical
```

## Pull requests

Include:

- what changed and why
- security/privacy impact
- commands used to validate the change
- documentation updates when behavior changes

Do not add dependencies without explaining why the capability cannot be implemented with the current stack.

## Design principles

- keep the core small and inspectable
- prefer local ownership and explicit configuration
- default to least privilege
- keep Telegram, runtime, storage, and optional integrations separated
- make extension points ordinary Pi skills where practical
- fail clearly rather than silently claiming success
