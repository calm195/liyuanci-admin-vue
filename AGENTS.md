# 管理端协作规则

## 工程与代码规范

- 使用 Vue 3 Composition API、`<script setup lang="ts">`、Vite、严格 TypeScript、Vue Router 和 Pinia。仅用 pnpm 10，安装用 `pnpm install`，保留 pnpm-lock.yaml；开发用 `pnpm dev`。
- 路由级页面放 src/views 并由 src/router 懒加载；复用组件放 src/components，props/emits 类型明确并使用可访问 HTML；响应式复用逻辑放 src/composables，命名 useX；store 只存共享状态，临时状态放组件。
- 外部 I/O 放 src/services，边界校验 unknown；共享类型放 src/types，本地类型靠近使用方；纯函数放 src/utils，行为测试与实现相邻 `*.spec.ts`。无具体需要不增加抽象或依赖。
- 严格类型，避免 any、不安全断言、非空断言和抑制注释；类型导入用 type，明确处理 Promise 拒绝、空值及索引值。公共 API 意图不明显时写简短中文 TSDoc，说明取舍与边界，不复述语法。
- 非测试代码不得出现任务/里程碑/REQ 编号；追踪仅在测试和 docs 工程。说明注释、日志及面向用户错误提示使用中文；语言指令、接口字段、协议值和工具标识保留原文。
- pnpm lint 使用本地 ESLint 规则检查非测试 JS/TS、Vue、独立 CSS/HTML 与工程脚本，包含 Vue 样式块及 HTML 内联脚本/样式。日志首参为含中文的字符串或模板，动态数据作后续参数；按作用域追踪赋值、解构、链式/命名导入别名和 bind/call/apply，重赋值保守保留来源。禁止用动态属性、别名、跨模块转发或抑制绕过规则；新增日志封装同步扩展规则和回归用例。自动中文检测只是最低门槛，评审仍需确认语义。
- 遵循现有 Prettier/ESLint，不削弱检查；新增逻辑与回归修复补行为测试，以用户可见结果验证。README.md 与 README.en.md 的用法、架构和规范保持一致；三端滚动文档仅维护中文，不复制英文译本。
- 不提交凭据、本地 Codex 认证或私有环境值；VITE_ 变量公开。后台令牌只存内存，菜单/按钮不可替代服务端授权。

## 验证

每组修改后运行 `pnpm format`、`pnpm check`、`pnpm build`；必要时用 `pnpm lint:fix` 后完整复跑。不得关闭规则或删除测试绕过失败；无法执行时报告命令与原因，不沿用旧快照结果或声称未执行的检查通过。另在 docs 工程运行文档检查与固定指纹检查。

## 跨仓库文档与分支规则

- 统一遵循 [docs 文档规范](../docs/governance/README.md)；本端入口为 [现状](../docs/development/admin/README.md)、[缺陷](../docs/development/admin/defects.md)、[后续计划](../docs/development/admin/plan.md)。
- 按用户2026-10-30最新要求，docs本端目录仅保留上述三份滚动文档，按模块维护；不再新增milestones、validation、阶段补证、截图或原始日志。源码仓库只保留运行/开发必要说明。
- 现状写源码完整SHA、当前能力和实际验证边界；缺陷区分已复现问题、依赖缺口和待验收项；计划写优先级、依赖和完成标准，不虚构负责人或日期。完成任务同步更新这三份文档，不将已解决问题继续列为开放缺陷。
- 本次明确退役的历史材料按docs清单保存在Git快照；既有需求、审批、有效契约及未退役固定输入不改写。AI不签发G1/G2/G3，业务范围和契约语义变化另走适用授权。
- 修改前核对本仓库及docs分支、完整HEAD和工作区，保护已有改动。源码与docs仅保留develop/main；管理端源码及对应文档在各自develop维护，经授权合入main并推送。并行任务协调写入，必要时使用detached工作树并在汇总后清理。
- 已授权提交时先提交源码仓库，再补docs精确版本；提交、合并、推送和部署按当次授权执行，不重复索取已有授权。共享模块映射与跨端计划由docs协调维护。
- 中文文档保留必要代码标识；报告真实/合成/未执行边界。纯文档整理只执行文档工具检查、链接/固定输入和差异检查；业务代码变化继续遵循本仓库完整质量门槛，不将历史测试冒充本轮重测。
