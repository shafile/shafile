![Shafile promotional poster](docs/poster.png)

<center>

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [हिन्दी](README.hi.md) · [Español (México)](README.es-MX.md)

**Live preview (Cloudflare Workers):** <https://shafile.laoju.wang>

</center>

## 1. Introduction

Shafile is an end-to-end encrypted file and text sharing tool. Content is encrypted in the browser and the server stores only ciphertext. It supports view limits, scheduled start and expiry, password access, and burn-after-reading.

## 2. Installation & Usage

### Requirements

- Node.js 24+ (tested on Node 26)
- pnpm
- HTTPS in production

### Run locally

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The first start creates:

- `data/shafile.db`: SQLite metadata
- `data/blobs/`: ciphertext storage
- `data/.secrets.json`: development signing secrets

### How to use

1. On the home page, choose **Create** and enter text or select a file.
2. Configure access mode, start and expiry times, and view limits.
3. Create the share and copy the link. If you use password mode, send the password through a separate channel.
4. The recipient opens the link in a browser to decrypt and view or download the content.

### Telegram Mini App

Shafile runs as a Telegram Mini App without extra configuration. Deploy it over HTTPS and set the Mini App URL in BotFather.

- The Telegram SDK is loaded only when Telegram launch parameters are present. Normal web visits still load no third-party scripts. Inside Telegram, the official SDK is third-party code and runs with the same privileges as the app.
- `initData` is validated server-side and share ownership is stored as a hashed Telegram user id. The manage page lists and revokes owned shares across devices and can link shares already stored in the current browser; link keys stay on the device that created them.
- Telegram theme colors, safe-area insets, the back button, and success haptics are applied automatically.
- Share links keep their `#k=` key when Telegram appends launch parameters to the URL fragment.
- The Content Security Policy allows framing only from `telegram.org` and its subdomains; every other origin stays blocked.

See [docs/telegram-mini-app.md](docs/telegram-mini-app.md) for setup and the device checklist, and [docs/telegram-identity-p1.md](docs/telegram-identity-p1.md) for the proposed identity design.

### Mobile

Mobile browsers get `viewport-fit=cover`, safe-area padding for notches and Telegram chrome, 44px touch targets, 16px form fields to prevent iOS zoom, and horizontally scrollable Markdown tables.

### Production deployment

```bash
pnpm build
pnpm start
```

Put a reverse proxy such as Caddy or Nginx in front of `127.0.0.1:3000` and enable HTTPS:

```caddyfile
shafile.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Set `TICKET_SECRET` and `IP_HASH_SECRET` explicitly in production, and set `TRUST_PROXY=true` when running behind a proxy. Stop the service before backing up `data/`. The app is currently single-instance by design (SQLite, in-memory rate limiting, and active-download tracking).

### Docker

The repository includes a multi-stage `Dockerfile` and `docker-compose.yml`.

```bash
docker compose up --build -d
```

The app is available at `http://localhost:3000`. Data persists in the `shafile-data` volume. Set `TICKET_SECRET` and `IP_HASH_SECRET` explicitly in production, and adjust limits and `TRUST_PROXY` as needed. The image uses the Next.js standalone output and exposes an `/api/health` health check.

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint, type checking, i18n checks, unit tests, the production build, Node Playwright E2E tests, a Docker image build, and a Cloudflare Worker build plus Playwright E2E against local D1/R2. After these pass, pushes to `main` auto-deploy to Workers when the Cloudflare GitHub secrets are configured.

### Cloudflare

Two supported paths:

- [Cloudflare Tunnel](docs/cloudflare.md): keep Node.js, SQLite, local disk, streaming, and cleanup. Best for full capability and existing servers.
- [Workers + D1 + R2](docs/cloudflare-workers.md): fully serverless on Cloudflare; feature-complete but subject to Workers, D1, and R2 quotas (for example D1 Free 5 GB and R2 Free 10 GB).

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `SHAFILE_DATA_DIR` | `./data` | Data root |
| `DATABASE_PATH` | `$DATA_DIR/shafile.db` | SQLite path |
| `BLOB_DIR` | `$DATA_DIR/blobs` | Ciphertext directory |
| `TICKET_SECRET` | auto-generated | Access-token HMAC secret |
| `IP_HASH_SECRET` | auto-generated | Rate-limit IP hash secret |
| `TELEGRAM_BOT_TOKEN` | — | Enables Telegram `initData` session exchange |
| `TELEGRAM_SESSION_SECRET` | derived from `TICKET_SECRET` | Telegram session token HMAC secret |
| `TELEGRAM_HASH_SECRET` | derived from `TICKET_SECRET` | Telegram user-id hash secret |
| `TELEGRAM_WEBHOOK_SECRET` | — | Telegram bot webhook verification secret |
| `TELEGRAM_BOT_USERNAME` | — | Public bot username used for Mini App share links |
| `TELEGRAM_MINI_APP_SHORT_NAME` | `shafile` | Public Mini App short name configured in BotFather |
| `MAX_SHARE_BYTES` | 5 GiB | Per-file limit |
| `MAX_STORAGE_BYTES` | 50 GiB | Total storage limit |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy |
| `CRON_SECRET` | — | Cloudflare internal cleanup bearer secret |

### Commands

```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm start        # Production server
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test         # Unit tests
pnpm test:e2e     # Playwright end-to-end tests
pnpm i18n:check   # Message key and placeholder checks
pnpm cf:build     # Cloudflare Worker build
pnpm cf:preview   # Local D1/R2 preview
pnpm cf:deploy    # Deploy Worker
```

Playwright requires `pnpm exec playwright install chromium` on first use. Large-file streaming downloads work best in Chromium browsers such as Chrome and Edge. Other browsers fall back to in-memory decryption with a 256 MiB limit.

## 3. Encryption Disclosure

### Scope

Shafile encrypts file and note content in the browser before any upload. The server stores ciphertext, encrypted metadata, and the minimum operational metadata required to enforce access rules.

### Cryptographic primitives

- **Content encryption:** AES-256-GCM via the Web Crypto API.
- **Password KDF:** Argon2id with 64 MiB memory, 3 iterations, 1 lane, and a 32-byte output.
- **Key derivation:** HKDF-SHA-256 with domain separation (`shafile/v1/wrap`, `shafile/v1/auth`).
- **Integrity:** AES-GCM authentication tags and SHA-256 over the plaintext manifest.

### Key management

- **Link mode:** a random 32-byte content key is encoded in the URL fragment (`/s/{id}#k=...`). Fragments are not sent to the server.
- **Password mode:** the content key is wrapped with a password-derived key. The server stores only the salt, wrapped key, nonce, KDF parameters, and a verifier for the password-derived authentication key. It never receives the password or content key.
- The password derives two domain-separated values: `authKey` for authorization and `wrapKey` for unwrapping. Knowing `authKey` does not permit decryption.

### File format

```
header   = "SHF1" | chunkSize(u32) | noncePrefix(8B) | fileId(16B)
part[i]  = len(u32) | AES-GCM(plaintextChunk_i)
manifest = len(u32) | AES-GCM(JSON{name,mime,size,sha256,chunkCount})
```

The nonce for each chunk is `noncePrefix || u32be(index)`. The AAD binds the header hash, share id, chunk index, and final-chunk flag. File name, MIME type, size, SHA-256, and chunk count are stored in the encrypted manifest. Text uses a single AES-GCM record with the same content key.

### Access enforcement and server visibility

The server can see ciphertext size, creation and access times, access counts, schedule, password presence, and the view limit. It cannot see file names, content, passwords, or keys. Start, expiry, and view limits are enforced atomically; ciphertext is deleted when a share is exhausted, revoked, or expired.

### Security boundaries

- Recipients can copy, screenshot, or forward decrypted content. This is not DRM.
- Link keys may leak through browser history, clipboards, QR codes, screenshots, or logs on the recipient side.
- XSS or a malicious browser extension can read decrypted content. The project mitigates this with CSP, no third-party scripts, and strict Markdown sanitization.
- A compromised server can serve modified client code; this limitation is intrinsic to web-delivered end-to-end encryption.
- No independent security audit is claimed.

---

MIT License · Copyright (c) 2026 Wang Laoju
