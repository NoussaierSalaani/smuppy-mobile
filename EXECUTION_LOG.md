# Execution Log — Phase 0

## S0 — Baseline (PRE-REFACTOR)
- Branch (before S0): main @ f2623bf1
- Tag created: pre-refactor-phase0 (yes)
- Branch created: refactor/phase0-api-split (yes)
- Gates:
  - lint: PASS (command: npm run lint — 0 errors, 1 pre-existing warning)
  - typecheck: PASS (command: npx tsc --noEmit — 0 errors)
- Notes: Untracked files (screenshots, audit-logs, artifacts) present but no tracked modifications.

## S1 — Docs added
- Commit: 3d34d8e3
- Files: REFACTOR_CHARTER.md, SMOKE_TESTS.md, EXECUTION_LOG.md (3 new files)
- Gates:
  - lint: PASS (0 errors, 1 pre-existing warning)
  - typecheck: PASS (0 errors)
- Verdict: PASS
- S1.1: Charter updated (Core Invariants + AUTH Scope frozen)

## S2 — Scaffold domain modules
- Commit: 1e1e111e
- Files: 12 new files in src/services/api/ (helpers + 11 domain modules)
- Existing files confirmed untouched: index.ts, types.ts, error.ts, internal-types.ts
- Gates:
  - lint: PASS (0 errors, 1 pre-existing warning)
  - typecheck: PASS (0 errors)
- Verdict: PASS

## S3 — Extract AUTH
- Commit: 328670f0
- Methods moved: smartSignup, confirmSignup, resendConfirmationCode, forgotPassword, confirmForgotPassword
- Files changed: aws-api.ts (delegations + export class), authApi.ts (5 domain functions)
- Note: Added `export` to `class AWSAPIService` for type import in domain modules
- Helpers: none needed (all 5 methods only call api.request)
- Gates:
  - lint: PASS (0 errors)
  - typecheck: PASS (0 errors)
- Verdict: PASS — awaiting human smoke test
## S4 — Extract NOTIFICATIONS
- Commit: d34313de
- Methods moved (10): getNotifications, getActivityHistory, markNotificationRead, markAllNotificationsRead, getUnreadCount, deleteNotification, registerPushToken, unregisterPushToken, getNotificationPreferences, updateNotificationPreferences
- Files changed: aws-api.ts + notificationsApi.ts only
- Helpers: none needed
- Gates: lint PASS, typecheck PASS
- Smoke: 565/565 unit tests pass (methods + service + comprehensive)
- Verdict: PASS
## S5 — Extract SOCIAL
- Commit: (pending)
- Methods moved (6): followUser, unfollowUser, getFollowers, getFollowing, getPostLikers, getFollowingUsers
- Files changed: aws-api.ts + socialApi.ts only
- Helpers: none needed
- Gates: lint PASS, typecheck PASS
- Smoke: 565/565 unit tests pass
- Verdict: PASS
## S6 — Extract PROFILE
- Commit: (pending)
- Methods moved (6): getProfile, getProfileByUsername, updateProfile, upgradeToProCreator, checkCreationLimits, searchProfiles
- Files changed: aws-api.ts + profileApi.ts only
- Helpers: none needed
- Gates: lint PASS, typecheck PASS
- Smoke: 565/565 unit tests pass
- Verdict: PASS
## S7 — Extract FEED
- Commit: (pending)
- Methods moved (1): getFeed
- Note: Only 1 method (not ~3 as estimated). getPosts belongs to POST domain.
- Files changed: aws-api.ts + feedApi.ts only
- Helpers: none needed
- Gates: lint PASS, typecheck PASS
- Smoke: 565/565 unit tests pass
- Verdict: PASS
## S8 — Extract POST (+ shared helpers to helpers.ts)
- Helper commit: cc2065e1 — withMediaReadyRetry + isMediaNotReadyError → helpers.ts (separate commit)
- POST commit: (pending)
- Methods moved (6): getPosts, getPost, createPost, updatePost, deletePost, likePost
- createPost uses withMediaReadyRetry directly from helpers.ts (no more this.withMediaReadyRetry)
- Files changed: aws-api.ts + postApi.ts only
- Gates: lint PASS, typecheck PASS
- Smoke: 565/565 unit tests pass
- Verdict: PASS
## S9 — Extract UPLOAD
- Commit: (pending)
- Methods moved (2): getUploadUrl, getUploadQuota
- Files changed: aws-api.ts + uploadApi.ts only
- Helpers: none needed (APIError imported from error.ts)
- Gates: lint PASS, typecheck PASS
- Smoke: 565/565 unit tests pass
- Verdict: PASS
## S10 — Extract PEAKS
- Commit: 89b4ec40
- Methods moved (20): getPeaks, getPeak, createPeak, likePeak, reactToPeak, removeReactionFromPeak, tagFriendOnPeak, getPeakTags, hidePeak, getPeakComments, commentOnPeak, deletePeak, getExpiredPeaks, savePeakDecision, createChallenge, getChallenges, getChallengeDetail, getChallengeResponses, respondToChallenge, voteChallengeResponse
- Private helpers removed from class: normalizePeakAuthor, normalizePeak (co-located in peaksApi.ts as local functions — Case 1)
- createPeak uses withMediaReadyRetry from helpers.ts
- Files changed: aws-api.ts + peaksApi.ts only
- Gates: lint PASS, typecheck PASS
- Smoke: 565/565 unit tests pass
- Verdict: PASS
## S11 — Extract MESSAGING
- Commit: ccae4001
- Methods moved (8): getConversations, getConversation, createConversation, getOrCreateConversation, getMessages, sendMessage, deleteMessage, markConversationRead
- Files changed: aws-api.ts + messagingApi.ts only
- Helpers: none needed
- Gates: lint PASS, typecheck PASS
- Smoke: 565/565 unit tests pass
- Verdict: PASS
## S12 — Extract MAP
- Commit: c6d940c0
- Methods moved (15): createSpot, getSpot, getNearbySpots, createReview, getReviews, getCategories, suggestSubcategory, createLivePin, deleteLivePin, startLiveStream, endLiveStream, getActiveLiveStreams, getNearbyLivePins, getMapMarkers, searchMap
- Files changed: aws-api.ts + mapApi.ts only
- Helpers: none needed
- Gates: lint PASS, typecheck PASS
- Smoke: 565/565 unit tests pass
- Verdict: PASS
## S13 — Extract EVENTS (PREP-gated)
- PREP verdict: PASS — no state dependencies, all clean request() calls
- Commit: 3f4860a3
- Methods moved (17): createEvent, getEvents, getEventDetail, getEventParticipants, joinEvent, leaveEvent, createEventPayment, confirmEventPayment, updateEvent, cancelEvent, removeEventParticipant, eventAction, createGroup, getGroups, getGroup, joinGroup, leaveGroup
- Files changed: aws-api.ts + eventsApi.ts only
- Helpers: none needed
- Gates: lint PASS, typecheck PASS
- Smoke: 565/565 unit tests pass
- Verdict: PASS

## Phase 0 — All Domain Extractions Complete
- Total methods extracted: 5 (AUTH) + 10 (NOTIF) + 6 (SOCIAL) + 6 (PROFILE) + 1 (FEED) + 6 (POST) + 2 (UPLOAD) + 20 (PEAKS) + 8 (MSG) + 15 (MAP) + 17 (EVENTS) = **96 methods**
- Shared helpers extracted: 2 (withMediaReadyRetry, isMediaNotReadyError)
- Private helpers co-located: 2 (normalizePeakAuthor, normalizePeak in peaksApi.ts)
- All 11 domain modules populated
- Sacred Set untouched: request, _requestWithRetry, _requestOnce, _refreshToken, inFlightGets
- All gates green across all 13 steps
