# Smuppy — Zero-Bug Enforcement Audit

## Build Provenance
| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Build | 81 |
| Git SHA | 2e1859af |
| API Base | (production — via expoConfig.extra) |
| Runtime | 1.0.0 |
| EAS Profile | production |
| Expo SDK | 54.0.0 |
| Device | iPhone 16 Pro Max (iPhone17,2) |
| Audit Date | 2026-02-21 |

---

## Bug List

### P0 — Critical (Blocks core flow)

#### BUG-001: Video playback errors show blank screen — no recovery UI
- **Severity:** P0
- **File:** `src/screens/peaks/PeakViewScreen.tsx` lines 1276-1289
- **Repro:** Open a peak with a broken/slow video URL → screen stays blank
- **Expected:** Error state with thumbnail fallback + retry button
- **Actual:** `onError` logs to Sentry breadcrumb but NO state update — user stuck on blank
- **Root Cause:** `onError` callback only logs, doesn't set error state or show fallback UI
- **Fix Plan:** Add `isVideoError` state; on error, show poster image + "Tap to retry" overlay
- **Status:** 🟢 FIXED (43371291)

#### BUG-002: HLS/MP4 URL can pass empty string to Video component
- **Severity:** P0
- **File:** `src/utils/cdnUrl.ts` lines 53-59
- **Repro:** Peak with both `hlsUrl` and `videoUrl` as empty strings
- **Expected:** `undefined` returned, Video component not rendered
- **Actual:** Empty string `''` may bypass falsy check in intermediate code
- **Root Cause:** `normalizeCdnUrl('')` returns `''` which is falsy → converts to `undefined` correctly. BUT callers may pass raw `hlsUrl || videoUrl` without going through `getVideoPlaybackUrl()`
- **Fix Plan:** Add explicit guard in PeakViewScreen video source resolution
- **Status:** 🟢 FIXED (8b7d2051)

#### BUG-003: Carousel image failures leave blank gaps
- **Severity:** P0
- **File:** `src/screens/home/FanFeed.tsx` lines 138-169
- **Repro:** Post with multi-image carousel where one image CDN URL is broken
- **Expected:** Failed image shows placeholder/retry
- **Actual:** Blank gap in carousel; user sees white space
- **Root Cause:** No `onError` handler on carousel images; OptimizedImage shows placeholder but carousel doesn't adjust layout
- **Fix Plan:** Already handled by OptimizedImage error placeholder — verify on device. May be cosmetic only.
- **Status:** 🟡 NEEDS VERIFICATION

### P1 — High (Security, data integrity, broken critical UX)

#### BUG-004: Avatar/cover upload race condition — no rollback on failure
- **Severity:** P1
- **File:** `src/screens/profile/ProfileScreen.tsx` lines 443-480
- **Repro:** Upload avatar → network fails mid-upload
- **Expected:** Avatar reverts to previous image
- **Actual:** UI shows new image (optimistic update) but backend has old image. Out of sync until refetch.
- **Root Cause:** Optimistic update at line 445 before upload completes; no rollback in error path (line 459)
- **Fix Plan:** Store previous image URL before optimistic update; restore on error
- **Status:** 🟢 FIXED (45c0af5b)

#### BUG-005: Profile data from 3 sources not reconciled
- **Severity:** P1
- **File:** `src/screens/profile/ProfileScreen.tsx` lines 157-162, 406-420
- **Repro:** Edit profile → save → navigate away → return
- **Expected:** Profile shows latest saved data
- **Actual:** May show stale data from previous fetch (race between Zustand, React Query, local state)
- **Root Cause:** Three data sources (`currentProfileData`, `storeUser`, local `user`) with no single source of truth
- **Fix Plan:** Verify React Query invalidation after mutation. Add explicit refetch on screen focus.
- **Status:** 🟡 NEEDS VERIFICATION

#### BUG-006: CDN domain fallback silently uses empty staging bucket
- **Severity:** P1
- **File:** `src/config/aws-config.ts` lines 100-106
- **Repro:** Build with missing EXPO_PUBLIC_CDN_DOMAIN env var
- **Expected:** Explicit error or warning
- **Actual:** Falls back to staging CDN pointing to empty S3 bucket — all images break silently
- **Root Cause:** Fallback chain prioritizes "never crash" over "fail visibly"
- **Fix Plan:** This was already fixed in commit a2786cb7. Verify on Build #81.
- **Status:** 🟢 LIKELY FIXED (verify)

#### BUG-007: Image load errors not user-actionable
- **Severity:** P1
- **File:** `src/components/OptimizedImage.tsx` lines 87-93, 107-120
- **Repro:** Image fails to load in feed
- **Expected:** Error state with retry option
- **Actual:** Shows gray placeholder with generic icon — no retry, no distinction from "loading"
- **Root Cause:** Error state renders static placeholder without action callback
- **Fix Plan:** Add tap-to-retry on error placeholder
- **Status:** 🟢 FIXED (011642b2)

#### BUG-008: useSocialAuth swallows Google auth errors silently
- **Severity:** P1
- **File:** `src/hooks/useSocialAuth.ts` lines 91-95
- **Repro:** Google Sign-In times out or fails
- **Expected:** Error shown to user
- **Actual:** Loading spinner clears silently, no feedback
- **Root Cause:** Outer `.catch()` only resets loading state, doesn't surface error
- **Fix Plan:** Call `onError()` callback in catch block
- **Status:** 🟢 FIXED (43371291)

### P2 — Medium (Functional bug with workaround)

#### BUG-009: Push token registration may not complete before navigation
- **Severity:** P2
- **File:** `src/hooks/useNotifications.ts` lines 231-246
- **Repro:** Open app → quickly navigate away from main screen
- **Expected:** Token registration completes via retry
- **Actual:** Cleanup may cancel pending retry if component unmounts
- **Root Cause:** Timer-based retry cancelled on unmount
- **Fix Plan:** Move registration to AppNavigator level (persists across navigation)
- **Status:** 🟡 LOW PRIORITY

#### BUG-010: Bio save has no explicit server response validation
- **Severity:** P2
- **File:** `src/screens/settings/EditProfileScreen.tsx` lines 258-334
- **Repro:** Edit bio → save → network error
- **Expected:** Error shown
- **Actual:** May proceed to `goBack()` without confirming save succeeded
- **Root Cause:** try/catch too broad; doesn't check mutation response explicitly
- **Status:** 🟡 NEEDS VERIFICATION

#### BUG-011: Hardcoded dummyimage.com placeholder URLs
- **Severity:** P2
- **File:** `src/screens/home/VibesFeed.tsx` line 90, `src/screens/peaks/PeaksFeedScreen.tsx` line 68
- **Repro:** External service down → placeholders fail too
- **Expected:** Local/inline placeholder
- **Actual:** Loads from dummyimage.com — fails if service is down
- **Fix Plan:** Replace with local base64 PNG or bundled asset
- **Status:** 🟢 FIXED (1cb54f12)

#### BUG-012: Prefetch errors not tracked — failed URLs marked as prefetched
- **Severity:** P2
- **File:** `src/screens/home/FanFeed.tsx` lines 976-990
- **Repro:** Image prefetch fails for a URL
- **Expected:** URL not marked as prefetched so it retries
- **Actual:** URL added to `prefetchedUrlsRef` before result — never retried
- **Status:** 🟡 LOW PRIORITY

### P3 — Cosmetic / Minor

#### BUG-013: Notification avatar field inconsistency
- **Severity:** P3
- **File:** `src/screens/notifications/NotificationsScreen.tsx` lines 199-202
- **Detail:** Checks `avatar` and `avatarUrl` but not `avatar_url` (snake_case from API)
- **Status:** 🟡 LOW PRIORITY

#### BUG-014: Carousel dot pagination lag on mid-scroll
- **Severity:** P3
- **File:** `src/screens/home/FanFeed.tsx` lines 144-167
- **Detail:** Dots update only on `onMomentumScrollEnd`, not during drag
- **Status:** 🟡 LOW PRIORITY

---

## Fix Log

| Commit | Bug | Description | Verified |
|--------|-----|-------------|----------|
| 43371291 | BUG-001 | Video error retry UI (thumbnail + "Tap to retry") | OTA deployed |
| 43371291 | BUG-008 | Surface Google auth errors to user | OTA deployed |
| 8b7d2051 | BUG-002 | Guard empty video URLs — prevent Video with blank source | OTA deployed |
| 7f0c2feb | BUG-015 | Move maybeCompleteAuthSession to non-lazy AppNavigator | OTA deployed |
| 45c0af5b | BUG-004 | Rollback avatar/cover on upload failure | Pending push |
| 011642b2 | BUG-007 | Tap-to-retry on failed image placeholders | Pending push |
| 1cb54f12 | BUG-011 | Replace dummyimage.com with inline base64 placeholder | Pending push |
| b78f6f87 | PERF | Defer profile sync + lazy-load VibesFeed | OTA deployed |

---

## Certification Status
- **P0 count:** 1 (BUG-003 needs device verification)
- **P1 count:** 2 (BUG-005, BUG-006 need verification)
- **P2 count:** 3 (BUG-009, BUG-010, BUG-012)
- **P3 count:** 2 (BUG-013, BUG-014)
- **Certified:** ❌ NO (pending device verification + social auth test)
