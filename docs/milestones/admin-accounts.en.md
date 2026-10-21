# Admin account management

Subsequent update: real APIs are now enabled by default, with isolated-mode/production restrictions removed; see [default real APIs](real-admin-api.en.md).

2026-10-21; T010/T011, REQ-018/019/020. Contract 0.2.0, actions revision 5. Read-only references: shared OpenAPI, admin-account integration notes and decisions. This stage implements the three account operations missing from the previous frontend inventory without activating moderation extensions.

## Behavior

- The lazy `/accounts` page and menu require super_admin. Review operators, crisis operators and accounts with no roles cannot enter; unauthenticated navigation returns to login.
- The list shows login names, active/inactive state, roles and target versions, marking the current account. Pagination uses limit=20 and encoded opaque cursors, with previous/next and restart controls. It is a changing list, not a frozen snapshot. Successful writes reload the first page.
- Creation accepts login_name, roles and a nonblank reason, including empty roles. A second confirmation displays the proposed account, roles and reason. Busy state prevents duplicate submission. There is no initial-password input, password display or reset operation; server policy supplies the initial password through the designated delivery channel.
- Full role replacement uses the selected Account.version, allows empty roles and self-modification, and adds no last-admin policy. Confirmation shows the target, version, roles and reason, with a notice when modifying the current account.
- Identical inputs retain their Idempotency-Key after network failure. Changed inputs create a new command. HTTP 409/404 reloads the first page, clears stale editing targets and requires selection and confirmation again without automatic replay. Creation conflicts preserve inputs and the key across automatic refresh.
- Successful self-modification updates the current in-memory Account from the response so menus reflect current roles. Losing super_admin clears the page and triggers the forbidden route while retaining the valid session. Other browser sessions still rely on backend authorization on every request; no renewal is introduced.
- HTTP 401 clears the session and page. HTTP 403 clears the page and stops operations without inventing roles. Navigation, session changes and local revocation cancel pending requests and discard stale responses. Lists and reasons are not persisted.

## Modules and interface boundaries

`types/accounts.ts` defines inputs, pages and the client. `services/accounts.ts` owns HTTP, envelopes and runtime validation, discarding extra password/token fields. `AccountsView.vue` owns transient form, cursor history, confirmation and retry state. `useAdminWorkspace` now accepts a required-role parameter, defaulting to review_operator to preserve existing review behavior; the account page passes super_admin.

| Operation under /api/v1        | Request                                                                  | Success                                       |
| ------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------- |
| GET /admin/accounts            | limit=20, optional cursor, admin Bearer                                  | 200, standard data.items/next_cursor envelope |
| POST /admin/accounts           | login_name, roles, reason, admin Bearer and stable Idempotency-Key       | 201, Account envelope without passwords       |
| PUT /admin/accounts/{id}/roles | roles, reason, expected_version, admin Bearer and stable Idempotency-Key | 200, target Account envelope                  |

Responses validate code=0, message, request_id and data before account/page validation. Inactive accounts and empty roles are valid list projections; unknown roles, invalid versions and mismatched target receipts are rejected. Same-origin requests use no-store, omitted credentials, redirect rejection and AbortSignal. Local authorization/cancellation is checked before transport, after response and after body reading. Error bodies are neither displayed nor logged; HTTP status drives safe messages.

## Runtime status and decisions

This page has HTTP wiring and test doubles, without a new synthetic account model. It reuses explicit identity integration admission: `VITE_ADMIN_MOCK=false VITE_ADMIN_AUTH_INTEGRATION=true pnpm dev --mode integration`. Backend admin opt-in routes, migrations/permissions, same-origin /api/v1 hosting and an external isolated super-admin identity are required. Default, Mock and production builds keep the entry closed. No new flags, dependencies, proxy or session-read/renewal endpoints were introduced.

Frontend implementation does not constitute real HTTP integration acceptance. Moderation and wordlists remain Mock-only; reports, penalties, appeals, crisis, evidence and work items still lack pages. Other entries in the previous inventory remain applicable. Although the self-service password transport supports isolated integration, its existing page admission remains Mock-only; this independent page was not changed in this stage.

## Validation

`pnpm format`, `pnpm check` and `pnpm build` passed: 16 business test files / 171 tests and 58 convention-checker tests. New transport/page tests and extended route/admission tests cover field filtering, empty roles, inactive projections, cursor encoding, 201/200, stable keys, target versions, confirmation, duplicate clicks, network retry, conflict refresh, 401/403, mismatched receipts, cancellation/revocation and self-role synchronization.

## Remaining dependencies

No same-origin isolated backend/super-admin identity was available; real service, database/Redis, audit, concurrency and cross-client checks were not performed. Backend/integration owners must supply them. Initial-password delivery, login-name uniqueness, current authorization, receipt replay and audit atomicity remain server responsibilities. Frontend tests do not replace backend acceptance. Admin TTL remains a coordination dependency. Only this repository was modified and committed; no push, deployment or release.
