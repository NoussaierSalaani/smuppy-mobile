# Smuppy Mobile - Quick Reference Guide

> Dernière mise à jour: 24 janvier 2026

## État Actuel de l'Infrastructure

### ✅ Optimisé pour 2M+ Utilisateurs

| Composant | Technologie | Status |
|-----------|-------------|--------|
| **Backend** | **AWS (Aurora + Lambda + Cognito)** | ✅ **Migré** |
| Lists | @shopify/flash-list | ✅ 10x faster |
| Images | expo-image | ✅ Cached |
| API Cache | React Query | ✅ 5min stale |
| State | Zustand | ✅ Optimized |
| **Errors** | **Sentry** | ✅ **[Dashboard](https://smuppy-inc.sentry.io)** |
| Security | SSL Pinning | ✅ Protected |
| Rate Limit | AsyncStorage | ✅ Persistent |
| Offline | NetInfo | ✅ Supported |
| **Push** | **Expo Notifications** | ✅ **Active** |
| **Media** | **S3 + CloudFront** | ✅ **CDN** |
| **UI Design** | **iOS 18 Liquid Glass** | ✅ **Implemented** |

---

## 🆕 iOS 18 Liquid Glass Design System

### LiquidTabs Component
```typescript
import { LiquidTabs, LiquidTabsWithMore } from '../components/LiquidTabs';

// Basic usage
<LiquidTabs
  tabs={[
    { key: 'fan', label: 'Fan' },
    { key: 'vibes', label: 'Vibes' },
    { key: 'xplorer', label: 'Xplorer' },
  ]}
  activeTab={activeTab}
  onTabChange={(key) => setActiveTab(key)}
  size="medium"      // 'small' | 'medium' | 'large'
  fullWidth={true}   // true = full width, false = compact
  variant="glass"    // 'glass' | 'solid' | 'minimal'
/>

// With extra tabs (shows +more button)
<LiquidTabsWithMore
  tabs={primaryTabs}
  extraTabs={extraTabs}
  activeTab={activeTab}
  onTabChange={handleTabChange}
  onMorePress={() => setShowModal(true)}
/>
```

### GlassButton Component
```typescript
import { GlassButton } from '../components/GlassButton';

<GlassButton
  label="Action"
  icon="add"
  onPress={handlePress}
  variant="primary"  // 'default' | 'primary' | 'secondary' | 'pill'
  size="medium"      // 'small' | 'medium' | 'large'
  active={isActive}
/>
```

### Design Features
- Frosted glass effect (BlurView)
- Water drop animation (spring physics)
- Haptic feedback on interaction
- Gradient indicator with glow effect

---

## Quick Code Examples

### 1. Push Notifications

```javascript
import { useNotifications } from '../hooks';

const { registerForPushNotifications, sendLocalNotification } = useNotifications();

// Register on app start
await registerForPushNotifications();

// Send local notification
sendLocalNotification('Titre', 'Corps du message', { screen: 'Profile' });
```

### 2. Media Upload (S3 + CloudFront)

```javascript
import { useMediaUpload } from '../hooks';

const { uploadAvatarImage, uploadPostMedia, progress, isUploading } = useMediaUpload();

// Upload avatar (auto-compressed to 400x400)
const result = await uploadAvatarImage();
if (result) {
  console.log('CDN URL:', result.cdnUrl);
  // Save result.cdnUrl to profile
}

// Upload post media (auto-compressed to 1080x1350)
const postResult = await uploadPostMedia();
```

### 3. Images (use these instead of React Native Image)

```javascript
import OptimizedImage, { AvatarImage, PostImage } from '../components/OptimizedImage';

// Avatar (circular, 40px)
<AvatarImage source={user.avatar} size={40} />

// Post image (maintains aspect ratio)
<PostImage source={post.thumbnail} aspectRatio={16/9} />

// Generic image
<OptimizedImage source={url} style={styles.image} />
```

### 4. Lists (use FlashList, NOT FlatList)

```javascript
import { FlashList } from '@shopify/flash-list';

<FlashList
  data={items}
  renderItem={renderItem}
  estimatedItemSize={100}  // ⚠️ REQUIRED!
  keyExtractor={(item) => item.id}
/>
```

### 5. Data Fetching (use React Query hooks)

```javascript
import { useFeedPosts, useToggleLike, useProfile } from '../hooks';

// Get feed posts (auto-cached)
const { data, isLoading, fetchNextPage } = useFeedPosts('fan');

// Like a post (optimistic update)
const { mutate: toggleLike } = useToggleLike();
toggleLike({ postId: post.id, liked: isLiked });

// Get user profile
const { data: profile } = useProfile(userId);
```

### 6. State Management (use Zustand stores)

```javascript
import { useUserStore, useAppStore } from '../stores';

// Get user profile
const profile = useUserStore(state => state.profile);

// Check online status
const isOnline = useAppStore(state => state.isOnline);

// Update preferences
const updatePreferences = useUserStore(state => state.updatePreferences);
updatePreferences({ theme: 'dark' });
```

### 7. Error Tracking (Sentry)

**Dashboard:** https://smuppy-inc.sentry.io

```javascript
import {
  captureException,
  captureMessage,
  setUserContext,
  addBreadcrumb
} from '../lib/sentry';

// Capture error with context
captureException(error, { screen: 'ProfileScreen', action: 'loadProfile' });

// Set user context (after login)
setUserContext({ id: user.id, username: user.username });

// Add breadcrumb for debugging
addBreadcrumb('Button clicked', 'user-action', { buttonId: 'submit' });

// Capture message
captureMessage('Payment completed', 'info', { amount: 99.99 });
```

**Note:** Sentry est désactivé en Expo Go. Utilise `npx expo run:ios` pour le tracking complet.

---

## Configuration Required

### Environment Variables (.env)

```env
# Supabase (legacy - being migrated)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx

# AWS (new backend)
AWS_REGION=us-east-1
AWS_API_GATEWAY_URL=https://xxx.execute-api.us-east-1.amazonaws.com/prod
AWS_COGNITO_USER_POOL_ID=us-east-1_xxx
AWS_COGNITO_CLIENT_ID=xxx

# Other
GOOGLE_API_KEY=xxx
APP_ENV=dev
SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

## 🆕 AWS Backend Architecture

### Services migrated to AWS
| Service | AWS Technology | Status |
|---------|---------------|--------|
| Database | Aurora PostgreSQL | ✅ Migrated |
| Auth | Cognito | ✅ Active |
| API | API Gateway + Lambda | ✅ Active |
| Storage | S3 + CloudFront | ✅ Active |

### Backend Toggle
```typescript
// src/services/backend.ts
export const USE_AWS = true;  // Toggle between AWS and Supabase

// Usage is transparent - same API:
import { getFeedPosts, likePost } from '../services/database';
```

### API Endpoints (API Gateway)
- `GET /posts` - Feed posts
- `GET /profiles/{id}` - User profile
- `POST /posts/{id}/like` - Like post
- `POST /follows` - Follow user
- `GET /messages` - Conversations

### Sentry Setup

| Paramètre | Valeur |
|-----------|--------|
| Organisation | smuppy-inc |
| Projet | react-native |
| Dashboard | https://smuppy-inc.sentry.io |
| Status | ✅ Actif |

**Fichiers:**
- `src/lib/sentry.ts` - Config & helpers
- `src/config/env.ts` - `ENV.SENTRY_DSN`
- `app.config.js` - Charge depuis `.env`

---

## File Locations

```
src/
├── components/
│   ├── OptimizedImage.js    ← Use these!
│   ├── OptimizedList.js     ← Use these!
│   ├── LiquidTabs.tsx       ← iOS 18 Liquid Glass tabs
│   ├── GlassButton.tsx      ← iOS 18 Glass button
│   └── HomeHeader.tsx       ← Main header with tabs
├── hooks/
│   ├── queries/index.js     ← React Query hooks
│   ├── useMediaUpload.ts    ← S3 upload hook
│   ├── useNotifications.ts  ← Push notifications hook
│   └── index.ts             ← All exports
├── services/
│   ├── backend.ts           ← AWS/Supabase toggle
│   ├── aws-api.ts           ← AWS API Gateway client
│   ├── aws-auth.ts          ← AWS Cognito auth
│   ├── database.ts          ← Unified database API
│   ├── notifications.ts     ← Push notification service
│   └── mediaUpload.ts       ← S3 upload service
├── config/
│   └── aws-config.ts        ← AWS configuration
├── stores/
│   └── index.js             ← Zustand stores
├── lib/
│   ├── queryClient.js       ← Query config
│   └── sentry.js            ← Error tracking
└── utils/
    ├── imageCompression.ts  ← Image compression
    ├── apiClient.js         ← SSL pinning
    └── rateLimiter.js       ← Rate limits

aws-migration/
├── lambda/                  ← Lambda functions
├── infrastructure/          ← CloudFormation/CDK
└── scripts/                 ← Migration scripts
```

---

## Rate Limits (per user)

| Action | Limit | Window |
|--------|-------|--------|
| Login | 5 | 15 min |
| Signup | 3 | 1 hour |
| Post | 10 | 1 hour |
| Comment | 30 | 1 hour |
| Like | 100 | 1 hour |
| Follow | 50 | 1 hour |
| Message | 60 | 1 hour |
| Upload | 20 | 1 hour |
| Report | 5 | 24 hours |

---

## Performance Tips

### DO ✅

```javascript
// Use FlashList with estimatedItemSize
<FlashList estimatedItemSize={100} ... />

// Use AvatarImage for circular images
<AvatarImage source={url} size={40} />

// Use React Query hooks
const { data } = useFeedPosts();

// Use Zustand for local state
const theme = useUserStore(s => s.preferences.theme);
```

### DON'T ❌

```javascript
// Don't use FlatList
<FlatList ... />  // ❌ Use FlashList

// Don't use React Native Image
<Image source={{ uri }} ... />  // ❌ Use OptimizedImage

// Don't fetch in useEffect
useEffect(() => { fetch... }, []);  // ❌ Use React Query

// Don't use Context for frequent updates
<ThemeContext.Provider>  // ❌ Use Zustand
```

---

## Common Hooks

### Data Hooks (React Query)
| Hook | Returns | Usage |
|------|---------|-------|
| `useCurrentProfile()` | `{ data, isLoading }` | Current user |
| `useFeedPosts(type)` | `{ data, fetchNextPage }` | Infinite feed |
| `useToggleLike()` | `{ mutate }` | Like/unlike |
| `useToggleFollow()` | `{ mutate }` | Follow/unfollow |
| `usePostComments(id)` | `{ data }` | Comments list |

### Media & Notifications Hooks
| Hook | Returns | Usage |
|------|---------|-------|
| `useMediaUpload()` | `{ uploadAvatarImage, progress, isUploading }` | S3 upload |
| `useNotifications()` | `{ registerForPushNotifications, sendLocalNotification }` | Push |

---

## Troubleshooting

### FlashList Warning: "estimatedItemSize not provided"
```javascript
// Add estimatedItemSize prop
<FlashList estimatedItemSize={100} ... />
```

### Images not caching
```javascript
// Check source format
<OptimizedImage source={url} />  // string
<OptimizedImage source={{ uri: url }} />  // object - both work
```

### React Query not updating
```javascript
// Invalidate queries manually
import { useQueryClient } from '@tanstack/react-query';
const queryClient = useQueryClient();
queryClient.invalidateQueries(['feed']);
```

---

## TestFlight Deployment

### Build & Submit
```bash
# Build for iOS
eas build --platform ios --profile production

# Submit to TestFlight
eas submit --platform ios --latest
```

### App Store Connect
- **App ID:** 6757627406
- **Bundle ID:** com.nou09.Smuppy
- **TestFlight:** https://appstoreconnect.apple.com/apps/6757627406/testflight/ios

### EAS Configuration (eas.json)
```json
{
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "6757627406"
      }
    }
  }
}
```

---

*Quick Reference v2.0.0 - 24 Janvier 2026*
