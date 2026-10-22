![Shafile Werbeposter](docs/poster.png)

<center>

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [Français](README.fr.md) · **Deutsch** · [हिन्दी](README.hi.md) · [Español (México)](README.es-MX.md)

</center>

## 1. Einführung

Shafile ist ein Ende-zu-Ende-verschlüsseltes Werkzeug zum Teilen von Dateien und Texten. Inhalte werden im Browser verschlüsselt, der Server speichert nur Chiffrat. Unterstützt werden Aufruflimits, geplantes Starten und Ablaufen, Passwortzugriff und Löschen nach dem Lesen.

## 2. Installation und Verwendung

### Voraussetzungen

- Node.js 24+ (auf Node 26 getestet)
- pnpm
- HTTPS in der Produktion

### Lokal starten

```bash
pnpm install
pnpm dev
```

Öffne <http://localhost:3000>. Beim ersten Start werden erstellt:

- `data/shafile.db`: SQLite-Metadaten
- `data/blobs/`: Chiffrat-Speicher
- `data/.secrets.json`: Signaturgeheimnisse für die Entwicklung

### Verwendung

1. Wähle auf der Startseite **Erstellen**, gib einen Text ein oder wähle eine Datei aus.
2. Lege Zugriffsmodus, Start- und Ablaufzeit sowie das Aufruflimit fest.
3. Erstelle die Freigabe und kopiere den Link. Im Passwortmodus musst du das Passwort über einen anderen Kanal senden.
4. Der Empfänger öffnet den Link im Browser, entschlüsselt den Inhalt und sieht ihn an oder lädt ihn herunter.

### Produktivbetrieb

```bash
pnpm build
pnpm start
```

Setze einen Reverse Proxy wie Caddy oder Nginx vor `127.0.0.1:3000` und aktiviere HTTPS:

```caddyfile
shafile.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Setze in der Produktion `TICKET_SECRET` und `IP_HASH_SECRET` explizit und hinter einem Proxy `TRUST_PROXY=true`. Stoppe den Dienst, bevor du `data/` sicherst. Die App ist derzeit für eine einzelne Instanz ausgelegt (SQLite, In-Memory-Rate-Limiting und Verwaltung aktiver Downloads).

### Docker

Das Repository enthält ein mehrstufiges `Dockerfile` und `docker-compose.yml`.

```bash
docker compose up --build -d
```

Die App ist unter `http://localhost:3000` erreichbar. Daten liegen im Volume `shafile-data`. Setze in der Produktion `TICKET_SECRET` und `IP_HASH_SECRET` explizit und passe Limits sowie `TRUST_PROXY` bei Bedarf an. Das Image nutzt den Next.js-Standalone-Build und bietet einen `/api/health`-Healthcheck.

### CI

GitHub Actions (`.github/workflows/ci.yml`) führt Lint, Typecheck, i18n-Prüfung, Unit-Tests, Produktions-Build, Playwright-E2E und den Docker-Image-Build aus.

### Umgebungsvariablen

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `SHAFILE_DATA_DIR` | `./data` | Datenverzeichnis |
| `DATABASE_PATH` | `$DATA_DIR/shafile.db` | SQLite-Pfad |
| `BLOB_DIR` | `$DATA_DIR/blobs` | Chiffrat-Verzeichnis |
| `TICKET_SECRET` | automatisch erzeugt | HMAC-Geheimnis für Zugriffstoken |
| `IP_HASH_SECRET` | automatisch erzeugt | IP-Hash-Geheimnis für Rate Limits |
| `MAX_SHARE_BYTES` | 5 GiB | Limit pro Datei |
| `MAX_STORAGE_BYTES` | 50 GiB | Gesamtes Speicherlimit |
| `TRUST_PROXY` | `false` | Hinter einem Reverse Proxy auf `true` setzen |

### Befehle

```bash
pnpm dev          # Entwicklungsserver
pnpm build        # Produktions-Build
pnpm start        # Produktionsserver
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test         # Unit-Tests
pnpm test:e2e     # Playwright-E2E-Tests
pnpm i18n:check   # Prüfung von Nachrichtenschlüsseln und Platzhaltern
```

Playwright benötigt beim ersten Mal `pnpm exec playwright install chromium`. Streaming-Downloads großer Dateien funktionieren am besten in Chromium-Browsern wie Chrome und Edge. Andere Browser fallen auf In-Memory-Entschlüsselung mit 256 MiB Limit zurück.

## 3. Offenlegung der Verschlüsselung

### Geltungsbereich

Shafile verschlüsselt Datei- und Notizinhalte im Browser vor dem Upload. Der Server speichert nur Chiffrat, verschlüsselte Metadaten und die minimalen Betriebsmetadaten, die zur Durchsetzung der Zugriffsregeln erforderlich sind.

### Kryptografische Primitive

- **Inhaltsverschlüsselung:** AES-256-GCM über die Web Crypto API.
- **Passwort-KDF:** Argon2id mit 64 MiB Speicher, 3 Iterationen, 1 Lane und 32-Byte-Ausgabe.
- **Schlüsselableitung:** HKDF-SHA-256 mit Domänentrennung (`shafile/v1/wrap`, `shafile/v1/auth`).
- **Integrität:** AES-GCM-Authentifizierungs-Tags und SHA-256 über das Klartext-Manifest.

### Schlüsselverwaltung

- **Link-Modus:** Ein zufälliger 32-Byte-Inhaltsschlüssel wird im URL-Fragment (`/s/{id}#k=...`) kodiert. Fragmente werden nicht an den Server gesendet.
- **Passwortmodus:** Der Inhaltsschlüssel wird mit einem passwortabgeleiteten Schlüssel umschlossen. Der Server speichert nur Salt, umschlossenen Schlüssel, Nonce, KDF-Parameter und einen Verifier für den passwortabgeleiteten Authentifizierungsschlüssel. Passwort und Inhaltsschlüssel erreichen ihn nie.
- Das Passwort leitet zwei domänengetrennte Werte ab: `authKey` für die Autorisierung und `wrapKey` zum Entpacken. Die Kenntnis von `authKey` erlaubt keine Entschlüsselung.

### Dateiformat

```
header   = "SHF1" | chunkSize(u32) | noncePrefix(8B) | fileId(16B)
part[i]  = len(u32) | AES-GCM(plaintextChunk_i)
manifest = len(u32) | AES-GCM(JSON{name,mime,size,sha256,chunkCount})
```

Der Nonce jedes Blocks ist `noncePrefix || u32be(index)`. Die AAD bindet Header-Hash, Share-ID, Blockindex und das Flag des letzten Blocks. Dateiname, MIME-Typ, Größe, SHA-256 und Blockanzahl liegen im verschlüsselten Manifest. Text verwendet einen einzelnen AES-GCM-Datensatz mit demselben Inhaltsschlüssel.

### Zugriffskontrolle und Serversichtbarkeit

Der Server sieht Chiffratgröße, Erstellungs- und Zugriffszeiten, Zugriffszahlen, Zeitfenster, das Vorhandensein eines Passworts und das Aufruflimit. Er sieht keine Dateinamen, Inhalte, Passwörter oder Schlüssel. Start, Ablauf und Aufruflimits werden atomar durchgesetzt; das Chiffrat wird gelöscht, wenn eine Freigabe verbraucht, widerrufen oder abgelaufen ist.

### Sicherheitsgrenzen

- Empfänger können entschlüsselte Inhalte kopieren, screenshotten oder weiterleiten. Das ist kein DRM.
- Linkschlüssel können über Browserverlauf, Zwischenablage, QR-Codes, Screenshots oder Logs auf Empfängerseite gelangen.
- XSS oder eine schädliche Browsererweiterung kann entschlüsselte Inhalte lesen. Das Projekt reduziert dies mit CSP, ohne Drittanbieter-Skripte und durch strenge Markdown-Bereinigung.
- Ein kompromittierter Server kann veränderten Client-Code ausliefern; diese Einschränkung ist der Web-Auslieferung von Ende-zu-Ende-Verschlüsselung inhärent.
- Es wird kein unabhängiges Sicherheitsaudit behauptet.

---

MIT License · Copyright (c) 2026 Wang Laoju
