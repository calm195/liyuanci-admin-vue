# Real admin APIs enabled by default

2026-10-21; T010/T012/T011, REQ-002/018/019/020. The user explicitly requested real login and removal of similar environment restrictions. Contract 0.2.0 remains unchanged; backend and shared workspace are untouched.

## Behavior and scope

- Login, password changes, logout, account listing/creation/full role replacement and identity review listing/details/cards/decisions now connect to same-origin `/api/v1` by default in development, preview and production builds.
- Removed DEV, integration mode, VITE_ADMIN_AUTH_INTEGRATION and VITE_ADMIN_IDENTITY_INTEGRATION admission requirements for real requests, along with the logout-only generic admin request allowlist. Obsolete flags are removed from types and configuration examples and no longer affect runtime behavior.
- Login and password forms no longer require integration or Mock mode. Identity review loads the real queue by default; account management loads according to super-admin authorization. Corresponding pending-acceptance and isolated-integration notices were removed.
- Explicit VITE_ADMIN_MOCK=true still selects synthetic development previews; synthetic tokens never reach real APIs. Accounts have no synthetic management model. Production ignores the Mock flag and uses real APIs.
- Authorization and protocol checks remain: super-admin menus/routes, admin Bearer, memory sessions, 401 cleanup, 403 stopping, stable keys, target versions, confirmation, stale-response rejection, cancellation and sensitive-state cleanup.
- Moderation and wordlists still lack real HTTP clients and remain Mock-only. This stage does not present synthetic behavior as real backend functionality.

## Modules and decisions

admin.ts directly calls the existing identity transport outside Mock mode. realApiEnabled only distinguishes explicit development Mock from real APIs for the account page; identity review selects its transport using mockEnabled. LoginView and PasswordView remove additional form-disable conditions. accounts.ts and admin-auth-transport.ts update wiring descriptions; contracts, errors and same-origin paths stay unchanged.

No extra parameters are required: `pnpm dev` uses real APIs, as does `pnpm build`. Hosting must provide same-origin `/api/v1` routing and enabled backend routes. No host, proxy, account or password is introduced. No running backend URL or credentials were available, so no real account login was executed.

## Validation

`pnpm format`, `pnpm check` and `pnpm build` passed: 17 business test files / 172 tests and 58 convention-checker tests.

The environment matrix verifies default development/production behavior and real APIs even with an erroneous production Mock flag; obsolete flags set to false no longer block requests. Login-form success and 401 paths use transport doubles and clear passwords after submission. Password-page regressions now run outside Mock mode, covering session clearing, wrong old passwords, duplicate clicks, stable retries, cancellation and session changes. A real identity-page wiring test checks automatic queue loading, on-demand details and admin Bearer headers. Existing authorization and synthetic-boundary tests pass.

## Status and dependencies

Frontend entry points are enabled; this does not establish backend deployment, database, audit, provider or cross-client acceptance. Account and verification routes must actually be enabled by the backend. Real moderation and wordlist wiring is still missing. Earlier stage descriptions of isolated admission and closed production entry points are historical; this stage defines current behavior. Both READMEs, configuration examples and bilingual stage documents are aligned. Only this repository changed; no push, deployment or release.
