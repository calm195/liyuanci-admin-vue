# Liyuanci Web administration

Content moderation and wordlist management use the contract 0.2.0 backend APIs. Wordlists support category heads, complete snapshots, dual-version publication and read-only archives.

## 1. Project introduction

The Liyuanci administration app uses Vue 3 Composition API, Vite, strict TypeScript, Vue Router, Pinia and Element Plus. It provides a login entry, role menus, a dashboard, admin account management, identity review, content moderation, and report/penalty/appeal management and a crisis workspace.

Administrators use pre-provisioned local accounts and may change their own passwords. Login, password changes, logout, account management, identity review, content moderation, wordlists, safety case management and the crisis workspace connect directly to same-origin HTTP APIs in development and production. Identity review separates the query list, read-only case details and processing drawer, with on-demand card viewing and decisions; content moderation also separates read-only details from its processing drawer, submits the case version and displays the business outcome separately; authorized crisis escalation opens an explicit operation from the details. No local demonstration accounts, cases or wordlists are provided.

Super administrators use separate evidence deletion and receipt query pages. Deletion requires explicitly opening the processing drawer after reading metadata for a known evidence item; they can confirm deletion of its entire retained scope using the scope version and a reason, and query evidence deletion jobs or anonymous deletion receipts. Acceptance does not mean physical cleanup is complete. Bodies, student numbers and receipts are never persisted to browser storage.

The interface uses a shared sidebar, breadcrumbs and role-filtered menus. Both login and workspace support light, dark and system appearance. Only the theme preference is saved in local storage; switching still works when storage is unavailable. Page titles and breadcrumbs use route metadata. Element Plus components are explicitly imported and configured for Simplified Chinese.

Account queries and editing are separated by a drawer. Wordlist listing, read-only details and draft creation use separate routes; publication requires confirmation on the detail page. Reports, penalties and appeals have separate pages with read-only queries/details and action drawers. Penalty grounds are confirmed reports from the current result page; the integrated APIs do not provide a penalty history list.

Whisper review is available at `/whispers/reviews` using the separate `whispers/1.0.0` contract for flagged posts, comments, nicknames and private capsules. The list, read-only details and processing drawer are separate. Decisions submit both case and content versions; content decisions are displayed separately from publication, nickname activation or capsule unlocking. Review operators and super administrators may enter; escalation from ordinary review details requires a super administrator. All actions remain subject to server projections and authorization. Missing backend routes show real errors; subsequent whisper crisis handling uses a separate integration.

Whisper reports are available at `/whispers/reports` to all three case roles subject to authorization, with separate listing, read-only details and processing drawers. Governance targets and versions come from the report source. Confirmed reports may lead to a minor warning, general 7-day mute or severe permanent ban without entering author account IDs or versions. Releasing ordinary restrictions does not publish content. Crisis escalation requires a crisis operator or super administrator and a server-granted action. Appeals for whisper penalties use the existing appeals workspace without adding private source bodies or identity fields.

Whisper crises are available at `/whispers/crises` only to crisis operators and super administrators, with authorized bodies, verification status, timelines and delivery status. Server-granted actions support takeover, follow-up, resolution, retrying valid notifications and marking false positives. Unverified cases show that no verified student number is available. Resolution preserves isolation; false positives return to ordinary review without publishing content. At `/whispers/evidence`, super administrators read metadata by a known scope ID, enter `DELETE_EVIDENCE_SCOPE` and a reason to request deletion of the entire scope, then manually query progress by the returned job ID. Acceptance does not mean completion. Bodies, reasons and retry requests stay in page memory and are cleared on role removal, account changes and navigation.

## 2. Project options and directory structure

The app accesses same-origin `/api/v1` without public environment flags. Vite forwards development requests to the local backend on port `18080`; production hosting must supply a same-origin reverse proxy. All `VITE_` variables are public and must contain no secrets.

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

Both `pnpm dev` and production builds connect to same-origin `/api/v1` by default, without integration mode or extra flags. Account management requires super_admin. Initial passwords come from server policy and are neither entered nor displayed on the page. Hosting must supply same-origin backend routes; identity review requires registered verification routes. Moderation and wordlists use real APIs. Safety case management supports report decisions, warnings, fixed 7-day muting, permanent bans, appeal decisions, and ordinary content restrictions. All three admin roles may access ordinary safety cases; account role management still requires super_admin. Current account and content-resource versions must come from an authorized handoff; case and body versions are never substituted. The crisis workspace separates its query list, read-only case details and processing drawer and is restricted to crisis operators and super administrators. It provides case evidence, timelines, care/operator delivery work, case actions and false-positive review; authorized report/moderation details can escalate a case. The backend requires an explicit independent `CrisisDSN` to register crisis routes; missing routes display a retriable error. The workspace shows care delivery status, excludes student-only care-card contents and contains no built-in assistance resources.

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

A one-line patch in `patches/` makes Vue 3.5.44 prop validator declarations compatible with Element Plus and `exactOptionalPropertyTypes`. It permits explicit `undefined` validators already supported at runtime, without changing validator function signatures or runtime code. Reassess this patch when upgrading Vue.

Use `<script setup lang="ts">` and respect strict typing and existing formatting/lint rules. Do not bypass checks with `any`, unsafe assertions or suppression comments. Validate external data in services; keep transient UI state in components and only shared state in stores. Place behavioral tests beside implementations.

After each set of changes, run `pnpm format`, `pnpm check` and `pnpm build` in order. Use `pnpm lint:fix` when automated lint fixes are needed. Report validation and unfinished dependencies accurately.

Keep README limited to introduction, options and structure, startup, and development notes; keep both root README languages aligned. All process artifacts belong to the docs repository; this project retains no stage documents.

Continue admin development on `develop` with the docs branch `admin-develop`. Check both branches and working trees before changes; use a separate docs worktree when another task is active. Fixed stage records are immutable; add new delivery, correction or evidence files in docs with exact source commits. Follow the [documentation policy](../docs/governance/README.md). Commit by feature scope with user authorization; do not automatically push, deploy or release. Requirements, approvals and fixed designs remain read-only.

Admin tokens stay in memory and refresh requires login again. Exclude student sessions and never persist identity data in browser storage. Menu and button visibility does not replace backend authorization. Never commit credentials, local Codex authentication or private environment values.

Production hosting requires HTTPS, history fallback and a same-origin `/api/v1` reverse proxy. Sensitive API responses must not be cached. See [AGENTS.md](AGENTS.md) for the full project guidance.

Browser regression: start `pnpm dev --host 127.0.0.1 --port 5173 --strictPort`, then run `pnpm test:browser`. Tests require resolvable Playwright and installed Chrome. Set `PLAYWRIGHT_MODULE` to an existing module’s absolute path, `ADMIN_TEST_BROWSER_CHANNEL` to an installed browser channel, or `ADMIN_TEST_OUTPUT` to an evidence directory. The script accesses local pages and intercepts every business API with synthetic responses, covering both themes, desktop/mobile layouts, drawers, role menus and session cleanup. It does not replace real backend integration.
