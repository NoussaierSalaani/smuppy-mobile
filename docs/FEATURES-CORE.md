# Core Systems — Strict Rules

> **Parent**: [FEATURES.md](./FEATURES.md) | **Sibling**: [FEATURES-FEEDS.md](./FEATURES-FEEDS.md) | **Read BEFORE modifying any core system.**

---

## 1. Auth & Session Management

**File**: `src/services/aws-auth.ts`

### Token Storage
- **ALL tokens stored in SecureStore** (encrypted keychain on iOS/Android)
- NEVER store tokens in AsyncStorage, React state, or global variables
- Keys: `aws_access_token`, `aws_refresh_token`, `aws_id_token`, `aws_user_profile`

### Token Refresh
- **60-second buffer**: Token considered expired if < 60s remaining
- This prevents race conditions where token expires mid-request
- Refresh happens automatically before API calls via `getValidToken()`

### STRICT: Network vs Auth Error Distinction
```
Network error during refresh → KEEP session alive (offline support)
Auth error during refresh (revoked/expired) → CLEAR session, redirect to login
```
Getting this wrong breaks "Remember Me" on cold start or offline scenarios.

### Cognito Client Lazy-Loading
```typescript
// CORRECT — lazy load inside function
async function refreshToken() {
  const { CognitoIdentityProviderClient } = await import('@aws-sdk/client-cognito-identity-provider');
  // ...
}

// WRONG — module-level import (crashes before crypto polyfill is ready)
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
```

### Session State Listeners
- `notifyAuthStateChange(null)` MUST be called when session is cleared
- This triggers AppNavigator to redirect to login screen
- Without this, UI stays on main screen with dead session

### Sign-Up Flow
```
1. Try server-side API first (handles unconfirmed users)
2. If 404 or network error → fall back to direct Cognito SignUpCommand
3. If 400 (validation error) → throw (don't fall back)
```

---

## 2. Navigation Structure

**File**: `src/navigation/MainNavigator.tsx`, `AppNavigator.tsx`

### Screen Hierarchy
```
AppNavigator
├── Auth Stack (not logged in)
│   ├── Welcome
│   ├── Login
│   ├── Signup
│   ├── ForgotPassword
│   ├── ResetCode
│   ├── NewPassword
│   └── EmailVerificationPending
└── Main Stack (logged in)
    ├── Tabs
    │   ├── Home (FeedScreen → FanFeed / VibesFeed / XplorerFeed)
    │   ├── CreatePost (modal)
    │   ├── Peaks
    │   ├── Notifications
    │   └── Profile
    ├── UserProfile
    ├── ChatScreen
    ├── PostDetail*
    ├── PeakView
    ├── Settings/*
    └── ... (40+ screens)
```

### STRICT Rules
- New screens MUST be wired in 3 files simultaneously:
  1. `src/screens/<category>/index.ts` — export
  2. `src/types/index.ts` — add to `MainStackParamList`
  3. `src/navigation/MainNavigator.tsx` — import + `<Stack.Screen>`
- Lazy-loaded screens use `LazyScreen` wrapper with ErrorBoundary
- Deep screens (Chat, PostDetail) are eagerly imported for instant nav

### Badge Counts
- Fetched at module level in MainNavigator (outside hooks)
- Updates Zustand stores directly (`tabBarStore`)
- Polling interval: every 30s for notifications, every 60s for messages
- MUST stay outside hooks to avoid React ordering issues

---

## 3. Stores (Zustand)

### userStore (`src/stores/userStore.ts`)
- **Persisted** to AsyncStorage
- Holds: user profile, accountType, stats, settings
- `isPro()` → checks `pro_creator` or `pro_business`
- `isProfileComplete()` → checks required fields
- Cleared on sign-out

### feedStore (`src/stores/feedStore.ts`)
- **NOT persisted** (rebuilds from API)
- `optimisticLikes`: `Record<postId, boolean>` — like overrides from detail screens
- `optimisticPeakLikes`: same for peaks
- `clearOptimisticLikes(ids)` — clear after applying to feed state
- `feedCache` with `lastFetchTime` for staleness (5-min TTL)

### vibeStore (`src/stores/vibeStore.ts`)
- **Persisted** to AsyncStorage (partialize middleware)
- Tracks: vibeScore, vibeLevel, actionHistory, streaks, badges, ripples

#### Action Points (DO NOT CHANGE without updating this doc)
```
post:                  10 pts
like:                   1 pt
share:                  3 pts
save:                   2 pts
daily_login:            5 pts
streak_bonus:          10 pts (7+ consecutive days)
prescription_complete: 15 pts
explore_spot:           8 pts
join_event:            12 pts
follow_user:            2 pts
```

#### Level Thresholds (DO NOT CHANGE)
```
newcomer:     0 pts
explorer:    20 pts
contributor: 80 pts
influencer: 200 pts
legend:     500 pts
```

#### Max Sizes
- actionHistory: 200 entries (trimmed FIFO)
- ripple entries: 100 entries (trimmed FIFO)

### contentStore (`src/stores/contentStore.ts`)
- Tracks reported posts/peaks/users
- Max 500 cached items (trimmed FIFO)
- Methods: `submitPostReport()`, `submitPeakReport()`, `hasUserReportedPost()`

### userSafetyStore (`src/stores/userSafetyStore.ts`)
- Tracks muted and blocked users
- `isHidden(userId)` — returns true if muted OR blocked
- Used by feed filters to hide content

---

## 4. Follow System

**File**: `src/services/database.ts`

### STRICT: Cache Invalidation After Follow
```typescript
// After follow/unfollow, ALWAYS clear feed cache
import('../../stores/feedStore').then(m => m.useFeedStore.getState().clearFeed());
```
Without this, new follows' posts don't appear in FanFeed.

### Cooldown System
- 2+ unfollows → blocked from following for 7 days
- API returns: `{ blocked: true, until: string, daysRemaining: number }`
- Frontend MUST check `result.cooldown?.blocked` and show message
- 429 responses include cooldown data in error body

### Optimistic Follow State
- Follow button updates immediately (optimistic)
- Grace period (5s) prevents API sync from reverting optimistic state
- `followGraceUntilRef` tracks when grace period expires

---

## 5. Image Optimization

**File**: `src/components/OptimizedImage.tsx`

### STRICT Rules
- Cache policy: `'memory-disk'` (both RAM + disk)
- Default blurhash: `'L6PZfSi_.AyE_3t7t7R**0o#DgR4'` (smooth gradient)
- ALL URLs go through `normalizeCdnUrl()` for CloudFront prefix
- `recyclingKey` REQUIRED for FlashList items (prevents image bleed)

### Variants
| Component | Purpose | Shape |
|-----------|---------|-------|
| `OptimizedImage` | General purpose | Rectangle |
| `AvatarImage` | User avatars | Circle (border-radius 50%) |
| `ThumbnailImage` | Small previews | Square/rectangle |
| `PostImage` | Feed posts | Aspect ratio preserved |

### CDN URL Normalization
```typescript
// If URL doesn't start with http, prepend CDN domain
const normalizeCdnUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${CDN_DOMAIN}/${url}`;
};
```

---

## 6. Vibe Ecosystem

### Vibe Guardian (`src/services/vibeGuardian.ts`)
- Detects doom-scrolling: rapid scroll + zero engagement > 90s
- Sliding window: 20 mood snapshots, 30s interval (10-min window)
- Degradation threshold: 0.7 (70% negative snapshots)
- Triggers: full-screen breathing exercise overlay

### Mood Detection (`src/services/moodDetection.ts`)
- Analyzes: interaction patterns, scroll speed, content type
- Mood types: `energetic`, `social`, `creative`, `calm`, `neutral`, `overwhelmed`, `disengaged`
- Positive moods: `['energetic', 'social', 'creative']`
- Update interval: 30s

### Ripple Tracker (`src/services/rippleTracker.ts`)
- Tracks positive actions (like, share, save, follow, encourage)
- Levels: Spark(0), Glow(10), Shine(30), Radiance(60), Aura(100)
- Visual: 1-5 concentric rings on profile

---

## 7. Error Reporting (Sentry)

**File**: `src/lib/sentry.ts`

### STRICT Rules
- **No code at import time can throw** — app crashes before ErrorBoundary mounts
- **PII scrubbing**: emails → first 2 chars + `***@domain`, sensitive keys redacted
- **Pre-init buffer**: captures before `initSentry()` are buffered, flushed after init
- **Never send full email/username** — only user ID in `setUserContext()`

### Sample Rates
```
Dev:  traces 1.0, profiles 1.0 (capture everything)
Prod: traces 0.2, profiles 0.1 (20% traces, 10% profiles)
```

### SENTRY_DISABLE_AUTO_UPLOAD
Set to `true` in EAS secrets — source maps uploaded manually, not during build.

---

## 8. Environment Config

**File**: `src/config/env.ts`

### Three-Tier Fallback
```typescript
Constants.expoConfig?.extra     // Preferred (app.config.ts)
  → Constants.manifest?.extra   // Legacy Expo
  → Constants.manifest2?.extra  // Expo Go
```

### HTTPS Enforcement
```typescript
ENFORCE_HTTPS = !__DEV__  // Always in production
```

### Required Env Vars
```
EXPO_PUBLIC_COGNITO_USER_POOL_ID
EXPO_PUBLIC_COGNITO_CLIENT_ID
EXPO_PUBLIC_API_REST_ENDPOINT
EXPO_PUBLIC_CDN_DOMAIN
EXPO_PUBLIC_S3_BUCKET
GOOGLE_API_KEY (optional, Nominatim used as primary)
MAPBOX_ACCESS_TOKEN
```

### STRICT: DEV_USE_STAGING
When `EXPO_PUBLIC_DEV_USE_STAGING=true`, dev builds use staging API/CDN/Cognito.
3 config values silently swap. Warning logged: `[AWS Config] DEV_USE_STAGING=true`.

---

## 9. Feature Flags

**File**: `src/config/featureFlags.ts`

### V1 App Store (Current)

**Enabled**:
```
CREATE_POST, CREATE_PEAK, MESSAGING, FOLLOW, SEARCH,
XPLORER_MAP, SPOTS, CHALLENGES, BUSINESS_DISCOVERY,
DISPUTES, VIBE_GUARDIAN, EMOTIONAL_RIPPLE, VIBE_PRESCRIPTIONS,
VIBE_SCORE
```

**Disabled** (monetization gated for App Store approval):
```
GO_LIVE, BATTLES, TIPPING, SESSIONS, CHANNEL_SUBSCRIBE,
WALLET, GIFTING, BUSINESS_DASHBOARD, BUSINESS_BOOKING,
SUBSCRIPTIONS, IDENTITY_VERIFICATION
```

### STRICT: Monetization Features
Stripe-dependent features are disabled until App Store approval for in-app purchases.
Enabling them without Stripe setup causes crashes.

---

## 10. Validation & Sanitization

**File**: `src/utils/validation.ts`

### STRICT: Every User Input MUST Be Sanitized
```typescript
// Remove dangerous characters
sanitize(value) → strips < > " ' `

// Recursive object sanitization
sanitizeObject(obj) → sanitizes all string values in object tree

// Text display sanitization
sanitizeText(text) → strips HTML tags + control characters + trims
```

### Email Validation
- `isDisposableEmail()` blocks 300+ temp mail domains
- `detectDomainTypo()` catches: gmail.co → gmail.com, yahooo.com → yahoo.com
- `isLegitimateProvider()` validates against known providers

### Password Rules
```
Min 8 characters
At least 1 uppercase
At least 1 lowercase
At least 1 digit
At least 1 special character (!@#$%^&*...)
```

### UUID Validation (Mandatory on all IDs)
```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```
Every function that receives a userId, postId, peakId MUST validate with this regex before API calls.

---

## 11. Push Notifications

**File**: `src/services/notifications.ts`

### STRICT Rules
- Only work on physical devices (simulators always fail)
- Permission requested on first registration attempt
- 4 retry attempts with exponential backoff (5s, 15s, 30s, 60s)
- Token stored and sent to backend for push delivery

### Notification Types
```
like, comment, message, follow_request, new_follower,
follow_accepted, peak_like, peak_comment, post_tag, live
```

### Foreground Handling
- `setNotificationHandler()` configures: show alert, play sound, set badge
- Tapping notification navigates to relevant screen

---

## 12. Post Creation

**File**: `src/screens/home/AddPostDetailsScreen.tsx`

### Visibility Options (by account type)
| Option | personal | pro_creator | pro_business |
|--------|----------|-------------|--------------|
| Public | YES | YES | YES |
| Fans only | YES | YES | YES |
| Private | YES | YES | YES |
| Subscribers only | NO | YES | NO |

### Limits
- Description: max 2200 characters
- Images: max 10 per carousel
- Video: max 60 seconds

### Post Flow
```
1. Select media → validate → upload to S3 via presigned URL
2. Fill details (caption, location, visibility, tags)
3. Submit → API creates post → navigate to feed
4. addVibeAction('post') → 10 points
```

### Location Search
- Primary: Nominatim API (free, OpenStreetMap)
- Backup: Google Places API (if Nominatim fails)
- Debounced 300ms, max 100 chars, 8s timeout

---

## 13. Network Resilience

### Timeout Pattern (STANDARD)
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
try {
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  // handle response
} catch (error) {
  clearTimeout(timeout);
  // handle error gracefully, return fallback
}
```

### Timeouts by Service
```
Mapbox Directions:  10,000ms
Nominatim Search:    8,000ms
Nominatim Reverse:   8,000ms
General API calls:  30,000ms (AWS API Gateway default)
```

### STRICT: Never Let Fetch Hang
Every `fetch()` call MUST have an AbortController timeout. Hanging requests
cause the app to appear frozen, especially on poor connections.

---

## 14. API Layer

**File**: `src/services/aws-api.ts`

### Auth Header Pattern
```typescript
headers: {
  'Authorization': `Bearer ${idToken}`,
  'Content-Type': 'application/json',
}
```
- Uses ID token (not access token) for API Gateway authorization
- Token auto-refreshed before each call via `getValidToken()`

### CDN URL Helper
```typescript
awsAPI.getCDNUrl(key) → `${CDN_DOMAIN}/${key}`
```
Used for S3 objects that need CloudFront URLs (images, videos, thumbnails).

### Error Handling Pattern
```
401 → Token expired, auto-refresh and retry once
403 → Forbidden (logged, not retried)
429 → Rate limited (show user message)
5xx → Server error (log to Sentry, show generic message)
```

### STRICT: Never Expose Error Details to User
```typescript
// WRONG
alert(error.message);

// CORRECT
if (__DEV__) console.warn('[API] Error:', error);
showGenericError('Something went wrong. Please try again.');
```

---

## 15. Regression Prevention Checklist

Before merging ANY change, verify:

### Layout
- [ ] FlashList masonry props intact (masonry, optimizeItemArrangement, estimatedItemSize)
- [ ] gridItemWrapper View wrapping each VibeCard
- [ ] contentContainerStyle paddingHorizontal on FlashList

### Data Integrity
- [ ] Peaks filtered by author_id on profiles (NEVER show all peaks)
- [ ] Optimistic likes have rollback on error
- [ ] Follow action clears feed cache

### Security
- [ ] All user input sanitized before display
- [ ] UUID validated before API calls
- [ ] No PII in Sentry/logs (emails masked)
- [ ] Tokens in SecureStore only

### Performance
- [ ] VibeCard memoization intact (id, isLiked, likes, styles)
- [ ] recyclingKey on all FlashList images
- [ ] useCallback on all event handlers passed as props
- [ ] No inline styles in render (objects created in useMemo/StyleSheet)

### Auth
- [ ] Network errors keep session alive
- [ ] Auth errors clear session
- [ ] Cognito client lazy-loaded (not module-level)
