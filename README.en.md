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

## T010 admin session and request boundary · REQ-018 / 019

Implements runtime admin-session validation, separate Bearer requests, login adapter boundary, revocation and 401/403 handling. Tokens stay in Pinia memory; reload requires login. Student Session.me, inactive accounts and unknown roles are rejected. Requests use same-origin admin paths, no-store, omit cookies and reject redirects; DELETE carries an idempotency key. Late responses after session changes are rejected; failed remote revocation is explicitly reported.

Contract 0.1.0 leaves D02 credentials undefined, so real login stays disabled without invented password or SSO fields. Mock defaults off and requires both Vite DEV and VITE_ADMIN_MOCK=true. Synthetic tokens never reach real APIs. Lifecycle and authorization await T008 integration. UI integration follows this module.

Foundation format/check/build passed with 3 template tests. Session/request tests use synthetic transport and do not prove real login or server authorization.
