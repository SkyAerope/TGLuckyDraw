# TGLuckyDraw
随机频道消息？

## 环境和运行

使用 Node.js **24.22.1**（当前稳定 24.x 补丁版）和 pnpm **12.15.0**。
`.nvmrc`、`.node-version` 与 `package.json#engines` 声明相同的运行要求；
Vercel 构建产物使用 `nodejs24.x`。本次升级不执行部署。

```bash
nvm install
nvm use
npm install --global pnpm@12.15.0
pnpm install --frozen-lockfile
```

通过运行环境或本地被忽略的 `.env` 配置 `TELEGRAM_CHANNEL_ID`。
可用 `cp .env.example .env` 创建配置；模板仅含空值。不要提交任何本地环境文件。
登录和 session 加载方法见下方“安全的 WSS 登录”。

| 命令 | 用途 |
| :--- | :--- |
| `pnpm dev` | 启动本地开发服务器（默认 `localhost:4321`） |
| `pnpm check` | 同步 Astro 类型、检查所有 Astro 文件，再用 TypeScript 7 检查 TS |
| `pnpm build` | 执行完整类型检查并构建 Vercel 服务端产物 |
| `pnpm astro --help` | 查看 Astro CLI 帮助 |
| `node TGLogin.js --check` | 不登录的 WSS 匿名协议检查 |

Vercel 适配器不支持 `astro preview`；本地验证使用 `pnpm dev`。
仓库当前没有独立的自动化测试套件。无 `TELEGRAM_SESSION` 时页面显示失败提示，
API 返回 500；服务会在联网之前拒绝缺失 session 的请求。

## 本次依赖迁移

所有原有直接依赖均更新至 npm `latest` 稳定版本，含 Astro 7、适配器 11、
dotenv 18、TypeScript 7；锁文件同时刷新兼容范围内的传递依赖。
`@types/node` 跟随该包最新稳定版（26），它只是开发类型包；实际运行版本仍限定为 24。

- 按 Astro 6/7 指南将 Vercel 入口迁移为 `@astrojs/vercel`，修复提前闭合的 `<body>`。
- TypeScript 7 的原生编译器不提供 Astro 检查器所需的旧 JS API。
  因此 `pnpm check` 使用官方 `astro-check` CLI 和 `tsc --noEmit` 两项检查。
  `.pnpmfile.cjs` 为检查器提供隔离的 TypeScript 6 API，
  `pnpm-workspace.yaml` 为语言服务提供相同兼容依赖；项目直接依赖保持 TypeScript 7，
  不修改 `node_modules`、不关闭诊断、不放宽 peer 规则。
- 新 GramJS 不再提供旧登录脚本借用的代理依赖，显式添加最新版
  `https-proxy-agent` 并使用具名导入；保留原有 WSS、代理和 session 保护行为。
- dotenv 显式使用 `quiet: true`；pnpm 仅允许三个已有依赖所需的安装脚本。

官方迁移资料：

- [Astro 6](https://docs.astro.build/en/guides/upgrade-to/v6/)、[Astro 7](https://docs.astro.build/en/guides/upgrade-to/v7/)
- [Vercel 适配器](https://docs.astro.build/en/guides/integrations-guide/vercel/)
- [TypeScript 原生编译器变化](https://github.com/microsoft/typescript-go/blob/main/CHANGES.md)、[Astro 检查器支持进度](https://github.com/withastro/roadmap/discussions/1321)
- [dotenv 变更记录](https://github.com/motdotla/dotenv/blob/master/CHANGELOG.md)
- [https-proxy-agent API](https://github.com/TooTallNate/proxy-agents/tree/main/packages/https-proxy-agent)
- [pnpm 12](https://pnpm.io/blog/releases/12.0)

## 安全的 WSS 登录

`TGLogin.js` 使用官方 Telegram DC 的 WSS、`ConnectionTCPObfuscated` 和显式
HTTPS 代理。Node 环境中不会退回直连 TCP；`HTTPS_PROXY`（其次为 `HTTP_PROXY`）
必须由运行环境配置。DC 1–5 使用 GramJS 官方域名映射，登录迁移 DC 时也使用 WSS。
API 配置保留现有默认值；可在已有的本地 `.env` 或环境变量中设置
`TELEGRAM_API_ID`、`TELEGRAM_API_HASH` 覆盖它们，请勿提交凭据。

先进行不登录的检查（总超时约 19 秒）：

```bash
node TGLogin.js --check
```

预期为 `{"connect":true,"isUserAuthorized":false}`。此模式使用空会话，只进行
MTProto 协议连接和授权状态检查，不调用登录、不请求验证码、不保存 session。
临时 auth key 仅存在于进程内存中，连接结束后退出进程。

真实登录必须由用户在自己控制、未录制的私密终端中手动运行：

```bash
node TGLogin.js
```

电话号码、验证码、2FA 密码均隐藏输入，不通过聊天、命令参数或日志传递。
无交互终端时脚本在联网登录前拒绝运行。不要使用代理可见的执行工具/终端转录
来输入验证码或密码；如果产品没有独立私密输入界面，请在自己的终端运行。
脚本最多等待五分钟；取消、失败或超时会清理连接，不自动循环请求验证码。
脚本不发送消息，不输出账户资料、API hash、session 或认证密钥。

成功后 session 写入仓库根目录下的 `.env.telegram`，权限为 `0600`。
脚本要求此路径已被 Git 忽略且未被跟踪，并拒绝覆盖现有文件或符号链接。
请勿展示此文件、提交、上传到日志或随云环境快照分发；它等同于账户访问凭据。
已有文件时脚本会停止，由用户自行保管或移走后再决定是否重新登录。

应用还需要 `TELEGRAM_CHANNEL_ID`，可配置在被忽略的 `.env` 中。
可使用 Node 的环境文件支持将保存的 session 加载为 `TELEGRAM_SESSION`：

```bash
NODE_OPTIONS="--env-file=.env.telegram" pnpm dev --host 127.0.0.1
```

已有进程环境中的同名变量优先，请避免旧的 `TELEGRAM_SESSION` 覆盖文件配置。
这仅解决 session 的加载：当前 `src/lib/telegram.ts` 仍使用原始 TCP，此次只修改
登录工具；在当前云环境中，应用读取频道前还需单独将其连接路径接入相同的 WSS
实现。登录脚本已导出 `createWssClient` 以供后续复用。本次不声称频道读取已可用。
