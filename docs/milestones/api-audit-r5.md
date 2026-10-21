# 最新 API 核对与功能清单

最新接线：登录、改密、账号和身份审核的环境限制已移除，见 [默认真实接口](real-admin-api.md)。

后续更新：账号管理三项已补齐页面与隔离 HTTP 接线，见 [后台账号管理](admin-accounts.md)；本文件表格保留本轮核对时的历史状态。
2026-10-21；T010/T012/T017，REQ-002、015、018、019、020。依据只读共享工作台 `contracts/openapi.v0.2.0.json`、`actions.v0.2.0.md` revision 5、`verification.v0.2.0.md`、`admin-accounts.v0.2.0.md`。契约版本仍为 0.2.0，不消费未激活 moderation 扩展。

## 检查结果与修复

- 登录 POST /admin/sessions、本人改密 POST /admin/password 的路径、字段、状态码与当前契约一致，保留 DEV integration 显式准入。
- 通用后台写请求保留调用方提供的 Idempotency-Key，避免相同命令重试时被替换；退出 DELETE /admin/session 严格要求 204。
- 原身份审核服务完全模拟，无法调用最新注入式后端。新增 identity-transport，连接 GET /admin/identity-reviews、GET /admin/identity-reviews/{id}、GET /admin/identity-reviews/{id}/student-card、POST /admin/identity-reviews/{id}/decision，统一前缀 /api/v1。
- 列表以 limit=20 和编码后的原样 cursor 分页，校验标准成功封装再解析 data；列表仅保留案件编号、版本和状态。详情核对案件 ID，决定核对 request_id，使用申请 expected_version 和调用方稳定幂等键，通过命令不带驳回意见。
- 学生卡独立读取 image/png 二进制，不解析为 JSON 或使用公开下载链接；拒绝空图片及错误媒体类型。请求使用 Bearer、no-store、omit credentials、error redirect，传入 AbortSignal，请求及读体后再次检查授权和取消状态。
- 页面保留既有会话绑定、迟到响应丢弃、对象 URL 回收、409重新读取与人工复核、401清会话及403停止操作。

## 模块边界与取舍

`admin.ts` 维护环境准入和身份会话；`identity-transport.ts` 维护 HTTP/封装/PNG 边界；`identity.ts` 保留字段解析和合成客户端；IdentityView 绑定进入页面时的内存会话。新增公开配置 VITE_ADMIN_IDENTITY_INTEGRATION，仅在 DEV、mode=integration、VITE_ADMIN_AUTH_INTEGRATION=true 且 Mock 未启用时生效，不在默认环境或生产构建自动启用。

启用命令：`VITE_ADMIN_MOCK=false VITE_ADMIN_AUTH_INTEGRATION=true VITE_ADMIN_IDENTITY_INTEGRATION=true pnpm dev --mode integration`。需同源 /api/v1 转发和已显式装配人工认证接口的后端；本仓库不配置外部资源、不提供账号。

## 当前已实现功能

| 功能                                   | 前端状态                                                                       | 后端接入事实                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 后台登录、本人改密、退出               | 表单、校验、内存会话、改密后重登                                               | 三项已接隔离 HTTP；支持开发模拟，生产入口关闭                  |
| 权限与导航                             | 三角色菜单、路由守卫、401清理、403拒绝、懒加载、404页                          | 当前角色快照仅供展示，服务端逐次授权                           |
| 工作台                                 | 静态欢迎与状态说明                                                             | 无真实指标或统计 API                                           |
| 身份审核                               | 分页、详情、按需读卡、通过/驳回、原因/建议、二次确认、回执、冲突复核、离页清理 | 四项 HTTP 已接线，额外显式开关；也支持合成演示，真实联调未完成 |
| 内容审核                               | 合成案件分页/详情、通过/驳回、独立业务结果、普通下线/解除限制                  | 仅 Mock；后端未实现，精确处置目标扩展仍未激活                  |
| 词库管理                               | 三类 heads、完整快照新建、双版本发布、归档只读、合成字面扫描                   | 仅 Mock；真实词库 API 与扫描未交付                             |
| 后台账号创建/列表/角色修改             | 尚无管理页面和专用客户端                                                       | 后端三项已 opt-in 实现，不等于前端已实现                       |
| 举报/处罚/申诉、危机、证据、技术工作项 | 尚无页面和客户端                                                               | 未接入，不列为已实现功能                                       |

## 验证与依赖

新增传输回归覆盖游标编码、脱敏、版本与稳定幂等键、PNG、异常封装、跨案件、取消/撤权和401/403/404/409/429/503；补环境开关、退出状态码和通用幂等键回归。

最终验证结果见本节后续记录。未执行真实后端 HTTP 或三端联调；学生认证后端仍是注入库，默认 server 未装配。实际供应商、审计落库/失败关闭、真实PNG、学校规则与隔离身份验收、后台 TTL、正式词条与扫描均需后端/集成方交付。没有修改共享 docs、后端或批准材料，没有 push、部署、上线。

最终 `pnpm format`、`pnpm check`、`pnpm build` 均通过；14 个业务测试文件、144 个测试通过，规范检查器 58 个测试通过。
