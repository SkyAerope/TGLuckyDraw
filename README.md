# TGLuckyDraw
随机频道消息？

## 如何使用？
    ### 1. 克隆仓库并安装依赖
    ```bash
    mv .env.example .env
    pnpm i
    ```
    ### 2. 运行`TGLogin.js`文件，按照提示登录，获取`SessionString`，放入.env文件中
    ```bash
    node TGLogin.js
    ```
    ### 3. 构建并运行
    ```bash
    npm run build
    npm run dev
    ```

## Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

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
node --env-file=.env.telegram ./node_modules/astro/astro.js dev --host 127.0.0.1
```

已有进程环境中的同名变量优先，请避免旧的 `TELEGRAM_SESSION` 覆盖文件配置。
这仅解决 session 的加载：当前 `src/lib/telegram.ts` 仍使用原始 TCP，此次只修改
登录工具；在当前云环境中，应用读取频道前还需单独将其连接路径接入相同的 WSS
实现。登录脚本已导出 `createWssClient` 以供后续复用。本次不声称频道读取已可用。
