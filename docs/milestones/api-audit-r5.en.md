# Latest API audit and implemented features

Subsequent update: account management now has a page and three isolated HTTP operations; see [admin account management](admin-accounts.en.md). The table below preserves the audit-time state.
2026-10-21; T010/T012/T017, REQ-002/015/018/019/020. Read-only inputs: shared OpenAPI 0.2.0, actions revision 5, verification and admin-account integration notes. No inactive moderation extension is consumed.

## Findings and changes

Login and self-service password paths, fields and response codes match the current contract. Generic admin writes now preserve caller-supplied Idempotency-Key values. Logout requires exactly 204.

Identity review previously used only synthetic data. The new identity transport connects four operations under /api/v1: GET /admin/identity-reviews, GET /admin/identity-reviews/{id}, GET /admin/identity-reviews/{id}/student-card and POST /admin/identity-reviews/{id}/decision. It encodes opaque cursors with limit=20, validates success envelopes before parsing data, retains only redacted list fields, checks case/receipt IDs and sends the application version with a stable caller key. Approval strips unrelated rejection fields.

Cards use nonempty image/png binary responses rather than JSON or download URLs. Requests carry admin Bearer tokens, no-store, omitted credentials, redirect rejection and AbortSignal. Authorization and cancellation are checked before and after response/body reads. Existing page behavior retains session ownership, stale-response rejection, object URL cleanup, manual conflict reconciliation, confirmation, 401 cleanup and 403 rejection.

## Boundaries and configuration

admin.ts owns environment admission; identity-transport.ts owns HTTP/envelope/PNG validation; identity.ts retains field parsers and synthetic fixtures; IdentityView binds the opening in-memory session. Public VITE_ADMIN_IDENTITY_INTEGRATION is effective only with DEV, mode=integration, VITE_ADMIN_AUTH_INTEGRATION=true and Mock disabled. Default and production builds keep the entry closed.

Run `VITE_ADMIN_MOCK=false VITE_ADMIN_AUTH_INTEGRATION=true VITE_ADMIN_IDENTITY_INTEGRATION=true pnpm dev --mode integration` only against an explicitly registered verification backend and same-origin /api/v1 hosting. This repository supplies no external resources or accounts.

## Implemented features

| Feature                                                   | Frontend implementation                                                                                                      | Integration status                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Login, password change, logout                            | Forms, validation, memory session, re-login after password change                                                            | Three isolated HTTP operations plus DEV synthetic mode; production entry closed                 |
| Permissions/navigation                                    | Three-role menus, route guards, 401 cleanup, 403 and 404 pages, lazy routes                                                  | Role snapshot is presentation only; backend authorizes each request                             |
| Dashboard                                                 | Static welcome/status                                                                                                        | No live metrics                                                                                 |
| Identity review                                           | Pagination, details, on-demand cards, approval/rejection, reasons/suggestions, confirmation, receipts, conflicts and cleanup | Four HTTP operations behind an additional explicit flag, plus Mock; real integration unverified |
| Moderation                                                | Synthetic cases, decisions, independent business outcomes, offline/release                                                   | Mock only; backend unimplemented and target extension inactive                                  |
| Wordlists                                                 | Three category heads, complete snapshots, dual-version publication, read-only archives, synthetic literal scanning           | Mock only; real APIs/scanning unavailable                                                       |
| Account creation/list/role replacement                    | No dedicated UI or client                                                                                                    | Three backend opt-in operations exist; frontend not implemented                                 |
| Reports, penalties, appeals, crisis, evidence, work items | No pages or clients                                                                                                          | Not integrated                                                                                  |

## Validation and remaining dependencies

Transport regressions cover cursor encoding, redaction, versions, stable keys, PNG, malformed envelopes, mismatched cases, cancellation/revocation and HTTP 401/403/404/409/429/503. Additional tests cover environment admission, logout status and generic key preservation.

Final check results are recorded below. No real backend HTTP or cross-client run was performed. Verification remains an injected backend library without default server assembly. Providers, audit persistence/failure behavior, real PNGs, school rules, isolated identities, admin TTL, official wordlists and scanning still require backend/integration delivery. Shared docs, backend and approvals were unchanged. No push, deployment or release.

Final `pnpm format`, `pnpm check` and `pnpm build` passed: 14 business test files / 144 tests and 58 convention-checker tests passed.
