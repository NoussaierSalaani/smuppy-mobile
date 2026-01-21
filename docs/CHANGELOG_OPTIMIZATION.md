# Changelog - Performance & Scalability Optimization

## Version 1.3.1 - 20 Janvier 2026

### State Management - Unified Onboarding Data Flow

**Synchronisation Zustand avec données onboarding pour les 3 types de compte.**

| Type de compte | Champs spécifiques |
|----------------|-------------------|
| `personal` | interests, dateOfBirth, gender |
| `pro_creator` | expertise, bio, website, socialLinks |
| `pro_local` | businessName, businessCategory, businessAddress, businessPhone |

**Problème résolu:**
- L'interface User de Zustand était trop simple (6 champs)
- UserContext avait tous les champs mais Zustand restait désynchronisé
- Les données onboarding n'étaient pas disponibles via Zustand

**Solution implémentée:**
- Interface User étendue dans `src/stores/index.ts` avec 25+ champs
- Synchronisation automatique dans `VerifyCodeScreen.tsx`
- Les deux stores (UserContext + Zustand) reçoivent les mêmes données

**Fichiers modifiés:**
| Fichier | Changements |
|---------|-------------|
| `src/stores/index.ts` | Interface User étendue avec tous les champs onboarding |
| `src/screens/auth/VerifyCodeScreen.tsx` | Ajout synchronisation Zustand après création profil |

**Interface User complète:**
```typescript
interface User {
  // Basic info
  id, firstName, lastName, fullName, displayName, username, email, avatar, coverImage, bio, location,
  // Personal info
  dateOfBirth, gender, accountType, isVerified, isPremium,
  // Onboarding data
  interests: string[], expertise: string[], website, socialLinks,
  // Business data
  businessName, businessCategory, businessAddress, businessPhone, locationsMode,
  // Stats
  stats: { fans, posts, following }
}
```

**Avantages:**
- ✅ État unifié entre UserContext et Zustand
- ✅ Toutes les données onboarding disponibles partout
- ✅ Support complet des 3 types de compte
- ✅ Zustand prêt pour future migration (performance)

---

## Version 1.3.0 - 20 Janvier 2026

### Design System - Unified Colors & Gradient

**Gradient et couleurs unifiés pour cohérence visuelle.**

| Élément | Ancienne Valeur | Nouvelle Valeur |
|---------|-----------------|-----------------|
| Gradient | `['#00B3C7', '#11E3A3', '#7BEDC6']` horizontal | `['#00B3C7', '#0EBF8A', '#72D1AD']` diagonal |
| Accent Color | `#11E3A3` (vif) | `#0EBF8A` (subtil, meilleure lisibilité) |
| Mint | `#7BEDC6` (flashy) | `#72D1AD` (doux) |
| Direction | Horizontal (x:0→1, y:0) | Diagonal (x:0→1, y:0→1) |

**Fichiers modifiés (38 fichiers):**
- `src/config/theme.ts` - GRADIENTS et COLORS
- Tous les écrans auth et onboarding
- Composants: Button, CooldownModal, Tag, Card
- Screens: Settings, Profile, Home

**Avantages:**
- ✅ Meilleure lisibilité texte blanc sur gradient
- ✅ Couleurs plus subtiles et professionnelles
- ✅ Gradient diagonal pour effet de profondeur
- ✅ Cohérence visuelle dans toute l'app

**Usage React Native:**
```javascript
import { GRADIENTS } from '../config/theme';

<LinearGradient
  colors={GRADIENTS.primary}  // ['#00B3C7', '#0EBF8A', '#72D1AD']
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 1 }}        // Diagonal!
  style={styles.button}
/>
```

---

## Version 1.2.1 - 12 Janvier 2026

### Sentry Error Tracking - Production Ready

**DSN configuré et activé en production.**

| Paramètre | Valeur |
|-----------|--------|
| Organisation | smuppy-inc |
| Projet | react-native |
| Dashboard | https://smuppy-inc.sentry.io |
| Status | ✅ Actif |

**Fichiers impliqués:**
| Fichier | Rôle |
|---------|------|
| `.env` | `SENTRY_DSN` ajouté |
| `src/lib/sentry.ts` | Configuration et helpers |
| `src/config/env.ts` | Expose `ENV.SENTRY_DSN` |
| `app.config.js` | Charge DSN via `extra.sentryDsn` |

**Fonctionnalités:**
- 📊 Crash reporting automatique
- 🔍 Stack traces avec source maps
- 👤 Contexte utilisateur (id, username)
- 📈 Performance monitoring (20% sampling)
- 🔔 Alertes configurables sur le dashboard
- ⚡ Désactivé automatiquement en Expo Go

**Usage:**
```javascript
import { captureException, setUserContext } from '../lib/sentry';

// Après login
setUserContext({ id: user.id, username: user.username });

// Capturer erreur
captureException(error, { screen: 'Profile', action: 'load' });
```

---

## Version 1.2.0 - 11 Janvier 2026

### Overview
Ajout des Push Notifications et du système de stockage média S3/CloudFront.

---

## New Features

### Push Notifications (Expo Notifications)

**Dependencies Added:**
```json
{
  "expo-notifications": "latest",
  "expo-device": "latest"
}
```

**Files Created:**
| File | Purpose |
|------|---------|
| `src/services/notifications.ts` | Service: permissions, tokens, listeners, badges |
| `src/hooks/useNotifications.ts` | React hook for components |

**Database Table:**
```sql
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  device_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Usage:**
```javascript
import { useNotifications } from '../hooks';
const { registerForPushNotifications, sendLocalNotification } = useNotifications();
await registerForPushNotifications();
```

---

### Media Upload (AWS S3 + CloudFront)

**Dependencies Added:**
```json
{
  "expo-image-manipulator": "latest",
  "expo-file-system": "latest"
}
```

**Files Created:**
| File | Purpose |
|------|---------|
| `src/services/mediaUpload.ts` | S3 upload with presigned URLs |
| `src/hooks/useMediaUpload.ts` | React hook for uploads |
| `src/utils/imageCompression.ts` | Image compression presets |
| `supabase/functions/media-presigned-url/index.ts` | Edge Function |

**Compression Presets:**
| Preset | Dimensions | Quality |
|--------|------------|---------|
| avatar | 400x400 | 80% |
| cover | 1200x600 | 85% |
| post | 1080x1350 | 85% |
| thumbnail | 300x300 | 70% |

**Usage:**
```javascript
import { useMediaUpload } from '../hooks';
const { uploadAvatarImage, progress, isUploading } = useMediaUpload();
const result = await uploadAvatarImage();
// result.cdnUrl = CloudFront URL
```

---

### Supabase Edge Functions

**Deployed Functions:**
| Function | Endpoint |
|----------|----------|
| `media-presigned-url` | `POST /functions/v1/media-presigned-url` |

**Secrets Configured:**
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION
- S3_BUCKET_NAME
- CLOUDFRONT_URL

---

## Files Modified

| File | Changes |
|------|---------|
| `App.js` | Added notification initialization |
| `src/hooks/index.ts` | Exports useMediaUpload, useNotifications |
| `src/config/env.js` | AWS variables |
| `app.config.js` | AWS env vars, notification config |
| `.env` | AWS credentials |

---

## Infrastructure Changes

### AWS S3
- Bucket: `smuppy-media`
- Region: `us-east-1`
- Folders: avatars, covers, posts, messages, thumbnails

### AWS CloudFront
- Distribution URL: `https://dc8kq67t0asis.cloudfront.net`
- Connected to S3 bucket

### Supabase Edge Functions
- Runtime: Deno
- Deployed: `media-presigned-url`

---

## Version 1.1.0 - Janvier 2026

### Overview
Optimisation complète de l'architecture pour supporter 2+ millions d'utilisateurs.

---

## Dependencies Added

```json
{
  "@tanstack/react-query": "^5.x",
  "zustand": "^5.x",
  "immer": "^10.x",
  "@shopify/flash-list": "^1.7.x",
  "expo-image": "^2.x",
  "@sentry/react-native": "^6.x",
  "@react-native-community/netinfo": "^11.x"
}
```

---

## New Files Created

### Library Configuration
| File | Purpose |
|------|---------|
| `src/lib/queryClient.js` | React Query client with caching, retry, offline support |
| `src/lib/sentry.js` | Sentry initialization and error tracking helpers |

### State Management
| File | Purpose |
|------|---------|
| `src/stores/index.js` | Zustand stores: useUserStore, useAppStore, useFeedStore, useAuthStore |

### Data Fetching
| File | Purpose |
|------|---------|
| `src/hooks/queries/index.js` | 20+ React Query hooks for all data operations |

### Optimized Components
| File | Purpose |
|------|---------|
| `src/components/OptimizedImage.js` | expo-image wrapper with 5 variants |
| `src/components/OptimizedList.js` | FlashList wrapper with 4 variants |

### Documentation
| File | Purpose |
|------|---------|
| `docs/ARCHITECTURE.md` | Complete architecture documentation |
| `docs/CHANGELOG_OPTIMIZATION.md` | This changelog |

---

## Files Modified

### Core App
| File | Changes |
|------|---------|
| `App.js` | Added QueryClientProvider, NetworkMonitor, Sentry.wrap(), rate limiter init |
| `app.config.js` | Added sentryDsn to expo.extra |

### Configuration
| File | Changes |
|------|---------|
| `src/config/env.js` | Added SENTRY_DSN, APP_VERSION |
| `.env.example` | Added SENTRY_DSN template |

### Services
| File | Changes |
|------|---------|
| `src/utils/apiClient.js` | SSL pinning, retry with exponential backoff, network check |
| `src/utils/rateLimiter.js` | Persistent storage with AsyncStorage, RATE_LIMITS config |

### Components
| File | Changes |
|------|---------|
| `src/components/ErrorBoundary.js` | Sentry.captureException integration |
| `src/components/index.js` | Added exports for OptimizedImage, OptimizedList |
| `src/hooks/index.js` | Added exports for all React Query hooks |

---

## Screen Migrations (FlatList → FlashList + Image → OptimizedImage)

### Profile Screens
| Screen | FlatList | Image | Status |
|--------|----------|-------|--------|
| ProfileScreen.js | ✅ Posts grid | ✅ Avatar, cover, thumbnails | Complete |
| FansListScreen.js | ✅ Fans list | ✅ All avatars | Complete |
| UserProfileScreen.js | - | ✅ Avatar, cover, thumbnails | Complete |
| PostDetailProfileScreen.js | ✅ Posts, comments | ✅ Media, avatars | Complete |

### Home Screens
| Screen | FlatList | Image | Status |
|--------|----------|-------|--------|
| FanFeed.js | ✅ Feed posts | ✅ All images, avatars | Complete |
| CreatePostScreen.js | ✅ Media grid | ✅ Thumbnails, preview | Complete |
| AddPostDetailsScreen.js | ✅ Media thumbnails | ✅ All images, avatars | Complete |
| PostDetailFanFeedScreen.js | ✅ Posts, comments | ✅ Media, avatars | Complete |
| PostDetailVibesFeedScreen.js | ✅ Comments | ✅ Media, grid, avatars | Complete |

### Messages Screens
| Screen | FlatList | Image | Status |
|--------|----------|-------|--------|
| MessagesScreen.js | ✅ Conversations | ✅ All avatars | Complete |
| ChatScreen.js | ✅ Messages | ✅ Avatars, images, links | Complete |

---

## Performance Improvements

### List Rendering
```
Before: FlatList (creates/destroys views on scroll)
After:  FlashList (recycles views, 10x faster)

Key changes:
- Added estimatedItemSize prop (required)
- Replaced columnWrapperStyle with numColumns
- Added recyclingKey for complex items
```

### Image Loading
```
Before: React Native Image (no caching)
After:  expo-image (memory + disk cache)

Key features:
- Blurhash placeholders (smooth loading)
- Priority levels (high/normal/low)
- Memory-disk caching policy
- Automatic format optimization
```

### API Caching
```
Before: No caching, API calls on every render
After:  React Query with intelligent caching

Configuration:
- staleTime: 5 minutes (data considered fresh)
- gcTime: 30 minutes (garbage collection)
- Automatic background refetch
- Optimistic updates for likes/follows
```

### State Management
```
Before: React Context (re-renders entire tree)
After:  Zustand (selective subscriptions)

Stores:
- useUserStore: Profile, preferences
- useAppStore: Online status, loading, errors
- useFeedStore: Scroll position, active tab
- useAuthStore: Authentication state
```

---

## Security Enhancements

### SSL Pinning
```javascript
// Prevents MITM attacks
const SSL_PINS = {
  'api.smuppy.com': ['sha256/...'],
};
```

### Persistent Rate Limiting
```javascript
// Survives app restarts
const RATE_LIMITS = {
  login: { max: 5, window: 15 * 60 * 1000 },
  signup: { max: 3, window: 60 * 60 * 1000 },
  // ... more limits
};
```

### Error Tracking
```javascript
// Sentry integration
Sentry.init({
  dsn: ENV.SENTRY_DSN,
  tracesSampleRate: 0.2, // 20% of transactions
  enableAutoSessionTracking: true,
});
```

---

## API Changes

### New Hooks Available
```javascript
// User
useCurrentProfile()
useProfile(userId)
useUpdateProfile()

// Posts
useFeedPosts(type)
useUserPosts(userId)
useCreatePost()
useDeletePost()

// Social
useIsFollowing(userId)
useFollowers(userId)
useFollowing(userId)
useToggleFollow()

// Engagement
useHasLiked(postId)
useToggleLike()
usePostComments(postId)
useAddComment()

// Reference
useInterests()
useExpertise()
useSaveInterests()

// Utilities
usePrefetchProfile(userId)
useInvalidateUserQueries()
```

### New Components Available
```javascript
// Images
import OptimizedImage, {
  AvatarImage,
  PostImage,
  BackgroundImage,
  ThumbnailImage
} from '../components/OptimizedImage';

// Lists
import OptimizedList, {
  FeedList,
  UserList,
  CommentList,
  GridList
} from '../components/OptimizedList';
```

---

## Breaking Changes

None. All changes are backward compatible.

---

## Migration Guide

### Using New Image Components
```javascript
// Before
import { Image } from 'react-native';
<Image source={{ uri: url }} style={styles.avatar} />

// After
import { AvatarImage } from '../components/OptimizedImage';
<AvatarImage source={url} size={40} />
```

### Using New List Components
```javascript
// Before
import { FlatList } from 'react-native';
<FlatList
  data={posts}
  renderItem={renderPost}
  keyExtractor={(item) => item.id}
/>

// After
import { FlashList } from '@shopify/flash-list';
<FlashList
  data={posts}
  renderItem={renderPost}
  keyExtractor={(item) => item.id}
  estimatedItemSize={200}  // Required!
/>
```

### Using React Query Hooks
```javascript
// Before
const [posts, setPosts] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetchPosts().then(setPosts).finally(() => setLoading(false));
}, []);

// After
const { data: posts, isLoading } = useFeedPosts('fan');
```

---

## Testing

### Build Verification
```bash
npx expo export --platform ios
# Success: Bundled 2233 modules in 7474ms
```

### Recommended Tests
1. Scroll performance in long lists
2. Image loading in slow network
3. Offline mode behavior
4. Rate limiting triggers
5. Error boundary catches

---

## Next Steps

1. TypeScript migration (type safety)
2. Unit tests for hooks
3. E2E tests with Detox
4. Performance monitoring dashboard
5. A/B testing framework

---

*Changelog generated: January 2026*
