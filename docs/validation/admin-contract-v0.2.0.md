# 管理端 0.2.0 验证快照 / Admin migration validation

2026-10-21 Asia/Shanghai / 管理端协作会话。

协调基准 / Coordination: `56863509d6b5b5fb12af8d690148376fbab2bb6d`。契约 / Contract: 0.2.0 at docs `9b775900422fdfec1fb222ce2b84bbb355f63b91`，文件指纹见 [阶段记录](../milestones/admin-contract-v0.2.0.md)。起始管理端 / Initial admin: `b316aaf4dc8cd5fff48a604fb7f26d76d646cb4a`；分支 / branch: `codex/admin-contract-0-2`。

本文件和源码位于同一功能提交，验证对应下列源文件SHA256，不沿用63dcd36或b316aaf的测试数量冒充本轮。/ This document and source share a feature commit; hashes identify this round's source rather than reusing historical test counts.

| 命令 / Command   | 最终结果 / Final result                                              |
| ---------------- | -------------------------------------------------------------------- |
| pnpm format      | 通过 / passed                                                        |
| pnpm check       | 格式、lint、类型、122业务用例（12文件）、58规范用例通过 / all passed |
| pnpm build       | 类型与生产构建通过 / passed                                          |
| git diff --check | 通过 / passed                                                        |

全量包含词库12服务/14页面回归，以及身份/内容审核权限、冲突、晚到和离开清理；新增账号/改密协议9用例、改密页面5用例、store5用例及改密路由1用例。/ Full suite includes wordlist 12 service/14 page tests and identity/moderation authorization/conflict/stale-response/unmount regressions; adds 9 account/password protocol, 5 password page, 5 store and 1 route tests.

中途失败：lint请求体字符串转换/crypto；可选signal严格类型；组件测试DOM刷新等待和路由插件卸载重置断言。均修复后完整重跑，无规则抑制或检查降级。/ Intermediate lint, strict optional signal and component test timing/router-teardown assertions were fixed before full reruns.

临时原始日志（可能清理）/ ephemeral raw logs:

- `/tmp/admin-v020-format.log`
- `/tmp/admin-v020-check.log`
- `/tmp/admin-v020-build.log`

真实业务服务、账号/改密撤销、卡图权限/审计、正式扫描、跨端联调和浏览器人工验收未执行。运行时仅DEV合成；登录/改密wire回归使用注入替代fetch，真实入口仍关闭。/ No real service, password revocation, card authorization/audit, formal scanning, cross-project or manual browser acceptance; runtime is DEV synthetic only and wire regressions use substitute fetch with actual entry points closed.

## 源码指纹 / Source hashes

```text
4bed2fe8a4c708ca32b74a468a28782e6a8f3e613cb6c9c1b3ce296eacd3a755  src/router/index.spec.ts
06310f1924a3bf5fd2207183fd776aa9868e8797f694cdf3ba417d371e363764  src/router/index.ts
ed1a6f43b384f118f2154f9bbdf5e77b1e2ceb6e17f17721b31e93c588e3144a  src/services/admin-auth-transport.spec.ts
b8761509c0d80bad62d69c159e4cc41880781c05c37fd1fb741c595c8610570e  src/services/admin-auth-transport.ts
71c9f88e85d3bbdcdcc460eebcea2e70c8c8cf7ffb7be73fc24efec75f75654a  src/services/admin.spec.ts
30b63bef3a70462ae640bc596d12176140dd7d8479df02b80ef75e18dc91e6b8  src/services/admin.ts
15ee5f1b69c74d3de986ebf9ee0eea5c72814a994d8ae6e13c087fd7673c41ed  src/stores/admin.spec.ts
0a6bbcf5a7336e06d0dc79512aedc97c7df1db18d1af573c7c70d79fafee184c  src/stores/admin.ts
a6c10ae8793bc7ba3334852c3f261ff346c0ee1b08f7d235d3f9bc4a631486d0  src/types/admin.ts
f7b2a9156f99fefb9b1eb83b497dea1791382fb84f9e89eff623d0ce4a98bf73  src/views/IdentityView.spec.ts
7653b2ceaf6c22021c14ef16617a6c6e7e153be1e582bdfeb1a4d2181c3ed1e1  src/views/LoginView.spec.ts
7bc6374bba3b7541c8112aab2ccf6412298f1e56a10f0fda5a07f17af1647059  src/views/LoginView.vue
2a932017e24f23bd9b20dfe188f0556290d606e2c36c87d296ea7dd435b5fe03  src/views/ModerationView.spec.ts
85f1e21175ee3fe17c318d7bf717703271aca07d8dad7c666090a7bf7c5df04c  src/views/PasswordView.spec.ts
75f67ab39327af7c41232290c5b1cf8111584e245435966234a36a1a5e89e908  src/views/PasswordView.vue
b9bf9a9d6037ec99741baf7651b7aa200a27a10e7a8d73710978f024bb268325  src/views/WordlistsView.spec.ts
```
