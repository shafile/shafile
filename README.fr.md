![Affiche promotionnelle Shafile](docs/poster.png)

<center>

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · **Français** · [Deutsch](README.de.md) · [हिन्दी](README.hi.md) · [Español (México)](README.es-MX.md)

</center>

## 1. Introduction

Shafile est un outil de partage de fichiers et de textes chiffré de bout en bout. Le contenu est chiffré dans le navigateur et le serveur ne stocke que du texte chiffré. Il prend en charge les limites de consultation, le début et l’expiration programmés, l’accès par mot de passe et l’effacement après lecture.

## 2. Installation et utilisation

### Prérequis

- Node.js 24+ (testé sur Node 26)
- pnpm
- HTTPS en production

### Exécution locale

```bash
pnpm install
pnpm dev
```

Ouvrez <http://localhost:3000>. Le premier démarrage crée :

- `data/shafile.db` : métadonnées SQLite
- `data/blobs/` : stockage du texte chiffré
- `data/.secrets.json` : secrets de signature pour le développement

### Utilisation

1. Sur la page d’accueil, choisissez **Créer**, saisissez un texte ou sélectionnez un fichier.
2. Configurez le mode d’accès, les heures de début et d’expiration, ainsi que la limite de consultations.
3. Créez le partage et copiez le lien. En mode mot de passe, transmettez le mot de passe par un autre canal.
4. Le destinataire ouvre le lien dans son navigateur pour déchiffrer et consulter ou télécharger le contenu.

### Déploiement en production

```bash
pnpm build
pnpm start
```

Placez un reverse proxy tel que Caddy ou Nginx devant `127.0.0.1:3000` et activez HTTPS :

```caddyfile
shafile.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Définissez explicitement `TICKET_SECRET` et `IP_HASH_SECRET` en production, et `TRUST_PROXY=true` derrière un proxy. Arrêtez le service avant de sauvegarder `data/`. L’application est actuellement conçue pour une instance unique (SQLite, limitation en mémoire et suivi des téléchargements actifs).

### Docker

Le dépôt contient un `Dockerfile` multi-étapes et un fichier `docker-compose.yml`.

```bash
docker compose up --build -d
```

L’application est disponible sur `http://localhost:3000`. Les données sont conservées dans le volume `shafile-data`. En production, définissez explicitement `TICKET_SECRET` et `IP_HASH_SECRET`, puis ajustez les limites et `TRUST_PROXY` si nécessaire. L’image utilise la sortie standalone de Next.js et expose un contrôle de santé `/api/health`.

### CI

GitHub Actions (`.github/workflows/ci.yml`) exécute lint, vérification des types, vérification i18n, tests unitaires, build de production, tests E2E Playwright et build de l’image Docker.

### Variables d’environnement

| Variable | Valeur par défaut | Description |
| --- | --- | --- |
| `SHAFILE_DATA_DIR` | `./data` | Racine des données |
| `DATABASE_PATH` | `$DATA_DIR/shafile.db` | Chemin SQLite |
| `BLOB_DIR` | `$DATA_DIR/blobs` | Répertoire du texte chiffré |
| `TICKET_SECRET` | généré automatiquement | Secret HMAC des jetons d’accès |
| `IP_HASH_SECRET` | généré automatiquement | Secret de hachage IP pour la limitation |
| `MAX_SHARE_BYTES` | 5 GiB | Limite par fichier |
| `MAX_STORAGE_BYTES` | 50 GiB | Limite de stockage totale |
| `TRUST_PROXY` | `false` | `true` derrière un reverse proxy |

### Commandes

```bash
pnpm dev          # Serveur de développement
pnpm build        # Build de production
pnpm start        # Serveur de production
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test         # Tests unitaires
pnpm test:e2e     # Tests E2E Playwright
pnpm i18n:check   # Vérification des clés et placeholders
```

Playwright nécessite `pnpm exec playwright install chromium` au premier lancement. Le téléchargement en streaming des gros fichiers est optimal dans les navigateurs Chromium comme Chrome et Edge. Les autres navigateurs utilisent un déchiffrement en mémoire limité à 256 MiB.

## 3. Divulgation du chiffrement

### Périmètre

Shafile chiffre le contenu des fichiers et des notes dans le navigateur avant tout envoi. Le serveur ne stocke que le texte chiffré, les métadonnées chiffrées et le minimum de métadonnées opérationnelles nécessaires à l’application des règles d’accès.

### Primitives cryptographiques

- **Chiffrement du contenu** : AES-256-GCM via l’API Web Crypto.
- **KDF du mot de passe** : Argon2id avec 64 MiB de mémoire, 3 itérations, 1 voie et une sortie de 32 octets.
- **Dérivation de clés** : HKDF-SHA-256 avec séparation de domaines (`shafile/v1/wrap`, `shafile/v1/auth`).
- **Intégrité** : balises d’authentification AES-GCM et SHA-256 du manifest en clair.

### Gestion des clés

- **Mode lien** : une clé de contenu aléatoire de 32 octets est encodée dans le fragment d’URL (`/s/{id}#k=...`). Les fragments ne sont pas envoyés au serveur.
- **Mode mot de passe** : la clé de contenu est enveloppée avec une clé dérivée du mot de passe. Le serveur ne stocke que le sel, la clé enveloppée, le nonce, les paramètres KDF et un vérificateur de la clé d’authentification. Il ne reçoit jamais le mot de passe ni la clé de contenu.
- Le mot de passe dérive deux valeurs séparées par domaine : `authKey` pour l’autorisation et `wrapKey` pour le déballage. Connaître `authKey` ne permet pas de déchiffrer le contenu.

### Format de fichier

```
header   = "SHF1" | chunkSize(u32) | noncePrefix(8B) | fileId(16B)
part[i]  = len(u32) | AES-GCM(plaintextChunk_i)
manifest = len(u32) | AES-GCM(JSON{name,mime,size,sha256,chunkCount})
```

Le nonce de chaque bloc est `noncePrefix || u32be(index)`. L’AAD lie le hash de l’en-tête, l’identifiant du partage, l’index du bloc et l’indicateur de dernier bloc. Le nom, le type MIME, la taille, le SHA-256 et le nombre de blocs sont stockés dans le manifest chiffré. Le texte utilise un seul enregistrement AES-GCM avec la même clé de contenu.

### Application des accès et visibilité serveur

Le serveur peut voir la taille du texte chiffré, les heures de création et d’accès, le nombre d’accès, la fenêtre temporelle, la présence d’un mot de passe et la limite de consultations. Il ne voit ni les noms de fichiers, ni le contenu, ni les mots de passe, ni les clés. Le début, l’expiration et les limites de consultations sont appliqués de façon atomique ; le texte chiffré est supprimé lorsque le partage est épuisé, révoqué ou expiré.

### Limites de sécurité

- Le destinataire peut copier, capturer ou transférer le contenu déchiffré. Ce n’est pas du DRM.
- La clé du lien peut fuiter via l’historique du navigateur, le presse-papiers, les QR codes, les captures d’écran ou les journaux côté destinataire.
- Une XSS ou une extension de navigateur malveillante peut lire le contenu déchiffré. Le projet réduit ce risque avec CSP, l’absence de scripts tiers et un assainissement strict de Markdown.
- Un serveur compromis peut servir du code client modifié ; c’est une limite intrinsèque du chiffrement de bout en bout livré via le Web.
- Aucun audit de sécurité indépendant n’est revendiqué.

---

MIT License · Copyright (c) 2026 Wang Laoju
