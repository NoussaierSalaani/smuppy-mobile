# ROADMAP — LOTS (Smuppy Mobile)

Purpose: single source of truth to track the Smuppy Mobile development progress using **LOTS** (small, controlled changes).
> It documents:
> - what was done (done / partial / blocked)
> - why it was done (purpose, security, UX, tech consistency)
> - how it was done (high-level approach + scope)
> - what remains next (clear execution plan)

---

## 0) Project Principles (Non-negotiable)

### 0.1 LOT workflow rules
- ✅ Only work in **small LOTS**
- ✅ One LOT = one purpose
- ✅ Strict scope: only the allowed files can be modified
- ✅ Always list exactly which files are touched
- ✅ Always provide commands + manual tests (≤5)
- ✅ If uncertain → write **"À vérifier"** (never invent)
- ✅ No vague refactors, no broad “best practices”
- ✅ No code changes unless a LOT is explicitly approved

### 0.2 Security rules (auth / anti-enum)
- Login errors must remain **generic**:
  - e.g. `"Invalid credentials"`
  - No hints if email exists or not
- Signup errors:
  - OK to show `"Email invalide"` for invalid format
  - Must neready exists
- Rate limits must be enforced **server-side** when possible.

### 0.3 Deployment / git workflow constraints
- ✅ Do not push unless explicitly requested
- Current known constraint: **GitHub push blocked (DNS github.com KO)** → local commits only

---

## 1) Current Status Snapshot (Quick Resume)

### 1.1 Repo state
- Repo: `smuppy-mobile`
- Branch: `main`
- Working tree: clean
- Local commits ahead of origin: **2**
  - `291c76b` — `security(nav): strict gate for unverified email`
  - `517d57d` — `chore(repo): ignore Supabase temp files`

### 1.2 Current active LOT
✅ **LOT G — security(auth): rate-limit resend verification + migration mobile + logout clean depuis Pending**

---

## 2) LOT HISTORY (Completed / Partial / Blocked)

> Legend:
> - ✅ DONE = completed and validated
> - 🟡 PARTIAL = started but not fully validated
> - 🔴 BLOCKED = cannot proceed (dependency missing, infra issues, etc.)
> - 🧪 TESTS = manual tests validated

---

### ✅ LOT B — purge SecureStore to
**Status:** ✅ DONE  
**Why:** Prevent stale sessions / token leak / ensure clean logout security  
**How:** On every logout path, purge SecureStore tokens consistently  
**Key outcome:** Logout always removes local tokens

---

### ✅ LOT E — auth server-side rate limit via Edge Functions + migration client
**Status:** ✅ DONE  
**Why:** Protect against brute force and abuse (login/signup/reset) with server-side rate-limit  
**How:** Added Edge Functions with RPC rate-limit enforcement + migrated mobile to call functions instead of `supabase.auth.*`  
**Scope files (historical):**
- `supabase/functions/auth-login/index.ts`
- `supabase/functions/auth-signup/index.ts`
- `supabase/functions/auth-reset/index.ts`
**Key outcome:** Mobile app uses Edge Functions for auth actions (not direct supabase.auth calls)

---

### ✅ FIX — 401 Unauthorized resolved (ANON KEY secret + fallback)
**Status:** ✅ DONE  
**Why:** Edge Functions require correct anon key headers; mismatch caused 401  
**How:** Correct heck logic where needed  
**Key outcome:** Auth functions callable reliably

---

### ✅ LOT F — logout ultra clean in SettingsScreen
**Status:** ✅ DONE  
**Why:** Consistency: logout should always be secure + predictable  
**How:** Ensure Settings logout purges SecureStore and exits cleanly  
**Key outcome:** Clean logout path in app settings

---

### ✅ LOT 2 — strict navigation gate (unverified email cannot access Main)
**Status:** ✅ DONE (local commit created)  
**Commit:** `291c76b security(nav): strict gate for unverified email`  
**Why:** Security & correctness: users with unverified email must never access main app  
**How:** `AppNavigator` never renders Main if session absent OR email not verified  
**Scope files:**
- `src/navigation/AppNavigator.js`
- `src/screens/auth/EmailVerificationPendingScreen.tsx`
- `docs/IMPLEMENTATION_LOG.md`
**Key outcome:** Gate is strict; Pending screen no longer forces reset (AppNavigator drives state)

---

### ✅ LOT H — repo hygiene: ignore Supabase tem:** ✅ DONE (local commit created)  
**Commit:** `517d57d chore(repo): ignore Supabase temp files`  
**Why:** Reduce repo noise, avoid tracking temp generated files  
**How:** Removed `supabase/.temp/cli-latest` from Git index; `.gitignore` already covered it  
**Scope files:**
- `docs/IMPLEMENTATION_LOG.md`
- (Git index only) removed tracked file
**Key outcome:** Cleaner git history and fewer future conflicts

---

## 3) Current LOT (In Progress)

### ✅ LOT G — security(auth): rate-limit resend verification + migration mobile + logout clean depuis Pending
**Status:** 🟡 IN PROGRESS (approved, not implemented yet)

#### Goals (max 3)
1) Add Edge Function `auth-resend` with server-side rate limit (coherence with LOT E)
2) Mobile: `EmailVerificationPendingScreen` calls Edge Function (no more direct `supabase.auth.resend`)
3) Logout from Pending: purge SecureStore + clean exit (coherence LOT B/F)

#### Allowed scope (strict)
- `supabase/functions/auth-resend/index.ts` (new)
- `src/screens/auth/EmailVeriPendingScreen.tsx`
- `docs/IMPLEMENTATION_LOG.md`

#### Manual tests (≤5)
1) Pending → Resend: generic success (no leaks)
2) Spam resend → 429 rate limited + generic UI message
3) Pending logout → back to auth + SecureStore purged
4) After email verification → normal access; Main never accessible when unverified
5) Bad login password → still generic "Invalid credentials"

---

## 4) Known UI Bugs (To Fix Later — Separate UI LOT)

**Status:** acknowledged, not in current scope

- Signup: email field turns red too early
- Signup: password conditions not showing + strength bar inside field
- Signup: Smuppy logo moves with keyboard and becomes invisible
- Signup: message too precise (shows full email in validation) → should be generic "Email invalide"

⚠️ IMPORTANT:
- Login errors must remain generic: "Invalid credentials"
- Signup can show "Email invalide" for format, but must never reveal existence of email.

---

## 5) Next Planned LOTS (Future Roadmap)

> These are intentionally small anl be executed ONLY when explicitly approved one at a time.

### LOT I — deps hygiene (remove unused dependencies)
**Status:** planned  
**Why:** reduce risk, reduce complexity, reduce bundle size  
**How:** check unused deps offline (depcheck fallback), remove only confirmed unused  
**Scope:** `package.json` (+ lockfile if required)  
**Manual tests:** expo start, smoke navigation

---

### LOT J — deduplicate similar screens (UI maintainability)
**Status:** planned  
**Why:** reduce copy/paste; bug fixes should not be duplicated  
**How:** identify duplicate screens (ex: PostDetail variants) and factor shared components/styles  
**Scope:** UI-only files  
**Manual tests:** open each screen and confirm same behavior

---

### LOT K — extract heavy hardcoded data (countries/interests) to constants
**Status:** planned  
**Why:** avoid “god screens”, improve readability, easier future localization  
**How:** move constants to `src/constants/…` and import them  
**Scope:** `src/constants/*` + one s
**Manual tests:** run screen, no UI changes

---

### LOT L — auth consistency cleanup (optional)
**Status:** planned  
**Why:** ensure all auth actions go through functions, strict anti-enum everywhere  
**How:** check for remaining `supabase.auth.*` calls in auth contexts  
**Scope:** limited to auth files  
**Manual tests:** login/signup/reset/resend flows

---

## 6) How to Resume Work (Copy/Paste Checklist)

Whenever resuming the project, always run:

```bash
git status -sb
git diff --name-only
git log -3 --oneline
Then read:
docs/ROADMAP_LOTS.md
docs/IMPLEMENTATION_LOG.md
Then continue from the next LOT marked 🟡 IN PROGRESS / planned.
EOF
