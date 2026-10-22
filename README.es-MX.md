![Póster promocional de Shafile](docs/poster.png)

<center>

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [हिन्दी](README.hi.md) · **Español (México)**

</center>

## 1. Introducción

Shafile es una herramienta para compartir archivos y textos con cifrado de extremo a extremo. El contenido se cifra en el navegador y el servidor solo guarda texto cifrado. Admite límites de visualizaciones, inicio y vencimiento programados, acceso con contraseña y borrado después de leer.

## 2. Instalación y uso

### Requisitos

- Node.js 24+ (probado en Node 26)
- pnpm
- HTTPS en producción

### Ejecutar en local

```bash
pnpm install
pnpm dev
```

Abre <http://localhost:3000>. El primer inicio crea:

- `data/shafile.db`: metadatos SQLite
- `data/blobs/`: almacenamiento de texto cifrado
- `data/.secrets.json`: secretos de firma para desarrollo

### Cómo usarlo

1. En la página de inicio, elige **Crear** e ingresa texto o selecciona un archivo.
2. Configura el modo de acceso, las horas de inicio y vencimiento, y el límite de visualizaciones.
3. Crea el enlace y cópialo. En modo contraseña, envía la contraseña por otro canal.
4. La persona que lo recibe abre el enlace en su navegador para descifrar y ver o descargar el contenido.

### Despliegue en producción

```bash
pnpm build
pnpm start
```

Coloca un proxy inverso como Caddy o Nginx delante de `127.0.0.1:3000` y activa HTTPS:

```caddyfile
shafile.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Define explícitamente `TICKET_SECRET` e `IP_HASH_SECRET` en producción, y `TRUST_PROXY=true` detrás de un proxy. Detén el servicio antes de respaldar `data/`. La aplicación está diseñada para una sola instancia (SQLite, límites en memoria y seguimiento de descargas activas).

### Docker

El repositorio incluye un `Dockerfile` multi-etapa y `docker-compose.yml`.

```bash
docker compose up --build -d
```

La app está disponible en `http://localhost:3000`. Los datos se guardan en el volumen `shafile-data`. En producción define explícitamente `TICKET_SECRET` e `IP_HASH_SECRET`, y ajusta los límites y `TRUST_PROXY` según sea necesario. La imagen usa la salida standalone de Next.js y expone una comprobación de salud en `/api/health`.

### CI

GitHub Actions (`.github/workflows/ci.yml`) ejecuta lint, verificación de tipos, comprobación de i18n, pruebas unitarias, build de producción, pruebas E2E con Playwright y la construcción de la imagen Docker.

### Variables de entorno

| Variable | Valor predeterminado | Descripción |
| --- | --- | --- |
| `SHAFILE_DATA_DIR` | `./data` | Raíz de datos |
| `DATABASE_PATH` | `$DATA_DIR/shafile.db` | Ruta de SQLite |
| `BLOB_DIR` | `$DATA_DIR/blobs` | Directorio de texto cifrado |
| `TICKET_SECRET` | generado automáticamente | Secreto HMAC de tokens de acceso |
| `IP_HASH_SECRET` | generado automáticamente | Secreto de hash de IP para límites |
| `MAX_SHARE_BYTES` | 5 GiB | Límite por archivo |
| `MAX_STORAGE_BYTES` | 50 GiB | Límite total de almacenamiento |
| `TRUST_PROXY` | `false` | `true` detrás de un proxy inverso |

### Comandos

```bash
pnpm dev          # Servidor de desarrollo
pnpm build        # Compilación de producción
pnpm start        # Servidor de producción
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test         # Pruebas unitarias
pnpm test:e2e     # Pruebas E2E con Playwright
pnpm i18n:check   # Verificación de claves y marcadores
```

Playwright requiere `pnpm exec playwright install chromium` la primera vez. La descarga en streaming de archivos grandes funciona mejor en navegadores Chromium como Chrome y Edge. Otros navegadores usan descifrado en memoria con un límite de 256 MiB.

## 3. Divulgación del cifrado

### Alcance

Shafile cifra el contenido de archivos y notas en el navegador antes de cualquier carga. El servidor solo guarda el texto cifrado, los metadatos cifrados y los metadatos operativos mínimos necesarios para aplicar las reglas de acceso.

### Primitivas criptográficas

- **Cifrado de contenido:** AES-256-GCM mediante Web Crypto API.
- **KDF de contraseña:** Argon2id con 64 MiB de memoria, 3 iteraciones, 1 carril y salida de 32 bytes.
- **Derivación de claves:** HKDF-SHA-256 con separación de dominios (`shafile/v1/wrap`, `shafile/v1/auth`).
- **Integridad:** etiquetas de autenticación AES-GCM y SHA-256 sobre el manifest en claro.

### Gestión de claves

- **Modo enlace:** una clave de contenido aleatoria de 32 bytes se codifica en el fragmento de la URL (`/s/{id}#k=...`). Los fragmentos no se envían al servidor.
- **Modo contraseña:** la clave de contenido se envuelve con una clave derivada de la contraseña. El servidor solo guarda la sal, la clave envuelta, el nonce, los parámetros KDF y un verificador de la clave de autenticación; nunca recibe la contraseña ni la clave de contenido.
- La contraseña deriva dos valores separados por dominio: `authKey` para autorización y `wrapKey` para desenvolver. Conocer `authKey` no permite descifrar el contenido.

### Formato de archivo

```
header   = "SHF1" | chunkSize(u32) | noncePrefix(8B) | fileId(16B)
part[i]  = len(u32) | AES-GCM(plaintextChunk_i)
manifest = len(u32) | AES-GCM(JSON{name,mime,size,sha256,chunkCount})
```

El nonce de cada bloque es `noncePrefix || u32be(index)`. El AAD vincula el hash del encabezado, el id del enlace, el índice del bloque y la marca del último bloque. El nombre, el tipo MIME, el tamaño, el SHA-256 y el número de bloques se guardan en el manifest cifrado. El texto usa un único registro AES-GCM con la misma clave de contenido.

### Aplicación de accesos y visibilidad del servidor

El servidor puede ver el tamaño del texto cifrado, las horas de creación y acceso, el número de accesos, la ventana temporal, si hay contraseña y el límite de visualizaciones. No puede ver nombres de archivo, contenido, contraseñas ni claves. El inicio, el vencimiento y los límites de visualizaciones se aplican de forma atómica; el texto cifrado se elimina cuando un enlace se agota, se revoca o vence.

### Límites de seguridad

- Quien recibe el enlace puede copiar, capturar o reenviar el contenido descifrado. Esto no es DRM.
- La clave del enlace puede filtrarse por el historial del navegador, el portapapeles, los códigos QR, las capturas de pantalla o los registros del destinatario.
- XSS o una extensión maliciosa del navegador pueden leer el contenido descifrado. El proyecto reduce este riesgo con CSP, sin scripts de terceros y sanitización estricta de Markdown.
- Un servidor comprometido puede entregar código de cliente modificado; esta es una limitación intrínseca del cifrado de extremo a extremo distribuido por la web.
- No se afirma haber recibido una auditoría de seguridad independiente.

---

MIT License · Copyright (c) 2026 Wang Laoju
