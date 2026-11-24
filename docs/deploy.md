# Deployment script

`scripts/deploy.py` is a dependency-free Python 3.10+ helper for three deployment paths:

1. Local container
2. Container plus Cloudflare Tunnel
3. Cloudflare Workers with D1 and R2

It never prints secret values and does not put secrets on command lines. It writes container secrets to the git-ignored `.env` file with mode `0600` where the platform supports it.

## Quick start

```bash
python scripts/deploy.py
```

The menu asks for the target. For automation, pass flags:

```bash
python scripts/deploy.py --target container
python scripts/deploy.py --target tunnel
python scripts/deploy.py --target cloudflare
python scripts/deploy.py --target container --action status
python scripts/deploy.py --target container --action logs --follow
python scripts/deploy.py --target container --action down
```

`--non-interactive` fails instead of prompting for missing values. `--dry-run` prints the commands that would run.

## Container backend

On Windows the default backend is `wslc`: Compose is executed inside WSL. WSL must have Docker Compose or Podman Compose installed.

If WSL is not available or should not be used, select a native Windows backend:

```bash
python scripts/deploy.py --target container --backend docker
python scripts/deploy.py --target container --backend podman
```

On Linux and macOS the script auto-detects Podman, Docker, then nerdctl. Override it with `--backend`:

```bash
python scripts/deploy.py --target container --backend podman
```

Supported Compose providers:

- `docker compose` and `docker-compose`
- `podman compose` and `podman-compose`
- `nerdctl compose`
- WSL detection for the same providers inside the distribution

The script creates `.env` from `.env.example` when needed and generates `TICKET_SECRET` and `IP_HASH_SECRET` if they are missing. Then it runs:

```text
compose up -d --build
```

and polls `http://127.0.0.1:3000/api/health`.

## Cloudflare Tunnel

```bash
python scripts/deploy.py --target tunnel
```

This composes both `docker-compose.yml` and `docker-compose.cloudflare.yml`. It requires `CLOUDFLARE_TUNNEL_TOKEN`; the script prompts for it when missing and stores it in `.env`.

The Cloudflare dashboard tunnel public hostname should point to:

```text
http://shafile:3000
```

## Cloudflare Workers

```bash
python scripts/deploy.py --target cloudflare --url https://shafile.example.workers.dev
```

Required values:

- `CLOUDFLARE_API_TOKEN` (prompted when missing)
- `CLOUDFLARE_ACCOUNT_ID` (prompted when missing)
- D1 `database_id` in `wrangler.jsonc` (prompted if it is a placeholder)
- R2 bucket in `wrangler.jsonc` (prompted if it is a placeholder)
- `TICKET_SECRET`, `IP_HASH_SECRET`, `CRON_SECRET` (generated and stored in `.env` when missing)

The script runs:

```text
pnpm install --frozen-lockfile
pnpm cf:build
wrangler d1 migrations apply shafile-db --remote
wrangler secret put ...
wrangler deploy --keep-vars
```

The API token needs Workers Scripts, D1, and R2 edit permissions for the account. See [Cloudflare Workers deployment](cloudflare-workers.md) for resource creation and production limits.

## Security notes

- `.env` is git-ignored. It contains app secrets and, for tunnel deployments, the tunnel token.
- Do not pass API tokens with command-line flags; use the environment or the interactive prompt.
- The Cloudflare API token is only kept in the process environment for the deploy commands; it is not written to `.env`.
- Review `--dry-run` output before running against production.
