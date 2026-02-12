# Smuppy Feature Documentation

> **PURPOSE**: This document defines the STRICT display conditions, data flow, and logic
> for every feature. Any agent or developer modifying code MUST respect these rules.
> Violations cause regressions visible to users.
>
> **RULE**: Before modifying ANY file listed here, read the relevant section first.
> If a change conflicts with this document, the change is WRONG.

---

## Table of Contents

1. [VibesFeed — Masonry Grid](#1-vibesfeed--masonry-grid)
2. [VibesFeed — VibeCard](#2-vibesfeed--vibecard)
3. [VibesFeed — Mood Indicator](#3-vibesfeed--mood-indicator)
4. [VibesFeed — Peaks Carousel](#4-vibesfeed--peaks-carousel)
5. [VibesFeed — Interest Filter Chips](#5-vibesfeed--interest-filter-chips)
6. [VibesFeed — Post Detail Modal](#6-vibesfeed--post-detail-modal)
7. [VibesFeed — Double-Tap Like](#7-vibesfeed--double-tap-like)
8. [VibesFeed — Vibe Guardian](#8-vibesfeed--vibe-guardian)
9. [VibesFeed — Session Recap](#9-vibesfeed--session-recap)
10. [VibesFeed — Cache & Pagination](#10-vibesfeed--cache--pagination)
11. [Peaks System — Complete Flow](#11-peaks-system--complete-flow)
12. [Profile — Peaks Display](#12-profile--peaks-display)
13. [Account Type Behavior Matrix](#13-account-type-behavior-matrix)
14. [Critical Constants](#14-critical-constants)

---

## 1. VibesFeed — Masonry Grid

**Files**: `src/screens/home/VibesFeed.tsx`

### STRICT Rules (DO NOT REMOVE)

```
FlashList MUST have these props:
  numColumns={2}
  masonry={true}                    ← enables variable-height columns
  optimizeItemArrangement={true}    ← reorders items by height for compact layout
  estimatedItemSize={230}           ← avg of height range 180-280
```

These are passed via spread to bypass FlashList types:
```typescript
{...{ masonry: true, optimizeItemArrangement: true, estimatedItemSize: 230 } as Record<string, unknown>}
```

### STRICT Rules — Item Wrapper

Each card MUST be wrapped in `gridItemWrapper`:
```typescript
const renderGridItem = ({ item }) => (
  <View style={styles.gridItemWrapper}>   ← REQUIRED wrapper
    <VibeCard ... />
  </View>
);
```

Style definition (MUST exist in createStyles):
```typescript
gridItemWrapper: {
  paddingHorizontal: GRID_GAP / 2,  // 5px
  paddingBottom: GRID_GAP,          // 10px
}
```

ContentContainer MUST have horizontal padding:
```typescript
contentContainerStyle={{ paddingHorizontal: GRID_PADDING - GRID_GAP / 2 }}
// = 8 - 5 = 3px edge padding
```

### Why

Without `masonry: true`, FlashList forces equal heights per row, breaking the
Pinterest-style layout. Without `gridItemWrapper`, cards have no gap between them.
Without `optimizeItemArrangement`, tall cards cluster on one side.

**Last broken by**: commit `bbcbf79` (ESLint agent removed these "unused" props)
**Fixed in**: commit `f0d45ec`

---

## 2. VibesFeed — VibeCard

**Files**: `src/screens/home/VibesFeed.tsx` (VibeCard component), `src/utils/postTransformers.ts`

### Height Computation

Heights are deterministic based on post ID (not random):
```typescript
const heights = [180, 200, 220, 240, 260, 280];
const randomHeight = heights[Math.abs(post.id.charCodeAt(0)) % heights.length];
```

Applied via inline style: `style={[styles.vibeCard, { height: post.height }]}`

### Card Structure (top to bottom)
1. Full-bleed image (`OptimizedImage`, 100% width/height)
2. Video indicator badge (top-right, if type === 'video')
3. Carousel indicator badge (top-right, if type === 'carousel')
4. Glassmorphic overlay (bottom, BlurView intensity 20):
   - Title (2-line max, Poppins-SemiBold 12px white)
   - Meta row: avatar 20px + username + heart icon + like count

### Memoization (DO NOT CHANGE)
```typescript
memo((prev, next) =>
  prev.post.id === next.post.id &&
  prev.post.isLiked === next.post.isLiked &&
  prev.post.likes === next.post.likes &&
  prev.styles === next.styles
)
```

---

## 3. VibesFeed — Mood Indicator

**Files**: `src/screens/home/VibesFeed.tsx` (MoodIndicator), `src/hooks/useMoodAI.ts`, `src/stores/vibeStore.ts`

### Display Conditions
- SHOW if `accountType !== 'pro_business'` AND `mood !== null`
- HIDE for business accounts (always)
- Position: first item in ListHeaderComponent

### Data Sources
- `mood` → `useMoodAI` hook (AI-based mood detection from scroll/like patterns)
- `vibeScore` → `useVibeStore` (Zustand)
- `vibeLevel` → `useVibeStore` (newcomer/explorer/contributor/influencer/legend)
- `currentStreak` → `useVibeStore` (daily login streak)

### Level Colors (FIXED — do not change)
```
newcomer:    #9E9E9E (gray)
explorer:    #4CAF50 (green)
contributor: #2196F3 (blue)
influencer:  #9C27B0 (purple)
legend:      #FF9800 (orange)
```

### Animation
- Pulse: continuous loop, scale 1.0 → 1.02 → 1.0 (4s cycle)
- `useNativeDriver: true` (REQUIRED for 60fps)

### Tap Action
- Navigates to `Prescriptions` screen

---

## 4. VibesFeed — Peaks Carousel

**Files**: `src/screens/home/VibesFeed.tsx`

### Display Conditions
- SHOW if `!isBusiness` (personal + pro_creator only)
- HIDE for `pro_business` accounts
- Position: ListHeaderComponent, after MoodIndicator, before filters
- Shows when `peaksData.length > 0`

### Data Source
- API: `awsAPI.getPeaks({ limit: 10 })` — NO userId (feed mode)
- Fetched on mount, skipped for business accounts
- CDN transformation: non-http URLs go through `awsAPI.getCDNUrl()`

### Card Specs
- Width: `PEAK_CARD_WIDTH = 100px`
- Height: `PEAK_CARD_HEIGHT = 140px`
- Corner radius: 16px
- Elements: thumbnail, new indicator (< 1h), duration badge, avatar (36px centered), username

### STRICT Rule
This carousel shows ALL active peaks from ALL users (feed mode).
It does NOT filter by the current user. This is intentional — it's a discovery carousel.

---

## 5. VibesFeed — Interest Filter Chips

**Files**: `src/screens/home/VibesFeed.tsx`

### Display Conditions
- Always visible in ListHeaderComponent below peaks
- Content varies by account type:
  - `personal` → user interests from profile
  - `pro_creator` → user expertise from profile
  - `pro_business` → business_category + expertise

### Behavior
- Chips boost matching posts (weight 1000 for active, 500 for profile interests)
- Deactivated chips still show as suggestions
- Animated scale on toggle (0.9 → spring back)
- Haptic: light impact

### Add Button (+ icon)
Navigates to:
- `EditInterests` (personal)
- `EditBusinessCategory` (pro_business)
- `EditExpertise` (pro_creator)

---

## 6. VibesFeed — Post Detail Modal

**Files**: `src/screens/home/VibesFeed.tsx`

### Display Conditions
- Opens on card tap (single tap via DoubleTapLike)
- Full-screen modal, slide animation

### Content
1. Image/carousel (width × 1.25 height)
2. Close button (top-right, safe area offset)
3. User info: avatar 44px + name + category + "Become a fan" button
4. Title (WorkSans-Bold 20px)
5. Actions: Like / Share / Save
6. Related posts (max 6, same category/tags)

### Engagement Tracking
- `trackPostView()` on open
- `trackPostExit()` on close (with time spent)
- `guardianTrackEngagement()` for doom-scroll detection

---

## 7. VibesFeed — Double-Tap Like

**Files**: `src/components/DoubleTapLike.tsx`

### Gesture Priority
1. Double-tap (2 taps within 300ms) → triggers like if not already liked
2. Single-tap (falls through if no double-tap) → opens post modal

### Animation (on double-tap)
- Main heart: spring bounce up + expand + fade
- 6 mini hearts: burst outward at 60 degree intervals
- Colors: alternating #FF6B6B (red) and #FF8FAB (pink)
- Haptic: notification success

### STRICT Rule
- `showAnimation={!post.isLiked}` — NO animation if already liked
- Uses `Gesture.Exclusive()` for priority handling

---

## 8. VibesFeed — Vibe Guardian

**Files**: `src/hooks/useVibeGuardian.ts`, `src/components/VibeGuardianOverlay.tsx`

### Display Conditions
- SHOW when excessive scrolling detected
- HIDE for `pro_business` accounts
- Full-screen breathing exercise modal

### Content
- "Take a moment" title
- Breathing circle animation (160px, inhale/exhale)
- "I'm good, continue" dismiss button

---

## 9. VibesFeed — Session Recap

**Files**: `src/components/SessionRecapModal.tsx`

### Display Conditions
- Triggers when app goes to background after >= 2 min session
- HIDE for `pro_business` accounts

### Content
- Duration stat
- Mood trajectory (start → end)
- Positive interactions count
- "Got it" dismiss button

---

## 10. VibesFeed — Cache & Pagination

### Module-Level Cache
```typescript
vibesFeedCache = { posts: UIVibePost[], timestamp: number, page: number }
```
- TTL: 5 minutes (300,000ms)
- Survives navigation, resets on app restart
- Clear on logout: `clearVibesFeedCache()`

### Pagination
- Page size: 40 posts
- Cursor: page number (0-based)
- Trigger: `onEndReachedThreshold={0.3}` (30% from bottom)
- Guard: `loadingMoreRef` prevents concurrent fetches
- Stop: `hasMore` set false when < 40 results returned

### Pull-to-Refresh
- Resets page to 0, fetches fresh data
- Clears and replaces allPosts
- Updates cache with new data

### Focus Re-sync
- On screen focus (not first mount):
  1. Apply optimistic like overrides from `feedStore`
  2. Batch re-check like/save status from API
  3. Merge into local state

---

## 11. Peaks System — Complete Flow

### Overview
Peaks are short-lived video content (24-48h) shown in a Stories-like format.

### Lifecycle
1. **Create**: User records peak → uploaded to S3 → stored in `peaks` table
2. **Active**: Visible in VibesFeed carousel + PeaksFeedScreen for 24-48h
3. **Expire**: After `expires_at` OR 48h if null → trigger ExpiredPeakModal
4. **Decision**: User chooses: Save to Profile / Download / Delete
5. **Saved**: `saved_to_profile = true` → visible on user's profile indefinitely
6. **Deleted**: Removed permanently

### Backend Query Modes

**Feed Mode** (no authorId):
```sql
WHERE (expires_at > NOW() OR (expires_at IS NULL AND created_at > NOW() - '48h'))
```
Returns ALL active peaks from all users. Used by VibesFeed carousel and PeaksFeedScreen.

**Profile Mode** (with authorId):
```sql
WHERE pk.author_id = $authorId
AND (expires_at > NOW() OR saved_to_profile = true)
```
Returns specific user's active + saved peaks. Used by ProfileScreen and UserProfileScreen.

### STRICT Visibility Rules

| Context | What shows | Filter |
|---------|-----------|--------|
| VibesFeed carousel | All active peaks, all users | Feed mode (no author filter) |
| PeaksFeedScreen | All active peaks, grouped by author | Feed mode |
| Own ProfileScreen | Own active + saved peaks ONLY | `author_id = currentUserId` |
| Other UserProfileScreen | That user's peaks from posts table | `is_peak = true` from `getPostsByUser(userId)` |

### STRICT Rule: NEVER show other users' peaks on a profile
```
ProfileScreen:     peaks MUST be filtered by author_id === targetUserId
UserProfileScreen: peaks come from getPostsByUser(userId) which is already filtered
Fallback:          If filter returns empty, show EMPTY STATE — never show all peaks
```

---

## 12. Profile — Peaks Display

**Files**: `src/screens/profile/ProfileScreen.tsx`, `src/screens/profile/UserProfileScreen.tsx`

### ProfileScreen (Own Profile)

**Data Sources** (two layers):
1. Primary: `awsAPI.getPeaks({ userId: targetUserId })` → filtered STRICTLY by `author_id`
2. Fallback: `peaksFromPosts` = `allUserPosts.filter(p => p.is_peak)` from posts API

**STRICT Rules**:
```
1. ALWAYS filter peaks by author_id === targetUserId
2. If no peaks match after filtering: show EMPTY STATE
3. NEVER fall back to showing all peaks from all users
4. The line `setPeaks(filtered.length > 0 ? filtered : mapped)` is a BUG — use `setPeaks(filtered)`
```

### UserProfileScreen (Other Users' Profiles)

**Data Source**: `userPosts.filter(p => p.is_peak)` where `userPosts` comes from `getPostsByUser(userId)`
- Already filtered server-side by userId
- No additional client filtering needed
- Safe — cannot leak other users' peaks

### Peak Card Display (Profile Grid)
- Grid of peak thumbnails
- Duration badge (top-left)
- Stats overlay (bottom): heart + likes, eye + views
- Tap: navigates to PeakView with all user's peaks

---

## 13. Account Type Behavior Matrix

| Feature | personal | pro_creator | pro_business |
|---------|----------|-------------|--------------|
| Mood Indicator | YES | YES | NO |
| Peaks Carousel | YES | YES | NO |
| Vibe Guardian | YES | YES | NO |
| Session Recap | YES | YES | NO |
| Interest Chips | interests | expertise | category + expertise |
| Add Interest → | EditInterests | EditExpertise | EditBusinessCategory |
| Masonry Grid | YES | YES | YES |
| Post Modal | YES | YES | YES |
| Like/Save | YES | YES | YES |
| Share | YES | YES | YES |

---

## 14. Critical Constants

**DO NOT CHANGE** these values without updating this document:

```typescript
// Grid Layout
GRID_PADDING = 8              // Edge padding (SPACING.sm)
GRID_GAP = 10                 // Gap between cards
COLUMN_WIDTH = (width - 16 - 10) / 2  // Computed column width
SECTION_GAP = 8               // Vertical gap between sections

// Peaks
PEAK_CARD_WIDTH = 100
PEAK_CARD_HEIGHT = 140

// Card Heights (masonry)
VIBE_CARD_HEIGHTS = [180, 200, 220, 240, 260, 280]  // Deterministic by post ID

// Cache
CACHE_TTL = 300000            // 5 minutes
POSTS_PER_PAGE = 40
PEAKS_FETCH_LIMIT = 10

// FlashList (REQUIRED)
estimatedItemSize = 230
numColumns = 2
masonry = true
optimizeItemArrangement = true

// Mood
MOOD_UPDATE_INTERVAL = 30000  // 30 seconds

// Nominatim API
NOMINATIM_TIMEOUT_MS = 8000

// Mapbox Directions
API_TIMEOUT_MS = 10000
```

---

## Regression Prevention

### Before Modifying Any Feature
1. Read the relevant section in this document
2. Verify your change doesn't violate any STRICT rules
3. After modification, check:
   - `npx tsc --noEmit` passes
   - `npx eslint <file>` passes
   - Feature still works as described here

### Common Regression Patterns
- **ESLint agents removing "unused" spread props** → masonry breaks
- **Fallback logic showing all data** → privacy leaks (peaks, posts)
- **Missing View wrappers** → layout breaks
- **Removing memoization** → performance degrades
- **Changing constants** → visual layout breaks

### If You're Not Sure
Ask before changing. A broken feature is worse than a delayed change.
