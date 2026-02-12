# Peaks Feature Specification

> **Parent**: [CLAUDE.md](../../CLAUDE.md) | **Features**: [FEATURES.md](../FEATURES.md) | **Stability**: [STABILITY.md](../STABILITY.md)
>
> **Status**: Binding contract. All implementations MUST conform to this spec.
>
> **Last updated**: 2026-02-10
>
> **Owner files**: See [File Inventory](#file-inventory) for all related code.

---

## 1. Core Concept

Peaks are short-form video stories (6-60 seconds) that expire after 24-48 hours. They are Smuppy's equivalent of Instagram Stories — **grouped by user, viewed as a story sequence, with ephemeral + saveable lifecycle**.

### 1.1 Key Principles (MUST follow)

| Principle | Rule |
|-----------|------|
| **Grouping** | Peaks from the same author MUST be displayed as a single story group (one circle/card per user) |
| **Navigation** | Tap/swipe navigates WITHIN the same author's peaks first, then advances to the next author |
| **Expiration** | Peaks expire after `feedDuration` hours (24 or 48). Expired peaks prompt a save/dismiss decision |
| **Profile save** | Saved peaks (`saved_to_profile = true`) remain visible on the author's profile indefinitely |
| **Creation** | Any non-business account can create peaks. Multiple peaks from the same user stack into one group |

---

## 2. Data Model

### 2.1 Database Schema — `peaks` table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | gen_random_uuid() | Primary key |
| `author_id` | UUID (FK profiles) | required | Peak creator |
| `video_url` | TEXT | required | Video file URL |
| `thumbnail_url` | TEXT | null | Thumbnail image URL |
| `caption` | TEXT | null | Text overlay (max 500 chars) |
| `duration` | INTEGER | 15 | Video playback duration in seconds (6-60) |
| `visibility` | VARCHAR(20) | 'public' | 'public' or 'private' |
| `media_type` | VARCHAR(20) | 'video' | Always 'video' for peaks |
| `reply_to_peak_id` | UUID (FK peaks) | null | Self-referential for reply chains |
| `allow_peak_responses` | BOOLEAN | true | Whether others can reply |
| `peak_replies_count` | INTEGER | 0 | Cached reply count |
| `likes_count` | INTEGER | 0 | Cached like count |
| `comments_count` | INTEGER | 0 | Cached comment count |
| `views_count` | INTEGER | 0 | Cached unique view count |
| `filter_id` | VARCHAR(50) | null | Visual filter name |
| `filter_intensity` | REAL | 1.0 | Filter strength (0.0-1.0) |
| `overlays` | JSONB | null | UI overlay widgets metadata |
| `expires_at` | TIMESTAMPTZ | null | When peak expires from feed |
| `saved_to_profile` | BOOLEAN | null | null=pending, true=saved, false=dismissed |
| `content_status` | VARCHAR | 'clean' | 'clean' or 'flagged' (moderation) |
| `created_at` | TIMESTAMPTZ | NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOW() | Last update timestamp |

### 2.2 Related Tables

| Table | Purpose | Key constraint |
|-------|---------|---------------|
| `peak_views` | Unique view tracking | UNIQUE(peak_id, user_id) |
| `peak_likes` | Like records | UNIQUE(user_id, peak_id) |
| `peak_comments` | Text comments | peak_id FK |
| `peak_reactions` | Emoji reactions (fire, flex, heart, etc.) | UNIQUE(peak_id, user_id) — one reaction per user |
| `peak_tags` | Tagged friends | peak_id + tagged_user_id |
| `peak_hidden` | "Not interested" records | UNIQUE(user_id, peak_id) |
| `peak_hashtags` | Hashtag associations | PRIMARY KEY(peak_id, hashtag) |
| `peak_challenges` | Challenge metadata | UNIQUE(peak_id) — 1:1 with peaks |

### 2.3 Expiration State Machine

```
                    ┌─────────────┐
  POST /peaks  ──►  │   ACTIVE    │  expires_at > NOW()
                    │  (in feed)  │  OR created_at > NOW() - 48h
                    └──────┬──────┘
                           │
                    expires_at <= NOW()
                           │
                    ┌──────▼──────┐
                    │   EXPIRED   │  saved_to_profile IS NULL
                    │  (pending)  │  → ExpiredPeakModal shown
                    └──┬──────┬───┘
                       │      │
          save_decision│      │save_decision
           = "save"    │      │= "dismiss"
                       │      │
               ┌───────▼─┐  ┌▼──────────┐
               │  SAVED   │  │ DISMISSED  │
               │ (profile)│  │ (hidden)   │
               └──────────┘  └────────────┘
```

| State | `expires_at` | `saved_to_profile` | Feed visible | Profile visible |
|-------|--------------|--------------------|-------------|-----------------|
| **Active** | Future or null (< 48h) | null | YES | YES |
| **Expired pending** | Past | null | NO | NO (modal shown) |
| **Saved** | Past | true | NO | YES (permanent) |
| **Dismissed** | Past | false | NO | NO (permanent) |

---

## 3. Feed Display — Story Circles (MANDATORY)

### 3.1 Layout

```
┌───────────────────────────────────────────────────────┐
│  Horizontal ScrollView (story circles)                │
│  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐    │
│  │ +  │  │ 🟢 │  │ 🟢 │  │ ⚪ │  │ 🟢 │  │ ⚪ │    │
│  │You │  │ali │  │bob │  │sam │  │eve │  │dan │    │
│  │    │  │(3) │  │(1) │  │(2) │  │(4) │  │(1) │    │
│  └────┘  └────┘  └────┘  └────┘  └────┘  └────┘    │
└───────────────────────────────────────────────────────┘
```

### 3.2 Story Circle Component

| Element | Spec |
|---------|------|
| **Size** | 72x72 avatar + 4px ring |
| **Ring color (unviewed)** | Gradient `['#0EBF8A', '#00B5C1', '#0081BE']` |
| **Ring color (all viewed)** | `#C7C7CC` (gray) |
| **Ring color (partial)** | Gradient (segmented — one segment per peak) |
| **Username** | Below circle, max 8 chars + ellipsis, 11px |
| **Peak count** | Badge bottom-right if > 1 peak |
| **"+" circle** | First position if user has no active peaks — opens CreatePeak |

### 3.3 Grouping Logic (Frontend)

The API returns a flat list of peaks sorted by `created_at DESC`. The frontend MUST group them by author:

```typescript
interface PeakGroup {
  author: {
    id: string;
    username: string;
    fullName: string;
    avatarUrl: string;
    isVerified: boolean;
  };
  peaks: Peak[];           // All peaks from this author, sorted by created_at ASC
  hasUnviewed: boolean;    // At least one peak not in peak_views for current user
  latestCreatedAt: string; // For sorting groups (most recent peak wins)
}

function groupPeaksByAuthor(peaks: Peak[]): PeakGroup[] {
  const map = new Map<string, PeakGroup>();

  for (const peak of peaks) {
    const authorId = peak.user.id;
    const existing = map.get(authorId);

    if (existing) {
      existing.peaks.push(peak);
      if (!peak.isViewed) existing.hasUnviewed = true;
      if (peak.createdAt > existing.latestCreatedAt) {
        existing.latestCreatedAt = peak.createdAt;
      }
    } else {
      map.set(authorId, {
        author: peak.user,
        peaks: [peak],
        hasUnviewed: !peak.isViewed,
        latestCreatedAt: peak.createdAt,
      });
    }
  }

  // Sort groups: unviewed first, then by latest peak
  const groups = Array.from(map.values());
  groups.sort((a, b) => {
    if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
    return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
  });

  // Sort peaks within each group by created_at ASC (oldest first = watch in order)
  for (const group of groups) {
    group.peaks.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  return groups;
}
```

### 3.4 Sort Order

| Level | Sort |
|-------|------|
| **Groups** | Unviewed groups first, then by latest peak `created_at DESC` |
| **Peaks within group** | `created_at ASC` (oldest first — watch in chronological order) |

---

## 4. Story Viewer — PeakViewScreen (MANDATORY)

### 4.1 Layout

```
┌──────────────────────────────────────────┐
│ [▓▓▓▓░░] [▓▓░░░] [░░░░░]               │  ← Progress bars (one per peak in group)
│                                           │
│ [←] @username                    [×]     │
│                                     ❤️    │
│                                     💬    │
│          [VIDEO - Full screen]      🔖    │
│                                     ↗️    │
│                                     ⋯    │
│                                           │
│ 👁 12.5K views                            │
│ Caption text here...                      │
└──────────────────────────────────────────┘
```

### 4.2 Progress Bars (Top)

| Property | Value |
|----------|-------|
| **Count** | One bar per peak in the CURRENT AUTHOR'S group |
| **Height** | 3px |
| **Background** | `rgba(255,255,255,0.3)` |
| **Fill color** | `#FFFFFF` |
| **Animation** | Linear fill synchronized with peak video duration |
| **Gap between bars** | 4px |
| **Behavior** | Active bar fills; completed bars = full; upcoming bars = empty |

### 4.3 Navigation (TWO-LEVEL — CRITICAL)

#### Level 1: Within same author's group

| Gesture | Action |
|---------|--------|
| **Tap right edge** (> 70% width) | Next peak from SAME author |
| **Tap left edge** (< 30% width) | Previous peak from SAME author |
| **Swipe left** | Next peak from SAME author |
| **Swipe right** | Previous peak from SAME author |
| **Auto-advance** | When peak video ends, auto-play next peak from SAME author |

#### Level 2: Between author groups

| Gesture | Action |
|---------|--------|
| **Last peak of author + tap right** | Advance to NEXT author's first peak |
| **First peak of author + tap left** | Go back to PREVIOUS author's last peak |
| **Last peak of author + auto-advance** | Advance to NEXT author's first peak |
| **Swipe down** | Close viewer (go back) |
| **Swipe up** | Open replies / create reply peak |

#### Navigation State

```typescript
interface StoryViewerState {
  groups: PeakGroup[];        // All author groups
  currentGroupIndex: number;  // Which author we're viewing
  currentPeakIndex: number;   // Which peak within that author's group
}

// Navigation helpers:
function nextPeak(state: StoryViewerState): StoryViewerState {
  const group = state.groups[state.currentGroupIndex];
  if (state.currentPeakIndex < group.peaks.length - 1) {
    // Next peak in same group
    return { ...state, currentPeakIndex: state.currentPeakIndex + 1 };
  } else if (state.currentGroupIndex < state.groups.length - 1) {
    // First peak of next group
    return { ...state, currentGroupIndex: state.currentGroupIndex + 1, currentPeakIndex: 0 };
  }
  // End of all groups — close viewer
  return state;
}

function previousPeak(state: StoryViewerState): StoryViewerState {
  if (state.currentPeakIndex > 0) {
    // Previous peak in same group
    return { ...state, currentPeakIndex: state.currentPeakIndex - 1 };
  } else if (state.currentGroupIndex > 0) {
    // Last peak of previous group
    const prevGroup = state.groups[state.currentGroupIndex - 1];
    return { ...state, currentGroupIndex: state.currentGroupIndex - 1, currentPeakIndex: prevGroup.peaks.length - 1 };
  }
  return state;
}
```

### 4.4 Other Gestures

| Gesture | Action |
|---------|--------|
| **Tap center** | Toggle play/pause + show/hide UI |
| **Double-tap** | Like with heart burst animation |
| **Long-press** | Pause + show context menu (report, not interested, copy link) |

### 4.5 View Tracking

When a peak becomes visible (starts playing), call `GET /peaks/:id` which automatically records the view in `peak_views` and increments `views_count`. This also provides the `is_viewed` flag for ring coloring.

---

## 5. Creation Flow

### 5.1 Duration Options

| Option | Duration | Icon |
|--------|----------|------|
| Quick | 6s | lightning |
| Short | 10s | (default) |
| Standard | 15s | - |
| Long | 60s | trophy |

### 5.2 Steps

1. **CreatePeakScreen**: Camera with duration selector, filter panel, overlay editor
2. **Record**: Hold button to record (min 3s, max selected duration)
3. **PeakPreviewScreen**: Preview + metadata (caption, location, feed duration, save to profile, challenge)
4. **Publish**: Upload video + thumbnail, call `POST /peaks` with all metadata

### 5.3 Feed Duration

| Option | Value | Description |
|--------|-------|-------------|
| 24h | `feedDuration: 24` | Peak visible in feed for 24 hours |
| 48h | `feedDuration: 48` | Peak visible in feed for 48 hours (default) |

`expires_at = NOW() + feedDuration * INTERVAL '1 hour'`

### 5.4 Restrictions

| Account type | Can create peaks? |
|-------------|-------------------|
| `personal` | YES |
| `pro_creator` | YES |
| `pro_business` | NO — shows "Peaks are not available for business accounts" |

---

## 6. Profile Display

### 6.1 Peaks Tab on UserProfileScreen

**Layout**: 3-column grid of individual peak thumbnails

| Property | Value |
|----------|-------|
| Card width | `(SCREEN_WIDTH - 48) / 3` |
| Card height | 180px |
| Border radius | 12px |
| Background | #1C1C1E |

**Elements per card**:
- Thumbnail image (full bleed)
- Duration badge (top-right): `15s`, `10s`, etc.
- Stats overlay (bottom): likes + views

**Tap behavior**: Opens PeakViewScreen with ALL profile peaks as a flat array (no grouping needed — all from same author)

### 6.2 What's shown

| Context | Peaks shown |
|---------|-------------|
| **Own profile** | Active peaks + saved peaks |
| **Other user's profile** | Active peaks + saved peaks (dismissed peaks hidden) |

### 6.3 Avatar Peak Indicator

On the profile avatar:
- **Has active peaks**: Gradient border `['#0EBF8A', '#00B5C1', '#0081BE']` (3px)
- **No active peaks**: White border (4px)

Tap on avatar with peak indicator → opens PeakViewScreen with user's peaks.

---

## 7. Expiration Flow

### 7.1 Trigger

`useExpiredPeaks` hook runs on app foreground (debounced 10s). Calls `GET /peaks/expired` to get peaks where:
- `author_id = current_user`
- `saved_to_profile IS NULL`
- `expires_at <= NOW()` OR `created_at <= NOW() - 48h`

### 7.2 ExpiredPeakModal

Shows one expired peak at a time with:
- Thumbnail preview
- Final stats (likes, comments, views)
- Counter "1 of 3" if multiple expired
- Action buttons:
  - **"Keep on profile"** (green) → `POST /peaks/:id/save-decision { action: "save_to_profile" }`
  - **"Download"** (white) → Save to camera roll
  - **"Delete"** (red) → `DELETE /peaks/:id`
  - **Dismiss** (swipe/tap outside) → closes modal, peak stays in pending state

---

## 8. API Endpoints

### 8.1 GET /peaks (List)

**Response shape**:
```json
{
  "data": [
    {
      "id": "uuid",
      "videoUrl": "https://...",
      "thumbnailUrl": "https://...",
      "caption": "text",
      "duration": 30,
      "replyToPeakId": null,
      "likesCount": 123,
      "commentsCount": 45,
      "viewsCount": 678,
      "createdAt": "ISO",
      "filterId": null,
      "filterIntensity": 1.0,
      "overlays": null,
      "expiresAt": "ISO",
      "savedToProfile": null,
      "isLiked": false,
      "isViewed": false,
      "author": {
        "id": "uuid",
        "username": "john",
        "fullName": "John Doe",
        "avatarUrl": "https://...",
        "isVerified": true,
        "accountType": "pro_creator"
      },
      "challenge": null
    }
  ],
  "nextCursor": "timestamp",
  "hasMore": true
}
```

**MUST include**: `isViewed` field (EXISTS check on `peak_views`)
**MUST exclude**: Hidden peaks (NOT IN `peak_hidden` for current user)
**MUST exclude**: Expired peaks in feed mode (only active peaks)
**MUST include**: Active + saved peaks in profile mode (authorId filter)

### 8.2 Other Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/peaks/:id` | Get single peak + record view |
| POST | `/peaks` | Create peak |
| DELETE | `/peaks/:id` | Delete peak (author only) |
| GET | `/peaks/expired` | Get expired peaks pending decision |
| POST | `/peaks/:id/save-decision` | Save or dismiss expired peak |
| POST | `/peaks/:id/like` | Like peak |
| DELETE | `/peaks/:id/like` | Unlike peak |
| GET | `/peaks/:id/comments` | List comments |
| POST | `/peaks/:id/comments` | Add comment |
| GET | `/peaks/:id/replies` | List reply peaks |
| POST | `/peaks/:id/replies` | Create reply peak |
| POST | `/peaks/:id/react` | Add emoji reaction |
| DELETE | `/peaks/:id/react` | Remove reaction |
| POST | `/peaks/:id/hide` | Hide peak ("not interested") |
| DELETE | `/peaks/:id/hide` | Unhide peak |
| POST | `/peaks/:id/tag` | Tag friend |
| DELETE | `/peaks/:id/tag/:userId` | Remove tag |
| GET | `/peaks/:id/tags` | List tags |
| GET | `/peaks/search` | Search by hashtag or caption |

---

## 9. Filters & Overlays

### 9.1 Filters (visual color overlays)

Filters are **metadata-only** — rendered as `LinearGradient` overlays during playback (NOT video re-encoding).

| Filter ID | Name | Gradient colors |
|-----------|------|-----------------|
| `gym_lighting` | Gym Lighting | warm amber tones |
| `golden_hour` | Golden Hour | golden orange |
| `muscle_boost` | Muscle Boost | contrast boost |
| `cold_plunge` | Cold Plunge | blue/cool tones |
| `sunrise_energy` | Sunrise Energy | pink/orange |
| `neon_pump` | Neon Pump | neon green/purple |
| `shadow_def` | Shadow Definition | high contrast |
| `vintage_iron` | Vintage Iron | sepia tones |
| `ocean_calm` | Ocean Calm | teal/aqua |

### 9.2 Overlays (draggable widgets)

Overlays are interactive widgets stored as JSONB metadata:

| Type | Description |
|------|-------------|
| `workout_timer` | Countdown/stopwatch |
| `rep_counter` | Exercise repetition counter |
| `day_challenge` | Challenge day tracker |
| `calorie_burn` | Calorie counter |
| `heart_rate_pulse` | BPM indicator |

---

## 10. File Inventory

### Frontend

| File | Purpose |
|------|---------|
| `src/screens/peaks/PeaksFeedScreen.tsx` | Feed screen (story circles) |
| `src/screens/peaks/PeakViewScreen.tsx` | Full-screen story viewer |
| `src/screens/peaks/CreatePeakScreen.tsx` | Camera + recording |
| `src/screens/peaks/PeakPreviewScreen.tsx` | Publish flow |
| `src/screens/peaks/ChallengesScreen.tsx` | Browse challenges |
| `src/components/peaks/PeakCard.tsx` | Grid card (profile only) |
| `src/components/peaks/PeakCarousel.tsx` | Progress indicator (viewer) |
| `src/components/peaks/PeakProgressRing.tsx` | Animated ring |
| `src/components/peaks/RecordButton.tsx` | Hold-to-record |
| `src/components/peaks/ExpiredPeakModal.tsx` | Expiration decision modal |
| `src/components/peaks/ChallengeCard.tsx` | Challenge card |
| `src/components/PeakReactions.tsx` | Emoji reactions bar |
| `src/components/SwipeToPeaks.tsx` | Swipe down gesture (FanFeed) |
| `src/hooks/useExpiredPeaks.ts` | Expiration check hook |

### Backend

| File | Endpoint |
|------|----------|
| `aws-migration/lambda/api/peaks/list.ts` | GET /peaks |
| `aws-migration/lambda/api/peaks/get.ts` | GET /peaks/:id |
| `aws-migration/lambda/api/peaks/create.ts` | POST /peaks |
| `aws-migration/lambda/api/peaks/delete.ts` | DELETE /peaks/:id |
| `aws-migration/lambda/api/peaks/expired.ts` | GET /peaks/expired |
| `aws-migration/lambda/api/peaks/save-decision.ts` | POST /peaks/:id/save-decision |
| `aws-migration/lambda/api/peaks/like.ts` | POST /peaks/:id/like |
| `aws-migration/lambda/api/peaks/unlike.ts` | DELETE /peaks/:id/like |
| `aws-migration/lambda/api/peaks/comment.ts` | GET/POST /peaks/:id/comments |
| `aws-migration/lambda/api/peaks/replies.ts` | GET/POST /peaks/:id/replies |
| `aws-migration/lambda/api/peaks/react.ts` | POST/DELETE /peaks/:id/react |
| `aws-migration/lambda/api/peaks/hide.ts` | POST/DELETE /peaks/:id/hide |
| `aws-migration/lambda/api/peaks/tag.ts` | POST/DELETE /peaks/:id/tag |
| `aws-migration/lambda/api/peaks/search.ts` | GET /peaks/search |

---

## 11. Non-Conformance Checklist

When auditing, verify these rules are NOT violated:

- [ ] Peaks are grouped by author in the feed (NOT individual cards)
- [ ] Story circles show gradient ring for unviewed, gray for viewed
- [ ] Tap left/right navigates within SAME author's group
- [ ] After last peak in group, advances to NEXT author
- [ ] Progress bars count = peaks in CURRENT author's group
- [ ] Hidden peaks (peak_hidden) excluded from feed query
- [ ] `is_viewed` field returned by GET /peaks
- [ ] Expired peaks not shown in feed (only in profile if saved)
- [ ] Business accounts cannot create peaks
- [ ] Duration options: 6s, 10s, 15s, 60s
- [ ] Feed duration: 24h or 48h (default 48h)
- [ ] Profile display: 3-column grid (not story circles)
- [ ] ExpiredPeakModal shown on app foreground for pending expired peaks
