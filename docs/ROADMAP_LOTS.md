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
- Branch: `docs/update-product-roadmap-and-ui-flows` (doc-only)
- Working tree: clean
- Local commits ahead of origin: **0**

### 1.2 Current active LOT
✅ **LOT L — Audit supabase.auth (DONE)**

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

## 3) Completed LOTs (Recent)

### ✅ LOT G — security(auth): rate-limit resend verification + migration mobile + logout clean depuis Pending
**Status:** ✅ DONE
**Commit:** `47a407b security(auth): rate-limit resend verification`

#### Goals (completed)
1) ✅ Edge Function `auth-resend` with server-side rate limit
2) ✅ Mobile: `EmailVerificationPendingScreen` calls Edge Function
3) ✅ Logout from Pending: purge SecureStore + clean exit

#### Scope files
- `supabase/functions/auth-resend/index.ts`
- `src/screens/auth/EmailVerificationPendingScreen.tsx`
- `docs/IMPLEMENTATION_LOG.md`

---

### ✅ LOT L — Audit supabase.auth
**Status:** ✅ DONE (audit only, no code changes)

#### Goals (completed)
1) ✅ Factual inventory of all `supabase.auth.*` calls in `src/`
2) ✅ Classification by category and security status

#### Summary
- **35 occurrences** inventoried
- **Auth public flows (signup / login / forgot-password / resend) = CLOSED** — all protected by Edge Functions + AWS rate limit
- **Auth internal flows (settings, post-auth) = AUDITED / À surveiller** — 8 direct calls remain intentionally

> **Note:** Certains appels `supabase.auth.*` internes restent volontairement directs (contexte utilisateur déjà authentifié). Aucune action corrective requise.

#### Scope files
- `docs/IMPLEMENTATION_LOG.md` (audit table added)
- No code modifications

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

### ~~LOT L — auth consistency cleanup~~ → COMPLETED (see section 3)
**Status:** ✅ DONE (moved to section 3)
**Result:** Audit completed. Auth public flows closed; internal flows documented as intentionally direct.

---

## 6) How to Resume Work (Copy/Paste Checklist)

```bash
git status -sb
git diff --name-only
git log -3 --oneline
Then read:
docs/ROADMAP_LOTS.md
docs/IMPLEMENTATION_LOG.md
Then continue from the next LOT marked 🟡 IN PROGRESS / planned.
```

---

## 7) Inventaire (état réel — Jan 2026)

- **Auth / Onboarding / Security**
  - Ce que montre le code: AppNavigator rend Main uniquement si session + `email_confirmed_at`. Signup → VerifyCode → EnableBiometric → onboarding (TellUsAboutYou → … → Success → Main). Forgot/Reset/NewPassword restent dans Auth. Tokens en SecureStore. Anti double-submit présent sur VerifyCode/ResetCode/NewPassword (usePreventDoubleNavigation) et via `loading` sur Login/Signup/Forgot/EnableBiometric. LoginScreen déjà conforme (erreurs génériques + bouton disabled pendant `loading`).
  - Manques/obsolète: Onboarding non forcé pour un login existant; anti spam-click à compléter sur autres boutons réseau (auth/onboarding + actions post); pas de flux report/block/mute.
- **Navigation (tabs)**
  - Réel: Tabs = Home (Fan/Vibes/Xplorer), Peaks, CreateTab, Notifications, Profile. Home embarque FanFeed (mock), VibesFeed (masonry mock), XplorerFeed (map mock).
  - Manques: Explorer réel (Phase 4); Settings accessible via Profile stack mais pas affiché en tab; pas de placeholders dédiés pour sections manquantes.
- **Feeds (Fan/Vibes)**
  - Réel: FanFeed/VibesFeed avec données mock; PostDetailFanFeedScreen/PostDetailVibesFeedScreen présents; actions like/save/share/+Fan/report non branchées au backend.
  - Manques: Connexion Supabase, focus post 60%, anti double-click sur actions.
- **Peaks**
  - Réel: PeaksFeedScreen + PeakViewScreen + CreatePeak/Preview (mock).
  - Manques: Backend et navigation croisée avec Home; commentaires/replies absents.
- **Explorer map**
  - Réel: XplorerFeed map (react-native-maps) avec filtres max 3, markers mock; permission location demandée.
  - Manques: Recherche réelle, spots vérifiés/premium, pas d’import.
- **Modération / Trust & Safety**
  - Réel: Guidelines mentionne report; `ReportProblemScreen` (Settings) en placeholder; pas de block/mute/report contenu.
  - Manques: Statuts moderation (active/limited/under_review/hidden/removed), tolérance zéro thèmes interdits.
- **Roadmap / Launch readiness**
  - Réel: Branch doc en cours; roadmap phases (0-5) ci-dessous; checklist launch mise à jour pour env/Sentry/smoke auth.

---

## 8) Roadmap par phases (MVP-first)
- **PHASE 0 — Foundations**: auth + security + anti-spam click.
- **PHASE 1 — Core Feeds**: Fan + Vibes masonry + post focus 60% + actions like/save/share/+Fan/report.
- **PHASE 2 — Comments**: Peas de commentaires; replies fans-only.
- **PHASE 3 — Modération launch-safe**: reports, block/mute, statuts active/limited/under_review/hidden/removed; tolérance zéro thèmes interdits.
- **PHASE 4 — Explorer MVP**: spots verified-only, places pro premium, search + filtres max 3, pas d’import.
- **PHASE 5+ — Extensions**: algo avancé, mood soft, events, pro schedules, tracking opt-in, ads.

## 9) Priorités actuelles (MVP)
1) Stabiliser les flows UI + navigation (Home tabs, Peaks, Profile, Settings).  
2) Compléter l’anti spam-click sur les boutons réseau restants (auth/onboarding + actions post).  
3) UI polish (couleurs/typo) plus tard.

## 10) UI Completion (MVP-first)
> LOTS proposés (ordre recommandé, scopes petits, UI seulement)

- **LOT UI-1 — Home tabs en état de marche (Fan/Vibes/Xplorer)**
  - Objectif: stabiliser FeedScreen + TabBar (scroll, reset active tab), FanFeed/VibesFeed mocks cohérents, Xplorer map affichée sans crash.
  - Fichiers: `src/screens/home/FeedScreen.tsx`, `src/screens/home/FanFeed.tsx`, `src/screens/home/VibesFeed.tsx`, `src/screens/home/XplorerFeed.tsx`, `src/components/HomeHeader.*`.
  - Tests rapides: (1) Login → Home; swipe Fan/Vibes/Xplorer; (2) Xplorer affiche carte + filtres max 3; (3) retour Fan/Vibes conserve header; (4) tab Create ouvre popup.

- **LOT UI-2 — Post Focus 60% + actions (Fan/Vibes)**
  - Objectif: utiliser PostDetailFanFeedScreen/PostDetailVibesFeedScreen comme focus; brancher actions like/save/share/+Fan/report (no comments en Phase 1) avec anti double-click.
  - Fichiers: `src/screens/home/PostDetailFanFeedScreen.tsx`, `src/screens/home/PostDetailVibesFeedScreen.tsx`, `src/components/CreateOptionsPopup.*`, services/actions concernés.
  - Tests rapides: (1) Depuis FanFeed, ouvrir un post → focus 60%; (2) actions désactivées pendant requête; (3) bouton report ouvre placeholder; (4) navigation back stable.

- **LOT UI-3 — Peaks MVP (feed + create)**
  - Objectif: PeaksFeedScreen stable (pas de crash), navigation PeakView/Preview/Create cohérente, placeholders propres.
  - Fichiers: `src/screens/peaks/PeaksFeedScreen.js`, `src/screens/peaks/PeakViewScreen.js`, `src/screens/peaks/CreatePeakScreen.js`, `src/screens/peaks/PeakPreviewScreen.js`.
  - Tests rapides: (1) Tab Peaks → scroll feed; (2) ouvrir PeakView; (3) lancer CreatePeak → Preview → back; (4) retourner Home sans crash.

- **LOT UI-4 — Explorer placeholder (Phase 4 ready)**
  - Objectif: sécuriser XplorerFeed pour Phase 4 (filtres max 3, markers mock vérifiés-only, search placeholder, UX permission claire).
  - Fichiers: `src/screens/home/XplorerFeed.tsx`, `src/components` si besoin (filter modal).
  - Tests rapides: (1) permission refusée → modal info; (2) filtres >3 impossible; (3) bouton search placeholder; (4) back to Home sans freeze.

- **LOT UI-5 — Notifications + Profile minimal**
  - Objectif: NotificationsScreen sans crash (pull-to-refresh), ProfileScreen basique (bio/photos/settings).
  - Fichiers: `src/screens/notifications/NotificationsScreen.js`, `src/screens/profile/ProfileScreen.tsx`, `src/screens/profile/UserProfileScreen.tsx`, `src/screens/profile/FansListScreen.tsx`.
  - Tests rapides: (1) Tab Notifications → refresh; (2) Tab Profile → open Settings; (3) ouvrir UserProfile; (4) back navigation stable.

- **LOT UI-6 — Settings & Onboarding polish (anti spam-click)**
  - Objectif: couvrir anti double-submit sur boutons réseau restants (Signup, Forgot, onboarding Next), clarifier gating avant Main.
  - Fichiers: `src/screens/auth/*.tsx` (Signup/Forgot/Verify/Reset/NewPassword), `src/screens/onboarding/*.tsx`, `src/hooks/usePreventDoubleClick.ts`.
  - Tests rapides: (1) Signup → Verify → EnableBiometric → Onboarding → Success → Main; (2) Forgot → Reset → NewPassword; (3) spam tap sur boutons réseau ne déclenche pas de doublons; (4) Main absent si email non vérifié.

## 11) Launch Readiness Checklist (mobile)
- Env vars: `.env` contient `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SENTRY_DSN`, `APP_ENV` (aucun secret en clair).
- Build: dev-client requis (`npx expo start --dev-client`), Sentry test event envoyé.
- Auth/Onboarding smoke: login, signup → verify → onboarding complet; forgot → otp → reset; resend OTP; logout purge SecureStore; Main bloqué si email non vérifié.
- Rate limit: brute-force rapide sur login/signup/forgot → message générique, pas de crash.
- Logs: vérifier qu’aucun token n’est loggé (console + Sentry breadcrumbs).
- Git workflow: avant commit → `git status -sb`, `git diff`; après commit → `git show --name-only --oneline -1`.
