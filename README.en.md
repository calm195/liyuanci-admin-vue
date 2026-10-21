# Liyuanci Web administration

## 1. Project introduction

The Liyuanci administration app uses Vue 3 Composition API, Vite, strict TypeScript, Vue Router and Pinia. It provides a login entry, role menus, a dashboard and an identity review business page.

Real login awaits the backend identity provider. There are no default credentials. Synthetic Mock previews are available in development; identity review supports synthetic case lists, on-demand card viewing, approval/rejection and receipts. Real business APIs remain pending integration.

## 2. Project options and directory structure

See [.env.example](.env.example). `VITE_ADMIN_MOCK=true` explicitly enables synthetic roles, sessions and identity review in Vite DEV with a persistent Mock banner. Production builds disable Mock, and synthetic requests never reach real APIs. All `VITE_` variables are public and must contain no secrets.

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
docs/
  milestones/   Feature, design and validation records by stage
```

Stages: [T004 foundation](docs/milestones/T004.en.md), [T010 sessions and permissions](docs/milestones/T010.en.md), [T012 identity review](docs/milestones/T012.en.md). Supporting material: [initial delivery](docs/delivery-T004-T010.md), [contract questions](docs/contract-questions.md), [T012 checklist](docs/T012-integration.md).

## 3. Getting started

Use Node.js `^22.13.0 || >=24.0.0` and pnpm 10 (declared version: 10.34.6). Preserve `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Synthetic local preview:

```sh
VITE_ADMIN_MOCK=true pnpm dev
```

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

Keep README limited to project introduction, options and directory structure, startup instructions, and development standards and notes. Keep both languages aligned. Store feature and milestone records in separate stage files under `docs/milestones/`, covering task IDs / REQs, behavior, module boundaries, design tradeoffs, contract version, real/Mock status, validation and unfinished dependencies. Include these records in the corresponding feature commits.

Create a development branch before new features and commit by feature scope and dependency order with user authorization. Do not automatically push, deploy or release. Modify only this repository; source templates, shared contract workspaces and approval materials remain read-only. Record contract questions in this repository's `docs/`.

Admin tokens stay in memory and refresh requires login again. Exclude student sessions and never persist identity data in browser storage. Menu and button visibility does not replace backend authorization. Never commit credentials, local Codex authentication or private environment values.

Production hosting requires HTTPS, history fallback and a same-origin `/api/v1` reverse proxy. Sensitive API responses must not be cached. See [AGENTS.md](AGENTS.md) for the full project guidance.
