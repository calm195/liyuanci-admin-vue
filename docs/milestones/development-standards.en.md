# Automated development standards

Date: 2026-10-20. Scope: IDs, Chinese comments and logging in non-test source; no new business requirement ID.

## Behavior and boundaries

A local ESLint rule runs through `pnpm lint`, `pnpm check` and existing CI, failing on violations. It covers JS, TS, JSX, TSX, Vue and project scripts, excluding tests, dependencies and build output. It scans the full source, including comments and Vue templates, for task, requirement and integration decision IDs; checks script and template comments; and checks log/info/warn/error/debug/trace/fatal calls on `console`, `logger` and `log`. Triple-slash type references retain their original syntax.

The first logging argument must be a Chinese string or template; dynamic data belongs in later arguments. Language detection checks for Chinese characters, not semantic quality. New logging wrappers require rule updates. Standalone CSS/HTML and Vue style blocks are not parsed, and aliases are not tracked through data flow; manual standards still apply.

## Design and validation

Reuses ESLint and its existing Vue parser without dependencies or lockfile changes. The rule reports violations without rewriting business code. RuleTester covers accepted and rejected cases; an actual-config test checks source enforcement and test exemptions. Node's built-in test runner executes rule tests through `pnpm test`; Vitest continues to run business tests.

Contract and real/Mock status remain unchanged, with no external integration dependencies. Passed `pnpm format`, `pnpm check` (formatting, zero-warning lint, strict types, 20 business tests and 15 convention tests), `pnpm build` and `git diff --check`. Remote CI was not run.
