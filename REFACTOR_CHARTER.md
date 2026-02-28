# Refactor Charter — Phase 0 (API Split, Safe)

## Goal
Split `aws-api.ts` (~214 methods) into 11 domain modules (~95 methods extracted) while keeping `aws-api.ts` as the public entry point.
Phase 0 is MOVE/SPLIT ONLY: no behavior change, no public contract change, no screen import change.
Methods not in scope (business/payments/device sessions/live streams/transversal utils) stay in `aws-api.ts`.

## Core Invariants — Sacred Set (NON-NEGOTIABLE, ALL PHASES)
The following must remain strictly unchanged:
- `AWSAPIService.request()` — handles GET deduplication via `inFlightGets`
- `AWSAPIService._requestWithRetry()` — retry on 408/429/5xx, exponential backoff
- `AWSAPIService._requestOnce()` — routing, auth header, 401 + refresh + double-401 signOut
- `AWSAPIService._refreshToken()` — token refresh flow
- `inFlightGets` — GET deduplication map

This includes: GET deduplication logic, retry strategy, timeout behavior, token refresh flow,
double-401 logout behavior, authorization header injection, endpoint routing logic, error mapping,
Sentry capture behavior.

## Existing Structure (RESPECT, DO NOT BREAK)
`src/services/api/` already contains:
- `index.ts` — barrel export (do NOT modify existing exports)
- `types.ts` — shared API types
- `error.ts` — APIError class
- `internal-types.ts` — internal type definitions

New domain modules are ADDED alongside these files. Do not rename, move, or modify existing files.

## Frozen Split Method (Phase 0)
- `aws-api.ts` remains the singleton service and public entry point.
- Domain files export pure functions receiving the `api` instance.
  - Example: `export async function smartSignup(api: AWSAPIService, input) { return api.request(...) }`
- `aws-api.ts` keeps the same public methods (names + signatures) and delegates to domain functions.
- Replace `this` with `api` inside moved code. No endpoint/payload/header changes.

## Helper Strategy
- Pure helper, single domain → move into the domain module as local function
- Pure helper, shared across 2+ domains → extract into `src/services/api/helpers.ts`
- Helper with internal state → do NOT extract, leave in `aws-api.ts`, report to human
- FORBIDDEN: making private helpers public/protected, duplicating helpers across modules

## Target Structure (Phase 0)
src/services/api/
  index.ts              (existing — do not break)
  types.ts              (existing — do not modify)
  error.ts              (existing — do not modify)
  internal-types.ts     (existing — do not modify)
  helpers.ts            (NEW — shared pure helpers between domains)
  authApi.ts            (NEW — 5 methods)
  notificationsApi.ts   (NEW — ~7 methods)
  socialApi.ts          (NEW — ~5 methods)
  profileApi.ts         (NEW — ~5 methods, incl. searchProfiles)
  feedApi.ts            (NEW — ~3 methods)
  postApi.ts            (NEW — ~6 methods)
  uploadApi.ts          (NEW — 2 methods: getUploadUrl, getUploadQuota)
  peaksApi.ts           (NEW — ~20 methods + normalizePeak* local helpers)
  messagingApi.ts       (NEW — ~8 methods)
  mapApi.ts             (NEW — ~10 methods)
  eventsApi.ts          (NEW — ~17 methods: 12 events + 5 groups, PREP-gated)

What stays in aws-api.ts after split (~115 methods):
- Sacred Set (request, _requestWithRetry, _requestOnce, _refreshToken, inFlightGets)
- Business (~30+ methods) — monetization, not MVP
- Payments/Stripe (~15 methods) — monetization, not MVP
- Device sessions, push tokens, consent, account management (~10 methods)
- Live streams + Battles (~8 methods) — streaming, not MVP
- Transversal utilities (validateEmail, checkUserExists, storeContacts, submitProblemReport)
- Dead code: comments methods (createComment, getComments, deleteComment — 0 screen callers)

Note: getPostLikers → assign to socialApi or postApi during PREP (check primary callers).
getFollowingUsers → assign to socialApi during PREP.

## Phase 0 Scope Order (lowest coupling → highest)
S3: AUTH (5, 0 helpers) → S4: NOTIFICATIONS (~7) → S5: SOCIAL (~5) →
S6: PROFILE (~5) → S7: FEED (~3) → S8: POST (~6, may use withMediaReadyRetry) →
S9: UPLOAD (2, shares withMediaReadyRetry with POST) →
S10: PEAKS (~20, uses normalizePeak*) → S11: MESSAGING (~8, verify ws token) →
S12: MAP (~10, verify live pins) → S13: EVENTS (~17, PREP-gated)

## Phase 0 Special Conditions (Non-Negotiable)

### Condition 1 — Events = PREP-gated
Events is scaffolded but MOVED only if PREP confirms:
- No dependency on internal state (signingOut, refreshPromise, etc.)
- No non-pure helper blocking extraction
- No need to touch Sacred Set
If any condition fails → leave methods in aws-api.ts, mark "deferred" in EXECUTION_LOG.md.

### Condition 2 — Helper Strategy enforced from S8 onward
- `withMediaReadyRetry` / `isMediaNotReadyError` → extract to `helpers.ts` before S8 (separate commit)
- `normalizePeak*` → co-locate in `peaksApi.ts` as local functions
- Any helper with internal state → deferred, not extracted

### Condition 3 — database.ts is UNTOUCHED in Phase 0
`database.ts` makes direct `awsAPI.request('/...')` calls for search/discover.
Phase 0 = architecture split only. No redesign of call paths.
- Do NOT create dedicated search methods
- Do NOT rename endpoints
- Do NOT change how database.ts calls awsAPI

## AUTH Methods (S3 Scope — Exact List)
- `smartSignup`
- `confirmSignup`
- `resendConfirmationCode`
- `forgotPassword`
- `confirmForgotPassword`

Source of truth for contracts: `src/__tests__/services/aws-api.methods.test.ts`

## Circular Import Prevention
`api/index.ts` re-exports `awsAPI` from `../aws-api`. Domain modules MUST import directly:
```typescript
// CORRECT — domain module imports
import type { AWSAPIService } from '../aws-api';

// WRONG — creates circular import
import { awsAPI } from './index';
```

## Hard Rules
DON'T: change screen imports, rename public methods, change signatures, modify Sacred Set,
introduce Result ok/err types, globally rewire calls through client.ts, refactor navigation/UI/state,
break existing barrel exports in api/index.ts, import from `api/index.ts` inside domain modules.
DO: Move/split only. One commit per step. Revert immediately if gates fail.

## Gates: lint + typecheck (`npx tsc --noEmit`)
## Smoke Tests: See SMOKE_TESTS.md
## Rollback: `git reset --hard pre-refactor-phase0`

---

## Navigation Split (Phase 3)

### Frozen invariants (must NOT change)
- Route names (string `name="..."`) stay identical.
- Params shape/types stay identical.
- Deep link / linking config paths stay identical.
- Initial route behavior stays identical.
- Modal vs push presentation stays identical.
- Tab structure stays identical (same tabs, same order, same icons/labels).

### Current state
- `src/navigation/MainNavigator.tsx` — 584 lines, 89 stack routes + 5 tab screens
- All non-core screens lazy-loaded via `React.lazy()` + Suspense + ErrorBoundary
- 1 modal presentation: `InviteToBattle`
- Deep linking in `AppNavigator.tsx` (12 routes with UUID validation)
- Badge polling (notifications + messages) in MainNavigator module scope

### Route inventory (source of truth for split)

#### Settings Stack (13 routes)
| Route name | Target stack | Animation | Notes |
|-----------|-------------|-----------|-------|
| Settings | SettingsStack | slide_from_right | Entry point |
| EditProfile | SettingsStack | slide_from_right | |
| EditInterests | SettingsStack | slide_from_right | |
| EditExpertise | SettingsStack | slide_from_right | |
| EditBusinessCategory | SettingsStack | slide_from_right | |
| PasswordManager | SettingsStack | slide_from_right | |
| NotificationSettings | SettingsStack | slide_from_right | |
| ReportProblem | SettingsStack | slide_from_right | |
| TermsPolicies | SettingsStack | slide_from_right | |
| BlockedUsers | SettingsStack | slide_from_right | |
| MutedUsers | SettingsStack | slide_from_right | |
| DataExport | SettingsStack | slide_from_right | |
| UpgradeToPro | SettingsStack | slide_from_right | Feature-flagged |

#### Profile Stack (3 routes)
| Route name | Target stack | Animation | Notes |
|-----------|-------------|-----------|-------|
| UserProfile | ProfileStack | slide_from_right | |
| FansList | ProfileStack | slide_from_right | |
| PostLikers | ProfileStack | slide_from_right | |

#### Notifications Stack (2 routes)
| Route name | Target stack | Animation | Notes |
|-----------|-------------|-----------|-------|
| Notifications | NotificationsStack | slide_from_right | |
| FollowRequests | NotificationsStack | slide_from_right | |

#### Search Stack (1 route)
| Route name | Target stack | Animation | Notes |
|-----------|-------------|-----------|-------|
| Search | SearchStack | slide_from_right | |

#### Home Stack (5 routes)
| Route name | Target stack | Animation | Notes |
|-----------|-------------|-----------|-------|
| PostDetailFanFeed | HomeStack | fade | From fan feed |
| PostDetailVibesFeed | HomeStack | fade | From vibes feed |
| PostDetailProfile | HomeStack | fade | From profile |
| PeakView | HomeStack | fade | |
| Prescriptions | HomeStack | slide_from_right | |
| ActivePrescription | HomeStack | slide_from_bottom | |

#### Create Stack (5 routes)
| Route name | Target stack | Animation | Notes |
|-----------|-------------|-----------|-------|
| CreatePost | CreateStack | slide_from_bottom | |
| VideoRecorder | CreateStack | slide_from_bottom | |
| AddPostDetails | CreateStack | slide_from_right | |
| PostSuccess | CreateStack | fade | |
| CreatePeak | CreateStack | slide_from_bottom | |
| PeakPreview | CreateStack | slide_from_right | |
| Challenges | CreateStack | slide_from_right | Feature-flagged |

#### Remain in MainNavigator (~56 routes)
Messages (Chat, NewMessage), Live Streaming (5), Battles (4), Activities (4),
Spots (2), Business Discovery (4), Business Booking (4), Business Owner (5),
Private Sessions (8), Creator Offerings (5), Creator Dashboard (2),
Payments (4), Disputes (4), PrescriptionPreferences, FindFriends, WebView.

These stay in MainNavigator until a future phase addresses them.

### Status
DONE (with known minor navigation bugs to fix)

### Final navigation layout
- Main navigator (tabs + remaining routes): `src/navigation/MainNavigator.tsx` (483 lines, down from 584)
- Shared helpers: `src/navigation/shared.tsx`
- Stacks:
  - `src/navigation/stacks/SettingsStack.tsx` (13 routes)
  - `src/navigation/stacks/ProfileStack.tsx` (3 routes)
  - `src/navigation/stacks/NotificationsStack.tsx` (2 routes)
  - `src/navigation/stacks/SearchStack.tsx` (1 route)
  - `src/navigation/stacks/HomeStack.tsx` (6 routes)
  - `src/navigation/stacks/CreateStack.tsx` (7 routes)

### Verification
- lint: PASS
- typecheck: PASS
- tests: PASS (3450/3450)
- nav smoke: App runs, minor bugs noted for follow-up

### Invariants upheld
- No route renames
- No param shape changes
- No linking/deep link changes
- No modal vs push presentation changes
- No tab order/structure changes

---

## Phase 5 — Post-Refactor Production Readiness

### 5.1 — Freeze Rules (Active)

1. **No More Structural Refactors** — no folder reshuffling, navigation restructuring, or API contract changes. Allowed: bug fixes, small features, performance improvements.
2. **No Opportunistic Refactors** — fix the bug, leave. No "while I'm here" edits.
3. **Result Pattern** — strongly recommended for new async methods in domain API files. Not a hard blocker until enforced by ESLint rule.
4. **MainNavigator Is Frozen** — route names = contract. Changing them breaks deep links, navigation calls, analytics.
5. **Sacred Set Is Sacred** — do not touch `request`/`_requestWithRetry`/`_requestOnce`/`_refreshToken`/`inFlightGets` unless fixing a critical production bug.

### 5.2 — Pre-Release Stability Gates

| Gate | Requirement | Status |
|------|------------|--------|
| A — Maestro Smoke | 4 flows minimum (login, feed, create post, logout) | READY (17 flows exist) |
| B — Crash-Free | ≥ 99.5% crash-free sessions, no blocking flow bugs | TO VERIFY (staging) |
| C — Performance | Feed p95 < 3s, create flow no freeze, no double API calls | TO VERIFY |
| D — Data Integrity | No duplicate posts, like/unlike sync, upload failures safe | TO VERIFY |
| E — Create Post | ≥ 99% success on 50-100 internal test attempts | TO VERIFY |

### 5.3 — Security & Secrets Checklist

| Item | Status | Notes |
|------|--------|-------|
| No secrets in repo | PASS | .env.example only; test mocks use `sk_test_fake` |
| .env in .gitignore | PASS | Lines 40-42, 69 cover all variants |
| Production config separation | PASS | `env.ts` + `aws-config.ts` switch on `__DEV__`/`APP_ENV` |
| Sentry PII scrubbing | PASS | `beforeSend` scrubs emails, tokens, passwords; `sendDefaultPii: false` |
| No auth tokens logged without `__DEV__` | PASS | All token/presigned URL logging guarded |
| No presigned URLs in production logs | PASS | Only key prefix logged, never full URL |
| Token storage | PASS | `expo-secure-store` (Keychain/Keystore encrypted) |
| Input validation | PASS | HTML/control char sanitization, parameterized SQL |
| Error messages | PASS | Generic to client, full details server-side only |

### 5.4 — Operational Readiness Checklist

| Item | Status | Notes |
|------|--------|-------|
| EAS profiles (dev/preview/prod) | WARN | All 3 exist; production uses `environment: "preview"` — expected (no prod infra yet) |
| API base URL switching | PASS | `__DEV__` flag + `APP_ENV` env var in `env.ts` |
| Sentry DSN per environment | WARN | Single DSN; recommend separate projects for prod launch |
| Secure env vars | PASS | `.env.example` with placeholders, secrets not committed |
| Build config sanity | WARN | Relies on Expo defaults for release mode; add explicit `optimization: true` for clarity |

### Production launch blocklist (before prod deploy)
1. Create separate Sentry projects for staging and production
2. Update `eas.json` production profile: `environment: "production"`, `APP_ENV: "production"`
3. Migrate sensitive values to EAS Secrets UI
4. Verify all 5 stability gates (B–E) pass on staging
