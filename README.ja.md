![Shafile プロモーションポスター](docs/poster.png)

<center>

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語** · [한국어](README.ko.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [हिन्दी](README.hi.md) · [Español (México)](README.es-MX.md)

**ライブプレビュー（Cloudflare Workers 版）：** <https://shafile.laoju.wang>

</center>

## 1. 紹介

Shafile は、エンドツーエンド暗号化されたファイル・テキスト共有ツールです。内容はブラウザ内で暗号化され、サーバーには暗号文だけが保存されます。閲覧回数制限、開始・失効の予約、パスワード保護、閲覧後の削除に対応しています。

## 2. インストールと使い方

### 必要な環境

- Node.js 24 以上（Node 26 で検証済み）
- pnpm
- 本番環境では HTTPS

### ローカル実行

```bash
pnpm install
pnpm dev
```

<http://localhost:3000> を開きます。初回起動時に以下が作成されます。

- `data/shafile.db`：SQLite メタデータ
- `data/blobs/`：暗号文ストレージ
- `data/.secrets.json`：開発用署名シークレット

### 使い方

1. ホームで「作成」を選び、テキストを入力するかファイルを選択します。
2. アクセス方法、開始・失効日時、閲覧回数を設定します。
3. 作成後に共有リンクをコピーします。パスワードモードの場合は、パスワードを別の経路で伝えます。
4. 受け取った人はブラウザでリンクを開き、復号して閲覧またはダウンロードします。

### 本番デプロイ

```bash
pnpm build
pnpm start
```

Caddy や Nginx などのリバースプロキシを `127.0.0.1:3000` の前に置き、HTTPS を有効にします。

```caddyfile
shafile.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

本番では `TICKET_SECRET` と `IP_HASH_SECRET` を明示的に設定し、プロキシ配下では `TRUST_PROXY=true` を設定してください。`data/` をバックアップする前にサービスを停止してください。現在のアプリは単一インスタンス設計です（SQLite、インメモリのレート制限、アクティブダウンロード管理）。

### Docker

リポジトリにはマルチステージの `Dockerfile` と `docker-compose.yml` が含まれています。

```bash
docker compose up --build -d
```

`http://localhost:3000` で利用できます。データは `shafile-data` ボリュームに保存されます。本番では `TICKET_SECRET` と `IP_HASH_SECRET` を明示的に設定し、上限と `TRUST_PROXY` を必要に応じて調整してください。イメージは Next.js の standalone 出力を使用し、`/api/health` のヘルスチェックを備えます。

### CI

GitHub Actions（`.github/workflows/ci.yml`）は lint、型チェック、i18n 検証、ユニットテスト、本番ビルド、Playwright E2E、Docker イメージのビルドを実行します。

### Cloudflare

2 つの構成に対応しています。

- [Cloudflare Tunnel](docs/cloudflare.md): Node.js、SQLite、ローカルディスク、ストリーミング、クリーンアップを維持します。
- [Workers + D1 + R2](docs/cloudflare-workers.md): Cloudflare 上で完全にサーバーレス動作しますが、Workers、D1、R2 の割り当て制限を受けます。

### 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `SHAFILE_DATA_DIR` | `./data` | データのルート |
| `DATABASE_PATH` | `$DATA_DIR/shafile.db` | SQLite のパス |
| `BLOB_DIR` | `$DATA_DIR/blobs` | 暗号文ディレクトリ |
| `TICKET_SECRET` | 自動生成 | アクセストークンの HMAC 鍵 |
| `IP_HASH_SECRET` | 自動生成 | レート制限用 IP ハッシュ鍵 |
| `MAX_SHARE_BYTES` | 5 GiB | ファイルあたりの上限 |
| `MAX_STORAGE_BYTES` | 50 GiB | 総ストレージ上限 |
| `TRUST_PROXY` | `false` | リバースプロキシ配下では `true` |
| `CRON_SECRET` | — | Cloudflare 内部クリーンアップ用シークレット |

### コマンド

```bash
pnpm dev          # 開発サーバー
pnpm build        # 本番ビルド
pnpm start        # 本番サーバー
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test         # ユニットテスト
pnpm test:e2e     # Playwright E2E テスト
pnpm i18n:check   # メッセージキーとプレースホルダーの検証
pnpm cf:build     # Cloudflare Worker build
pnpm cf:preview   # Local D1/R2 preview
pnpm cf:deploy    # Deploy Worker
```

Playwright の初回実行には `pnpm exec playwright install chromium` が必要です。大きなファイルのストリーミングダウンロードは Chrome や Edge などの Chromium 系ブラウザが最適です。その他のブラウザはメモリ内復号にフォールバックし、上限は 256 MiB です。

## 3. 暗号化の開示

### 対象範囲

Shafile はアップロード前にファイルとノートの内容をブラウザ内で暗号化します。サーバーは暗号文、暗号化されたメタデータ、およびアクセスルールを適用するために必要な最小限の運用メタデータのみを保存します。

### 暗号プリミティブ

- **内容の暗号化**：Web Crypto API による AES-256-GCM。
- **パスワード KDF**：Argon2id、メモリ 64 MiB、3 回の反復、1 レーン、32 バイト出力。
- **鍵導出**：HKDF-SHA-256。ドメイン分離ラベル（`shafile/v1/wrap`、`shafile/v1/auth`）を使用します。
- **完全性**：AES-GCM の認証タグと、平文 manifest に対する SHA-256。

### 鍵管理

- **リンクモード**：ランダムな 32 バイトの内容鍵を URL フラグメント（`/s/{id}#k=...`）にエンコードします。フラグメントはサーバーへ送信されません。
- **パスワードモード**：内容鍵をパスワード由来の鍵で包みます。サーバーは salt、包まれた鍵、nonce、KDF パラメーター、およびパスワード認証鍵の検証値のみを保存し、パスワードや内容鍵を受け取ることはありません。
- パスワードからはドメイン分離された 2 つの値、認可用の `authKey` と解包用の `wrapKey` を導出します。`authKey` を知っても内容を復号することはできません。

### ファイル形式

```
header   = "SHF1" | chunkSize(u32) | noncePrefix(8B) | fileId(16B)
part[i]  = len(u32) | AES-GCM(plaintextChunk_i)
manifest = len(u32) | AES-GCM(JSON{name,mime,size,sha256,chunkCount})
```

各チャンクの nonce は `noncePrefix || u32be(index)` です。AAD はヘッダーハッシュ、共有 ID、チャンク番号、最終チャンクフラグを束縛します。ファイル名、MIME タイプ、サイズ、SHA-256、チャンク数は暗号化された manifest に保存されます。テキストは同じ内容鍵による単一の AES-GCM レコードを使用します。

### アクセス制御とサーバー可視性

サーバーは暗号文のサイズ、作成・アクセス時刻、アクセス回数、時間枠、パスワードの有無、閲覧上限を確認できます。ファイル名、内容、パスワード、鍵は確認できません。開始時刻、失効時刻、閲覧回数はアトミックに適用され、共有が使い切られた場合、取り消された場合、または失効した場合に暗号文が削除されます。

### セキュリティ境界

- 受信者は復号後の内容をコピー、スクリーンショット、転送できます。これは DRM ではありません。
- リンク鍵はブラウザ履歴、クリップボード、QR コード、スクリーンショット、または受信者側のログを通じて漏洩する可能性があります。
- XSS や悪意のあるブラウザ拡張機能は復号後の内容を読み取れます。本プロジェクトは CSP、サードパーティスクリプトの不使用、厳格な Markdown サニタイズでリスクを軽減します。
- 侵害されたサーバーは変更されたクライアントコードを配信できます。これは Web 経由で提供されるエンドツーエンド暗号化の本質的な制約です。
- 独立したセキュリティ監査を受けていることを主張するものではありません。

---

MIT License · Copyright (c) 2026 Wang Laoju
