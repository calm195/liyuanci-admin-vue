# INT-003 本端验证快照 / Local validation snapshot

2026-10-21 Asia/Shanghai，管理端会话 / admin session。输入完整SHA、契约指纹及环境缺项见[中文阶段记录](../milestones/admin-int003.md)和[英文记录](../milestones/admin-int003.en.md)。本文件与代码同一提交 / this record shares the source commit.

| 命令 / Command   | 结果 / Result                                                    |
| ---------------- | ---------------------------------------------------------------- |
| pnpm format      | 通过 / passed                                                    |
| pnpm check       | 格式、lint、类型、128业务用例（13文件）、58规范用例通过 / passed |
| pnpm build       | 类型与生产构建通过 / passed                                      |
| git diff --check | 通过 / passed                                                    |

首次运行只有旧登录提示断言失败，修正后完整重跑，无检查降级。/ Initial stale login-message assertion fixed before complete rerun, without weakening checks.

新增6用例覆盖生产/默认/缺标记/冲突关闭，以及运行时三项身份操作接线、合成入口拒绝、其余业务拒绝、不存储。既有登录/改密/词库等全量回归保留。/ Six new cases cover gates and runtime identity-only wiring; existing full regressions retained.

临时原始日志 / ephemeral logs: /tmp/admin-int003-format.log、/tmp/admin-int003-check.log、/tmp/admin-int003-build.log。

仅合成及替代fetch回归；真实INT-003 I3-01–09全部未执行。未启动后端、初始化账号、执行迁移或实际HTTP；无真实请求ID、服务配置/迁移实例指纹或联合验证结果。/ Synthetic/substitute-fetch only; all real I3-01–09 cases unexecuted. No backend startup, initialization, migration, real HTTP or joint results.

## 源码SHA256 / Source hashes

```text
5a91afc24c505ff71edf7536632f9ff6878b75df66a7620fb5ed6a52328b1c5e  src/services/admin.ts
4ac9ad99c079df5235e470695c30ac861a1acb5c81a47460719fb05b0b706746  src/services/admin-auth-transport.ts
72111164e22fcf14f62c5c0e3456d1cd10a2144f3c187c6ee19a5b5124524cac  src/services/admin-integration.spec.ts
882771081b9678a8b735aecdf104ee7f9893588c15aa8aadd3381fa70d76d318  src/views/LoginView.vue
f08775fdd3f60f778e4c56f3a3f52458d84a4e2395b6225f9881c3ed948a9f6d  src/views/LoginView.spec.ts
f5d0c65dfee49849a416b3c276c0f7f789b2ae0096b8bf22e382332c92b1f8cc  src/env.d.ts
```
