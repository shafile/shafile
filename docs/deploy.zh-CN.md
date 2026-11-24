# 部署脚本

`scripts/deploy.py` 是一个无第三方依赖的 Python 3.10+ 脚本，支持三种部署方式：

1. 本地容器
2. 容器 + Cloudflare Tunnel
3. Cloudflare Workers + D1 + R2

脚本不会打印密钥，也不会把密钥放在命令行参数里。容器密钥写入被 git 忽略的 `.env`，在支持的平台上设置权限 `0600`。

## 快速开始

```bash
python scripts/deploy.py
```

不传参数时显示菜单。自动化场景可直接指定：

```bash
python scripts/deploy.py --target container
python scripts/deploy.py --target tunnel
python scripts/deploy.py --target cloudflare
python scripts/deploy.py --target container --action status
python scripts/deploy.py --target container --action logs --follow
python scripts/deploy.py --target container --action down
```

`--non-interactive` 在缺少参数时直接失败，`--dry-run` 只打印将要执行的命令。

## 容器后端

Windows 默认使用 `wslc`：在 WSL 内执行 Compose。WSL 中需要安装 Docker Compose 或 Podman Compose。

如果 WSL 不可用，可改用 Windows 本机容器：

```bash
python scripts/deploy.py --target container --backend docker
python scripts/deploy.py --target container --backend podman
```

Linux / macOS 会按 Podman、Docker、nerdctl 的顺序自动探测，也可用 `--backend` 指定：

```bash
python scripts/deploy.py --target container --backend podman
```

支持的 Compose 提供者：

- `docker compose` / `docker-compose`
- `podman compose` / `podman-compose`
- `nerdctl compose`
- WSL 内的上述提供者

首次运行会从 `.env.example` 创建 `.env`，缺少 `TICKET_SECRET` 和 `IP_HASH_SECRET` 时自动生成，然后执行：

```text
compose up -d --build
```

并轮询 `http://127.0.0.1:3000/api/health`。

## Cloudflare Tunnel

```bash
python scripts/deploy.py --target tunnel
```

该模式同时使用 `docker-compose.yml` 和 `docker-compose.cloudflare.yml`。需要 `CLOUDFLARE_TUNNEL_TOKEN`，缺失时会安全提示并写入 `.env`。

Cloudflare Tunnel 的 public hostname 应指向：

```text
http://shafile:3000
```

## Cloudflare Workers

```bash
python scripts/deploy.py --target cloudflare --url https://shafile.example.workers.dev
```

需要填写：

- `CLOUDFLARE_API_TOKEN`（缺失时安全提示）
- `CLOUDFLARE_ACCOUNT_ID`（缺失时提示）
- `wrangler.jsonc` 中的 D1 `database_id`（占位符时提示）
- `wrangler.jsonc` 中的 R2 bucket（占位符时提示）
- `TICKET_SECRET`、`IP_HASH_SECRET`、`CRON_SECRET`（缺失时生成并写入 `.env`）

脚本依次执行：

```text
pnpm install --frozen-lockfile
pnpm cf:build
wrangler d1 migrations apply shafile-db --remote
wrangler secret put ...
wrangler deploy --keep-vars
```

API Token 需要该账号的 Workers Scripts、D1、R2 编辑权限。资源创建与生产限制见 [Cloudflare Workers 部署](cloudflare-workers.zh-CN.md)。

## 安全说明

- `.env` 已被 git 忽略，包含应用密钥；Tunnel 模式还包含 Tunnel Token。
- 不要把 API Token 作为命令行参数传入；使用环境变量或交互提示。
- Cloudflare API Token 只存在于部署子进程环境中，不会写入 `.env`。
- 对生产环境执行前，先用 `--dry-run` 检查命令。
