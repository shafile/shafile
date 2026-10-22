![Shafile 홍보 포스터](docs/poster.png)

<center>

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · **한국어** · [Русский](README.ru.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [हिन्दी](README.hi.md) · [Español (México)](README.es-MX.md)

</center>

## 1. 소개

Shafile은 종단간 암호화 파일 및 텍스트 공유 도구입니다. 콘텐츠는 브라우저에서 암호화되며 서버에는 암호문만 저장됩니다. 조회 횟수 제한, 예약 시작과 만료, 비밀번호 접근, 읽은 뒤 삭제를 지원합니다.

## 2. 설치 및 사용

### 요구 사항

- Node.js 24 이상 (Node 26에서 검증)
- pnpm
- 프로덕션 환경에서는 HTTPS

### 로컬 실행

```bash
pnpm install
pnpm dev
```

<http://localhost:3000>을 엽니다. 처음 실행하면 다음이 생성됩니다.

- `data/shafile.db`: SQLite 메타데이터
- `data/blobs/`: 암호문 저장소
- `data/.secrets.json`: 개발용 서명 비밀

### 사용 방법

1. 홈에서 **만들기**를 선택하고 텍스트를 입력하거나 파일을 선택합니다.
2. 접근 방식, 시작 및 만료 시간, 조회 횟수를 설정합니다.
3. 공유를 만들고 링크를 복사합니다. 비밀번호 모드라면 비밀번호를 다른 경로로 전달합니다.
4. 받는 사람은 브라우저에서 링크를 열어 복호화한 뒤 보거나 다운로드합니다.

### 프로덕션 배포

```bash
pnpm build
pnpm start
```

Caddy 또는 Nginx 같은 리버스 프록시를 `127.0.0.1:3000` 앞에 두고 HTTPS를 활성화합니다.

```caddyfile
shafile.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

프로덕션에서는 `TICKET_SECRET`과 `IP_HASH_SECRET`을 명시적으로 설정하고, 프록시 뒤에서는 `TRUST_PROXY=true`를 설정하세요. `data/`를 백업하기 전에 서비스를 중지하세요. 현재 앱은 단일 인스턴스 설계입니다(SQLite, 메모리 기반 요청 제한, 활성 다운로드 추적).

### Docker

저장소에는 멀티스테이지 `Dockerfile`과 `docker-compose.yml`이 포함되어 있습니다.

```bash
docker compose up --build -d
```

`http://localhost:3000`에서 사용할 수 있습니다. 데이터는 `shafile-data` 볼륨에 저장됩니다. 프로덕션에서는 `TICKET_SECRET`과 `IP_HASH_SECRET`을 명시적으로 설정하고 필요에 따라 제한과 `TRUST_PROXY`를 조정하세요. 이미지는 Next.js standalone 출력을 사용하며 `/api/health` 상태 확인을 제공합니다.

### CI

GitHub Actions(`.github/workflows/ci.yml`)는 lint, 타입 검사, i18n 검사, 단위 테스트, 프로덕션 빌드, Playwright E2E, Docker 이미지 빌드를 실행합니다.

### 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `SHAFILE_DATA_DIR` | `./data` | 데이터 루트 |
| `DATABASE_PATH` | `$DATA_DIR/shafile.db` | SQLite 경로 |
| `BLOB_DIR` | `$DATA_DIR/blobs` | 암호문 디렉터리 |
| `TICKET_SECRET` | 자동 생성 | 액세스 토큰 HMAC 비밀 |
| `IP_HASH_SECRET` | 자동 생성 | 요청 제한 IP 해시 비밀 |
| `MAX_SHARE_BYTES` | 5 GiB | 파일당 제한 |
| `MAX_STORAGE_BYTES` | 50 GiB | 전체 저장 공간 제한 |
| `TRUST_PROXY` | `false` | 리버스 프록시 뒤에서는 `true` |

### 명령어

```bash
pnpm dev          # 개발 서버
pnpm build        # 프로덕션 빌드
pnpm start        # 프로덕션 서버
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test         # 단위 테스트
pnpm test:e2e     # Playwright E2E 테스트
pnpm i18n:check   # 메시지 키와 플레이스홀더 검사
```

Playwright를 처음 실행하려면 `pnpm exec playwright install chromium`이 필요합니다. 큰 파일의 스트리밍 다운로드는 Chrome, Edge 등 Chromium 브라우저에서 가장 좋습니다. 다른 브라우저는 메모리 내 복호화로 대체하며 제한은 256 MiB입니다.

## 3. 암호화 공개

### 범위

Shafile은 업로드 전에 브라우저에서 파일과 노트 내용을 암호화합니다. 서버는 암호문, 암호화된 메타데이터, 그리고 접근 규칙을 적용하는 데 필요한 최소한의 운영 메타데이터만 저장합니다.

### 암호화 프리미티브

- **콘텐츠 암호화**: Web Crypto API를 통한 AES-256-GCM.
- **비밀번호 KDF**: Argon2id, 메모리 64 MiB, 반복 3회, 1 레인, 32바이트 출력.
- **키 유도**: HKDF-SHA-256, 도메인 분리 라벨(`shafile/v1/wrap`, `shafile/v1/auth`) 사용.
- **무결성**: AES-GCM 인증 태그와 평문 manifest에 대한 SHA-256.

### 키 관리

- **링크 모드**: 무작위 32바이트 콘텐츠 키를 URL 프래그먼트(`/s/{id}#k=...`)에 인코딩합니다. 프래그먼트는 서버로 전송되지 않습니다.
- **비밀번호 모드**: 콘텐츠 키를 비밀번호에서 파생한 키로 감쌉니다. 서버는 salt, 감싼 키, nonce, KDF 매개변수, 비밀번호 인증 키 검증자만 저장하며 비밀번호나 콘텐츠 키는 받지 않습니다.
- 비밀번호는 도메인이 분리된 두 값, 즉 권한 부여용 `authKey`와 풀기용 `wrapKey`를 파생합니다. `authKey`를 알아도 콘텐츠를 복호화할 수 없습니다.

### 파일 형식

```
header   = "SHF1" | chunkSize(u32) | noncePrefix(8B) | fileId(16B)
part[i]  = len(u32) | AES-GCM(plaintextChunk_i)
manifest = len(u32) | AES-GCM(JSON{name,mime,size,sha256,chunkCount})
```

각 청크의 nonce는 `noncePrefix || u32be(index)`입니다. AAD는 헤더 해시, 공유 ID, 청크 번호, 마지막 청크 플래그를 바인딩합니다. 파일 이름, MIME 형식, 크기, SHA-256, 청크 수는 암호화된 manifest에 저장됩니다. 텍스트는 같은 콘텐츠 키를 사용하는 단일 AES-GCM 레코드를 사용합니다.

### 접근 제어와 서버 가시성

서버는 암호문 크기, 생성 및 접근 시간, 접근 횟수, 시간 범위, 비밀번호 설정 여부, 조회 제한을 볼 수 있습니다. 파일 이름, 내용, 비밀번호, 키는 볼 수 없습니다. 시작 시간, 만료 시간, 조회 횟수는 원자적으로 적용되며, 공유가 소진되거나 취소되거나 만료되면 암호문이 삭제됩니다.

### 보안 경계

- 받는 사람은 복호화된 내용을 복사, 캡처 또는 전달할 수 있습니다. 이는 DRM이 아닙니다.
- 링크 키는 브라우저 기록, 클립보드, QR 코드, 스크린샷 또는 수신 측 로그를 통해 유출될 수 있습니다.
- XSS 또는 악성 브라우저 확장 프로그램은 복호화된 내용을 읽을 수 있습니다. 이 프로젝트는 CSP, 서드파티 스크립트 미사용, 엄격한 Markdown 정제로 위험을 줄입니다.
- 침해된 서버는 수정된 클라이언트 코드를 제공할 수 있습니다. 이는 웹으로 전달되는 종단간 암호화의 본질적인 한계입니다.
- 독립적인 보안 감사를 받았다고 주장하지 않습니다.

---

MIT License · Copyright (c) 2026 Wang Laoju
