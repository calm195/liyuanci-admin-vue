# 鲤源池 Web 管理端

词库管理按契约 0.2.0 演示分类 heads 基准、完整快照、双版本发布及归档只读详情；仅显式 DEV Mock 可用，真实入口待接入。

## 1. 项目介绍

鲤源池后台管理 Web 应用，采用 Vue 3 Composition API、Vite、严格 TypeScript、Vue Router 和 Pinia。提供后台登录入口、角色菜单、工作台、身份审核及内容审核业务页。

真实登录等待后台身份方案接入，当前没有默认账号或口令。开发环境可使用合成 Mock 演示；身份审核支持合成案件列表、按需读卡、通过/驳回及回执演示，内容审核支持版本复核、独立业务结果和普通下线/解除限制演示；真实业务 API 尚未接入。

## 2. 项目选项与目录结构

配置示例见 [.env.example](.env.example)。`VITE_ADMIN_MOCK=true` 显式启用本地模拟角色、会话、身份审核与内容审核业务，仅在 Vite DEV 生效，页面持续显示 Mock 标记；生产构建禁用 Mock，模拟请求不会发送到真实 API。`VITE_` 变量为公开配置，不得包含秘密。

```text
src/
  assets/       全局样式和静态资源
  components/   可复用 UI 组件（按需创建）
  composables/  可复用响应式行为
  router/       懒加载路由、角色菜单与守卫
  services/     外部 I/O 与数据校验边界
  stores/       共享状态与后台内存会话
  types/        共享领域及契约类型
  utils/        纯函数与相邻测试
  views/        路由级页面
public/         公共静态资源
docs/
  milestones/   按阶段分文件的功能、设计与验证记录
```

阶段记录：[T004 工程基础](docs/milestones/T004.md)、[T010 后台会话与权限](docs/milestones/T010.md)、[T012 身份审核](docs/milestones/T012.md)、[T017 内容审核与词库](docs/milestones/T017.md)。配套材料：[首批交付记录](docs/delivery-T004-T010.md)、[契约疑问](docs/contract-questions.md)、[T012 接入清单](docs/T012-integration.md)。

## 3. 项目启动方式

使用 Node.js `^22.13.0 || >=24.0.0` 和 pnpm 10（项目声明版本为 10.34.6），保留 `pnpm-lock.yaml`。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

本地合成演示：

```sh
VITE_ADMIN_MOCK=true pnpm dev
```

质量检查与构建预览：

```sh
pnpm format
pnpm check
pnpm build
pnpm preview
```

`pnpm check` 包含格式、零警告 ESLint、类型检查与测试。单独执行测试可用 `pnpm test`，监听模式用 `pnpm test:watch`。

`pnpm lint` 自动检查非测试 JS/TS（含 JSX/TSX）、Vue、独立 CSS/HTML 和工程脚本，覆盖 Vue 样式块、HTML 内联样式块与脚本：禁止任务、需求及里程碑编号，说明注释必须包含中文，`console`、`logger`、`log` 的常见日志方法首参必须是包含中文的字符串或模板，动态数据作为后续参数。日志检查按作用域追踪对象和方法的赋值、解构、链式别名、命名导入别名与 `bind/call/apply`，重赋值保守保留日志来源；禁止通过动态属性或跨模块转发绕过检查，新增日志封装须扩展规则与用例。保留三斜线类型引用指令；文件名为 `*.spec.*`、`*.test.*` 或位于 `__tests__/` 的测试文件（含 HTML 内联脚本）豁免此规则。`pnpm test` 同时执行业务测试与规范检查器回归测试；`pnpm test:watch` 仅监听业务测试。

## 4. 开发规范与须知

非测试代码不得出现里程碑、任务或需求编号；追踪信息仅写入阶段文档或测试。代码注释只使用中文说明功能与业务意图、边界及设计原因，日志和面向用户的错误提示使用中文。语言指令、接口字段、协议值及工具要求的标识符保留原文。

使用 `<script setup lang="ts">`，遵循严格类型与现有格式、lint 规则，不使用 `any`、不安全断言或抑制注释绕过检查。外部数据在 services 边界校验；瞬时 UI 状态留在组件，共享状态才进入 store；行为测试与实现相邻存放。

每组修改后依次运行 `pnpm format`、`pnpm check`、`pnpm build`；需要自动 lint 修复时使用 `pnpm lint:fix`。准确记录验证结果与未完成依赖。

README 仅维护项目介绍、项目选项与目录结构、启动方式、开发规范与须知，并同步英文版。功能与里程碑记录放在 `docs/milestones/`，按阶段分文件，包含任务 ID / REQ、主要行为、模块边界、设计取舍、接口契约版本、真实/模拟状态、验证结果与未完成依赖，随对应功能提交。

新功能先建开发分支，按功能范围及依赖顺序提交，提交需有用户授权；不自动 push、部署或上线。仅修改本仓库，源模板、共享契约工作台及批准材料保持只读；契约疑问记入本仓库 `docs/`。

后台令牌仅存内存，刷新需重新登录，不接学生会话，不在浏览器存储身份资料。菜单和按钮隐藏不能替代后端授权。禁止提交凭据、本地 Codex 认证或私有环境值。

生产静态托管需 HTTPS、history fallback 和同源 `/api/v1` 反向代理，禁止缓存敏感 API 响应。完整项目约定见 [AGENTS.md](AGENTS.md)。
