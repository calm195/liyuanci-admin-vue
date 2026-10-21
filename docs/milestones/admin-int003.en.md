# T010 / INT-003 isolated admin integration preparation

2026-10-21 Asia/Shanghai, admin session. REQ-018/019 and admin identity isolation under REQ-002; applicable acceptance subsets 018-A–F and 019-A/B. Isolated wiring: locally verified. Real scope: in development (blocked), not yet eligible for integration. No product acceptance.

## Inputs and prerequisites

Initial clean admin branch codex/admin-contract-0-2 at e1ceb027a19cef4abb5329d16e1da025a7be87d7 had no subsequent changes. New branch: codex/admin-auth-integration. This record shares its feature commit with the source; see Git and final report for its SHA. Existing login/password and wordlist heads/dual-version migration remain intact.

Coordination and observed docs HEAD: c927db0fa2a1b12b1ded49bc77e23991cc80325d. Backend remains clean at 8ba233f7a3c4edab32de8331f775aefd14b2dcad; phase-05 and admin-auth.md supply the latest handoff. Backend historical checks were not rerun. Direct prerequisites are the delivered T008 admin operations and T010 session/transport implementation. T011 is unnecessary for this local scope. Miniprogram participation/version/device: not applicable.

Formal contract 0.2.0 was frozen at 9b775900422fdfec1fb222ce2b84bbb355f63b91. Metadata/documentation update 9db9d71125097e25d02c2e5ca28153160fe85de1 changes no wire fields. Current SHA256:

- OpenAPI: 5f7389cb5e3ba968345db1c9b1d3565daee0ef9731810df657b94d6365c661a4
- Examples: 0d3560fcb0e634d4e0e65a48e448bcb9e605fe3253f65aa976d31bd30bf2df1e
- Decisions: 188043aa722f3a40d74644bb77c2f6f462cb6b04fe46e8ff7399a03ccf294a07

Docs has modified build.py/validate.py and untracked actions.v0.2.0.json, authorization.py and moderation-extension.draft.json. These were evaluated read-only, never consumed or generated. Shared ledgers remain unchanged.

## Implementation and transport

Real identity wiring requires DEV, mode integration, VITE_ADMIN_AUTH_INTEGRATION=true and VITE_ADMIN_MOCK other than true. Production, default mode, missing flag and conflicting Mock fail closed. Login shows an isolation banner. Existing adapters handle login/password; logout retains DELETE with an idempotency key. Tokens remain memory-only; no student session, cookies, persistent recovery or renewal. Fixed same-origin paths use no-store, omit and redirect:error. Other adminRequest operations are blocked in integration mode. No proxy or cross-origin arrangement was added.

Existing store/page behavior preserves password 403 without logout, 204 clearing and relogin, duplicate prevention, stable retry keys, generation checks, unmount cancellation and input cleanup. Cancellation does not prove backend rollback. New tests use substitute fetch and verify runtime wiring and gates, not backend transactions, revocation or throttling.

## Admission and cases

Before execution, lock full docs/backend/admin SHAs, contract fingerprints, static artifact digest, migration instance/version and 0007_admin_local plus permissions evidence; same-origin hosting, backend startup version, non-secret configuration digest and external secret references. Identity references have not been delivered. Never record passwords, tokens, DSNs or keys.

Backend/integration owners must supply APP_ADMINAUTH_ENABLED; a restricted maintenance identity on the authoritative PG database; external INITIALPASSWORDFILE and RECEIPTKEYFILE references; explicit SESSIONTTL, TIMEOUT, LOCKTIMEOUT, RECEIPTTTL, MAXATTEMPTS, LOGINWINDOW, LOGINLIMIT and APP_REDIS_* configuration. Record test values and fingerprints without approving production policy. Overall readyz may remain 503: verify local admin availability separately. Frontend wiring is ready; accessible same-origin hosting, service, migration/permission evidence and isolated identities are still missing. No backend was started or initialized.

All real cases below are **not executed**; there are no real request IDs or joint results:

| Case  | Expected behavior and evidence                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I3-01 | Unknown account and wrong password both 401, same Chinese UI message, no enumeration; record statuses, request IDs and sanitized response fields, distinguish throttling |
| I3-02 | Designated admin login 200 and returned roles; student token rejected by admin operation; retain identity-domain evidence                                                |
| I3-03 | Wrong current password 403 leaves session usable; subsequent correct change works; retain status sequence                                                                |
| I3-04 | Password change 204 clears memory; old password 401, new password 200; retain cleanup and request IDs                                                                    |
| I3-05 | Establish two sessions before change; both old tokens subsequently return 401 on protected password requests; never record tokens                                        |
| I3-06 | Relogin then logout 204 clears memory; revoked token returns 401; retain request IDs                                                                                     |
| I3-07 | Network uncertainty never automatically resubmits; same input retains key, repeated clicks create one in-flight request; retain sanitized timing/key references          |
| I3-08 | Leaving/switching sessions during login/password requests prevents late success/401/403 from affecting newer sessions; retain cancellation and cleanup timing            |
| I3-09 | Explicit short test TTL produces 401 and relogin; revoked role produces 403 without inferred roles; retain TTL reference and roles after explicit relogin                |

Super-admin creation is excluded. If later included, separately cover super/ordinary roles, identical-key replay, changed payload, duplicate-name 409 and action records. No account list or role management expansion.

## Consumption review and blockers

B02: isolated wiring and substitute regressions complete; backend/identity/integration owners must deliver admission inputs and run INT-003. B04: synthetic behavior and closed real card access retained; backend must supply lists, card authorization and audit. B05: case IDs/versions never substitute for content targets; backend must freeze a new version, mapping, independent versions, migrations and 409 examples. B06: wordlist heads/full snapshots/dual versions/archive regressions retained; backend publication/scanning/audit remain. B07: 401 clearing, password 403 retention and absolute-expiry relogin retained; backend must freeze action/role-refresh rules and provide test TTL, data owners supply grade dictionary. B11: formal wordlists/samples and scanning verification remain with operations owners. B14: applicable admin migration is complete, no new formal wire delta; docs coordinates remaining cross-project consumption separately from service/resource readiness.

The uncommitted action index is static operationId mapping, not authorization; missing/unknown actions fail closed and bind to current targets. Its proposed role refresh uses login snapshots and explicit relogin; 403 cannot imply new roles, and no GET/refresh endpoint exists. It is not a newly frozen protocol. The draft-not-active extension proposes content_registry.id rather than case/entity IDs, independent target.version rather than content_version/wish.version, and a case version whose DDL is also missing. Wait for formal version/migration, then create a separate consumer task and target/version/action/conflict regressions.

## Validation and next step

See the [validation snapshot](../validation/admin-int003.md). pnpm format, pnpm check, pnpm build and git diff --check passed: 128 business and 58 convention tests. An initial stale login-message assertion was updated before a complete rerun. Real HTTP, manual browser acceptance, joint integration and deployment were not executed.

Backend/integration owners supply admission inputs, lock final SHAs/configuration, then execute I3-01–09 with evidence. Substitute fetch never counts as joint verification. Commits are authorized; no push, deployment or release. Shared ledgers are left to the docs coordination session.
