![Shafile 宣传海报](docs/poster.png)

<center>

[English](README.md) · **简体中文** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [हिन्दी](README.hi.md) · [Español (México)](README.es-MX.md)

**在线预览（Cloudflare Workers 版）：** <https://shafile.laoju.wang>

</center>

## 1. 介绍

Shafile 是一个端到端加密的文件与文本分享工具。内容在浏览器内完成加密，服务器只保存密文；支持按次分享、定时生效与失效、密码访问和阅后即焚。

## 2. 安装与使用

### 环境要求

- Node.js 24+（本地在 Node 26 验证）
- pnpm
- 生产环境需要 HTTPS

### 本地运行

```bash
pnpm install
pnpm dev
```

打开 <http://localhost:3000>。首次启动会自动创建：

- `data/shafile.db`：SQLite 元数据
- `data/blobs/`：密文存储
- `data/.secrets.json`：开发用签名密钥

### 使用流程

1. 在首页选择「创建」，输入文本或选择文件。
2. 设置访问方式、生效与失效时间、查看次数。
3. 创建后复制分享链接；如使用密码模式，请通过另一渠道发送密码。
4. 接收者在浏览器中打开链接，解密并查看或下载。

### Telegram Mini App

Shafile 可直接作为 Telegram Mini App 运行，无需额外配置。使用 HTTPS 部署后，在 BotFather 中设置 Mini App URL。

- 仅在检测到 Telegram 启动参数时加载 Telegram SDK；普通网页访问仍不加载第三方脚本。在 Telegram 内，官方 SDK 属于第三方代码，拥有与应用相同的页面权限。
- 服务端会校验 `initData`，分享归属仅保存为 Telegram 用户 ID 的哈希。管理页可跨设备列出并撤销已归属的分享，也可关联当前浏览器中已有的分享；链接密钥仍只保存在创建它的设备上。
- 自动应用 Telegram 主题色、安全区、返回按钮和成功触感反馈。
- Telegram 向 URL fragment 追加启动参数时，分享链接中的 `#k=` 密钥仍可读取。
- Content Security Policy 仅允许 `telegram.org` 及其子域内嵌；其他来源仍被阻止。

部署与真机检查清单见 [docs/telegram-mini-app.md](docs/telegram-mini-app.md)，P1 身份设计见 [docs/telegram-identity-p1.md](docs/telegram-identity-p1.md)。

### 移动端

移动浏览器启用 `viewport-fit=cover`、刘海与 Telegram 界面安全区、44px 触控目标、16px 输入框（避免 iOS 自动缩放），Markdown 宽表格可横向滚动。

### 生产部署

```bash
pnpm build
pnpm start
```

建议使用 Caddy/Nginx 反向代理到 `127.0.0.1:3000` 并启用 HTTPS：

```caddyfile
shafile.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

生产环境请显式设置 `TICKET_SECRET`、`IP_HASH_SECRET`，代理部署时设置 `TRUST_PROXY=true`。备份 `data/` 时先停止服务；应用当前为单实例设计（SQLite、内存限流和活动下载计数）。

### Docker 部署

仓库包含多阶段 `Dockerfile` 和 `docker-compose.yml`。

```bash
docker compose up --build -d
```

应用在 `http://localhost:3000` 可用，数据保存在 `shafile-data` 卷。生产环境请显式设置 `TICKET_SECRET`、`IP_HASH_SECRET`，并按需调整上限和 `TRUST_PROXY`。镜像使用 Next.js standalone 输出，并提供 `/api/health` 健康检查。

### 持续集成

GitHub Actions（`.github/workflows/ci.yml`）会运行 lint、类型检查、i18n 校验、单元测试、生产构建、Playwright E2E、Docker 镜像构建，以及 Cloudflare Worker 构建和本地 D1/R2 E2E。配置 Cloudflare GitHub secrets 后，`main` 分支在检查通过后会自动部署到 Workers。

### Cloudflare

支持两种部署方式：

- [Cloudflare Tunnel](docs/cloudflare.zh-CN.md)：保留 Node.js、SQLite、本地磁盘、流式下载和清理任务，适合完整能力与现有服务器。
- [Workers + D1 + R2](docs/cloudflare-workers.zh-CN.md)：完全运行在 Cloudflare；功能完整，但受 Workers、D1 和 R2 配额限制（例如 D1 免费 5 GB、R2 免费 10 GB）。

### 环境变量

| 变量                | 默认值                 | 说明                  |
| ------------------- | ---------------------- | --------------------- |
| `SHAFILE_DATA_DIR`  | `./data`               | 数据根目录            |
| `DATABASE_PATH`     | `$DATA_DIR/shafile.db` | SQLite 路径           |
| `BLOB_DIR`          | `$DATA_DIR/blobs`      | 密文目录              |
| `TICKET_SECRET`     | 自动生成               | 访问令牌 HMAC 密钥    |
| `IP_HASH_SECRET`    | 自动生成               | 限流 IP 哈希密钥      |
| `TELEGRAM_BOT_TOKEN` | —                     | 启用 Telegram `initData` 会话交换 |
| `TELEGRAM_SESSION_SECRET` | 由 `TICKET_SECRET` 派生 | Telegram 会话令牌 HMAC 密钥 |
| `TELEGRAM_HASH_SECRET` | 由 `TICKET_SECRET` 派生 | Telegram 用户 ID 哈希密钥 |
| `TELEGRAM_WEBHOOK_SECRET` | — | Telegram Bot Webhook 校验密钥 |
| `TELEGRAM_BOT_USERNAME` | — | 用于 Mini App 分享链接的公开 Bot 用户名 |
| `TELEGRAM_MINI_APP_SHORT_NAME` | `shafile` | BotFather 中配置的公开 Mini App 短名 |
| `MAX_SHARE_BYTES`   | 5 GiB                  | 单文件上限            |
| `MAX_STORAGE_BYTES` | 50 GiB                 | 总存储上限            |
| `TRUST_PROXY`       | `false`                | 反向代理后设为 `true` |
| `CRON_SECRET`       | —                      | Cloudflare 内部清理接口鉴权 |

### 常用命令

```bash
pnpm dev          # 开发服务器
pnpm build        # 生产构建
pnpm start        # 生产运行
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test         # 单元测试
pnpm test:e2e     # Playwright 端到端测试
pnpm i18n:check   # 词条 key 与占位符校验
pnpm cf:build     # Cloudflare Worker build
pnpm cf:preview   # Local D1/R2 preview
pnpm cf:deploy    # Deploy Worker
```

Playwright 首次运行需要 `pnpm exec playwright install chromium`。大文件流式下载以 Chrome/Edge 等 Chromium 浏览器体验最佳；其他浏览器回退到内存解密，上限 256 MiB。

## 3. 加密披露

### 范围

Shafile 在上传前于浏览器内加密文件与笔记内容。服务器仅保存密文、加密元数据，以及执行访问规则所需的最少运营元数据。

### 密码学原语

- **内容加密**：通过 Web Crypto API 使用 AES-256-GCM。
- **密码 KDF**：Argon2id，64 MiB 内存、3 次迭代、1 条通道、32 字节输出。
- **密钥派生**：HKDF-SHA-256，使用域分离标签（`shafile/v1/wrap`、`shafile/v1/auth`）。
- **完整性**：AES-GCM 认证标签，以及对明文 manifest 计算 SHA-256。

### 密钥管理

- **链接模式**：随机 32 字节内容密钥编码在 URL fragment（`/s/{id}#k=...`）中，fragment 不会发送到服务器。
- **密码模式**：内容密钥由密码派生密钥包裹。服务器仅保存 salt、包裹后的密钥、nonce、KDF 参数和密码认证密钥的验证器；永远收不到密码或内容密钥。
- 密码派生两个域分离值：`authKey` 用于授权，`wrapKey` 用于解包。知道 `authKey` 也不能解密内容。

### 文件格式

```
header   = "SHF1" | chunkSize(u32) | noncePrefix(8B) | fileId(16B)
part[i]  = len(u32) | AES-GCM(plaintextChunk_i)
manifest = len(u32) | AES-GCM(JSON{name,mime,size,sha256,chunkCount})
```

每个分块的 nonce 为 `noncePrefix || u32be(index)`。AAD 绑定 header 哈希、share id、分块序号和末块标记。文件名、MIME 类型、大小、SHA-256 和分块数保存在加密 manifest 中。文本使用同一内容密钥的单条 AES-GCM 记录。

### 访问控制与服务器可见性

服务器可以看到密文大小、创建与访问时间、访问次数、时间窗口、是否设置密码和查看上限；看不到文件名、内容、密码和密钥。开始时间、失效时间和查看次数以原子方式执行；分享耗尽、撤销或过期后删除密文。

### 安全边界

- 接收者可以复制、截图或转发解密后的内容；这不是 DRM。
- 链接密钥可能通过浏览器历史、剪贴板、二维码、截图或接收端日志泄漏。
- XSS 或恶意浏览器扩展可以读取解密后的内容；项目通过 CSP、无第三方脚本和严格 Markdown sanitize 降低风险。
- 被攻陷的服务器可以返回被修改的客户端代码；这是 Web 交付端到端加密的固有限制。
- 本文不声称已通过独立安全审计。

---

MIT License · Copyright (c) 2026 Wang Laoju
