# Automated development standards

Date: 2026-10-20. Scope: IDs, Chinese comments and logging in non-test source; no new business requirement ID.

## Behavior and boundaries

A local ESLint rule runs through `pnpm lint`, `pnpm check` and existing CI, failing on violations. It covers JS, TS, JSX, TSX, Vue, standalone CSS/HTML and project scripts, excluding tests, dependencies and build output. It scans the full source, including comments, Vue templates and styles, for task, requirement and integration decision IDs; checks script, HTML and CSS comments; and checks log/info/warn/error/debug/trace/fatal calls on `console`, `logger` and `log`. HTML inline scripts are parsed separately with original line and column positions preserved. Triple-slash type references retain their original syntax.

The first logging argument must be a Chinese string or template; dynamic data belongs in later arguments. Scope-aware alias propagation supports assignments, destructuring, alias chains, named import aliases, conditional expressions, optional chains, static computed properties and bind/call/apply, including script aliases referenced in Vue templates. Reassignment conservatively retains logging origins without conflating variables in other scopes. Language detection checks for Chinese characters, not semantic quality. New wrappers require rule updates. Cross-file, cross-HTML-script, arbitrary object-property and function parameter/return data flow are not analyzed; using these forms to bypass standards is prohibited.

## Design and validation

Reuses ESLint, the existing Vue parser and jsdom without dependencies or lockfile changes. HTML document boundaries identify comments, styles and scripts without executing scripts or loading external resources. CSS scanning skips strings, escapes and URL contents to avoid false positives. Text parsing provides comments and source for convention checks, not full HTML/CSS syntax validation. The rule reports violations without rewriting business code. RuleTester covers accepted and rejected cases; actual-config tests check source enforcement, original positions and test exemptions. Node's built-in test runner executes rule tests through `pnpm test`; Vitest continues to run business tests.

Contract and real/Mock status remain unchanged, with no external integration dependencies. Passed `pnpm format`, `pnpm check` (formatting, zero-warning lint, strict types, 20 business tests and 58 convention tests), `pnpm build` and `git diff --check`. Remote CI was not run.
