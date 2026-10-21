# T017 wordlist contract 0.2.0 migration

Date: 2026-10-21 (Asia/Shanghai). Session: admin collaboration. Scope: T017 wordlist types, synthetic service, page and regressions; REQ-015/018/019, applicable portions of 015-A–D, 018 authorization/cleanup and 019-A/B. This is not full requirement acceptance or migration of accounts, identity review or other modules.

## Baseline, contract and dependencies

Started from clean admin commit `63dcd361c70d9eba1fc33bba8059e7fbce8843e6`, creating `codex/wordlist-contract-0-2` from `codex/content-moderation-wordlists`. Existing T012 commit `30be3f442190047021596d2739ec1032871b265a` and moderation page `e4eb1fa6eb3eac3f77a7c039a66bac2901f41c03` remain unchanged. This replaces the wordlist 0.1.0 synthetic version rules in 63dcd36.

Shared docs HEAD remains baseline `a5e6124dd77c0f539516e550fb790d7ad2bd0195`, but its workspace is no longer clean: contract README, generators/validators, semantics/error/operation indexes and shared progress/blocker/integration files are modified; 0.2.0 decisions, OpenAPI, examples and historical clarifications are untracked. These belong to other sessions and were read only. Since the baseline, B06 policy/protocol has converged and B14 tracks migration; complete snapshots, heads and dual-version publication are no longer undecided policy questions.

Consumed the uncommitted **0.2.0** workspace contract. SHA256 remained identical before/after:

| File                 | SHA256                                                           |
| -------------------- | ---------------------------------------------------------------- |
| openapi.v0.2.0.json  | acf31b515538e1bf3b3f85fcecee9a210bb83e6b0408e2dbcde6643a736d9dd9 |
| examples.v0.2.0.json | 0d3560fcb0e634d4e0e65a48e448bcb9e605fe3253f65aa976d31bd30bf2df1e |
| decisions.v0.2.0.md  | 75de7fa5d156859bce884561d6b32a60a0a7ddb5cc4d76007aa17f02b82793cf |

Direct dependencies: T010 has local synthetic permission-shell evidence; real T016 is unavailable and T008/T011 are also incomplete. Only the authorized independent synthetic scope continues.

## Field and behavior migration

| Previous local model                                                      | Current consumption                                                                                                                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Highest resource version as creation baseline; omitted for new categories | Every page includes exactly three category heads; first creation also supplies head.version, initially 1/null                                                                |
| New resource version derived from category maximum                        | New draft resource starts at 1; creation increments only head generation, preserving effective_id and capturing base_effective_id                                            |
| Publication checks resource version and rejects every earlier draft       | Requires expected_version and expected_head_version, plus matching base_effective_id; later draft creation alone does not invalidate an earlier draft                        |
| Effective version inferred from list                                      | Publication updates resource state versions, head generation and effective pointer together; previous effective snapshot becomes archived, without direct republish/rollback |
| No entries detail, open status strings                                    | Full authorized WordlistDetail entries for draft/published/archived; invalid or missing response fields fail at the boundary                                                 |
| Matching returns a version number                                         | Synthetic matching records actual snapshot id/version; later calls use new effective snapshots while historical results remain unchanged; no historical full rescan          |

Inputs remain complete immutable entry snapshots, including allowed empty arrays. Read-only details do not edit existing resources. List projection excludes entries; returned detail arrays are copied. Synthetic published seeds have resource version 2/head generation 3; new categories have generation 1 and null effective_id.

The page separately shows head generation, effective id, resource version and creation-time effective id; publication confirmation shows both expected versions. All cursor pages must load with consistent heads before writes. Changed/missing/duplicate heads or cursor cycles fail closed without using partial lists. A 409/404 clears confirmation and rereads, requiring user review before any new request; it never upgrades versions or overwrites automatically. Drafts based on replaced effective snapshots are read-only with guidance to create a fresh snapshot. Existing idempotency keys, duplicate submission locks, 401/403 cleanup and session ownership remain; switching/closing/unmounting detail cancels and rejects stale responses.

Module boundaries: types define wire fields; service validates responses and holds page-local synthetic state; view owns transient input/detail/confirmation. No shared store, route authorization or backend changes. No dependencies, real HTTP, substitute network transport or persistence were added. This does not establish database atomicity, audit or real scanning.

## Validation and status

Final `pnpm format` → `pnpm check` → `pnpm build` passed: 10 test files, 102 business tests, 58 convention tests and production build. Wordlist service has 12 tests and page has 14; other modules remain green. Results apply to this feature commit source; SHA256 manifest and local raw log references are in the [validation snapshot](../validation/T017-wordlists-v0.2.0.md).

Initial migration passed 100 business tests. After adding missing-version and detail-unmount cases, Reflect.apply triggered the unbound-method lint rule; explicit binding fixed the test, and the full sequence passed again. No checks were weakened. Shared contract generation/validation was not rerun to avoid mutating another session's workspace. No manual browser/screenshots, actual backend/scanning/audit or cross-project integration ran.

Status: this wordlist 0.2.0 synthetic migration is **locally verified**; overall T017 remains **in development, blocked**. README, milestone records and contract questions are updated. Final commit and clean/dirty state are reported from Git at handoff.

## Blockers and next step

- **B06/B11**: protocol is defined; actual heads/detail/publication services, persistent idempotency/audit/concurrency evidence and formal entries/scanning evidence remain missing. Backend coordinates/implements; designated operations providers supply data. Actual positive/negative and scanning evidence are required for closure; response dates TBD.
- **B14**: only the admin wordlist subset migrated. Shared 0.2.0 must be formally pinned, and other admin/session/identity and other clients/backend scopes require their own migration and coordinator aggregation. This local result does not close migration across projects.
- **B02/B04/B05/B07 and T008/T011/T016**: actual sessions, identity/card authorization, ordinary-disposition targets and role refresh remain subject to their blockers. No settled policy is reopened. Real login, card, disposition and wordlist entry points remain closed.

Consumer context is in [contract questions](../contract-questions.md). Next, coordinators pin 0.2.0 and deliver services/data before adapters and INT-001/002 admission. Shared progress remains read-only; no further modules, push, deployment, release or unsupported schedule estimates.

## Final shared snapshot verification

After the local feature commit, final verification found coordinator commits `56863509d6b5b5fb12af8d690148376fbab2bb6d` (progress aggregation) and `9b775900422fdfec1fb222ce2b84bbb355f63b91` (0.2.0 contract freeze); shared docs is clean. The uncommitted description above records startup/validation time. Final consumption can now be pinned to `9b775900422fdfec1fb222ce2b84bbb355f63b91`. All three contract SHA256 values still match the table, with no consumed field changes requiring implementation updates. This session did not write shared docs. Format, check and build were fully rerun after this note.
