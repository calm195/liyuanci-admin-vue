# Liyuanci Web administration

## T004 engineering foundation · REQ-001 / 020

Imported the Vue 3, TypeScript, Router and Pinia template and examples from the read-only source. Preserved the pnpm 10.34.6 lockfile, strict types, ESLint, Vitest, formatting and CI gates, plus repository history and .gitignore. Excluded template Git data, credentials, local configuration, dependencies and build outputs. Examples are not business features; T010 replaces them with the admin shell.

Design: lazy views in src/views, I/O in src/services and shared state in Pinia. No real API dependency. See package.json for Node requirements.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm format
pnpm check
pnpm build
```

Update both READMEs after each completed feature with implementation and design, then commit by dependency order on a feature branch. No automatic push or deployment.
