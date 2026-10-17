# T004 Web / T010 首批交付记录

日期：2026-10-17。关联 T004（REQ-001/020）、T010（REQ-018/019），T012 接入清单（REQ-002/018/019）。本次用户明确授权业务开发；只读工作台历史阶段文字不扩展到本仓库。

## 输入与范围

已核对 G1/G2/G3、需求基线 v0.2、详细设计 v0.2、实施计划及共享契约。共享契约版本 **0.1.0**，OpenAPI SHA-256：`d2d01a0478ccc33839f14d6c648c16784883ccdb146764d20beba59323bab26c`。维护权归后端会话；本仓库仅引用并实现后台相关类型边界。

初始仓库工作区干净，仅已有 .gitignore 与 Git 历史（HEAD `139c9a4`）。原 .gitignore 保持字节不变，未修改 .git。模板来自 `/Users/kurous/code/vue3-template`；导入源码、公开静态资源、质量/构建/CI 配置及原锁文件。排除 .git、node_modules、dist、.idea、.codex、本地环境与凭据。模板和文档工作台没有写入。

原锁文件 SHA-256：`3cbd9fa9490b9b69e99716eff3151be8c3c6d96666e675b6f3f42c080a659166`，与源模板相同。Node v22.19.0、pnpm 10.34.6。依赖安装首次受沙箱网络限制，获授权后 frozen-lockfile 安装通过。

## 文件与行为

| 文件                                                                                                                          | 交付内容                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| package.json、pnpm-lock.yaml、tsconfig*.json、vite.config.ts、eslint.config.js、格式配置、.github/workflows/ci.yml、AGENTS.md | T004 模板工程与质量门禁，保留严格规则                                                              |
| src/main.ts、src/App.vue、src/assets/styles/main.css、index.html                                                              | T004/T010 入口、菜单、Mock 标记、响应式布局                                                        |
| src/types/admin.ts                                                                                                            | T010 0.1.0 后台会话/account 运行时校验，拒绝学生 Session.me、停用账号、未知角色                    |
| src/services/admin.ts                                                                                                         | T010 独立后台 Bearer 请求边界、no-store、omit cookie、禁止重定向、DELETE 幂等键；真实登录 D02 阻塞 |
| src/stores/admin.ts                                                                                                           | T010 内存会话、退出撤销、401清理、403拒绝、旧请求晚到防护；刷新需重登                              |
| src/router/index.ts、src/views/*.vue                                                                                          | T010 登录/守卫、角色菜单、403/404、工作台；T012仅身份审核准备页                                    |
| src/services/admin.spec.ts、src/stores/admin.spec.ts、src/router/index.spec.ts、src/views/LoginView.spec.ts                   | T010 REQ-018/019 行为用例，全部仅合成资料                                                          |
| README.md、README.en.md、.env.example、src/env.d.ts                                                                           | 同步运行方式与默认关闭Mock                                                                         |
| docs/contract-questions.md、docs/T012-integration.md                                                                          | 契约缺口、T012前置与接入验收清单                                                                   |

不展开 T017/T028/T030/T032 的业务页面；没有全站私聊、延期模块、学生卡公开链接或身份资料持久化。角色/会话只在内存；无自动续期，没有自定时长。服务端401代表过期/撤销，提示重登；403保留会话但进入拒绝页。服务端撤销失败时明确提示本地清理与远端未确认的区别。

## 真实与模拟状态

| 项目                                   | 状态                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Vue 工程、格式/lint/类型/测试/生产编译 | 本机实际执行                                                                                           |
| 登录页与角色/会话状态                  | 合成 Mock，可用 `VITE_ADMIN_MOCK=true pnpm dev` 显式启用；DEV 限制，持续标记，模拟请求不向真实后端发送 |
| POST /admin/sessions                   | D02 未冻结，真实登录禁用，未发明凭据字段                                                               |
| DELETE /admin/session                  | 按契约建立真实请求实现；仅合成 transport 验证，真实撤销待联调                                          |
| 后台授权/角色收回/过期/撤销            | 本地状态与合成 HTTP 验证；服务端实现与安全性待 T008 联调                                               |
| T012 身份审核                          | 只交接入清单；T011 未验收，未实现或验收真实审核                                                        |

## 验证

最终实际结果：`pnpm format` 通过；`pnpm check` 通过（Prettier、零警告 ESLint、严格类型检查、4 个测试文件 / 20 个用例全部通过）；`pnpm build` 通过（Vite 8.3.4，35 个模块，懒加载页面产物已生成）。`git diff --check` 通过；原 .gitignore 无 diff。检查覆盖格式、零警告 lint、严格 TypeScript、Vitest 和 Vite 生产构建。早期 lint 的无 await 与索引签名访问错误已修复，规则未削弱。没有运行真实后端、浏览器人工视觉验收、云资源测试或学生卡流程。

## 风险与下一步

D02、T008、T011 未就绪，T010 仅工程/模拟部分通过，不宣称全部验收。401清理依赖服务端及时验证生命周期/auth_epoch；菜单只是体验控制。当前契约没有后台 me/续期/到期字段，角色菜单要重新登录刷新，实际请求须后端即时拒绝已撤销权限。

下一步先由后端协调 C-01–C-04：交付后台身份方案、测试账号、会话撤销与角色变更语义，再联调 T010。T011 通过私有卡/场景授权/审计/版本用例后按 T012 清单实施。后续再依计划推进 T017、T028、T030/T032 管理端部分。后续用户已授权按功能提交，新建分支 feat/admin-foundation-session，按工程基础→会话请求边界→登录权限页面与接入材料顺序提交；各提交包含 README 实现与设计。没有 push、部署或上线。
