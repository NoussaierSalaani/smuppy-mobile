# Feed Systems — Strict Rules

> **Parent**: [FEATURES.md](./FEATURES.md) | **Sibling**: [FEATURES-CORE.md](./FEATURES-CORE.md) | **Read BEFORE modifying any feed screen.**

---

## 1. FanFeed

**File**: `src/screens/home/FanFeed.tsx`

### Purpose
Shows posts from **followed users** + suggested profiles. This is the "home timeline".

### Display Conditions
- Default tab when user opens the app
- Shows ALL account types
- Posts come from `getFollowingFeed()` (followed users only)

### Data Flow
```
getFollowingFeed(page, limit=10) → Post[]
  → transformToFanPost(post, likedIds, savedIds) → UIFanPost
  → hasLikedPostsBatch() / hasSavedPostsBatch() for like/save state
```

### Key Differences from VibesFeed
| Aspect | FanFeed | VibesFeed |
|--------|---------|-----------|
| Content source | Followed users | Discovery (all users) |
| Layout | Single-column cards | 2-column masonry grid |
| Peaks carousel | NO | YES |
| Mood indicator | NO | YES (non-business) |
| Interest filters | NO | YES |
| Vibe Guardian | NO | YES |

### Post Card Structure
- Full-width image/carousel
- User header: avatar + name + time ago + follow button
- Caption with "more" truncation
- Action bar: like, comment, share, save
- Like count + comment count

### Interactions
- Double-tap to like (DoubleTapLike component)
- Single-tap opens `PostDetailFanFeedScreen`
- Pull-to-refresh resets to page 0
- Infinite scroll: page size 10

---

## 2. VibesFeed (Masonry Grid)

**File**: `src/screens/home/VibesFeed.tsx`

> Full documentation in [FEATURES.md sections 1-10](./FEATURES.md#1-vibesfeed--masonry-grid)

### STRICT FlashList Props (DO NOT REMOVE)
```typescript
numColumns={2}
masonry={true}
optimizeItemArrangement={true}
estimatedItemSize={230}
```

### STRICT Item Wrapper (DO NOT REMOVE)
```typescript
<View style={styles.gridItemWrapper}>  // paddingHorizontal: 5, paddingBottom: 10
  <VibeCard ... />
</View>
```

### STRICT Content Container Padding
```typescript
contentContainerStyle={{ paddingHorizontal: GRID_PADDING - GRID_GAP / 2 }}
```

### Card Height Determinism
```typescript
const heights = [180, 200, 220, 240, 260, 280];
const height = heights[Math.abs(post.id.charCodeAt(0)) % heights.length];
```
This is NOT random. Same post ID always produces same height. Do NOT change to Math.random().

---

## 3. XplorerFeed (Map Discovery)

**File**: `src/screens/home/XplorerFeed.tsx`

### Purpose
Map-based discovery using Mapbox. Shows nearby businesses, coaches, spots, events.

### Display Conditions
- Available to ALL account types
- Requires location permission (asks on first open)
- Falls back to default coordinates if permission denied

### Filter Categories (8 fixed)
```
coaches, gyms, wellness, sports, food, stores, events, groups
```
- Max 3 active filters at once (enforced)
- Each category has a pin color

### Map Rules
- Provider: Mapbox GL
- Default zoom: 12
- Pin clustering enabled above 50 pins
- Tab bar hidden when map is zoomed/panned (via `setBottomBarHidden`)

### Search
- Nominatim API for location search
- Debounced 300ms
- Max query length: 100 chars
- Timeout: 8s with AbortController

### STRICT Validation
```typescript
// UUID validation on all user IDs before navigation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Text sanitization on all displayed text
const sanitizeText = (text) => text.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();
```

---

## 4. Feed Tab System

**File**: `src/screens/home/FeedScreen.tsx`

### Tab Order
1. **Fan** (FanFeed) — followed users
2. **Vibes** (VibesFeed) — discovery masonry
3. **Xplorer** (XplorerFeed) — map discovery

### STRICT Rules
- Tabs are in a horizontal ScrollView with `pagingEnabled`
- Each feed is a separate component (not conditional render)
- Tab state persists across navigation (feeds don't unmount)
- `scrollToTop()` exposed via ref for tab-bar double-tap

---

## 5. Post Transformers

**File**: `src/utils/postTransformers.ts`

### Functions
| Function | Input | Output | Used By |
|----------|-------|--------|---------|
| `transformToFanPost()` | Post, likedIds, savedIds | UIFanPost | FanFeed |
| `transformToVibePost()` | Post, likedIds, savedIds | UIVibePost | VibesFeed |
| `getTimeAgo()` | Date string | "5m ago" etc. | All feeds |
| `normalizeMediaType()` | string | 'image'/'video'/'carousel' | All feeds |
| `getMediaUrl()` | Post | URL string | All feeds |

### UIVibePost Height (CRITICAL)
```typescript
// Deterministic height based on post ID — NOT random
const heights = [180, 200, 220, 240, 260, 280];
const randomHeight = heights[Math.abs(post.id.charCodeAt(0)) % heights.length];
```

### Media Type Normalization
```
'photo' → 'image'
'multiple' → 'carousel'
undefined → 'image'
'video' → 'video'
```

---

## 6. Post Interactions (Shared Hook)

**File**: `src/hooks/usePostInteractions.ts`

### Pattern: Optimistic Update + Rollback
```
1. User taps like → immediately update local state (optimistic)
2. Fire API call in background
3. If API fails → revert state to previous value (rollback)
4. PendingSets prevent duplicate requests for same post
```

### STRICT Rules
- `pendingLikes` / `pendingSaves` are `Set<string>` — check before every API call
- Never call like/save API if postId is already in pending set
- Always clear from pending set in `finally` block
- `onLike` callback fires on LIKE only (not unlike)
- `onSaveToggle` fires with `(postId, isSaved)` boolean

### Generic Interface
```typescript
interface InteractablePost {
  id: string;
  isLiked: boolean;
  likes: number;
  isSaved?: boolean;
  saves?: number;
}
```
Works with UIFanPost, UIVibePost, or any post type satisfying this interface.

---

## 7. Double-Tap Like

**File**: `src/components/DoubleTapLike.tsx`

### Gesture Priority (Exclusive)
1. Double-tap (2 taps, 300ms window) → like + heart animation
2. Single-tap (falls through) → open post detail

### Animation Specs
- Main heart: spring bounce (friction 3, tension 100) → expand → fade
- 6 mini hearts: burst at 60-degree intervals, alternating red (#FF6B6B) / pink (#FF8FAB)
- Duration: ~600ms total
- Haptic: `Haptics.notificationAsync(Success)` on double-tap

### STRICT Rules
- `showAnimation={!post.isLiked}` — NO animation if already liked
- Uses `Gesture.Exclusive(doubleTap, singleTap)` — order matters
- `pointerEvents="none"` on animation overlay — doesn't block touch
