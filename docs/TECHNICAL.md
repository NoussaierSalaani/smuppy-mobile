# SMUPPY - Documentation Technique

> Dernière mise à jour: 12 janvier 2026

## Table des Matières

1. [Stack Technique](#stack-technique)
2. [Architecture](#architecture)
3. [Push Notifications](#push-notifications)
4. [Media Upload (S3 + CloudFront)](#media-upload-s3--cloudfront)
5. [Supabase Edge Functions](#supabase-edge-functions)
6. [Variables d'Environnement](#variables-denvironnement)
7. [Sentry Error Tracking](#sentry-error-tracking)
8. [Hooks Disponibles](#hooks-disponibles)
9. [Services](#services)
10. [Database Schema](#database-schema)

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

## Prochaines Étapes Possibles

- [ ] Deep Linking (liens universels)
- [ ] Dark Mode
- [ ] Internationalisation (i18n)
- [ ] Tests unitaires et E2E
- [ ] Analytics (Mixpanel/Amplitude)
- [ ] Offline Mode

---

*Documentation générée pour le projet SMUPPY Mobile*
