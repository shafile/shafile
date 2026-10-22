# Cloudflare Tunnel Deployment

Shafile supports Cloudflare as a free ingress layer through **Cloudflare Tunnel** while keeping the existing Node.js runtime, SQLite database, local ciphertext storage, streaming downloads, and cleanup job. No application rewrite is required.

Cloudflare Workers + D1 + R2 is also supported by this repository; see [Workers + D1 + R2](cloudflare-workers.md). That path runs serverless and is subject to Cloudflare's D1/R2 quotas, while Tunnel keeps the current Node.js runtime and local storage.

## Architecture

```
Internet -> Cloudflare edge (TLS, DNS, WAF)
         -> cloudflared tunnel
         -> http://shafile:3000 (Docker Compose)
         -> SQLite data/shafile.db + data/blobs/
```

Cloudflare only proxies traffic. File content remains encrypted end-to-end, and the server still stores only ciphertext.

## Setup

1. Add your domain to Cloudflare and wait for DNS to become active.
2. Open **Zero Trust → Networks → Tunnels → Create a tunnel**.
3. Choose **Cloudflared**, name the tunnel, and copy the tunnel token.
4. Add a public hostname:
   - Subdomain: for example `share`
   - Domain: your domain
   - Service: `http://shafile:3000`
5. Put the token in `.env` on the server:

```bash
CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token
```

6. Start the app with the Cloudflare overlay:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cloudflare.yml \
  up -d --build
```

The overlay sets `TRUST_PROXY=true` so rate limiting and same-origin checks trust Cloudflare's forwarded headers. Keep port `3000` closed to the public internet; only `cloudflared` needs to reach it on the Docker network.

Health check: `https://share.example.com/api/health`

## Environment

| Variable | Purpose |
| --- | --- |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnel token |
| `TICKET_SECRET` | Access-token HMAC secret |
| `IP_HASH_SECRET` | Rate-limit IP hash secret |
| `MAX_SHARE_BYTES` | Per-file limit, bounded by server disk and Cloudflare request limits |
| `MAX_STORAGE_BYTES` | Total ciphertext storage |
| `TRUST_PROXY` | Set to `true` by the Cloudflare overlay |

## Limits and notes

- Cloudflare Free allows request bodies up to 100 MB. Shafile uploads encrypted chunks of 4 MiB, so this does not block normal uploads.
- Streaming downloads have no Cloudflare response-body limit while the client stays connected.
- Cloudflare Free caching does not apply to API responses; Shafile sends `no-store`.
- Storage stays on the server, so the disk must hold `data/` and be backed up.
- Do not commit `.env` or the tunnel token.
- `cloudflared` requires a working outbound connection from the server.
- If you need a fully serverless deployment instead, see [Workers + D1 + R2](cloudflare-workers.md). It uses D1 and R2 instead of local SQLite and disk, so plan for those quotas.

## Updating

```bash
git pull
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cloudflare.yml \
  up -d --build
```

For zero-downtime deployments, put the server behind a small blue/green setup or restart during a maintenance window.
