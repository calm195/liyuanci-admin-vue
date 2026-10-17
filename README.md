# 鲤源池 Web 管理端

## T004 管理端工程基础 · REQ-001 / 020

从只读 vue3-template 导入 Vue3、TypeScript、Router、Pinia 工程与示例，保留 pnpm 10.34.6 原锁文件、严格类型、ESLint、Vitest、格式与 CI 门禁。保留原仓库 Git 历史及 .gitignore；排除模板 .git、凭据、本地配置、依赖与构建产物。示例不代表业务实现，后续 T010 替换为后台登录工程壳。

设计：懒加载页面位于 src/views，外部 I/O 位于 src/services，共享状态由 Pinia 管理。工程基础不依赖真实 API。Node 要求见 package.json。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm format
pnpm check
pnpm build
```

每个功能修改完成后更新本文件及 README.en.md，记录实现与设计，并按依赖顺序在功能分支提交。不得自动 push 或部署。
