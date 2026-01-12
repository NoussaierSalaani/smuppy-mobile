# SMUPPY - Documentation Technique

> Dernière mise à jour: 11 janvier 2026

## Table des Matières

1. [Stack Technique](#stack-technique)
2. [Architecture](#architecture)
3. [Push Notifications](#push-notifications)
4. [Media Upload (S3 + CloudFront)](#media-upload-s3--cloudfront)
5. [Supabase Edge Functions](#supabase-edge-functions)
6. [Variables d'Environnement](#variables-denvironnement)
7. [Hooks Disponibles](#hooks-disponibles)
8. [Services](#services)

---

## Stack Technique

| Catégorie | Technologie | Version |
|-----------|-------------|---------|
| Framework | React Native + Expo | SDK 52 |
| Backend | Supabase | - |
| State Management | Zustand | - |
| Data Fetching | React Query (TanStack) | v5 |
| Storage Media | AWS S3 + CloudFront | - |
| Notifications | Expo Notifications | - |
| Navigation | React Navigation | v6 |
| Listes | FlashList | - |
| Images | expo-image | - |

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
```

### Accès dans le code

```javascript
import { ENV } from '../config/env';

console.log(ENV.SUPABASE_URL);
console.log(ENV.CLOUDFRONT_URL);
```

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
