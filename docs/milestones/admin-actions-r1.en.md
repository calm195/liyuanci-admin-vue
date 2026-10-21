# B07 revision 1 applicable admin consumption

2026-10-21 Asia/Shanghai, admin session. T010/T012/T017, B07/B14; REQ-002/018/019, applicable acceptance subsets 018-A–F and 019-A/B. Locally verified; real scope remains in development (blocked), without joint integration or product acceptance.

## Fixed inputs

Initial clean branch codex/admin-auth-integration at b00094f40b89e6e4aa5998134ddf896c647ea7b8. New branch codex/admin-actions-review. This record and regression tests share a commit; Git and the final report identify the full final SHA.

Formal docs main: f8c35f93fcc10cd2b4adc3f3b67ae4e4736b0b87, parent coordination baseline c927db0fa2a1b12b1ded49bc77e23991cc80325d. Observed backend: 764fd9f8a044ea2cf275b77eece2743895cb8166. Contract 0.2.0, static index revision 1, no wire changes. git show and Python hashlib verified all nine committed fingerprints listed in the [Chinese record](admin-actions-r1.md), including:

- actions.v0.2.0.json: 1c6b67db585a9f80970bdde16b996c145fb5627ee56c86de2ce82af3bfb2ebd2
- actions-review.v0.2.0-r1.json: 0d377b65bf7a6f353ecf620f1db403d3117debbb239084e4fd5791c61a0680ba

Prerequisites: formal index and existing admin memory-session implementation. The formal delivery supersedes the previous stage's historical “uncommitted index” observation. Moderation extensions remain uncommitted/inactive. No shared files were changed and no shared generator was run. The 83 entries form a directory, not authorization; only four operations are implemented-opt-in.

## Applicability and behavior

| Scope                                                         | Consumption decision                                                                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eight Me and twelve WishResult projection operations          | N/A: admin has no student projection consumer. Student allowed_actions cannot grant admin roles; no student pages or copied action vocabulary added |
| Remaining 63 null projections, including all admin operations | Null grants nothing; GET is not write permission. No invented Account/case allowed_actions or directory-based real entry activation                 |
| Login roles                                                   | Snapshot drives menus; explicit relogin refreshes roles, without optimistic elevation or automatic refresh                                          |
| 401                                                           | Clears current session and roles; stale 401 cannot affect a newer session                                                                           |
| 403                                                           | Stops operation without retry or inferred role/session invalidation; incorrect current password retains session                                     |
| Password 204                                                  | Clears current session for relogin; stale 204 cannot clear a newer session                                                                          |
| Absolute expiry                                               | 401 requires relogin; no refresh/session GET endpoint, guessed TTL or student policy reuse                                                          |
| Moderation target actions                                     | N/A: formal 0.2.0 has no new target projection fields. Real dispositions remain closed; case IDs/versions never substitute for content targets      |
| Wordlists                                                     | Existing heads/dual-version/archive consumption retained without repeating migration                                                                |

Existing runtime behavior already satisfies the applicable formal rules. No unused action abstraction or runtime static-index dependency was added. Two new behavioral regressions verify single-attempt 403 with unchanged roles, explicit relogin replacing roles and 401 clearing them; fabricated student/admin action fields cannot grant admin roles and student sessions remain rejected. Existing password 204, late 401/403/204, duplicate submission, unmount cleanup and closed real business entry regressions remain.

## Validation and remaining work

pnpm format, pnpm check, pnpm build and git diff --check passed: 130 business tests across 13 files and 58 convention tests. Logs: /tmp/admin-actions-r1-format.log, /tmp/admin-actions-r1-check.log, /tmp/admin-actions-r1-build.log. Validation corresponds to this commit's test source. Synthetic projections, mocked services and substitute fetch do not establish real HTTP authorization, cross-process revocation or joint integration. All real INT-003 I3-01–09 cases remain unexecuted; no backend startup, migration, account initialization or deployment.

B07 formal vocabulary/admin refresh consumption review is complete locally. Test TTL/environment, grade dictionary, student policy and real positive/negative evidence remain with backend/data owners and applicable clients. B14 admin applicable migration is complete, while docs must still coordinate other-client page/action consumption.

B02 still requires same-origin hosting, accessible backend, migration 0007/permissions evidence, external isolated identities and explicit configuration before INT-003. B04 card/audit, B06 real wordlist service and B11 formal data remain with their respective owners. B05 requires user decisions on target model and compatibility release scope followed by a formal backend version/migration; future consumer changes and regressions must be separate, without consuming draft-not-active fields.

Next: docs consolidates evidence; integration/backend owners supply INT-003 inputs, then lock final SHAs, artifacts and configuration for execution. Shared ledgers stay read-only. Commit under existing authorization; no push, deployment or release.
