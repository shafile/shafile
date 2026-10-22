# Cloudflare Workers + D1 + R2 部署

Shafile 可以完整运行在 Cloudflare Workers 上：D1 保存元数据，R2 保存密文。浏览器加密格式、密码、查看次数、定时生效、过期清理、流式下载等能力保持不变，只是把 Node.js 服务、本地 SQLite 和本地磁盘替换为 Cloudflare 服务。

如果希望保留原始 Node.js 运行时和本地存储，请使用 [Cloudflare Tunnel](cloudflare.zh-CN.md)。

## 架构

```
浏览器 -> Cloudflare Worker（OpenNext + Next.js）
       -> D1（分享、上传、限流、活跃下载状态）
       -> R2（header、加密分块、manifest、加密文本）
```

- 浏览器仍然先加密再上传，下载后本地解密。
- D1 保存元数据、密码校验值、包装后的内容密钥、token 哈希、查看次数和清理状态。
- R2 只保存密文，对象路径为 `shares/{id}/...`。
- Cron Trigger 每分钟通过 service binding 调用内部清理接口。
- Cloudflare 免费额度仍然生效：D1 免费版总存储 5 GB，R2 免费版 10 GB。默认 50 GB 总存储上限无法在免费额度内达到。

官方限制：

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/r2/pricing/

## 前置条件

- 已启用 Workers、D1、R2 的 Cloudflare 账号
- Node.js 22+ 和 pnpm
- 已登录 Wrangler：`pnpm exec wrangler login`
- 建议使用自定义域名，`workers.dev` 也可用

## 创建资源

```bash
pnpm exec wrangler d1 create shafile-db
pnpm exec wrangler r2 bucket create shafile-blobs
```

将命令输出中的 D1 `database_id` 写入 `wrangler.jsonc`：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "shafile-db",
    "database_id": "your-d1-database-id",
    "migrations_dir": "migrations"
  }
]
```

执行数据库迁移：

```bash
pnpm exec wrangler d1 migrations apply shafile-db --remote
```

Worker 首次访问数据库时也会执行 `CREATE TABLE IF NOT EXISTS`，生产环境仍建议显式执行迁移。

## 密钥

```bash
pnpm exec wrangler secret put TICKET_SECRET
pnpm exec wrangler secret put IP_HASH_SECRET
pnpm exec wrangler secret put CRON_SECRET
```

每个密钥都使用密码学安全的随机值，例如：

```bash
openssl rand -base64 32
```

`wrangler.jsonc` 已配置 `SHAFILE_RUNTIME=cloudflare` 和 `TRUST_PROXY=true`。

## 存储限制

在 `wrangler.jsonc` 的 `vars` 或 Cloudflare 控制台设置运行时变量：

```jsonc
"vars": {
  "SHAFILE_RUNTIME": "cloudflare",
  "TRUST_PROXY": "true",
  "MAX_SHARE_BYTES": "5368709120",
  "MAX_STORAGE_BYTES": "9663676416"
}
```

`MAX_STORAGE_BYTES` 是密文总预算，应低于 D1/R2 套餐额度，并为 manifest 和 header 留出空间。Workers 上未设置时默认 9 GiB；R2 免费版为 10 GB。示例配置也使用约 9 GiB。

## 构建、预览、部署

```bash
pnpm cf:build
pnpm cf:preview
pnpm cf:deploy
```

`pnpm cf:preview` 使用本地模拟的 D1 和 R2 运行 Worker，并读取 `.dev.vars`。将 `.dev.vars.example` 复制为 `.dev.vars`，填入三个密钥。

部署前必须创建 D1 数据库和 R2 bucket。若修改 Worker 名称，也要同步修改 `WORKER_SELF_REFERENCE` 的 service 名称。

## 清理任务

`wrangler.jsonc` 定义每分钟一次的 Cron Trigger：

```jsonc
"triggers": { "crons": ["* * * * *"] }
```

自定义 `worker.ts` 的 scheduled handler 会调用：

```
POST https://shafile.internal/api/internal/cleanup
Authorization: Bearer $CRON_SECRET
```

清理内容：过期密文、撤销宽限期结束的分享、废弃草稿、陈旧下载状态和旧限流记录。也可以由外部定时器调用同一接口。

## 本地对 Worker 跑 E2E

```bash
pnpm cf:build
pnpm exec opennextjs-cloudflare preview -- --port 8788
# 另一个终端：
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8788 pnpm exec playwright test
```

PowerShell：

```powershell
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:8788"
pnpm exec playwright test
```

## Windows

OpenNext 官方提示 Windows 支持不完整。若构建在读取 pnpm 符号链接时报错，本仓库已在 `pnpm-workspace.yaml` 启用 `nodeLinker: hoisted`，修改后重新执行 `pnpm install`。CI 和生产构建建议使用 Linux。

## 运维说明

- Workers 免费版每请求 10 ms CPU。Shafile 服务端主要是 D1/R2 I/O，但高流量场景可能需要 Workers Paid。
- Cloudflare 免费版请求体上限约 100 MB；Shafile 使用 4 MiB 加密分块，正常上传不受影响。
- Workers 免费版每次调用限制 50 个子请求。流式下载每 4 MiB 分块读取一次 R2，因此超大分享可能超限。免费版建议控制在约 100 MB 以内；多 GB 文件请使用 Workers Paid（10,000 子请求）。
- 清理任务每次 Cron 最多处理 3 个分享，避免超过免费版子请求限制。
- D1 是元数据唯一事实来源，请使用 D1 export/import 备份。
- R2 保存密文。若配置生命周期规则，需要同时考虑墓碑和元数据清理。
- 不要把 `TICKET_SECRET`、`IP_HASH_SECRET`、`CRON_SECRET` 或 `.dev.vars` 提交到 git。
- Worker 不写入 `data/`；该目录只用于 Node.js 部署。

## GitHub Actions 自动部署

`.github/workflows/ci.yml` 包含 `deploy-cloudflare` job。它只在 `main` 分支 push（或手动运行 `main` 的 workflow）且 `checks` 与 `cloudflare` 两个 job 都通过后执行：应用 D1 迁移、构建 Worker，并通过 `wrangler deploy --keep-vars` 部署。

### GitHub 仓库 Secrets

在 **Settings → Secrets and variables → Actions** 添加：

| 名称 | 值 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 限定权限的 Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |

可选 Repository variable：

| 名称 | 值 |
| --- | --- |
| `PRODUCTION_URL` | 例如 `https://shafile.example.workers.dev`，用于部署后健康检查 |

在 <https://dash.cloudflare.com/profile/api-tokens> 创建 API Token，权限包括：

- Account → Workers Scripts → Edit
- Account → D1 → Edit
- Account → R2 → Edit
- Account → Account Settings → Read

将 Token 限制到 Shafile 所在账号，不要提交到仓库。

Worker 运行时 secrets（`TICKET_SECRET`、`IP_HASH_SECRET`、`CRON_SECRET`）保留在 Cloudflare；`--keep-vars` 会避免部署时删除它们。如果 Worker 被重新创建，需要用 `wrangler secret put` 重新设置。

### 手动触发

```bash
gh workflow run CI --ref main
```

或使用 **Actions → CI → Run workflow**，分支选择 `main`。

部署 job 使用 concurrency group，不会取消正在进行的生产部署。

### 回滚

```bash
pnpm exec wrangler deployments list
pnpm exec wrangler rollback <version-id>
```