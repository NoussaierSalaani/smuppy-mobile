# SMUPPY MOBILE — Codebase Refactor & Stabilization Guide (Complete)

> **Version 3.3 — February 2026**
> Single source of truth. Follow chronologically. Do not skip steps.
> Includes all prompts (ready to paste), gates, smoke tests, stop conditions.

---

## Overview & Ground Rules

### Roles (Non-Negotiable)

- **Claude Code** = Executor + Reviewer. Executes steps, runs gates, reviews own diffs, makes scope decisions. Follows this document exactly. Claude Code executes and self-audits, but never changes the plan without STOP + human approval.
- **Human (You)** = Manual smoke tests, gives "next" confirmation between steps, final approval.

### Universal Rules

- **No behavior change:** Move/split code only. Same endpoints, payloads, return types, error behavior.
- **One commit per step:** Small, reversible. If gates fail, fix immediately or revert.
- **Gates after every commit:** lint + typecheck (`npx tsc --noEmit`). No exceptions.
- **Facade pattern:** `aws-api.ts` remains the public entry point. Zero screen import changes in Phase 0.
- **Core invariant (Sacred Set):** These methods are NEVER modified across ALL phases:
  - `request`
  - `_requestWithRetry`
  - `_requestOnce`
  - `_refreshToken`
  - `inFlightGets` (GET deduplication map)
- **No premature abstractions:** No Result types in Phase 0. No `client.ts` rewiring. No navigation refactor until Phase 3.
- **Rollback ready:** `git tag pre-refactor-phase0`. Rollback: `git reset --hard pre-refactor-phase0`

### Anti-Incoherence Guards

- **Guard A — Frozen plan:** Once the charter is validated, the target structure does not change mid-execution.
- **Guard B — Strict sequencing:** Execute step → run gates → show report → WAIT for human "next" → proceed.
- **Guard C — No improvisation:** Do exactly what the step says. No "while I'm here" improvements.

### Stop Conditions (All Phases)

- Any extraction forces changes to request core (Sacred Set)
- Any screen import must change (Phase 0)
- Any user-visible flow change is required (Phase 2) — STOP and explain to human
- Gates fail twice in a row on the same step — revert + explain
- Helper with internal state dependency cannot be safely extracted — reporter to later phase

### Helper Strategy (Phase 0)

When extracting domain methods that depend on private helpers:

**Case 1 — Pure helper, single domain** (e.g., `normalizePeak()`, `normalizePeakAuthor()`):
- Move the helper into the domain module file as a local function (not exported unless needed by tests)
- It becomes co-located with its only consumer

**Case 2 — Pure helper, shared across 2+ domains** (e.g., `withMediaReadyRetry()`, `isMediaNotReadyError()`):
- Extract into `src/services/api/helpers.ts` as an exported function
- Both domain modules import from `helpers.ts`
- NEVER duplicate across modules
- Known consumers: `createPost` (postApi) AND `createPeak` (peaksApi) — both depend on `helpers.ts`

**Case 3 — Helper with internal state** (e.g., depends on `signingOut`, `refreshPromise`, class instance state):
- Do NOT extract in Phase 0
- Leave the methods that depend on it in `aws-api.ts`
- Report to human: "these N methods stay in aws-api.ts because of state dependency"

**Forbidden:**
- Making private helpers `public`/`protected` just to enable the split (changes internal API surface)
- Duplicating helpers across domain modules

### Error Details Sanitization Rule (All Phases)

When using `err(code, message, details?)` in Phase 2+:
- `details` must NEVER contain: headers, tokens, presigned URLs, passwords, emails, auth codes
- In production: `details` should be minimal or empty
- In dev: `details` can include sanitized error info for debugging
- When in doubt: omit `details` entirely

---

# PHASE 0 — API Split (Safe Refactor)

**Goal:** Split `aws-api.ts` (~214 methods) into 11 domain modules (~95 methods extracted) while keeping it as a facade. Zero behavior change. Zero screen import changes. ~115 methods (Sacred Set, business ~30, payments ~15, battles ~5, device/push ~8, live streams ~4, account management ~3, transversal utils ~4, dead code comments ~3, and remaining misc) stay in `aws-api.ts`. `database.ts` is untouched.

**Scaffold vs Extract:** We scaffold 12 domain files (11 modules + helpers.ts). We expect to extract 10–11 modules in Phase 0. Events is PREP-gated: if PREP reveals coupling or state dependencies, it remains deferred (empty scaffold, methods stay in `aws-api.ts`).

---

## S0 — Preflight + Rollback Tag + Working Branch

**Owner:** Claude Code

```
STEP S0 — Pre-flight + rollback tag + working branch (NO CODE CHANGES)

1) Verify clean state + correct repo:
   Run:
     git status
     git rev-parse --show-toplevel
     git branch --show-current
   Requirement:
     - Working tree must be clean.

2) Create rollback tag:
   Run:
     git tag pre-refactor-phase0
     git push --tags   (if remote exists)

3) Create working branch:
   Run:
     git checkout -b refactor/phase0-api-split

4) Baseline gates (Expo / React Native safe):
   Run:
     pnpm lint || yarn lint || npm run lint
     pnpm typecheck || yarn typecheck || npm run typecheck || npx tsc --noEmit

   DO NOT run start as an automated gate.
   Typecheck is sufficient for Phase 0.

5) Report back in structured format:
   - Current branch name
   - Tag exists (yes/no)
   - lint result (PASS/FAIL)
   - typecheck result (PASS/FAIL)
   - Any errors if failures occurred
```

**→ WAIT for human confirmation before proceeding.**

---

## S1 — Add Governance Docs

**Owner:** Claude Code

```
STEP S1 — Add Phase 0 governance docs (NO CODE REFACTOR YET)

GOAL:
Add 3 governance docs (1-page each) with correct naming (REFACTOR*),
and pre-fill EXECUTION_LOG S0 with the actual results from Step S0.
No other changes.

FILES TO CREATE (repo root):
1) REFACTOR_CHARTER.md
2) SMOKE_TESTS.md
3) EXECUTION_LOG.md

CONTENT:

--- REFACTOR_CHARTER.md ---
# Refactor Charter — Phase 0 (API Split, Safe)

## Goal
Split `aws-api.ts` into domain modules while keeping `aws-api.ts` as a facade (barrel re-export).
No behavior change. No screen import changes.

## Hard Rules (Non-negotiable)
1) `aws-api.ts` remains the public entry point.
2) No changes to screens/components imports in Phase 0.
3) Keep identical exported function names + signatures from `aws-api.ts`.
4) Move/split only — no logic changes, no renames.
5) `client.ts` may exist but is OPT-IN only (do not route existing calls through it).
6) Result/ok/err types are NOT part of Phase 0.
7) One commit per step. If gates fail: fix immediately or revert.

## Scope
Phase 0 domains in order (lowest coupling → highest):
AUTH → NOTIFICATIONS → SOCIAL → PROFILE → FEED → POST → UPLOAD → PEAKS → MESSAGING → MAP → EVENTS (PREP-gated)

## Gates (must pass after each commit)
- lint
- typecheck

## Rollback
- `git reset --hard pre-refactor-phase0`

--- SMOKE_TESTS.md ---
# Smoke Tests (Phase 0)

## AUTH
- Login
- Signup (if enabled)
- Logout (if available)
- Forgot password flow

## NOTIFICATIONS
- Open notifications tab
- Verify list loads

## SOCIAL
- Follow/unfollow a user
- View followers/following list

## PROFILE
- Open profile
- Edit profile (if enabled)
- Back navigation

## FEED
- Open Fan feed
- Open Vibes feed
- Scroll 10-15 items
- Open a post

## POST
- Create post
- Like/unlike a post

## UPLOAD
- Create post with media (photo/video)
- Verify upload progress
- Submit and verify it appears

## PEAKS
- Open peaks/challenges
- Interact with a peak

## MESSAGING
- Open conversations list
- Open a conversation
- Send a message

## MAP
- Open map/explorer
- View spots

## EVENTS (if extracted)
- View events
- Join/leave group

--- EXECUTION_LOG.md ---
# Execution Log — Phase 0

## S0 — Baseline (PRE-REFACTOR)
- Branch (before S0):
- Tag created: pre-refactor-phase0 (yes/no)
- Branch created: refactor/phase0-api-split (yes/no)
- Gates:
  - lint: PASS/FAIL (command used: ...)
  - typecheck: PASS/FAIL (command used: ...)
- Notes:

## S1 — Docs added
- Commit:
- Files:
- Gates:
- Verdict: pending

## S2 — Scaffold domain modules
- Commit:
- Files:
- Gates:
- Verdict: pending

## S3 — Extract AUTH
## S4 — Extract NOTIFICATIONS
## S5 — Extract SOCIAL
## S6 — Extract PROFILE
## S7 — Extract FEED
## S8 — Extract POST (+ shared helpers to helpers.ts)
## S9 — Extract UPLOAD
## S10 — Extract PEAKS
## S11 — Extract MESSAGING
## S12 — Extract MAP
## S13 — Extract EVENTS (PREP-gated)

ACTIONS:
1) Create those 3 files with exactly that content.
2) IMPORTANT: Before committing, fill EXECUTION_LOG.md S0 with real outputs from Step S0.
3) git add the 3 files.
4) Commit message:
   chore(refactor): add Phase 0 charter + smoke tests + execution log
5) Run gates:
   pnpm lint || yarn lint || npm run lint
   pnpm typecheck || yarn typecheck || npm run typecheck || npx tsc --noEmit

REPORT BACK:
- Commit hash
- Files changed list (must be only the 3 docs)
- lint PASS/FAIL
- typecheck PASS/FAIL
```

**→ WAIT for human confirmation before proceeding.**

---

## S1.1 — Freeze Charter (Core Invariants + AUTH Scope)

**Owner:** Claude Code

Replace `REFACTOR_CHARTER.md` with this finalized version:

```markdown
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
```

**Execution prompt:**

```
STEP S1.1 — Update REFACTOR_CHARTER.md (Core Invariants + AUTH Scope)

GOAL:
Replace REFACTOR_CHARTER.md with the finalized consolidated version above.
Do not create any new file.

ACTIONS:
1) Replace full content of REFACTOR_CHARTER.md with the provided final version.
2) Update EXECUTION_LOG.md in S1:
   Add: "S1.1 Charter updated (Core Invariants + AUTH Scope frozen)"
3) Commit message:
   docs(refactor): freeze core invariants and auth scope in charter
4) Run gates:
   pnpm lint || yarn lint || npm run lint
   pnpm typecheck || yarn typecheck || npm run typecheck || npx tsc --noEmit

REPORT:
- Commit hash
- Files changed (must be only REFACTOR_CHARTER.md and EXECUTION_LOG.md)
- lint PASS/FAIL
- typecheck PASS/FAIL
```

**→ WAIT for human confirmation before proceeding.**

---

## S2 — Scaffold Domain Modules (Structure Only)

**Owner:** Claude Code

```
STEP S2 — Scaffold API domain modules (structure only, charter-compliant)

GOAL:
Create the 11 domain module files + 1 shared helpers file.
Do NOT move any logic. Do NOT edit aws-api.ts.
Do NOT modify existing files in src/services/api/ (index.ts, types.ts, error.ts, internal-types.ts).

FIRST: Verify existing structure:
  ls -la src/services/api/
  Confirm index.ts, types.ts, error.ts exist. Note what's there.

TARGET FILES TO CREATE (alongside existing files):
- src/services/api/helpers.ts
- src/services/api/authApi.ts
- src/services/api/notificationsApi.ts
- src/services/api/socialApi.ts
- src/services/api/profileApi.ts
- src/services/api/feedApi.ts
- src/services/api/postApi.ts
- src/services/api/uploadApi.ts
- src/services/api/peaksApi.ts
- src/services/api/messagingApi.ts
- src/services/api/mapApi.ts
- src/services/api/eventsApi.ts

CONTENT FOR EACH FILE (exactly):
// Phase 0 scaffold — no logic yet.
// Domain module placeholder.
export {};

RULES (non-negotiable):
- Do NOT modify aws-api.ts.
- Do NOT modify existing files in src/services/api/.
- Do NOT modify any screen/component imports.
- Do NOT modify existing barrel exports in api/index.ts.
- This commit must only ADD these 12 new files.

COMMIT MESSAGE:
refactor(api): scaffold domain api modules (no logic moved)

GATES:
- pnpm lint || yarn lint || npm run lint
- pnpm typecheck || yarn typecheck || npm run typecheck || npx tsc --noEmit

REPORT BACK:
- Commit hash
- Files changed list (must be only the 12 new files)
- Existing files in src/services/api/ (confirm untouched)
- lint PASS/FAIL
- typecheck PASS/FAIL
```

**→ WAIT for human confirmation before proceeding.**

---

## S3 PREP — Verify AUTH Method Signatures

**Owner:** Claude Code — NO code changes, observation only.

```bash
# 1) Find the 5 AUTH methods with context
rg -n -C 20 "smartSignup|confirmSignup|resendConfirmationCode|forgotPassword|confirmForgotPassword" src/services/aws-api.ts

# 2) Confirm the contract from aws-auth.ts
rg -n "awsAPI\.(smartSignup|confirmSignup|resendConfirmationCode|forgotPassword|confirmForgotPassword)" src/services/aws-auth.ts
```

**Capture:** exact signatures + ~20 lines of body for each method. If any method calls helpers beyond `this.request()`, note them.

**If clean:** proceed to S3. **If hidden dependencies found:** STOP and explain to human.

**→ WAIT for human confirmation before proceeding.**

---

## S3 — Extract AUTH (First Real Move)

**Owner:** Claude Code

```
STEP S3 — Extract AUTH methods (MOVE ONLY, facade preserved)

GOAL:
Move the 5 AUTH methods from aws-api.ts to src/services/api/authApi.ts.
Keep aws-api.ts as facade with identical public method signatures.

AUTH METHODS TO MOVE:
- smartSignup
- confirmSignup
- resendConfirmationCode
- forgotPassword
- confirmForgotPassword

RULES:
- Do NOT modify the Sacred Set (request, _requestWithRetry, _requestOnce, _refreshToken, inFlightGets).
- Do NOT change endpoints, payloads, headers, return types.
- Do NOT rename methods.
- Do NOT modify screen imports.
- Replace `this` with `api` inside moved methods.
- Keep wrappers in aws-api.ts delegating to authApi functions.

IMPLEMENTATION:
1) In authApi.ts:
   - Add: import type { AWSAPIService } from "../aws-api";
   - Export async functions with same names.
   - Copy original method bodies.
   - Replace `this.` with `api.`

2) In aws-api.ts:
   - Add import:
     import { smartSignup, confirmSignup, resendConfirmationCode, forgotPassword, confirmForgotPassword } from "./api/authApi";
   - Replace ONLY the bodies of the 5 class methods with delegations:
     return smartSignup(this, ...args);
   - Do NOT modify any other methods.

COMMIT:
refactor(api): extract auth api (facade preserved)

GATES:
- pnpm lint || yarn lint || npm run lint
- pnpm typecheck || yarn typecheck || npm run typecheck || npx tsc --noEmit

MANUAL SMOKE (human does this):
- Signup + confirm signup (if enabled)
- Forgot password flow
- Login / Logout

REPORT BACK:
- Commit hash
- Files changed list (should be aws-api.ts + authApi.ts only)
- lint PASS/FAIL
- typecheck PASS/FAIL

STOP CONDITIONS:
- Any of the 5 methods are not found in aws-api.ts
- Any method depends on a private/local helper that cannot be referenced as api.<helper>
- Any need to touch the Sacred Set
```

**→ WAIT for human confirmation (including smoke test results) before proceeding.**

---

## S4 — Extract NOTIFICATIONS

**Owner:** Claude Code

### S4 PREP (run first, no edits)

```bash
rg -n -C 2 "(notification|pushToken|deviceToken|registerDevice|badge|alert)" src/services/aws-api.ts
rg -n -C 2 "(\/notifications|\/push|\/device|\/badge)" src/services/aws-api.ts
```

Identify the exact NOTIFICATIONS method list (~7 methods). If ambiguity, STOP and explain.

**→ WAIT for human confirmation of method list before proceeding.**

### S4 MOVE

```
STEP S4 — Extract NOTIFICATIONS methods (MOVE ONLY, facade preserved)

Same pattern as S3. Move NOTIFICATIONS methods into src/services/api/notificationsApi.ts.

NON-NEGOTIABLE:
- Do NOT modify the Sacred Set.
- Do NOT change endpoints/payloads/headers/return shapes/error behavior.
- Do NOT change screen imports.
- Apply Helper Strategy if any private helpers found.

COMMIT: refactor(api): extract notifications api (facade preserved)
GATES: lint + typecheck
SMOKE (human): Open notifications tab, verify list loads, tap a notification
REPORT: Commit hash, method list moved, files changed, lint PASS/FAIL, typecheck PASS/FAIL
```

**→ WAIT for human confirmation before proceeding.**

---

## S5 — Extract SOCIAL

**Owner:** Claude Code

### S5 PREP

```bash
rg -n -C 2 "(follow|unfollow|followers|following|block|mute|report|friend)" src/services/aws-api.ts
rg -n -C 2 "(\/follow|\/unfollow|\/followers|\/following|\/block|\/mute)" src/services/aws-api.ts
```

**→ WAIT for human confirmation of method list before proceeding.**

### S5 MOVE

```
STEP S5 — Extract SOCIAL methods (MOVE ONLY, facade preserved)

Same pattern. Move SOCIAL methods (follow/unfollow/followers/following/block/mute) into src/services/api/socialApi.ts.

NON-NEGOTIABLE: Sacred Set untouched, no screen import changes, apply Helper Strategy.
COMMIT: refactor(api): extract social api (facade preserved)
GATES: lint + typecheck
SMOKE (human): Follow/unfollow a user, view followers list, view following list
```

**→ WAIT for human confirmation before proceeding.**

---

## S6 — Extract PROFILE

**Owner:** Claude Code

### S6 PREP

```bash
rg -n -C 2 "(profile|getProfile|updateProfile|editProfile|avatar|bio|username|userInfo)" src/services/aws-api.ts
rg -n -C 2 "(\/profile|\/user\/|\/users\/|\/me\/|\/avatar)" src/services/aws-api.ts
```

Note: if profile methods overlap with social (e.g., getUser returns follow status), keep them separate — profile = read/edit self, social = relationships.

**→ WAIT for human confirmation of method list before proceeding.**

### S6 MOVE

```
STEP S6 — Extract PROFILE methods (MOVE ONLY, facade preserved)

Same pattern. Move PROFILE methods into src/services/api/profileApi.ts.

NON-NEGOTIABLE: Sacred Set untouched, no screen import changes, apply Helper Strategy.
COMMIT: refactor(api): extract profile api (facade preserved)
GATES: lint + typecheck
SMOKE (human): Open profile, edit profile, view other user's profile
```

**→ WAIT for human confirmation before proceeding.**

---

## S7 — Extract FEED

**Owner:** Claude Code

### S7 PREP

```bash
rg -n -C 2 "(feed|vibes|fan|timeline|homeFeed|discover|explore|postsFeed|forYou|following)" src/services/aws-api.ts
rg -n -C 2 "(\/feed|\/vibes|\/fan|\/timeline|\/discover|\/home|\/posts\?|\/posts\/feed)" src/services/aws-api.ts
```

Identify the exact FEED method list (~3 methods). If ambiguity (mixed with POST), STOP and explain.

**→ WAIT for human confirmation of method list before proceeding.**

### S7 MOVE

```
STEP S7 — Extract FEED methods (MOVE ONLY, facade preserved)

Same pattern. Move FEED methods into src/services/api/feedApi.ts.

NON-NEGOTIABLE: Sacred Set untouched, no screen import changes, apply Helper Strategy.
COMMIT: refactor(api): extract feed api (facade preserved)
GATES: lint + typecheck
SMOKE (human): Open Fan feed, open Vibes feed, scroll 10-15 items, open a post
```

**→ WAIT for human confirmation before proceeding.**

---

## S8 — Extract POST

**Owner:** Claude Code

### S8 PREP

```bash
rg -n -C 2 "(createPost|deletePost|updatePost|getPost|like|unlike|comment|reaction|share|caption|publish)" src/services/aws-api.ts
rg -n -C 2 "(\/posts|\/post\/|\/comments|\/likes|\/reactions|\/publish)" src/services/aws-api.ts
# Check for shared helpers
rg -n "withMediaReadyRetry|isMediaNotReadyError" src/services/aws-api.ts
```

**IMPORTANT:** If `withMediaReadyRetry`/`isMediaNotReadyError` are used by POST methods:
- Extract these helpers into `src/services/api/helpers.ts` FIRST (separate commit)
- Then proceed with POST extraction

**→ WAIT for human confirmation of method list + helper plan before proceeding.**

### S8 MOVE (may be 2 commits)

```
STEP S8a (if needed) — Extract shared helpers

If withMediaReadyRetry / isMediaNotReadyError are needed by POST and UPLOAD:
1) Create src/services/api/helpers.ts with these functions (pure, no internal state)
2) Import from helpers.ts where needed
3) Remove from aws-api.ts class (or keep wrapper if still used internally)

COMMIT: refactor(api): extract shared helpers (withMediaReadyRetry, isMediaNotReadyError)
GATES: lint + typecheck

STEP S8b — Extract POST methods

Same pattern. Move POST methods into src/services/api/postApi.ts.
Import shared helpers from helpers.ts if needed.

NON-NEGOTIABLE: Sacred Set untouched, no screen import changes.
COMMIT: refactor(api): extract post api (facade preserved)
GATES: lint + typecheck
SMOKE (human): Create post, view post, like/unlike, open post details
```

**→ WAIT for human confirmation before proceeding.**

---

## S9 — Extract UPLOAD

**Owner:** Claude Code

### S9 PREP

```bash
rg -n -C 2 "(upload|presign|preSigned|multipart|media|video|photo|image|s3|signedUrl|cloudfront|transcode|progress)" src/services/aws-api.ts
rg -n -C 2 "(\/upload|\/media|\/presign|\/signed|\/s3|\/assets|\/files)" src/services/aws-api.ts
```

Shared helpers (withMediaReadyRetry etc.) should already be in helpers.ts from S8.

**→ WAIT for human confirmation of method list before proceeding.**

### S9 MOVE

```
STEP S9 — Extract UPLOAD methods (MOVE ONLY, facade preserved)

Same pattern. Move UPLOAD methods into src/services/api/uploadApi.ts.
Import shared helpers from helpers.ts if needed.

NON-NEGOTIABLE: Sacred Set untouched, no screen import changes.
COMMIT: refactor(api): extract upload api (facade preserved)
GATES: lint + typecheck
SMOKE (human): Create post flow, pick media, start upload, confirm progress
```

**→ WAIT for human confirmation before proceeding.**

---

## S10 — Extract PEAKS (Most Complex V1 Module)

**Owner:** Claude Code

### S10 PREP

```bash
rg -n -C 2 "(peak|peaks|Peak|normalizePeak|normalizePeakAuthor|challenge)" src/services/aws-api.ts
rg -n -C 2 "(\/peaks|\/peak\/|\/challenges)" src/services/aws-api.ts
# Identify private helpers
rg -n "normalizePeak|normalizePeakAuthor" src/services/aws-api.ts
```

**IMPORTANT:** `normalizePeak*` helpers are pure functions (no internal state).
- Move them into `peaksApi.ts` as local functions (not exported unless tests need them)
- If any helper has internal state dependency → leave those methods in aws-api.ts and report

**→ WAIT for human confirmation of method list + helper plan before proceeding.**

### S10 MOVE

```
STEP S10 — Extract PEAKS methods (MOVE ONLY, facade preserved)

Same pattern. Move PEAKS methods (~20) into src/services/api/peaksApi.ts.
Move normalizePeak* helpers as local functions inside peaksApi.ts.

NON-NEGOTIABLE: Sacred Set untouched, no screen import changes.
If any method depends on internal state → leave it in aws-api.ts and report.

COMMIT: refactor(api): extract peaks api (facade preserved)
GATES: lint + typecheck
SMOKE (human): Open peaks/challenges, create peak, view peak details
```

**→ WAIT for human confirmation before proceeding.**

---

## S11 — Extract MESSAGING

**Owner:** Claude Code

### S11 PREP

```bash
rg -n -C 2 "(conversation|message|sendMessage|getMessages|wsToken|chat|inbox)" src/services/aws-api.ts
rg -n -C 2 "(\/conversations|\/messages|\/ws-token|\/chat)" src/services/aws-api.ts
```

**→ WAIT for human confirmation of method list before proceeding.**

### S11 MOVE

```
STEP S11 — Extract MESSAGING methods (MOVE ONLY, facade preserved)

Same pattern. Move MESSAGING methods (~7: getConversations, getConversation, create, getOrCreate,
getMessages, sendMessage, deleteMessage, markRead, getWsToken) into src/services/api/messagingApi.ts.

NON-NEGOTIABLE: Sacred Set untouched, no screen import changes, apply Helper Strategy.
COMMIT: refactor(api): extract messaging api (facade preserved)
GATES: lint + typecheck
SMOKE (human): Open conversations list, open a conversation, send a message
```

**→ WAIT for human confirmation before proceeding.**

---

## S12 — Extract MAP

**Owner:** Claude Code

### S12 PREP

```bash
rg -n -C 2 "(spot|createSpot|getSpot|nearbySpots|review|mapMarker|livePin|searchMap|category|subcategory)" src/services/aws-api.ts
rg -n -C 2 "(\/spots|\/map|\/markers|\/live-pins|\/categories|\/reviews)" src/services/aws-api.ts
```

**→ WAIT for human confirmation of method list before proceeding.**

### S12 MOVE

```
STEP S12 — Extract MAP methods (MOVE ONLY, facade preserved)

Same pattern. Move MAP methods (~10: createSpot, getSpot, getNearbySpots, createReview, getReviews,
getCategories, suggestSubcategory, getMapMarkers, searchMap, createLivePin, deleteLivePin,
getNearbyLivePins) into src/services/api/mapApi.ts.

NON-NEGOTIABLE: Sacred Set untouched, no screen import changes, apply Helper Strategy.
COMMIT: refactor(api): extract map api (facade preserved)
GATES: lint + typecheck
SMOKE (human): Open map/explorer, view spots, create spot, view reviews
```

**→ WAIT for human confirmation before proceeding.**

---

## S13 — Extract EVENTS (PREP-Gated)

**Owner:** Claude Code

**⚠️ PREP-GATED:** This module is scaffolded but MOVED only if PREP confirms clean extraction. If PREP reveals state dependencies or Sacred Set coupling → mark "deferred" in EXECUTION_LOG.md and skip.

### S13 PREP

```bash
rg -n -C 2 "(event|eventAction|createGroup|getGroups|getGroup|joinGroup|leaveGroup)" src/services/aws-api.ts
rg -n -C 2 "(\/events|\/event\/|\/groups|\/group\/)" src/services/aws-api.ts
```

**→ WAIT for human confirmation of method list before proceeding.**

### S13 MOVE

```
STEP S13 — Extract EVENTS methods (MOVE ONLY, facade preserved)

Same pattern. Move EVENTS methods (~17: createEvent, getEvents, getEventDetail,
getEventParticipants, joinEvent, leaveEvent, createEventPayment, confirmEventPayment,
updateEvent, cancelEvent, removeEventParticipant, eventAction + createGroup, getGroups,
getGroup, joinGroup, leaveGroup) into src/services/api/eventsApi.ts.
Note: createEventPayment/confirmEventPayment overlap with payments — assign based on
primary callers during PREP. If payment-centric, leave in aws-api.ts.

NON-NEGOTIABLE: Sacred Set untouched, no screen import changes, apply Helper Strategy.
COMMIT: refactor(api): extract events api (facade preserved)
GATES: lint + typecheck
SMOKE (human): View events, create event, join/leave group
```

**→ WAIT for human confirmation before proceeding.**

---

## Phase 0 Final Validation

**Owner:** Claude Code (gates) + Human (smoke)

```
PHASE 0 FINAL CHECK — repo-wide gates + facade cleanup

STEP 1 — FULL REPO GATES
Run:
- pnpm lint || yarn lint || npm run lint
- pnpm typecheck || yarn typecheck || npm run typecheck || npx tsc --noEmit
If ANY error: fix ONLY what is required. No refactors. No behavior changes.

STEP 2 — VERIFY FACADE PURITY
Confirm in aws-api.ts:
1) AUTH methods delegate to authApi
2) NOTIFICATIONS methods delegate to notificationsApi
3) SOCIAL methods delegate to socialApi
4) PROFILE methods delegate to profileApi
5) FEED methods delegate to feedApi
6) POST methods delegate to postApi
7) UPLOAD methods delegate to uploadApi
8) PEAKS methods delegate to peaksApi
9) MESSAGING methods delegate to messagingApi
10) MAP methods delegate to mapApi
11) EVENTS methods delegate to eventsApi (or marked "deferred" if PREP-gated)
12) Sacred Set unchanged
13) No logic left inside wrapper bodies (only delegation calls)
14) Remaining methods are non-MVP (business/payments/live+battles/device/utils ~65 methods)
15) database.ts is UNTOUCHED

STEP 3 — VERIFY HELPER EXTRACTION
Confirm:
- helpers.ts contains shared pure helpers (withMediaReadyRetry, isMediaNotReadyError)
- normalizePeak* helpers are local to peaksApi.ts
- No helper is duplicated across modules

STEP 4 — OPTIONAL STRUCTURAL CLEANUP
Group wrapper methods with comments: // ===== AUTH WRAPPERS ===== etc.
Group domain imports together. No renames, no signature changes.

COMMIT: refactor(api): finalize phase 0 facade split (no behavior change)
REPORT: Files changed, lint PASS/FAIL, typecheck PASS/FAIL, count of methods remaining in aws-api.ts
```

### Phase 0 Manual Smoke (Human)

- AUTH: Login / Logout / Forgot password flow
- NOTIFICATIONS: Open notifications, verify list loads
- SOCIAL: Follow/unfollow a user, view followers
- PROFILE: Open profile, edit profile
- FEED: Fan + Vibes feed, scroll, open post
- POST: Create post, like/unlike
- UPLOAD: Create post with media, verify upload progress
- PEAKS: Open peaks/challenges, interact with a peak
- MESSAGING: Open conversations, send a message
- MAP: Open map/explorer, view spots
- EVENTS: View events (if extracted, else verify unchanged)

**→ WAIT for human confirmation: "Phase 0 DONE" before proceeding.**

---

# PHASE 1 — Observability & Debuggability

**Goal:** Make bugs easy to locate. Add dev logs + Sentry breadcrumbs without changing behavior.

**Rules:** No endpoint/payload/return shape changes. No Result types. No navigation restructuring. No Sacred Set changes.

---

## P1.0 — Baseline Gates

**Owner:** Claude Code

```
PHASE 1.0 — Baseline gates before observability

NO CODE CHANGES.

Run:
- pnpm lint || yarn lint || npm run lint
- pnpm typecheck || yarn typecheck || npm run typecheck || npx tsc --noEmit

Report:
- lint PASS/FAIL (include command used)
- typecheck PASS/FAIL (include command used)
```

**→ WAIT for human confirmation before proceeding.**

---

## P1.1 — Add Observability Util

**Owner:** Claude Code

```
PHASE 1.1 — Add observability helper utils (no behavior change)

Create: src/services/observability.ts

Required exports:
- export function devLog(...args: unknown[]) { if (__DEV__) console.log(...args); }
- export function nowMs(): number { return Date.now(); }
- export function safeJson(value: unknown): string {
    try { return JSON.stringify(value); } catch { return "[unserializable]"; }
  }

No other changes.

COMMIT: chore(obs): add observability helpers
GATES: lint + typecheck
REPORT: commit hash, files changed, lint PASS/FAIL, typecheck PASS/FAIL
```

**→ WAIT for human confirmation before proceeding.**

---

## P1.2 — Instrument API Requests

**Owner:** Claude Code

```
PHASE 1.2 — Instrument aws-api request with dev logs + (optional) Sentry breadcrumbs

Goal: Add observability only. No behavior change.

1) In src/services/aws-api.ts:
   - Import { devLog, nowMs, safeJson } from the new util.
   - Add timing around request() calls:
     - start = nowMs()
     - in success path: devLog(`[API] ${method} ${endpoint} OK ${ms}ms`)
     - in error path: devLog(`[API][ERR] ${method} ${endpoint} ${ms}ms`, safeJson(errorLike))
   - If Sentry is already used in this file, add:
     Sentry.addBreadcrumb({ category:"api", message:`${method} ${endpoint}`, data:{ ms, status }, level:"info" })
     And for errors: level:"error"
   - Do NOT modify the Sacred Set logic. Logs are additive only.

2) Sanitization: NO PII, NO tokens, NO presigned URLs, NO auth headers in logs. If an endpoint contains sensitive query params, log the path only (strip querystring).

COMMIT: chore(obs): add api request breadcrumbs (no behavior change)
GATES: lint + typecheck

STOP: If you must restructure the Sacred Set to add logs, STOP and report.
```

**→ WAIT for human confirmation before proceeding.**

---

## P1.3 — (Optional) Feature Tags

Add optional `meta` field in request options for breadcrumbs. Must be backward-compatible, never sent to server. Ask human: "Do P1.3 or skip?"

**→ WAIT for human confirmation ("do it" or "skip") before proceeding.**

---

## P1.4 — Manual Verification (Human)

- Open app, run: login → feeds → profile → upload/post
- Confirm dev console shows `[API]` lines
- Confirm Sentry breadcrumbs (if active)

**→ WAIT for human confirmation: "Phase 1 DONE" before proceeding.**

---

# PHASE 2 — Contract Hardening (Result Types)

**Goal:** Reduce crashes with `Result<T>`. Opt-in, incremental. No big bang. No duplicate functions.

**Key Rules:**
- **No duplicate functions:** Migrate existing function + all callers in the same mini-lot.
- **STOP if:** Migration forces a new user-visible flow change (new error screen/state/navigation) — explain to human.
- **Wave order:** A (AUTH) → B (FEED) → C (POST actions) → D (UPLOAD + CREATE)
- **Error details sanitization:** `details` must never contain headers, tokens, presigned URLs, passwords, emails. When in doubt, omit `details` entirely.
- **Error code format:** Always use `DOMAIN_ACTION_FAILED` pattern (e.g., `FEED_FAN_FAILED`, `POST_LIKE_FAILED`). Message must be user-neutral (no internal info leak).

---

## P2.0 — Create Result Primitive

**Owner:** Claude Code

```
PHASE 2.0 — Introduce Result primitive (no behavior change, no usage yet)

Create: src/services/result.ts

CONTENT (exact):
export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; code: string; message: string; details?: unknown };
export type Result<T> = Ok<T> | Err;

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
export const err = (code: string, message: string, details?: unknown): Err => ({
  ok: false, code, message, details,
});

No other files changed.

COMMIT: chore(result): add Result primitive
GATES: lint + typecheck
REPORT: commit hash, files changed (must be only result.ts), PASS/FAIL
```

**→ WAIT for human confirmation before proceeding.**

---

## Flow Migration Template (P2.1–P2.11)

Every flow follows the same structure. Adapt `[METHOD]`, `[ERROR_CODE]`, `[SMOKE_STEPS]` per flow.

```
PHASE 2.X (Flow N) — Migrate [FLOW_NAME] to Result (NO DUPLICATION)

GOAL:
Convert the existing [METHOD] API function to return Result, and update all callers in the same lot.
No parallel "*Result" wrapper functions.

SCOPE:
- src/services/api/<domainApi>.ts (where [METHOD] is implemented)
- the exact screen(s)/hook(s) that call it (only those)
- src/services/result.ts (no changes expected)

STEP A — PREP (must do first, no edits yet)
1) Locate implementation:
   rg -n "[METHOD]" src/services
2) Locate all callers:
   rg -n "[METHOD]\(" src
3) Output: Implemented in <file+line>, Callers <file+line list>
If callers are unexpectedly many, STOP and report to human.

STEP B — Convert the EXISTING function to Result
1) Change return type to Promise<Result<T>>
2) Wrap: success → return ok(data), failure → return err("[ERROR_CODE]", "message", details?)
3) Preserve behavior EXACTLY (endpoints, payload, options, Sacred Set)
4) SANITIZE details: no PII, no tokens, no presigned URLs, no headers. When in doubt, omit details.

STEP C — Update all callers (same lot)
Replace try/catch with:
  const res = await [METHOD](...)
  if (!res.ok) { use existing error UI; return; }
  proceed with success path.
If new user-visible flow needed → STOP and explain to human.

STEP D — Gates: lint + typecheck
STEP E — Manual smoke (human): [SMOKE_STEPS]

COMMIT: refactor(result): migrate [FLOW_NAME] to Result
REPORT: files changed, callers updated, PASS/FAIL, any UI flow change needed

STOP CONDITIONS:
- Method not found where expected
- Requires Sacred Set change
- Requires new visible flow/state → explain to human
```

---

## Wave A — AUTH Flows

Execute in order. After all 4, run AUTH Global Smoke.

| Step | Flow | Method | Error Code | Smoke |
|------|------|--------|-----------|-------|
| P2.1 | Forgot Password | `forgotPassword` | `AUTH_FORGOT_PASSWORD_FAILED` | Open forgot pw, submit valid email, submit invalid email |
| P2.2 | Resend Confirmation Code | `resendConfirmationCode` | `AUTH_RESEND_CODE_FAILED` | From confirm screen, tap resend |
| P2.3 | Confirm Signup | `confirmSignup` | `AUTH_CONFIRM_SIGNUP_FAILED` | Wrong code (error), correct code (success) |
| P2.4 | Smart Signup | `smartSignup` | `AUTH_SIGNUP_FAILED` | Valid data (success), invalid data (clean error) |

**→ WAIT for human confirmation after EACH flow.**

### AUTH Global Smoke (Mandatory Before Wave B)

```
PHASE 2 — AUTH GLOBAL CHECK (after P2.1–P2.4)

Run:
- pnpm lint || yarn lint || npm run lint
- pnpm typecheck || yarn typecheck || npm run typecheck || npx tsc --noEmit

If anything fails: fix ONLY what is required. No refactors.
REPORT: lint PASS/FAIL, typecheck PASS/FAIL, commit hash if fixes needed
```

**Human smoke:** Signup → Confirm → Resend code → Forgot password → Login → Logout

**→ WAIT for human confirmation: "AUTH smoke PASS" before Wave B.**

### Phase 2 Evaluation Gate (Mandatory After Wave A)

Before proceeding to Waves B-D, evaluate:
1. Did the callers adapt cleanly to Result? (no hacks, no workarounds)
2. Did any smoke test break? (regression signal)
3. Does the Result pattern improve readability in the AUTH screens?

**If all 3 = yes:** Continue to Wave B.
**If any = no or unclear:** Freeze Phase 2 here. Move to Phase 3. Revisit Phase 2 later.

This is a deliberate pause — not every flow needs Result types to ship safely.

---

## Wave B — FEED Flows (only if evaluation gate passed)

| Step | Flow | Method | Error Code | Smoke |
|------|------|--------|-----------|-------|
| P2.5 | Fan Feed | `fanFeed`/`getFan` | `FEED_FAN_FAILED` | Open Fan, scroll, open post, airplane mode |
| P2.6 | Vibes Feed | `vibesFeed`/`getVibes` | `FEED_VIBES_FAILED` | Open Vibes, scroll, open post, airplane mode |

**Note:** If Fan+Vibes share the same function, migrate both together in one lot.

**→ WAIT for human confirmation after each flow.**

---

## Wave C — POST Lightweight Actions

| Step | Flow | Method | Error Code | Notes |
|------|------|--------|-----------|-------|
| P2.7 | Like/Unlike | `likePost`/`toggleLike` | `POST_LIKE_FAILED` | Preserve optimistic UI if present |
| P2.8 | Get Post Details | `getPost`/`fetchPost` | `POST_DETAILS_FAILED` | Read-only, cleanest migration |

> Note: `createComment`/`getComments`/`deleteComment` are dead code (0 callers). Not included in Phase 2.

**→ WAIT for human confirmation after each flow.**

---

## Wave D — UPLOAD + CREATE POST (Highest Complexity)

| Step | Flow | Method | Error Code | Notes |
|------|------|--------|-----------|-------|
| P2.9 | Upload Presign/Init | `presign`/`uploadInit` | `UPLOAD_INIT_FAILED` | If mixed with finalize, STOP |
| P2.10 | Upload Finalize/Attach | `finalize`/`completeUpload` | `UPLOAD_FINALIZE_FAILED` | If mixed with create post, STOP |
| P2.11 | Create Post | `createPost`/`publishPost` | `POST_CREATE_FAILED` | Last, highest complexity |

**→ WAIT for human confirmation after each flow.**

---

## Phase 2 Global Check

```
PHASE 2 — GLOBAL FINAL CHECK (after P2.0–P2.11)

Run:
- pnpm lint || yarn lint || npm run lint
- pnpm typecheck || yarn typecheck || npm run typecheck || npx tsc --noEmit

If anything fails: fix ONLY what is required. No behavior changes beyond Result handling.
REPORT: lint PASS/FAIL, typecheck PASS/FAIL, commit hash if fixes needed
```

### Phase 2 Global Smoke (Human — 10 minutes)

- AUTH: signup, confirm, resend code, forgot password, login, logout
- FEED: Fan + Vibes feed, scroll, open post, airplane mode test
- POST: like/unlike, open post details
- UPLOAD+CREATE: pick media, upload init+finalize, publish, airplane mode test

**→ WAIT for human confirmation: "Phase 2 DONE" before proceeding.**

---

# PHASE 3 — Navigation Split

**Goal:** Split MainNavigator.tsx (~584 lines, 89 routes, already lazy-loaded) into feature stacks. Moderate blast radius — navigation touches everything, but the file is well-structured, not a monolith.

### Frozen Invariants (Must NOT Change)

- Route names (string literals) stay identical
- Params shape/types stay identical
- Deep link / linking config paths stay identical
- Initial route behavior stays identical
- Modal vs push presentation stays identical
- Tab structure stays identical (same tabs, same order)

---

## NavSplit S0 — Inventory + Freeze Invariants

**Owner:** Claude Code (PREP, no code changes beyond docs)

```bash
# 1) Find the main nav entry files
rg -n "MainNavigator|create(Bottom|Stack|NativeStack)Navigator|NavigationContainer|linking" src

# 2) List route names
rg -n "name=['\"][^'\"]+['\"]" src/navigation src -S

# 3) Find all navigation calls
rg -n "\.navigate\(|navigation\.navigate\(|router\.push\(|router\.replace\(|router\.navigate\(" src -S

# 4) Find deep link / linking config
rg -n "linking|prefixes|config:|getInitialURL|subscribe" src -S
```

Add a `## Navigation Split (Phase 3)` section to `REFACTOR_CHARTER.md` with frozen invariants + route inventory table:

```markdown
## Navigation Split (Phase 3)

### Frozen invariants (must NOT change)
- Route names (string `name="..."`) stay identical.
- Params shape/types stay identical.
- Deep link / linking config paths stay identical.
- Initial route behavior stays identical.
- Modal vs push presentation stays identical.
- Tab structure stays identical (same tabs, same order, same icons/labels).

### Route inventory (source of truth for split)
| Route name | Current file | Target stack | Navigated from | Notes |
|-----------|--------------|-------------|---------------|-------|
|           |              |             |               |       |
```

Commit: `docs(nav): add navigation split invariants + route inventory`

**→ WAIT for human confirmation before proceeding.**

---

## NavSplit S1 — Scaffold Stack Files

**Owner:** Claude Code

```
NAVSPLIT S1 — Scaffold stack files (NO behavior change)

GOAL: Create stack files only (placeholders). Move ZERO routes.

FILES TO CREATE:
- src/navigation/stacks/SettingsStack.tsx
- src/navigation/stacks/ProfileStack.tsx
- src/navigation/stacks/NotificationsStack.tsx
- src/navigation/stacks/SearchStack.tsx
- src/navigation/stacks/HomeStack.tsx
- src/navigation/stacks/CreateStack.tsx

Each exports a component with the same name returning null. No routes, no imports of screens, no linking changes.

RULES: Do NOT edit route names. Do NOT move screens. Do NOT change MainNavigator.

COMMIT: chore(nav): scaffold stack files for navigation split
GATES: lint + typecheck
REPORT: commit hash, files created, PASS/PASS
```

**→ WAIT for human confirmation before proceeding.**

---

## NavSplit S2–S7 — Move Stacks (Lowest → Highest Risk)

**Order:** Settings → Profile → Notifications → Search → Home → Create

Each follows the same PREP → MOVE pattern:

```
NAVSPLIT SX — Move [STACK_NAME] routes into [Stack]Stack (NO behavior change)

GOAL:
Move ONLY [STACK_NAME]-related route declarations into src/navigation/stacks/[Stack]Stack.tsx.
Wire into main navigator. Keep route names/params/presentation/linking identical.

STEP A — PREP (no edits)
1) Locate routes: rg -n "[keywords]" src/navigation src -S
2) Extract route names list
3) Identify call sites: rg -n "navigate(" src -S | rg "[keywords]"
4) Note modal/presentation behavior
If unclear ownership: STOP and explain to human.

STEP B — MOVE
1) In [Stack]Stack.tsx: implement stack with routes copied verbatim (same component, options, initialRouteName)
2) In main navigator: remove moved routes, mount [Stack]Stack in their place
3) Types: update only for compile, no name/param changes

COMMIT: refactor(nav): split [STACK_NAME] stack (no behavior change)
GATES: lint + typecheck
SMOKE (human): Open [STACK_NAME] tab, navigate subpages, back, no crashes

STOP CONDITIONS: linking change needed, route rename needed, presentation change needed
```

### PREP Keywords Per Stack

| Stack | Keywords |
|-------|----------|
| Settings | `Settings\|Security\|Privacy\|Account\|Preferences\|NotificationsSettings` |
| Profile | `Profile\|EditProfile\|Followers\|Following\|UserProfile\|MyProfile` |
| Notifications | `Notifications\|Notification\|Activity\|ActivityFeed\|Inbox\|Alerts` |
| Search | `Search\|Explore\|Discover\|Map\|Explorer\|Results\|SearchResults` |
| Home | `Home\|Fan\|Vibes\|Feed\|Timeline\|MainFeed\|ForYou\|Following\|Peaks` |
| Create | `Create\|NewPost\|PostCreate\|Compose\|Upload\|Media\|Peaks\|Challenge\|Live\|Plus\|FAB` |

**→ WAIT for human confirmation after EACH stack move.**

---

## NavSplit Final Validation

```
NAVSPLIT FINAL — Global validation after S1–S7

Run:
- pnpm lint || yarn lint || npm run lint
- pnpm typecheck || yarn typecheck || npm run typecheck || npx tsc --noEmit

If anything fails: fix ONLY what is required. NO route renames. NO param changes. NO linking changes.
REPORT: lint PASS/FAIL, typecheck PASS/FAIL, commit hash if fixes needed
```

### NavSplit Global Smoke (Human)

- Home: Fan/Vibes/Explorer + open post + back
- Search: run search + open result + back
- Create "+": full flow + back out safely
- Notifications: open + tap item + back
- Profile: open + edit + Followers/Following + back
- Settings: open 2-3 subpages + back
- Deep link / initial route lands correctly

**→ WAIT for human confirmation: "NavSplit DONE" before proceeding.**

---

# PHASE 4 — Post-NavSplit Cleanup

**Goal:** Polish navigation structure, close out documentation. Zero behavior change.

---

## N1 — MainNavigator Facade Purity

**Owner:** Claude Code

```
POST-NAVSPLIT N1 — MainNavigator facade purity (NO behavior change)

GOAL: Make MainNavigator a clean composition layer:
- mounts bottom tabs
- each tab points to its Stack component
- no screen route declarations remain inside

DO: Remove leftover inline Screen declarations and dead imports.
DO NOT: rename routes, change params, change linking, change presentation.

COMMIT: chore(nav): finalize MainNavigator as thin facade
GATES: lint + typecheck
REPORT: commit hash + files changed + PASS/PASS
```

**→ WAIT for human confirmation before proceeding.**

---

## N2 — Navigation Hygiene

**Owner:** Claude Code

```
POST-NAVSPLIT N2 — Navigation hygiene (NO behavior change)

SCOPE: Only src/navigation/**

DO: Remove unused imports/vars. Normalize export style consistency.
DO NOT: rename routes, change params, change linking, change stack structure.

COMMIT: chore(nav): cleanup navigation folder (no behavior change)
GATES: lint + typecheck
```

**→ WAIT for human confirmation before proceeding.**

---

## N3 — Update Charter (Close-Out)

**Owner:** Claude Code or Human

In `REFACTOR_CHARTER.md` under "Navigation Split (Phase 3)", add:

```markdown
### Status
DONE ✅

### Final navigation layout
- Main navigator (tabs): <path to MainNavigator file>
- Stacks:
  - src/navigation/stacks/HomeStack.tsx
  - src/navigation/stacks/SearchStack.tsx
  - src/navigation/stacks/CreateStack.tsx
  - src/navigation/stacks/NotificationsStack.tsx
  - src/navigation/stacks/ProfileStack.tsx
  - src/navigation/stacks/SettingsStack.tsx

### Verification
- lint: PASS
- typecheck: PASS
- nav smoke: PASS

### Invariants upheld
- No route renames
- No param shape changes
- No linking/deep link changes
- No modal vs push presentation changes
- No tab order/structure changes
```

Commit: `docs(nav): mark navigation split complete in charter`

**→ WAIT for human confirmation before proceeding.**

---

## N4 — Final Global Smoke (Human)

- All 5 tabs + create flow + login/logout
- If all green → fully stabilized

**→ WAIT for human confirmation: "Phase 4 DONE" before proceeding.**

---

# PHASE 5 — Post-Refactor Production Readiness

**Architecture ready ≠ production ready.** This phase bridges the gap.

---

## 5.1 — Refactor Freeze Rules

These rules apply immediately after Phase 4 cleanup is complete.

### Rule 1: No More Structural Refactors
- No folder reshuffling, no navigation restructuring, no API contract changes, no renaming
- Allowed only: bug fixes, small feature additions, performance improvements

### Rule 2: No Opportunistic Refactors
- Fix the bug, leave. No "while I'm here" edits.

### Rule 3: Result Pattern — Strongly Recommended (Not Blocking)
- New async methods in domain API files (authApi, feedApi, uploadApi, postApi) should return `Result<T>`
- Not a hard blocker for internal utilities until an automated lint rule enforces it
- Make it mandatory when you have a code review template or ESLint rule that verifies it

### Rule 4: MainNavigator Is Frozen
- Route names = contract. Changing them breaks deep links, navigation calls, analytics.

### Rule 5: Request Core (Sacred Set) Is Sacred
- Do not touch `request`/`_requestWithRetry`/`_requestOnce`/`_refreshToken`/`inFlightGets` unless fixing a critical production bug.

> If you follow this freeze, your architecture stays stable for 12+ months.

---

## 5.2 — Pre-Release Stability Gates

### Gate A — Automated P0 Smoke (Minimum)
4 Maestro flows minimum:
1. Login
2. Open Home feed
3. Create post (happy path)
4. Logout

Without this, future changes can silently break core flows.

### Gate B — Crash-Free Check
- Staging build, internal usage 3–5 days
- Crash-free sessions ≥ 99.5%
- No blocking flow bug (infinite loaders, stuck uploads, broken back navigation)

### Gate C — Performance Sanity
- Feed initial load p95 < 3 seconds on average WiFi
- Create flow does not freeze UI
- No double API calls on mount (dev logs make this easy to verify)

### Gate D — Data Integrity
- No duplicate posts created on retry
- Like/unlike does not desync
- Upload failures do not corrupt draft state

### Gate E — Create Post Success Rate
- ≥ 99% success rate on 50–100 internal test attempts

---

## 5.3 — Security & Secrets Checklist

Before any production deploy, verify:

- [ ] No API keys, tokens, or secrets committed in repo
- [ ] `.env` / `.env.local` in `.gitignore` (never committed)
- [ ] Production config separate from dev (API base URL, Sentry DSN)
- [ ] Sentry configured to scrub PII client-side (emails, tokens, usernames)
- [ ] No presigned URLs or auth tokens logged in production builds (`__DEV__` guard)
- [ ] App transport security / SSL pinning configured (if applicable)

---

## 5.4 — Operational Readiness Checklist

| Item | Status | Priority |
|------|--------|----------|
| Environment separation (dev / staging / prod) | To verify | P0 |
| API base URL switching per environment | To verify | P0 |
| Production Sentry DSN configured | To verify | P0 |
| Secure env vars (no secrets in code) | To verify | P0 |
| Build configuration sanity (release vs debug) | To verify | P1 |
| App Store / Google Play production build tested | To verify | P0 |

### EAS / Expo Build Profiles (if using EAS)

Verify your `eas.json` has correct profiles:
- `development` — local dev, internal distribution
- `preview` — staging builds, TestFlight / internal track
- `production` — store builds, signed with production credentials

For each profile, verify:
- `APP_ENV` or equivalent env var selects the correct API base URL
- Sentry DSN matches the environment
- Signing credentials (iOS provisioning profile, Android keystore) are accessible and documented
- Credentials are stored securely (EAS Secrets, not in repo)

---

## 5.5 — Backend / API Compatibility Checklist

Before deploying the refactored mobile app, verify backend alignment:

- [ ] Staging backend is on the same API version expected by the mobile app
- [ ] Production backend is on the same API version (or backward-compatible)
- [ ] Error contract is stable: status codes and error response shapes match what Result types expect
- [ ] No pending backend migrations that would break mobile endpoints
- [ ] Feature flags (if any) are consistent between staging and production
- [ ] Rate limits / throttling won't block smoke testing or burn-in traffic
- [ ] If backend has breaking changes planned: coordinate deploy order (backend first, then mobile)

---

## 5.6 — Observability in Production

- Dev logs (`devLog`) disabled in production (guarded by `__DEV__`)
- Sentry breadcrumbs active in production (category: "api")
- Useful tags on Sentry events:
  - `feature`: auth / feed / post / upload
  - `buildVersion`: app version string
  - `environment`: dev / staging / prod
- If endpoint contains sensitive query params: log path only (strip querystring)

---

## 5.7 — Safe Production Migration Path

| # | Action | Duration | Owner |
|---|--------|----------|-------|
| 1 | Deploy to staging | 1 day | You |
| 2 | Internal usage burn-in | 3–5 days | Team |
| 3 | Monitor: API error rate, crash rate, create post reliability | Continuous | You |
| 4 | Fix any issues found in staging | As needed | Claude Code |
| 5 | Promote to production | 1 day | You |

**Going straight to production without staging burn-in is risky — not because the architecture is bad, but because humans miss edge cases.**

---

## 5.8 — Production Release Runbook

### Build Steps
1. Merge refactor branch to `main` (or your release branch)
2. Tag: `git tag v1.X.0 && git push --tags`
3. Build production binary (EAS Build / Expo export / custom pipeline)
4. Verify binary size is within expected range (no accidental bundling)

### Staged Rollout
- iOS: phased release (start 10% → 25% → 50% → 100% over 3–5 days)
- Android: staged rollout in Google Play Console (same progression)
- Monitor crash reports at each stage before increasing %

### Monitoring Window (first 48 hours)
- Sentry: crash rate, new error types
- API dashboard: error rate, latency p95
- User reports: App Store reviews, support tickets

### Rollback Procedure
- If crash rate > 1% or blocking flow bug discovered:
  1. **Pause rollout** (both stores)
  2. **Rebuild previous tag**: `git checkout v1.(X-1).0 && build`
  3. **Submit hotfix build** to both stores
  4. **Investigate root cause** on a branch (not on main)
- If minor issue (non-blocking, cosmetic):
  1. Fix on branch
  2. Tag `v1.X.1`
  3. Submit updated build
  4. Resume rollout

### Go / No-Go Checklist (Before Promoting to 100%)
- [ ] Crash-free sessions ≥ 99.5% at current rollout %
- [ ] Create post success rate ≥ 99%
- [ ] API error rate (4xx/5xx) ≤ 2% across all endpoints
- [ ] Upload failure rate ≤ 3%
- [ ] Login success rate ≥ 99.5%
- [ ] No P0 bug reports from internal testers or early users
- [ ] Feed load time p95 < 3 seconds
- [ ] All smoke test flows pass on production build
- [ ] Sentry breadcrumbs visible for API calls

---

## 5.9 — Store Readiness Checklist

Before submitting to App Store / Google Play:

- [ ] Version number incremented (semver: `X.Y.Z`)
- [ ] Build number incremented (integer, unique per submission)
- [ ] App icon + splash screen correct for this version
- [ ] Screenshots up to date (if UI changed)
- [ ] Privacy labels / data safety form updated (if data collection changed)
- [ ] Review notes provided (test account credentials if required by Apple)
- [ ] Staged rollout configured (not 100% on day 1)
- [ ] Release notes written (user-facing changelog)
- [ ] Previous version still downloadable as rollback (don't delist)
- [ ] TestFlight / internal track build tested before store submission

---

## 5.10 — Maestro E2E Setup

### Location
Tests live in `e2e/maestro/` at the repo root.

### Minimum flows (P0)
```
e2e/maestro/
  01_login.yaml
  02_home_feed.yaml
  03_create_post.yaml
  04_logout.yaml
```

### Run command
```bash
maestro test e2e/maestro/
```

### When Maestro becomes blocking
- First: run manually after each phase completion (advisory)
- Once it passes 3 consecutive runs on CI without flakes: promote to **blocking gate**
- Blocking = PR cannot merge if Maestro fails

### Writing flows
- Use `testID` props in React Native components (not text selectors)
- Keep flows short (< 30 seconds each)
- No hardcoded waits — use `assertVisible` / `waitForElement`

---

## 5.11 — CI/CD Gate Recommendations (Post-Refactor)

Once the refactor is stable, add these gates to your CI pipeline to prevent regressions:

| Gate | Blocks merge? | Tool |
|------|:------------:|------|
| `lint` | Yes | ESLint |
| `typecheck` (`tsc --noEmit`) | Yes | TypeScript |
| Unit tests (if any) | Yes | Jest |
| Build check (`expo export` or `eas build --profile preview`) | Yes | EAS/Expo |
| Bundle size check | Warning | custom script |
| Maestro E2E smoke (4 flows) | Yes (when ready) | Maestro |

**Minimum viable CI:** lint + typecheck + build check. Add E2E when Maestro flows are stable.

---

# APPENDIX

## A. Target File Structure (Final State)

```
src/services/
  aws-api.ts              (facade + singleton + wrappers + ~60 non-MVP methods)
  aws-auth.ts             (untouched)
  database.ts             (untouched in Phase 0)
  observability.ts        (Phase 1)
  result.ts               (Phase 2)
  api/
    index.ts              (existing barrel — do not break)
    types.ts              (existing — do not modify)
    error.ts              (existing — do not modify)
    internal-types.ts     (existing — do not modify)
    helpers.ts            (shared pure helpers: withMediaReadyRetry, isMediaNotReadyError)
    authApi.ts            (5 methods)
    notificationsApi.ts   (~7 methods)
    socialApi.ts          (~5 methods)
    profileApi.ts         (~5 methods, incl. searchProfiles)
    feedApi.ts            (~3 methods)
    postApi.ts            (~6 methods)
    uploadApi.ts          (~3 methods)
    peaksApi.ts           (~20 methods + normalizePeak* local helpers)
    messagingApi.ts       (~8 methods)
    mapApi.ts             (~10 methods)
    eventsApi.ts          (~5 methods, PREP-gated)

src/navigation/
  MainNavigator.tsx       (thin tab shell, ~584 lines → composition only)
  stacks/
    HomeStack.tsx
    SearchStack.tsx
    CreateStack.tsx
    NotificationsStack.tsx
    ProfileStack.tsx
    SettingsStack.tsx
```

## B. Quick Reference — All Gate Commands

```bash
# Lint
pnpm lint || yarn lint || npm run lint

# Typecheck
pnpm typecheck || yarn typecheck || npm run typecheck || npx tsc --noEmit

# Rollback (Phase 0)
git reset --hard pre-refactor-phase0
```

## C. Sacred Set (Copy-Paste Reference)

These methods must NEVER be modified across ALL phases unless fixing a critical production bug:
- `AWSAPIService.request()` — handles GET deduplication via `inFlightGets`
- `AWSAPIService._requestWithRetry()` — retry on 408/429/5xx, exponential backoff
- `AWSAPIService._requestOnce()` — routing, auth header, 401 + refresh + double-401 signOut
- `AWSAPIService._refreshToken()` — token refresh flow
- `inFlightGets` — GET deduplication map

## D. Complete Smoke Test Checklist

### AUTH
- Signup → reach code screen
- Resend code (success)
- Confirm signup (wrong code = error, correct = success)
- Forgot password (success + invalid email)
- Login / Logout

### FEED
- Fan feed: opens, scroll, open post
- Vibes feed: opens, scroll, open post
- Airplane mode → clean error handling

### POST
- Like/unlike a post
- Open post details from feed

### UPLOAD + CREATE
- Start create post → pick media
- Upload init + finalize runs
- Publish post (success)
- Airplane mode during publish → clean error, draft safe

### NAVIGATION
- All 5 tabs open correctly
- Settings: 2-3 subpages + back
- Create "+": full flow + back out safely
- Deep link / initial route lands correctly

## E. Definition of Done — Production Readiness

| Metric | Threshold | Measured on |
|--------|-----------|-------------|
| Crash-free sessions | ≥ 99.5% | Staging burn-in (3–5 days) |
| Create post success rate | ≥ 99% | 50–100 internal attempts |
| API error rate (4xx/5xx) | ≤ 2% | All endpoints, staging burn-in |
| Upload failure rate | ≤ 3% | Staging burn-in |
| Login success rate | ≥ 99.5% | Staging burn-in |
| Feed initial load p95 | < 3 seconds | Average WiFi |
| P0 blocking bugs | 0 | All smoke test paths |
| Security checklist | All items ✅ | Pre-deploy review |
| Store readiness | All items ✅ | Pre-submission review |
