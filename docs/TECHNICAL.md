# SMUPPY - Documentation Technique

> Dernière mise à jour: 20 janvier 2026 (align état réel auth/navigation + roadmap MVP)

## Table des Matières

1. [Stack Technique](#stack-technique)
2. [Architecture](#architecture)
3. [Sécurité (Score 9.5/10)](#sécurité-score-9510)
4. [Push Notifications](#push-notifications)
5. [Media Upload (S3 + CloudFront)](#media-upload-s3--cloudfront)
6. [Supabase Edge Functions](#supabase-edge-functions)
7. [Variables d'Environnement](#variables-denvironnement)
8. [Sentry Error Tracking](#sentry-error-tracking)
9. [Hooks Disponibles](#hooks-disponibles)
10. [Services](#services)
11. [Database Schema](#database-schema)

---

## Stack Technique

| Catégorie | Technologie | Version |
|-----------|-------------|---------|
| Framework | React Native + Expo | SDK 54 |
| Backend | Supabase | - |
| State Management | Zustand | v5 |
| Data Fetching | React Query (TanStack) | v5 |
| Storage Media | AWS S3 + CloudFront | - |
| Notifications | Expo Notifications | - |
| Navigation | React Navigation | v6 |
| Listes | FlashList | - |
| Images | expo-image | - |
| Error Tracking | Sentry | v7.8 |

---

## Architecture

```
src/
├── components/          # Composants UI réutilisables
├── config/              # Configuration (env, supabase, api)
├── context/             # React Context (Auth, Theme)
├── hooks/               # Hooks personnalisés
│   ├── index.ts         # Export centralisé
│   ├── queries/         # React Query hooks
│   ├── useMediaUpload.ts
│   ├── useNotifications.ts
│   └── usePreventDoubleClick.ts
├── navigation/          # Configuration navigation
├── screens/             # Écrans de l'app
├── services/            # Services externes
│   ├── notifications.ts # Push notifications
│   └── mediaUpload.ts   # Upload S3
├── stores/              # Zustand stores
├── theme/               # Design tokens
└── utils/               # Utilitaires
    └── imageCompression.ts

supabase/
├── config.toml          # Config Supabase CLI
├── functions/           # Edge Functions
│   └── media-presigned-url/
│       └── index.ts
└── migrations/          # Migrations SQL
```

---

## Sécurité (état courant)

### Vue d'ensemble

| Fonctionnalité | Status | Description |
|----------------|--------|-------------|
| Auth via Edge Functions | ✅ | `auth-login` / `auth-signup` / `auth-reset` appelés côté mobile (fetch vers functions) |
| CORS / HTTPS | ✅ | App mobile ne fait que du HTTPS; `apiClient` bloque HTTP non sûr |
| Rate limiting côté client | ✅ | `checkAWSRateLimit` appelé avant login/signup/forgot/resend OTP |
| Rate limiting côté serveur | 🟡 | Edge Functions protégées, quotas exacts à reconfirmer en prod |
| Email vérifié requis | ✅ | `AppNavigator` route vers `EmailVerificationPendingScreen` si `email_confirmed_at` absent |
| Onboarding | 🟡 | Parcours post-signup (EnableBiometric → onboarding → Success) avant Main; non forcé pour un login existant |
| Recovery flow | ✅ | Forgot/Reset/NewPassword restent dans Auth; Main jamais monté sans session + email vérifié |
| Anti double-submit (auth) | 🟡 | Couvert: VerifyCodeScreen, ResetCodeScreen, NewPasswordScreen (usePreventDoubleNavigation). Boutons disabled via `loading`: LoginScreen, SignupScreen, ForgotPasswordScreen, EnableBiometricScreen. Reste à couvrir: autres boutons réseau auth/onboarding |
| Stockage tokens | ✅ | `expo-secure-store` (storage ACCESS/REFRESH_TOKEN) |
| Sentry | 🟡 | Initialisé via `initSentry`, désactivé sur Expo Go; nécessite DSN en `.env` |
| Modération (report/block) | ❌ | Pas de flux de report/block/mute en prod; `ReportProblemScreen` (settings) en placeholder |

### Navigation & écrans (état réel)
- **AppNavigator**: rend Main uniquement si `session` + `email_confirmed_at`; sinon Auth ou EmailVerificationPending.
- **Tabs MainNavigator**: Home (Fan/Vibes/Xplorer), Peaks, CreateTab, Notifications, Profile.
- **Feeds**: FanFeed + VibesFeed en mock; PostDetailFanFeedScreen/PostDetailVibesFeedScreen présents; XplorerFeed = carte (react-native-maps) avec filtres max 3, markers mock.
- **Peaks**: PeaksFeedScreen + PeakViewScreen + CreatePeakScreen/PeakPreview (mock data).
- **Onboarding**: screens TellUsAboutYou, AccountType, Interests, Profession/BusinessDetails, Expertise, Guidelines, Success; déclenché après signup → EnableBiometric.
- **Modération/Trust & Safety**: pas de block/mute/report post; Guidelines mentionne le report; Settings inclut `ReportProblemScreen` (TODO backend).

### Rate Limiting Server-Side

**Table PostgreSQL:** `rate_limits`

```sql
CREATE TABLE rate_limits (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  endpoint TEXT NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW()
);
```

**Limites par endpoint:**

| Edge Function | Limite | Fenêtre |
|---------------|--------|---------|
| `media-presigned-url` | 100 req | 1 minute |
| `send-notification` | 50 req | 1 minute |
| `send-push-notification` | 50 req | 1 minute |

**Fonction PostgreSQL:** `check_rate_limit(user_id, endpoint, max_requests, window_minutes)`

### Validation Fichiers Server-Side

**Types autorisés:**

| Type MIME | Extensions | Taille max |
|-----------|------------|------------|
| `image/jpeg` | jpg, jpeg | 10 MB |
| `image/png` | png | 10 MB |
| `image/webp` | webp | 10 MB |
| `image/gif` | gif | 10 MB |
| `video/mp4` | mp4 | 100 MB |
| `video/quicktime` | mov | 100 MB |
| `video/x-m4v` | m4v | 100 MB |

**Dossiers whitelist:** `avatars`, `covers`, `posts`, `messages`, `thumbnails`

### Certificate Pinning

**Fichiers:**
- `src/utils/certificatePinning.ts` - Module JS avec pins SHA-256
- `android/app/src/main/res/xml/network_security_config.xml` - Config native Android
- `AndroidManifest.xml` - Référence vers network_security_config

**Domains pinnés:**
- `wbgfaeytioxnkdsuvvlx.supabase.co` (Supabase)
- `cloudfront.net` (CloudFront CDN)
- `exp.host` (Expo Push)
- `sentry.io` (Sentry)

### HTTPS Enforcement

**Fichier:** `src/utils/apiClient.ts`

```javascript
// HTTP bloqué en production
// Localhost autorisé uniquement en développement
const isSecureUrl = (url) => {
  if (url.protocol === 'https:') return true;
  if (ENV.isDev && hostname === 'localhost') return true;
  return false;
};
```

### CORS Whitelist (Edge Functions)

```typescript
const ALLOWED_ORIGINS = [
  'https://smuppy.com',
  'https://www.smuppy.com',
  'https://app.smuppy.com',
  'http://localhost:8081',  // Expo dev
  'http://localhost:19006', // Expo web
];
```

### Fichiers de Sécurité

| Fichier | Description |
|---------|-------------|
| `src/utils/apiClient.ts` | Client API avec HTTPS enforcement, host validation, cert pinning |
| `src/utils/certificatePinning.ts` | Module certificate pinning avec pins SHA-256 |
| `src/utils/rateLimiter.js` | Rate limiting côté client (backup) |
| `src/utils/secureStorage.ts` | Wrapper expo-secure-store |
| `android/.../network_security_config.xml` | Config certificate pinning Android |
| `supabase/migrations/20260112_rate_limiting.sql` | Table et fonction rate_limits |
| `supabase/migrations/20260112_device_sessions.sql` | Tables device_sessions et device_alert_logs |
| `supabase/functions/send-new-device-alert/` | Edge Function alertes nouvel appareil |
| `src/services/deviceSession.ts` | Service tracking des appareils |
| `src/screens/auth/EmailVerificationPendingScreen.tsx` | Écran vérification email obligatoire |

### Account Security (Nouveau)

#### Email Verification Required

L'accès à l'app est bloqué tant que l'email n'est pas confirmé:

- **Mobile:** `AppNavigator.js` vérifie `session.user.email_confirmed_at`
- **Web:** `ProtectedRoute.tsx` redirige vers `/verify-email-pending`
- **Écran dédié:** `EmailVerificationPendingScreen` avec polling auto (5s)

#### Device Session Tracking

**Table PostgreSQL:** `device_sessions`

```sql
CREATE TABLE device_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  device_id TEXT NOT NULL,
  device_name TEXT,
  device_type TEXT,     -- 'mobile', 'web', 'tablet'
  platform TEXT,        -- 'ios', 'android', 'web'
  ip_address INET,
  country TEXT,
  city TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ
);
```

**Fonctions RPC:**
- `register_device_session()` - Enregistre un appareil à la connexion
- `get_user_devices()` - Liste les appareils actifs de l'utilisateur
- `revoke_device_session()` - Révoque l'accès d'un appareil

#### New Device Login Alerts

**Edge Function:** `send-new-device-alert`

- Envoie un email via Resend API lors d'une nouvelle connexion
- Rate limited: 5 alertes/heure/utilisateur
- Inclut: appareil, localisation (IP), heure de connexion
- Table `device_alert_logs` pour l'audit trail

#### Password Reset Security

Messages génériques pour éviter l'énumération d'emails:
- "Si un compte existe avec cet email, tu recevras un lien de réinitialisation."
- Même message en cas de succès ou d'erreur
- OTP 6 chiffres via Supabase Auth

---

## Push Notifications

### Stack
- `expo-notifications` - Gestion des notifications
- `expo-device` - Détection appareil physique
- Supabase - Stockage des tokens

### Fichiers
- `src/services/notifications.ts` - Service principal
- `src/hooks/useNotifications.ts` - Hook React

### Configuration requise

**app.config.js:**
```javascript
{
  plugins: [
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#11E3A3"
      }
    ]
  ]
}
```

### Table Supabase

```sql
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  device_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id);
```

### Utilisation

```javascript
import { useNotifications } from '../hooks';

const MyComponent = () => {
  const {
    expoPushToken,
    registerForPushNotifications,
    sendLocalNotification
  } = useNotifications();

  useEffect(() => {
    registerForPushNotifications();
  }, []);

  const notify = () => {
    sendLocalNotification(
      'Titre',
      'Corps du message',
      { customData: 'value' }
    );
  };
};
```

### Envoyer depuis le serveur

```javascript
// POST https://exp.host/--/api/v2/push/send
{
  "to": "ExponentPushToken[xxxxxx]",
  "title": "Nouveau message",
  "body": "Tu as reçu un message",
  "data": { "screen": "Messages", "id": "123" }
}
```

---

## Media Upload (S3 + CloudFront)

### Stack
- AWS S3 - Stockage des fichiers
- AWS CloudFront - CDN pour distribution
- Supabase Edge Function - Génération URLs presignées
- `expo-image-manipulator` - Compression images
- `expo-file-system` - Accès fichiers

### Fichiers
- `src/services/mediaUpload.ts` - Service upload
- `src/hooks/useMediaUpload.ts` - Hook React
- `src/utils/imageCompression.ts` - Compression
- `supabase/functions/media-presigned-url/index.ts` - Edge Function

### Configuration AWS

**Bucket S3:** `smuppy-media`
**Region:** `us-east-1`
**CloudFront:** `https://dc8kq67t0asis.cloudfront.net`

**Politique IAM requise:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::smuppy-media/*"
    }
  ]
}
```

### Dossiers autorisés
- `avatars/` - Photos de profil
- `covers/` - Images de couverture
- `posts/` - Médias des publications
- `messages/` - Médias des messages
- `thumbnails/` - Vignettes vidéo

### Types de fichiers autorisés
- Images: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Vidéos: `video/mp4`, `video/quicktime`, `video/x-m4v`

### Presets de compression

| Preset | Dimensions | Qualité | Usage |
|--------|------------|---------|-------|
| avatar | 400x400 | 80% | Photos de profil |
| cover | 1200x600 | 85% | Images de couverture |
| post | 1080x1350 | 85% | Publications |
| thumbnail | 300x300 | 70% | Vignettes |

### Utilisation

```javascript
import { useMediaUpload } from '../hooks';

const ProfileScreen = () => {
  const {
    uploadAvatarImage,
    uploadCover,
    uploadPostMedia,
    progress,
    isUploading,
    error
  } = useMediaUpload();

  // Upload avatar (avec compression automatique)
  const handleAvatarChange = async () => {
    const result = await uploadAvatarImage();
    if (result) {
      console.log('Avatar URL:', result.cdnUrl);
      // Sauvegarder result.cdnUrl dans le profil
    }
  };

  // Upload image de couverture
  const handleCoverChange = async () => {
    const result = await uploadCover();
    if (result) {
      console.log('Cover URL:', result.cdnUrl);
    }
  };

  // Upload média pour un post
  const handlePostMedia = async () => {
    const result = await uploadPostMedia();
    if (result) {
      console.log('Post media URL:', result.cdnUrl);
    }
  };

  return (
    <View>
      <Button
        onPress={handleAvatarChange}
        disabled={isUploading}
      >
        {isUploading ? `Upload ${progress}%` : 'Changer avatar'}
      </Button>
      {error && <Text style={{ color: 'red' }}>{error}</Text>}
    </View>
  );
};
```

### Flux d'upload

```
1. Utilisateur sélectionne une image
         ↓
2. Compression (si image)
         ↓
3. Appel Edge Function → URL presignée
         ↓
4. Upload direct vers S3
         ↓
5. Retour URL CloudFront
```

---

## Supabase Edge Functions

### Fonctions déployées

| Fonction | Endpoint | Description |
|----------|----------|-------------|
| `media-presigned-url` | `/functions/v1/media-presigned-url` | Génère URLs presignées S3 |
| `send-notification` | `/functions/v1/send-notification` | Envoie push notifications via Expo |

### send-notification API

**Request:**
```json
POST /functions/v1/send-notification
{
  "type": "new_like",
  "recipient_id": "user-uuid",
  "data": {
    "sender_id": "sender-uuid",
    "sender_name": "John Doe",
    "sender_avatar": "https://...",
    "post_id": "post-uuid"
  }
}
```

**Types supportés:**
| Type | Description | Data requise |
|------|-------------|--------------|
| `new_like` | Quelqu'un a liké un post | sender_id, sender_name, post_id |
| `new_follow` | Quelqu'un a follow un user | sender_id, sender_name |
| `new_message` | Nouveau message reçu | sender_id, sender_name, message_preview |
| `new_comment` | Nouveau commentaire | sender_id, sender_name, post_id, comment_text |

**Response:**
```json
{
  "success": true,
  "sent": 2,
  "failed": 0,
  "results": [...]
}
```

### Database Triggers

Les notifications sont envoyées automatiquement via des triggers SQL:

| Table | Trigger | Action |
|-------|---------|--------|
| `likes` | `on_new_like` | Notifie le propriétaire du post |
| `follows` | `on_new_follow` | Notifie l'utilisateur suivi |
| `messages` | `on_new_message` | Notifie le destinataire |
| `comments` | `on_new_comment` | Notifie le propriétaire du post |

### Secrets configurés

```bash
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
S3_BUCKET_NAME
CLOUDFRONT_URL
```

### Déploiement

```bash
# Login
supabase login

# Lier le projet
supabase link --project-ref wbgfaeytioxnkdsuvvlx

# Définir les secrets
supabase secrets set KEY=value

# Déployer une fonction
supabase functions deploy media-presigned-url

# Voir les logs
supabase functions logs media-presigned-url
```

---

## Variables d'Environnement

### Fichier `.env`

```bash
# Supabase
SUPABASE_URL=https://wbgfaeytioxnkdsuvvlx.supabase.co
SUPABASE_ANON_KEY=eyJ...

# Google APIs
GOOGLE_API_KEY=AIza...

# Backend API
API_URL_DEV=http://localhost:3000/api
API_URL_PROD=https://api.smuppy.com/api

# Environment
APP_ENV=dev

# AWS S3 & CloudFront
AWS_REGION=us-east-1
S3_BUCKET_NAME=smuppy-media
CLOUDFRONT_URL=https://dc8kq67t0asis.cloudfront.net
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# Sentry Error Tracking
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

### Accès dans le code

```javascript
import { ENV } from '../config/env';

console.log(ENV.SUPABASE_URL);
console.log(ENV.CLOUDFRONT_URL);
console.log(ENV.SENTRY_DSN);
```

---

## Sentry Error Tracking

### Configuration

| Paramètre | Valeur |
|-----------|--------|
| **Organisation** | smuppy-inc |
| **Projet** | react-native |
| **Dashboard** | https://smuppy-inc.sentry.io |
| **Status** | ✅ Actif en production |

### Fichiers

| Fichier | Description |
|---------|-------------|
| `src/lib/sentry.ts` | Configuration et helpers Sentry |
| `src/config/env.ts` | Expose `ENV.SENTRY_DSN` |
| `app.config.js` | Charge `SENTRY_DSN` depuis `.env` |

### Initialisation

Sentry est initialisé automatiquement au démarrage de l'app dans `App.js`:

```javascript
import { initSentry, setUserContext } from './src/lib/sentry';

// Initialize Sentry early (before any other code)
initSentry();
```

### Configuration Sentry

```javascript
// src/lib/sentry.ts
Sentry.init({
  dsn: ENV.SENTRY_DSN,
  environment: ENV.APP_ENV,              // 'dev', 'staging', 'production'
  tracesSampleRate: 0.2,                 // 20% des transactions en prod
  profilesSampleRate: 0.1,               // 10% des profils en prod
  enableAutoSessionTracking: true,
  attachStacktrace: true,

  // Erreurs ignorées
  ignoreErrors: [
    'Network request failed',
    'Failed to fetch',
    'AbortError',
  ],
});
```

### Utilisation

```javascript
import {
  captureException,
  captureMessage,
  setUserContext,
  addBreadcrumb
} from '../lib/sentry';

// Capturer une erreur avec contexte
try {
  await riskyOperation();
} catch (error) {
  captureException(error, {
    screen: 'ProfileScreen',
    action: 'loadProfile'
  });
}

// Définir le contexte utilisateur (après login)
setUserContext({
  id: user.id,
  username: user.username
});

// Ajouter un breadcrumb pour debugging
addBreadcrumb('User clicked buy button', 'user-action', {
  productId: '123'
});

// Capturer un message
captureMessage('Payment completed', 'info', {
  amount: 99.99
});
```

### Expo Go Limitation

Sentry nécessite des modules natifs qui ne sont pas disponibles dans Expo Go. Le code gère automatiquement ce cas:

```javascript
const isExpoGo = Constants.appOwnership === 'expo';

if (isExpoGo) {
  console.log('Sentry disabled in Expo Go');
  return;
}
```

**Pour le tracking d'erreurs complet**, utilise un development build:
```bash
npx expo run:ios
# ou
npx expo run:android
```

### Dashboard Sentry

Accès: https://smuppy-inc.sentry.io

Fonctionnalités disponibles:
- 📊 Crash reports en temps réel
- 🔍 Stack traces détaillées
- 👤 Contexte utilisateur
- 📈 Performance monitoring
- 🔔 Alertes configurables

---

## Hooks Disponibles

### UI Hooks
| Hook | Description |
|------|-------------|
| `usePreventDoubleClick` | Empêche les doubles clics |
| `usePreventDoubleNavigation` | Empêche la double navigation |

### Media Hooks
| Hook | Description |
|------|-------------|
| `useMediaUpload` | Upload média vers S3 |
| `useNotifications` | Gestion push notifications |

### Data Hooks (React Query)
| Hook | Description |
|------|-------------|
| `useCurrentProfile` | Profil de l'utilisateur connecté |
| `useProfile(id)` | Profil d'un utilisateur |
| `useUpdateProfile` | Mise à jour profil |
| `useFeedPosts` | Posts du feed (infinite scroll) |
| `useUserPosts(id)` | Posts d'un utilisateur |
| `useCreatePost` | Créer un post |
| `useDeletePost` | Supprimer un post |
| `useHasLiked(postId)` | Vérifier si liké |
| `useToggleLike` | Like/Unlike |
| `useIsFollowing(userId)` | Vérifier si follow |
| `useFollowers(userId)` | Liste followers |
| `useFollowing(userId)` | Liste following |
| `useToggleFollow` | Follow/Unfollow |
| `usePostComments(postId)` | Commentaires d'un post |
| `useAddComment` | Ajouter commentaire |
| `useInterests` | Liste des intérêts |
| `useExpertise` | Liste des expertises |
| `useSaveInterests` | Sauvegarder intérêts |

---

## Services

### notifications.ts

```javascript
import { NotificationService } from '../services/notifications';

// Demander permissions
const token = await NotificationService.registerForPushNotifications();

// Envoyer notification locale
await NotificationService.sendLocalNotification(title, body, data);

// Sauvegarder token en base
await NotificationService.saveTokenToDatabase(userId, token);

// Supprimer token
await NotificationService.removeTokenFromDatabase(userId);

// Mettre à jour badge
await NotificationService.setBadgeCount(5);
await NotificationService.clearBadge();
```

### mediaUpload.ts

```javascript
import {
  uploadMediaToS3,
  uploadAvatar,
  uploadCoverImage,
  uploadPostImage
} from '../services/mediaUpload';

// Upload générique
const result = await uploadMediaToS3(fileUri, 'posts', 'image/jpeg');

// Upload avatar (avec compression)
const avatarUrl = await uploadAvatar(imageUri);

// Upload couverture
const coverUrl = await uploadCoverImage(imageUri);

// Upload post
const postUrl = await uploadPostImage(imageUri);
```

---

## Database Schema

### Tables

| Table | Colonnes |
|-------|----------|
| `posts` | id, author_id, media_url, media_type, caption, visibility, location, likes_count, comments_count, created_at, updated_at |
| `comments` | id, user_id, post_id, peak_id, parent_comment_id, text, likes_count, created_at |
| `likes` | id, user_id, post_id, peak_id, created_at |
| `follows` | follower_id, following_id, created_at |
| `messages` | id, sender_id, receiver_id, text, media_url, is_read, created_at |
| `push_tokens` | id, user_id, token, platform, device_name, created_at, updated_at |
| `notification_logs` | id, recipient_id, type, success, error, metadata, created_at |

### Indexes (Performance)

```sql
-- Posts
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_author_id ON posts(author_id);

-- Likes
CREATE INDEX idx_likes_post_id ON likes(post_id);
CREATE INDEX idx_likes_user_id ON likes(user_id);

-- Follows
CREATE INDEX idx_follows_follower_id ON follows(follower_id);
CREATE INDEX idx_follows_following_id ON follows(following_id);

-- Comments
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);

-- Messages
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_receiver_id ON messages(receiver_id);

-- Push Tokens
CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id);
```

### Triggers (Notifications automatiques)

| Table | Trigger | Action |
|-------|---------|--------|
| `likes` | `on_new_like` | Notifie le propriétaire du post |
| `follows` | `on_new_follow` | Notifie l'utilisateur suivi |
| `messages` | `on_new_message` | Notifie le destinataire |
| `comments` | `on_new_comment` | Notifie le propriétaire du post |

---

## Expo / Metro (cohérence)
- Un seul Metro en parallèle.
- Expo Go: `npx expo start -c`
- Dev build: `npx expo start -c --dev-client`
- Fermer l'app avant un nouveau scan (QR/dev-client).
- Si Wi‑Fi/5G change: `npx expo start --tunnel -c`

## Priorités actuelles (MVP)
1) Stabiliser les flows UI + navigation (Home tabs, Peaks, Profile, Settings).  
2) Compléter l’anti spam-click sur les boutons réseau restants (auth/onboarding + actions post).  
3) UI polish (couleurs/typo) plus tard.

## Roadmap produit (phases)
- **PHASE 0 — Foundations**: auth + security + anti-spam click.
- **PHASE 1 — Core Feeds**: Fan + Vibes masonry + post focus 60% + actions like/save/share/+Fan/report.
- **PHASE 2 — Comments**: Peas de commentaires; replies fans-only.
- **PHASE 3 — Modération launch-safe**: reports, block/mute, statuts active/limited/under_review/hidden/removed; tolérance zéro thèmes interdits.
- **PHASE 4 — Explorer MVP**: spots verified-only, places pro premium, search + filtres max 3, pas d’import.
- **PHASE 5+ — Extensions**: algo avancé, mood soft, events, pro schedules, tracking opt-in, ads.

## Launch Readiness (mobile)
- **Secrets/env**: `.env` sans secrets en clair; `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SENTRY_DSN`, `APP_ENV` présents.
- **Build**: dev-client obligatoire pour valider Sentry/modules natifs (`npx expo start --dev-client`).
- **Sentry**: envoyer un event de test dans le dev-client; vérifier réception.
- **Auth/Onboarding smoke**: login, signup → verify → onboarding complet; forgot → otp → reset; resend OTP; logout purge SecureStore; Main absent si email non vérifié.
- **Rate limit**: tenter brute-force rapide login/signup/forgot → réponses génériques, pas de crash.
- **Logs**: pas de token en clair; vérifier console + Sentry breadcrumbs.
- **Git workflow**: avant push/commit → `git status -sb`, `git diff`; après commit → `git show --name-only --oneline -1`.

---

## Commandes Utiles

```bash
# Démarrer l'app
npx expo start

# Build iOS
npx expo run:ios

# Build Android
npx expo run:android

# Build EAS
eas build --platform ios
eas build --platform android

# Mise à jour OTA
eas update --branch production

# Logs Supabase
supabase functions logs media-presigned-url --tail
```

---

## Prochaines Étapes Possibles (reclassées)

**Pré-launch (priorité)**  
- [ ] Compléter l’anti double-submit sur tous les écrans auth réseau  
- [ ] Vérifier Sentry DSN + envoyer un event de test depuis un dev-client  
- [ ] Checklist secrets/env + smoke tests AUTH/onboarding

**Post-launch**  
- [ ] Deep Linking (liens universels)  
- [ ] Dark Mode  
- [ ] Internationalisation (i18n)  
- [ ] Analytics (Mixpanel/Amplitude)  
- [ ] Offline Mode  
- [ ] Flows de modération/report si requis produit

---

*Documentation générée pour le projet SMUPPY Mobile*
