# Cloudflare Workers + D1 + R2

Shafile can run entirely on Cloudflare Workers with D1 for metadata and R2 for encrypted blobs. This keeps the same browser encryption format, sharing features, password flow, view limits, scheduling, expiry, streaming downloads, and cleanup behavior. It replaces the Node.js server, local SQLite, and local disk only.

Use [Cloudflare Tunnel](cloudflare.md) instead if you want the original Node.js runtime and local storage without Cloudflare's D1/R2 quotas.

## Architecture

```
Browser -> Cloudflare Worker (OpenNext + Next.js)
        -> D1 (shares, uploads, rate limits, active streams)
        -> R2 (header, encrypted parts, manifest, encrypted text)
```

- The browser still encrypts before upload and decrypts after download.
- D1 stores metadata, password verifier, wrapped content key, token hashes, view counters, and cleanup state.
- R2 stores only ciphertext. Objects are keyed as `shares/{id}/...`.
- A Cron Trigger calls an internal cleanup route every minute through a service binding.
- Free-plan limits still apply. D1 Free currently provides 5 GB total storage; R2 Free provides 10 GB. The default 50 GB total storage limit cannot be reached without a paid plan or higher limits.

Official limits:

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/r2/pricing/

## Prerequisites

- Cloudflare account with Workers, D1, and R2 enabled
- Node.js 22+ and pnpm
- Wrangler authenticated: `pnpm exec wrangler login`
- A custom domain is recommended, but `workers.dev` also works

## Create resources

```bash
pnpm exec wrangler d1 create shafile-db
pnpm exec wrangler r2 bucket create shafile-blobs
```

Copy the D1 `database_id` from the command output into `wrangler.jsonc`:

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

Apply the schema:

```bash
pnpm exec wrangler d1 migrations apply shafile-db --remote
```

The Worker also runs the schema with `CREATE TABLE IF NOT EXISTS` on its first database access, but applying migrations explicitly is recommended for production.

## Secrets

```bash
pnpm exec wrangler secret put TICKET_SECRET
pnpm exec wrangler secret put IP_HASH_SECRET
pnpm exec wrangler secret put CRON_SECRET
```

Generate each secret with a cryptographically secure random value, for example:

```bash
openssl rand -base64 32
```

`SHAFILE_RUNTIME=cloudflare` and `TRUST_PROXY=true` are already configured in `wrangler.jsonc`.

## Storage limits

Set runtime variables in `wrangler.jsonc` under `vars` or in the Cloudflare dashboard:

```jsonc
"vars": {
  "SHAFILE_RUNTIME": "cloudflare",
  "TRUST_PROXY": "true",
  "MAX_SHARE_BYTES": "5368709120",
  "MAX_STORAGE_BYTES": "9663676416"
}
```

`MAX_STORAGE_BYTES` is the total ciphertext budget. Keep it below your D1/R2 plan limits and leave room for manifests and headers. On Workers, the default is 9 GiB when unset; R2 Free is 10 GB. The example also sets about 9 GiB explicitly.

## Build, preview, deploy

```bash
pnpm cf:build
pnpm cf:preview
pnpm cf:deploy
```

`pnpm cf:preview` runs the Worker locally with local D1 and R2 emulation. It reads `.dev.vars`; copy `.dev.vars.example` to `.dev.vars` and set the three secrets.

Deployment requires the D1 `database_id` and R2 bucket to exist. If the Worker is renamed, update both `name` and the `WORKER_SELF_REFERENCE` service binding.

## Cleanup

`wrangler.jsonc` defines a one-minute Cron Trigger:

```jsonc
"triggers": { "crons": ["* * * * *"] }
```

The custom `worker.ts` scheduled handler calls:

```
POST https://shafile.internal/api/internal/cleanup
Authorization: Bearer $CRON_SECRET
```

This removes expired ciphertext, revoked shares after the grace period, abandoned drafts, stale active-stream rows, and old rate-limit rows. The same endpoint can be called by an external scheduler if desired.

## Local E2E against the Worker

```bash
pnpm cf:build
pnpm exec opennextjs-cloudflare preview -- --port 8788
# in another terminal:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8788 pnpm exec playwright test
```

PowerShell:

```powershell
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:8788"
pnpm exec playwright test
```

## Windows

OpenNext warns that Windows is not fully supported. If the build fails while reading pnpm symlinks, this repository enables `nodeLinker: hoisted` in `pnpm-workspace.yaml`; run `pnpm install` after changing it. CI and production builds on Linux are recommended.

## Operational notes

- Workers Free has a 10 ms CPU limit per request. Shafile's server work is dominated by D1/R2 I/O, but high traffic may require Workers Paid.
- Cloudflare request bodies are limited (100 MB on Free). Shafile uploads 4 MiB encrypted chunks, so normal uploads are unaffected.
- Workers Free allows 50 subrequests per invocation. A streaming download reads one R2 object per 4 MiB chunk, so very large shares can exceed that limit. Keep Free-plan shares around 100 MB or use Workers Paid (10,000 subrequests) for multi-GB files.
- Cleanup is deliberately batched to at most three purge operations per Cron invocation so it stays under the Free subrequest limit.
- D1 is the metadata source of truth. Back it up with D1 export/import.
- R2 holds ciphertext. Enable a lifecycle rule only if you also account for tombstone/metadata cleanup.
- Do not store `TICKET_SECRET`, `IP_HASH_SECRET`, `CRON_SECRET`, or `.dev.vars` in git.
- The Worker does not write to `data/`; that directory is for the Node.js deployment only.

## GitHub Actions auto deploy

`.github/workflows/ci.yml` contains a `deploy-cloudflare` job. It runs on a push to `main` (or a manual workflow run on `main`) only after both `checks` and `cloudflare` jobs pass. It applies D1 migrations, builds the Worker, and deploys with `wrangler deploy --keep-vars`.

### GitHub repository secrets

Add these in **Settings → Secrets and variables → Actions**:

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Scoped Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

Optional repository variable:

| Name | Value |
| --- | --- |
| `PRODUCTION_URL` | For example `https://shafile.example.workers.dev`; enables the post-deploy health check |

Create the API token at <https://dash.cloudflare.com/profile/api-tokens> with:

- Account → Workers Scripts → Edit
- Account → D1 → Edit
- Account → R2 → Edit
- Account → Account Settings → Read

Limit the token to the Shafile account. Do not commit the token.

The Worker's runtime secrets (`TICKET_SECRET`, `IP_HASH_SECRET`, `CRON_SECRET`) stay in Cloudflare; `--keep-vars` prevents a deploy from deleting them. If the Worker is recreated, set the secrets again with `wrangler secret put`.

### Manual trigger

```bash
gh workflow run CI --ref main
```

Or use **Actions → CI → Run workflow** on `main`.

The deploy job uses a concurrency group that does not cancel an in-progress production deploy.

### Rollback

```bash
pnpm exec wrangler deployments list
pnpm exec wrangler rollback <version-id>
```