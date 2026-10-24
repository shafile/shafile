# Telegram Mini App

Status: P0 and P1 implemented. The Mini App validates `initData`, exchanges it for a short-lived session, attaches share ownership, and lists/revokes owned shares from the manage page. Link keys are never stored server-side, so cross-device management shows status and revocation only; see [telegram-identity-p1.md](telegram-identity-p1.md).

## Setup

1. Deploy Shafile over HTTPS.
2. In BotFather, create or open the bot and set the Mini App URL to `https://your-host/`.
3. Optionally configure the bot menu button to open the same URL.
4. No extra environment variables are required for P0.

The app is embedded by Telegram Web, so the CSP `frame-ancestors` allowlist in `next.config.ts` must include `https://telegram.org` and `https://*.telegram.org`. Do not re-add `X-Frame-Options: DENY`.

## Runtime behavior

- Telegram is detected from `tgWebApp*` fragment parameters or an existing `Telegram.WebApp.initData`.
- The Telegram SDK is loaded only in that case; normal web visits load no third-party scripts.
- The SDK is third-party code loaded from `telegram.org`. Inside a Mini App it runs with the same page privileges as Shafile. Users who do not trust Telegram should use the regular web app.
- Theme colors, Telegram chrome colors, safe-area insets, the back button, haptics, and closing confirmation are wired through `src/lib/client/telegram.ts` and `src/components/telegram-bridge.tsx`.
- External Markdown links open with `Telegram.WebApp.openLink`.
- Link shares keep the `#k=` key when Telegram appends launch parameters to the fragment.
- On the home page, a first launch without a locale cookie adopts the Telegram user's language when it maps to a supported locale.

## Manual device matrix

Automated tests simulate the WebApp API. Verify these clients before a release:

| Client | Notes |
| --- | --- |
| Telegram Web A/K/Z (desktop browser) | Runs inside an iframe; CSP and cookies matter |
| Telegram Desktop (Windows, macOS, Linux) | Usually a top-level webview/window |
| Telegram iOS | Safe areas, software keyboard, file downloads |
| Telegram Android | WebView file picker and downloads |
| Small screen (320 px) | Header, language menu, create form |
| Arabic locale | RTL layout and mirrored icons |
| Light and dark Telegram themes | Theme changes while the app is open |

## Release checklist

- Open the app from the bot menu button.
- Switch the Telegram theme while the app is open; colors and chrome update.
- Confirm safe-area padding on a notched iPhone and an Android gesture bar.
- Use the Telegram back button on `/create`, `/manage`, and `/s/{id}`.
- Create a link share, open it in Telegram, decrypt the note.
- Create a password share; reject a wrong password without burning a view.
- Upload and download a small file; test a file larger than 256 MiB for the expected fallback.
- Tap the Share button and confirm Telegram's chat picker opens with the encoded link.
- Open an external Markdown link; it should open in Telegram's in-app browser.
- Close or swipe away during upload/decryption; closing confirmation should appear.
- Reload the Mini App and open a link containing `tgWebApp*` and `#k=` parameters.
- Check the console for CSP violations in Telegram Web.

## Known limits

- Downloads without the File System Access API fall back to in-memory decryption with a 256 MiB limit.
- Telegram Web is a third-party iframe; cookies and local storage may be partitioned or blocked.
- Telegram identity is stored only as a hashed owner id. Management tokens still work for non-Telegram clients.
- The manage page lists owned shares created on other devices and allows revoking them; it can also link shares already stored in this browser. It cannot recover link keys or passwords.
- `startapp` / `start_param` must never carry the `#k=` key: launch parameters pass through Telegram servers.
- Fullscreen mode and vertical-swipe locking are not enabled.

## Troubleshooting

- **Blank or refused frame**: the Mini App URL must be HTTPS and its origin must match the CSP `frame-ancestors` allowlist.
- **Theme not applied**: confirm launch parameters exist and the SDK request is not blocked by CSP or an extension.
- **Share link opens without the key**: use the full `https://.../s/{id}#k=...` URL; do not route keys through `start_param`.
- **Language does not change on first launch**: the device may already have a locale cookie, or Telegram/WebView storage is unavailable.
