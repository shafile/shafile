# Telegram Identity P1 Design

Status: P1 implemented (validation, session exchange, ownership, owner list, owner revoke, adopt, and the manage-page list).

## Implemented in P1a

- `POST /api/telegram/session` validates `initData` and returns a one-hour session token.
- Validation lives in `src/lib/server/telegram.ts`; token signing lives in `src/lib/server/tokens.ts`.
- Requires `TELEGRAM_BOT_TOKEN`. `TELEGRAM_SESSION_SECRET` and `TELEGRAM_HASH_SECRET` are optional and derived from `TICKET_SECRET` when absent.
- The endpoint returns `503 TELEGRAM_NOT_CONFIGURED` when no bot token is set.
- Unit tests cover signature, tampering, expiry, and malformed user data; E2E covers success, tampering, and stale data.

## Implemented in P1b

- `shares.telegram_user_hash` stores only an HMAC of the Telegram user id.
- `POST /api/shares` attaches ownership when a valid session bearer token is present.
- `GET /api/telegram/shares` lists the session user's shares.
- `POST /api/shares/{id}/revoke` accepts either the manage token or an owner session.
- `POST /api/telegram/adopt` attaches an existing share after proving the manage token.
- The manage page shows a "Telegram account" section for shares not present in local storage and can link this browser's shares to the account.
- Node and D1 runtime initialization add the column/index for existing databases; `migrations/0002_telegram_identity.sql` is provided for standard D1 migration workflows.
- Link keys and passwords remain client-side, so remote management cannot reopen or re-share link-mode shares.

## Goal

Let a Telegram user manage their own Shafile shares across devices while keeping the end-to-end encryption boundary intact.

## Non-goals

- No plaintext, content keys, passwords, or file names on the server.
- No Telegram profile storage (name, username, photo, phone).
- No sharing of content keys through Telegram launch parameters.
- No replacement for the existing manage-token flow.

## Threat model delta

Today the server only sees ciphertext and metadata. P1 adds an ownership attribute derived from Telegram identity:

- The server can learn that the same Telegram user created several shares.
- Telegram can learn that the user opened this Mini App (already true).
- A leaked bot token would let an attacker forge sessions until rotated. Treat `TELEGRAM_BOT_TOKEN` as a high-value secret.
- Ownership must not grant decryption. Content keys remain in the browser.

## initData validation

Add `TELEGRAM_BOT_TOKEN` (secret) and `TELEGRAM_HASH_SECRET` (dedicated HMAC pepper).

For each launch:

1. Receive raw `initData` over HTTPS in a POST body.
2. Parse as URL-encoded key/value pairs.
3. Reject if `hash` is missing, `auth_date` is older than 24 hours, or `user.id` is missing.
4. Build the data-check string: all pairs except `hash` and `signature`, sorted by key, joined as `key=value` with `\n`.
5. `secret = HMAC_SHA256(key = "WebAppData", data = bot_token)`.
6. `expected = HMAC_SHA256(key = secret, data = dataCheckString)`.
7. Compare `expected` and `hash` with the existing constant-time `safeEqual` helper.
8. Never log `initData`; never trust `initDataUnsafe` for authorization.

Optional hardening: verify the Bot API 8.0 Ed25519 `signature` when a third-party verifier is available. HMAC with the bot token is sufficient for a self-hosted bot.

## Session model

- `POST /api/telegram/session` exchanges valid `initData` for a short-lived bearer token.
- Token payload: `{ v: 1, uid, exp }`, where `uid` is the hashed Telegram user id and `exp` is about one hour.- Sign the token with a dedicated secret, not the access-ticket secret.
- Keep the token in memory only. The Mini App re-exchanges `initData` on every launch.
- Avoid relying on cookies from a third-party Telegram Web iframe.
- Rate-limit by IP hash and by user hash.

The existing access token remains separate: it authorizes reading one share for ten minutes.

## Ownership hash

Store only:

```
telegram_user_hash = HMAC_SHA256(TELEGRAM_HASH_SECRET, "telegram:" + user.id)
```

Use a dedicated secret so the hash cannot be correlated with rate-limit hashes. Do not store the numeric id, username, or profile data.

## Schema change

Add to `migrations/0002_telegram_identity.sql` and `src/lib/server/schema.ts`:

```sql
ALTER TABLE shares ADD COLUMN telegram_user_hash BLOB;

CREATE INDEX IF NOT EXISTS idx_shares_telegram_user
  ON shares(telegram_user_hash, created_at DESC);
```

Update both because:

- `migrations/` is used by Cloudflare D1.
- `src/lib/server/schema.ts` creates fresh Node and D1 databases at runtime.

Existing rows keep `NULL` and continue to work with manage tokens.

## API changes

| Method and path | Behavior |
| --- | --- |
| `POST /api/telegram/session` | Validate `initData`; return `{ token, expiresIn }` |
| `POST /api/shares` | Optionally accepts the session token; stores `telegram_user_hash` |
| `GET /api/telegram/shares` | Lists shares owned by the session user |
| `POST /api/shares/{id}/revoke` | Accepts an owner session **or** the existing manage token |
| `POST /api/telegram/adopt` | Optional: attach an existing share after proving the manage token |

The create response still returns `manageToken` so non-Telegram clients keep working. The owner list must not return manage tokens.

## Privacy and retention

- Add a privacy-policy section describing the ownership hash and Telegram launch validation.
- Keep `telegram_user_hash` only while the share row exists; it is removed with the tombstone.
- Sessions are stateless and expire in an hour.
- Do not add analytics or profile lookups.

## Rollout

1. Ship the session endpoint and validation behind `TELEGRAM_IDENTITY=optional`; no schema use yet.
2. Attach ownership on create when a session is present; keep the feature flag.
3. Add the owner list and owner-authorized revoke.
4. Add adopt for shares created before the rollout.
5. Consider `required` only after real-device validation and privacy review.

## Tests

- Unit: valid signature, tampered field, missing hash, stale `auth_date`, malformed user id, constant-time comparison.
- Unit: token expiry, wrong signature, wrong owner hash.
- API: no session, valid session, another user's session, revoked session, rate limiting.
- E2E: mock a bot token in the test environment, create a share, reload a fresh context with the same `initData`, list and revoke it.
- Regression: non-Telegram manage-token flows and all existing E2E tests.

## Risks

- Bot token leakage; support rotation and keep it out of logs.
- Privacy boundary change: the server can correlate shares per user.
- Telegram Web storage restrictions; prefer in-memory bearer tokens.
- Larger attack surface on create/revoke; keep `assertSameOrigin`, limits, and rate limiting.
- Ownership must not be accepted from a client-supplied header such as `x-telegram-user-id`.

## Estimated effort

- Validation and session endpoint: 0.5-1 day.
- Schema, create ownership, owner list/revoke: 1-1.5 days.
- Adopt flow, tests, docs, real-device pass: 1-1.5 days.
