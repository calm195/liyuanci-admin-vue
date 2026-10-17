# Liyuanci Web administration

T004 (Web)/T010; REQ-018, REQ-019, REQ-020. Imported Vue 3, TypeScript, Router and Pinia from vue3-template with its unchanged pnpm 10.34.6 lockfile and quality rules.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm format
pnpm check
pnpm build
```

See package.json for Node requirements. Real login is disabled pending D02 identity-provider delivery in shared contract 0.1.0. No invented password/SSO exchange or default credentials. Admin tokens stay in memory; refreshing requires login again. Student sessions are excluded. Browser storage holds no identity data.

For synthetic local preview: `VITE_ADMIN_MOCK=true pnpm dev`. The persistent Mock banner identifies simulated roles and sessions. Mock only runs in Vite DEV and is disabled in production builds, even with that variable set. Synthetic requests never reach real APIs. Real business APIs and identity review are pending integration.

Lazy views live in src/views, I/O boundaries in src/services, contract types in src/types, memory session in src/stores, role menus and guards in src/router. UI visibility never replaces server authorization.

See [delivery and validation](docs/delivery-T004-T010.md), [contract questions](docs/contract-questions.md), and [T012 integration checklist](docs/T012-integration.md).

Hosting requires HTTPS, history fallback and same-origin `/api/v1` reverse proxy. Sensitive API responses must not be cached. Changes are committed by feature on a development branch; no automatic push or deployment.

## Implemented features and design

| Feature / traceability                  | Implementation and design                                                                                                                                                                                                                              | Validation and dependencies                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| T004 foundation / REQ-001,020           | Vue3, strict TypeScript, Router, Pinia; original lockfile and quality rules; source/build/CI imported, local data excluded                                                                                                                             | Standalone foundation format/check/build passed with 3 template tests; examples subsequently removed                          |
| T010 session and requests / REQ-018,019 | Validate AdminSessionResult; reject student Session.me, unknown roles and inactive accounts; memory-only tokens, same-origin /api/v1/admin, no-store, omit cookies, reject redirects, DELETE idempotency key; discard late results from old sessions   | Session-stage format/check/build passed with 16 tests including template tests; contract0.1.0; real login blocked by D02/T008 |
| T010 login and role entry / REQ-018,019 | Real exchange disabled; explicit development Mock with synthetic roles and persistent banner; lazy dashboard, identity preparation,403/404; shared role checks for menu and guard, crisis-only role excluded from identity review, super-admin allowed | Final20 behavioral tests and format/check/build passed; server authorizes every request                                       |
| T010 expiry and logout / REQ-018,019    | 401 clears session and returns to login;403 preserves session and opens denial page; logout clears locally then revokes with explicit failure notice; reload requires login, no invented refresh/TTL                                                   | Synthetic HTTP/state tests passed; real expiry, revocation and role changes await T008                                        |
| T012 preparation / REQ-002,018,019      | Guarded information page and checklist for masked lists, case-scoped card access, audit, version/idempotency and cleanup; no full identity reads                                                                                                       | Await T011 acceptance and T008 real sessions; real review is neither implemented nor accepted                                 |

After every completed feature change, document implementation and design in this README and README.md. Include documentation and necessary tests in feature commits ordered by dependency on a feature branch. AGENTS.md records this rule. Current branch: feat/admin-foundation-session. No push or deployment.
