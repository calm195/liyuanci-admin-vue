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

## T010 后台会话与请求边界 · REQ-018 / 019

实现后台会话类型校验、独立 Bearer 请求、登录适配边界、退出撤销及401/403处理。设计上令牌仅驻留 Pinia 内存，刷新需重登；拒绝学生 Session.me、停用账号与未知角色。请求限定同源后台路径，no-store、omit cookie、拒绝重定向；DELETE 携带幂等键。会话切换后拒绝旧请求结果，退出撤销失败明确提示远端未确认。

契约 0.1.0 的 D02 凭据形状未冻结，真实登录禁用，不发明密码或 SSO。Mock 默认关闭，仅 Vite DEV 且 VITE_ADMIN_MOCK=true 时允许合成角色/令牌；模拟请求不发送真实后端。后台生命周期和授权仍待 T008 联调，客户端校验不能替代服务端授权。下一步由权限页面接入本模块。

工程基础已通过 format/check/build（3 个模板用例）；会话与请求测试使用合成 transport，不代表真实登录或后端授权通过。
