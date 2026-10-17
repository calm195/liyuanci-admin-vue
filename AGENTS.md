# Project guidance for Codex

## Stack and commands

- Vue 3 Composition API with `<script setup lang="ts">`, Vite, strict TypeScript, Vue Router, Pinia.
- Use pnpm 10 only. Install with `pnpm install`; preserve `pnpm-lock.yaml`.
- Develop: `pnpm dev`.
- After every set of modifications, run `pnpm format`, then `pnpm check` (formatting, lint, type checking, and tests), and `pnpm build` before completing the task. If fixes require further modifications, repeat formatting and checks on the final changes.
- Use `pnpm lint:fix` when automated lint fixes are needed. Resolve failures without weakening checks; report any checks that cannot run and why.

## Architecture

- `src/views`: route-level views, lazy-loaded through `src/router`.
- `src/components`: reusable UI; typed props/emits and accessible HTML.
- `src/composables`: reusable reactive behavior, named `useX`.
- `src/stores`: shared state only; keep transient UI state inside components.
- `src/services`: external I/O; validate unknown data at the boundary.
- `src/types`: shared domain types. Keep local types beside their consumer.
- `src/utils`: pure helpers. Tests live beside implementations as `*.spec.ts`.
- Do not create abstractions or dependencies without a concrete need.

## Code conventions

- Respect strict typing. Avoid `any`, unsafe casts, non-null assertions and suppression comments.
- Use type-only imports. Handle rejected promises and nullable/indexed values explicitly.
- Comment public APIs with concise TSDoc when intent is not obvious; explain decisions and edge cases, not syntax.
- Follow existing Prettier/ESLint configuration. Do not weaken checks to make a task pass.
- Add behavioral tests for new logic and regressions; prefer user-visible outcomes.
- Keep README.md and README.en.md aligned when commands or architecture change.
- Never commit credentials, local Codex auth, or private environment values. VITE_ variables are public.
- Report changes and validation accurately. Do not claim checks ran when they did not.

## 功能文档与提交

- 每个功能的完整修改完成后，必须在 README.md 写明实现功能与设计，包括任务 ID / REQ、主要行为、模块边界、关键设计取舍、接口契约版本、真实/模拟状态、验证结果与未完成依赖；同步更新 README.en.md。文档随对应功能一起提交，不能只以交付记录或对话代替 README。
- 新功能开发前新建功能分支；按功能范围拆分提交，并按依赖顺序提交工程基础、业务能力及后续接入材料。每个功能提交包含对应 README 更新与必要用例，不混入无关改动。
- 仅修改本仓库；源模板、共享契约工作台与批准材料保持只读，契约疑问记录在本仓库 docs/，由后端协调维护共享契约。
- 提交须有用户授权；本次用户已授权新建开发分支并按功能提交，不自动 push、部署或上线。
