# Cloudflare Tunnel 部署

Shafile 通过 **Cloudflare Tunnel** 支持 Cloudflare 免费接入，同时保留现有的 Node.js 运行时、SQLite、本地密文存储、流式下载和清理任务，不需要重写应用。

本仓库也支持 Cloudflare Workers + D1 + R2，见 [Workers + D1 + R2](cloudflare-workers.zh-CN.md)。该方式完全无服务器运行，但受 D1/R2 配额限制；Tunnel 则保留现有 Node.js 运行时和本地存储。

## 架构

```
互联网 -> Cloudflare 边缘（TLS、DNS、WAF）
       -> cloudflared 隧道
       -> http://shafile:3000（Docker Compose）
       -> SQLite data/shafile.db + data/blobs/
```

Cloudflare 只代理流量。文件仍然端到端加密，服务器只保存密文。

## 配置步骤

1. 将域名接入 Cloudflare，等待 DNS 生效。
2. 打开 **Zero Trust → Networks → Tunnels → Create a tunnel**。
3. 选择 **Cloudflared**，命名隧道并复制 token。
4. 添加 Public Hostname：
   - Subdomain：例如 `share`
   - Domain：你的域名
   - Service：`http://shafile:3000`
5. 在服务器的 `.env` 中写入：

```bash
CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token
```

6. 使用 Cloudflare 覆盖文件启动：

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cloudflare.yml \
  up -d --build
```

覆盖文件会设置 `TRUST_PROXY=true`，使限流和同源校验信任 Cloudflare 转发的请求头。请对公网关闭 `3000` 端口，只允许 `cloudflared` 通过 Docker 网络访问应用。

健康检查：`https://share.example.com/api/health`

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnel token |
| `TICKET_SECRET` | 访问令牌 HMAC 密钥 |
| `IP_HASH_SECRET` | 限流 IP 哈希密钥 |
| `MAX_SHARE_BYTES` | 单文件上限，受服务器磁盘与 Cloudflare 请求限制约束 |
| `MAX_STORAGE_BYTES` | 密文总存储上限 |
| `TRUST_PROXY` | Cloudflare 覆盖文件会设为 `true` |

## 限制与说明

- Cloudflare 免费版请求体上限约 100MB；Shafile 使用 4 MiB 加密分块上传，通常不受影响。
- 客户端保持连接时，流式下载没有 Cloudflare 响应体大小限制。
- Cloudflare 免费缓存不适用于 API；Shafile 已设置 `no-store`。
- 文件仍存储在服务器本地，`data/` 需要足够磁盘并做好备份。
- 不要提交 `.env` 或 tunnel token。
- 服务器需要能主动访问外网以建立 `cloudflared` 连接。
- 如果需要完全无服务器部署，请使用 [Workers + D1 + R2](cloudflare-workers.zh-CN.md)。它使用 D1 和 R2 替代本地 SQLite 和磁盘，需要规划相应配额。

## 更新

```bash
git pull
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cloudflare.yml \
  up -d --build
```

如需零停机，可在服务器前使用蓝绿部署，或在维护窗口内重启。
