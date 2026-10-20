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

- 非测试代码不得出现里程碑、任务或需求编号（如 T00x、REQ 编号）；追踪信息仅写入阶段文档或测试。代码注释只使用中文说明功能、业务意图、边界与设计原因；日志及面向用户的错误提示使用中文。保留语言指令、接口字段、协议值和工具要求的标识符原文。
- `pnpm lint` 通过本地 ESLint 规则检查非测试 JS/TS、Vue 与工程脚本中的编号、中文说明注释和日志；日志首参使用包含中文的字符串或模板，动态数据作为后续参数。不要用日志别名或规则抑制绕过检查。新增日志封装须同步扩展检查与回归用例。自动语言检查以包含中文为最低门槛，代码评审仍须确认说明完整、准确。
- Respect strict typing. Avoid `any`, unsafe casts, non-null assertions and suppression comments.
- Use type-only imports. Handle rejected promises and nullable/indexed values explicitly.
- Comment public APIs with concise TSDoc when intent is not obvious; explain decisions and edge cases, not syntax.
- Follow existing Prettier/ESLint configuration. Do not weaken checks to make a task pass.
- Add behavioral tests for new logic and regressions; prefer user-visible outcomes.
- Keep README.md and README.en.md aligned when commands or architecture change.
- Never commit credentials, local Codex auth, or private environment values. VITE_ variables are public.
- Report changes and validation accurately. Do not claim checks ran when they did not.

## 功能文档与提交

- README.md 仅包含项目介绍、项目选项与目录结构、项目启动方式、开发规范与须知；同步更新 README.en.md。每个功能完整修改完成后，在 docs/milestones/ 按阶段分文件记录实现功能与设计，包括任务 ID / REQ、主要行为、模块边界、关键设计取舍、接口契约版本、真实/模拟状态、验证结果与未完成依赖；同步维护英文阶段文件。阶段文档随对应功能一起提交，不能只以对话代替。
- 新功能开发前新建功能分支；按功能范围拆分提交，并按依赖顺序提交工程基础、业务能力及后续接入材料。每个功能提交包含对应阶段文档与必要用例；涉及项目介绍、选项、目录、命令或规范变化时同步更新中英文 README，不混入无关改动。
- 仅修改本仓库；源模板、共享契约工作台与批准材料保持只读，契约疑问记录在本仓库 docs/，由后端协调维护共享契约。
- 提交须有用户授权；本次用户已授权新建开发分支并按功能提交，不自动 push、部署或上线。
