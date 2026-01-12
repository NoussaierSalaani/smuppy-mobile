# Smuppy Mobile - Quick Reference Guide

> Dernière mise à jour: 11 janvier 2026

## État Actuel de l'Infrastructure

### ✅ Optimisé pour 2M+ Utilisateurs

| Composant | Technologie | Status |
|-----------|-------------|--------|
| Lists | @shopify/flash-list | ✅ 10x faster |
| Images | expo-image | ✅ Cached |
| API Cache | React Query | ✅ 5min stale |
| State | Zustand | ✅ Optimized |
| Errors | Sentry | ✅ Tracking |
| Security | SSL Pinning | ✅ Protected |
| Rate Limit | AsyncStorage | ✅ Persistent |
| Offline | NetInfo | ✅ Supported |
| **Push** | **Expo Notifications** | ✅ **Active** |
| **Media** | **S3 + CloudFront** | ✅ **CDN** |

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

```javascript
import { captureError, setUserContext } from '../lib/sentry';

// Capture error with context
captureError(error, { screen: 'ProfileScreen', action: 'loadProfile' });

// Set user context (after login)
setUserContext({ id: user.id, email: user.email });
```

---

## Configuration Required

### Environment Variables (.env)

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
GOOGLE_API_KEY=xxx
API_URL_DEV=http://localhost:3000/api
API_URL_PROD=https://api.smuppy.com/api
APP_ENV=dev
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### Sentry Setup

1. Create project at sentry.io
2. Get DSN
3. Add to .env
4. Errors auto-captured!

---

## File Locations

```
src/
├── components/
│   ├── OptimizedImage.js    ← Use these!
│   └── OptimizedList.js     ← Use these!
├── hooks/
│   ├── queries/index.js     ← React Query hooks
│   ├── useMediaUpload.ts    ← S3 upload hook
│   ├── useNotifications.ts  ← Push notifications hook
│   └── index.ts             ← All exports
├── services/
│   ├── notifications.ts     ← Push notification service
│   └── mediaUpload.ts       ← S3 upload service
├── stores/
│   └── index.js             ← Zustand stores
├── lib/
│   ├── queryClient.js       ← Query config
│   └── sentry.js            ← Error tracking
└── utils/
    ├── imageCompression.ts  ← Image compression
    ├── apiClient.js         ← SSL pinning
    └── rateLimiter.js       ← Rate limits

supabase/
└── functions/
    └── media-presigned-url/ ← Edge Function
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

*Quick Reference v1.2 - 11 Janvier 2026*
