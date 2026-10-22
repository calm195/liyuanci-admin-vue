# Liyuanci Web administration

Wordlist management previews contract 0.2.0 category heads, complete snapshots, dual-version publication and read-only archive details in explicit DEV Mock mode. Real integration remains pending.

## 1. Project introduction

The Liyuanci administration app uses Vue 3 Composition API, Vite, strict TypeScript, Vue Router and Pinia. It provides a login entry, role menus, a dashboard, admin account management, identity review and content moderation pages.

Administrators use pre-provisioned local accounts and may change their own passwords. Login and password changes connect to same-origin backend APIs by default; no account or password is built into the code. Synthetic Mock previews are available in development; identity review supports synthetic case lists, on-demand card viewing, approval/rejection and receipts. Content moderation previews versioned review, independent business outcomes and ordinary offline/release operations. Login, password changes, logout, account management and identity review connect to same-origin HTTP APIs by default in both development and production builds.

## 2. Project options and directory structure

See [.env.example](.env.example). `VITE_ADMIN_MOCK=true` explicitly enables synthetic accounts, sessions, self-service password changes, identity review and content moderation in Vite DEV with a persistent Mock banner. Production builds disable Mock, and synthetic requests never reach real APIs. All `VITE_` variables are public and must contain no secrets.

```text
src/
  assets/       Global styles and static assets
  components/   Reusable UI components (created as needed)
  composables/  Reusable reactive behavior
  router/       Lazy routes, role menus and guards
  services/     External I/O and validation boundaries
  stores/       Shared state and in-memory admin sessions
  types/        Shared domain and contract types
  utils/        Pure helpers and adjacent tests
  views/        Route-level views
public/         Public static assets
```

Development records, milestones and validation evidence are managed in the [admin documentation index](../docs/development/admin/README.md).

## 3. Getting started

Use Node.js `^22.13.0 || >=24.0.0` and pnpm 10 (declared version: 10.34.6). Preserve `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Synthetic local preview: generate temporary fictional credentials on the login page. Roles only configure the fixture account. You may reveal and record the fictional password before login for the self-service password-change preview, then log in again after success. Generating a new fixture replaces the previous synthetic account; it is not a real account creation/reset API.

```sh
VITE_ADMIN_MOCK=true pnpm dev
```

Both `pnpm dev` and production builds connect to same-origin `/api/v1` by default, without integration mode or extra flags. Account management requires super_admin. Initial passwords come from server policy and are neither entered nor displayed on the page. Hosting must supply same-origin backend routes; identity review requires registered verification routes. Moderation and wordlists remain Mock-only because real transports are not yet implemented.

Quality checks and build preview:

```sh
pnpm format
pnpm check
pnpm build
pnpm preview
```

`pnpm check` runs formatting, zero-warning ESLint, type checking and tests. Use `pnpm test` for tests alone or `pnpm test:watch` for watch mode.

`pnpm lint` checks non-test JS/TS (including JSX/TSX), Vue, standalone CSS/HTML and project scripts, including Vue style blocks and HTML inline styles and scripts, for task, requirement and milestone IDs. Explanatory comments must contain Chinese. Common logging methods on `console`, `logger` and `log` require a Chinese string or template as their first argument; pass dynamic data in subsequent arguments. Logging checks track object/method assignments, destructuring, alias chains, named import aliases and `bind/call/apply` by scope, conservatively retaining logging origins after reassignment. Do not bypass checks with dynamic properties or cross-module forwarding; extend rules and tests for new logging wrappers. Triple-slash type references are preserved. Files named `*.spec.*`, `*.test.*` or under `__tests__/` (including their HTML inline scripts) are exempt from this rule. `pnpm test` runs both business and convention-rule regression tests; `pnpm test:watch` watches business tests only.

## 4. Development standards and notes

Non-test code must contain no milestone, task or requirement IDs. Keep traceability in stage documents or tests. Write code comments in Chinese to explain functionality, business intent, boundaries and design decisions. Use Chinese for logs and user-facing errors. Preserve language directives, API fields, protocol values and identifiers required by tools.

Use `<script setup lang="ts">` and respect strict typing and existing formatting/lint rules. Do not bypass checks with `any`, unsafe assertions or suppression comments. Validate external data in services; keep transient UI state in components and only shared state in stores. Place behavioral tests beside implementations.

After each set of changes, run `pnpm format`, `pnpm check` and `pnpm build` in order. Use `pnpm lint:fix` when automated lint fixes are needed. Report validation and unfinished dependencies accurately.

Keep README limited to introduction, options and structure, startup, and development notes; keep both root README languages aligned. All process artifacts belong to the docs repository; this project retains no stage documents.

Before any project change, prepare matching `codex/<topic>` branches in this project and docs. Fixed stage records are immutable; add new delivery, correction or evidence files in docs with exact source commits. Follow the [documentation policy](../docs/governance/README.md). Commit by feature scope with user authorization; do not automatically push, deploy or release. Requirements, approvals and fixed designs remain read-only.

Admin tokens stay in memory and refresh requires login again. Exclude student sessions and never persist identity data in browser storage. Menu and button visibility does not replace backend authorization. Never commit credentials, local Codex authentication or private environment values.

Production hosting requires HTTPS, history fallback and a same-origin `/api/v1` reverse proxy. Sensitive API responses must not be cached. See [AGENTS.md](AGENTS.md) for the full project guidance.
