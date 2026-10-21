# T017 词库迁移验证 / Wordlist migration validation

2026-10-21 Asia/Shanghai / 管理端协作会话。起始源码 / Initial source: `63dcd361c70d9eba1fc33bba8059e7fbce8843e6`。分支 / Branch: `codex/wordlist-contract-0-2`。

消费共享工作区0.2.0；HEAD为a5e6124但非干净快照，文件指纹见 [中文阶段记录](../milestones/T017-wordlists-v0.2.0.md) / [English record](../milestones/T017-wordlists-v0.2.0.en.md)。本文件与源码同一功能提交，以下指纹定位实际验证源文件。/ This record and source share the feature commit; hashes below identify the tested source.

| 命令 / Command | 最终实际结果 / Final actual result                               |
| -------------- | ---------------------------------------------------------------- |
| pnpm format    | 通过 / passed                                                    |
| pnpm check     | 格式、lint、类型、10文件102业务用例、58规范用例通过 / all passed |
| pnpm build     | 类型与生产构建通过 / typecheck and production build passed       |

首轮迁移100业务用例及构建通过；补用例后曾因测试方法绑定lint失败，显式bind修复后完整重跑通过。/ First migration passed 100 business tests and build; added tests then failed method-binding lint, fixed with explicit bind and fully rerun.

原始日志在本机临时文件（可被清理）/ ephemeral local raw logs:

- `/tmp/t017-v020-format.log`
- `/tmp/t017-v020-check.log`
- `/tmp/t017-v020-build.log`

范围 / Scope: heads分页、首次版本、完整快照、双版本冲突、旧草稿保护、归档只读、同键重放、并发、权限清理、详情晚到/离开、后续合成匹配。仅本端合成服务与组件；未运行真实HTTP、持久事务/审计/扫描、替代网络传输、共享契约生成器或浏览器人工验收。/ Synthetic local service and component tests only; no actual HTTP, persistent transactions/audit/scanning, substitute network transport, shared contract generators or manual browser acceptance.

## 源码 SHA256 / Source SHA256

cbfcac3c4af74b23a31ab57f4b4d22c50a2663804dd2df153baf57bb9c555f29 src/types/wordlists.ts
ff85c1228b56ac8678f5cfebe3b11d8426777e33d72b44dafb9cb8c771e20053 src/services/wordlists.ts
d02c408b1d34c15b50b8b727bda61851ca5ded11eeb63e32b7fdb90dbdf6f68f src/services/wordlists.spec.ts
9aef889557364c000dc8d609ff9ea670f5f0cde28c49174d638b44336c391ac6 src/views/WordlistsView.vue
2149437f5decdb9c787e96d5089b656f375eda1ee2e9f707e8e479d4490b8d98 src/views/WordlistsView.spec.ts

最终共享复核 / Final shared verification: docs `9b775900422fdfec1fb222ce2b84bbb355f63b91`，干净 / clean；三个契约指纹与开工快照一致 / all three contract hashes match the initial snapshot. 原a5e6124+工作区描述属于运行时历史 / earlier workspace description is historical.
