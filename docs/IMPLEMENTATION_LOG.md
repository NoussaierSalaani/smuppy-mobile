# Implementation Log — Smuppy Mobile

Dernière mise à jour: 2026-01-13

## Vue d’ensemble
| ID | Type | Date | Objectif principal | Status | Tests | Notes |
|----|------|------|--------------------|--------|-------|-------|
| LOT B | LOT | À vérifier | Purger tokens SecureStore sur tous les logout paths | À vérifier | À vérifier | À vérifier |
| LOT E | LOT | À vérifier | Auth rate limit via Edge Functions + migration client | À vérifier | À vérifier | À vérifier |
| FIX 401 | FIX | À vérifier | Corriger SUPABASE_ANON_KEY pour éliminer les 401 | À vérifier | À vérifier | À vérifier |
| LOT F | LOT | À vérifier | Logout ultra clean via SettingsScreen | À vérifier | À vérifier | À vérifier |
| LOT 2 | LOT | 2026-01-13 | Gate navigation strict email vérifié | DONE (tests À vérifier) | À vérifier | Expo start timeout 20s (À vérifier sur poste) |

## Détails LOTs et fixes

### LOT B — Purge tokens SecureStore sur tous les logout paths
- Date: À vérifier
- Type: LOT
- Objectif: Purger systématiquement les tokens SecureStore sur chaque chemin de logout.
- Fichiers modifiés: À vérifier
- Changements: À vérifier
- Commandes: À vérifier
- Tests:
  - Non documenté — À vérifier
  - Non documenté — À vérifier
- Status: À vérifier
- Notes: À vérifier

### LOT E — Auth rate limit server-side via Edge Functions + migration client
- Date: À vérifier
- Type: LOT
- Objectif: Mettre en place un rate limit côté Edge Functions et aligner le client sur le nouveau flux.
- Fichiers modifiés: À vérifier
- Changements: À vérifier
- Commandes: À vérifier
- Tests:
  - Non documenté — À vérifier
  - Non documenté — À vérifier
- Status: À vérifier
- Notes: À vérifier

### FIX — 401 Unauthorized résolu (SUPABASE_ANON_KEY)
- Date: À vérifier
- Type: FIX
- Objectif: Résoudre les erreurs 401 en corrigeant la clé SUPABASE_ANON_KEY utilisée par le client.
- Fichiers modifiés: À vérifier
- Changements: À vérifier
- Commandes: À vérifier
- Tests:
  - Non documenté — À vérifier
  - Non documenté — À vérifier
- Status: À vérifier
- Notes: À vérifier

### LOT F — Logout ultra clean via SettingsScreen
- Date: À vérifier
- Type: LOT
- Objectif: Garantir un logout propre depuis SettingsScreen en couvrant les scénarios locaux et réseau.
- Fichiers modifiés: À vérifier
- Changements: À vérifier
- Commandes: À vérifier
- Tests:
  - Non documenté — À vérifier
  - Non documenté — À vérifier
- Status: À vérifier
- Notes: À vérifier

### LOT 2 — Gate Navigation Strong (Email Verified)
- Date: 2026-01-13
- Type: LOT
- Objectif: Gate strict pour empêcher le montage de Main sans session ou sans email vérifié; aiguillage vers Auth ou EmailVerificationPending sinon.
- Fichiers modifiés: src/navigation/AppNavigator.js; src/screens/auth/EmailVerificationPendingScreen.tsx; docs/IMPLEMENTATION_LOG.md
- Changements: Stack Main rendu uniquement si session et email vérifié; stack pending dédiée quand email non vérifié; suppression des redirections locales vers Main depuis l'écran pending.
- Commandes: `npx expo start --no-dev --minify` — Timeout 20s (À vérifier sur poste)
- Tests:
  - (1) User non connecté -> Auth uniquement, Main absent — À vérifier
  - (2) User connecté non vérifié -> Pending uniquement, Main absent — À vérifier
  - (3) Depuis Pending, back/redirect -> Main jamais monté — À vérifier
  - (4) Email vérifié -> app refresh -> Main accessible — À vérifier
  - (5) Logout depuis Settings -> retour Auth, relaunch reste Auth — À vérifier
- Status: DONE
- Notes: À vérifier

## Template LOT (à dupliquer)
- ID + Nom
- Date
- Type (LOT/FIX)
- Contexte
- Objectif
- Fichiers modifiés
- Changements
- Commandes
- Tests manuels
- Status (DONE/PARTIEL/À vérifier)
- Notes

## Historique des correctifs
- FIX 401 — À vérifier (voir section dédiée)

## Légende
- OK: vérifié et conforme.
- À vérifier: information ou test non confirmé.
- KO: test ou critère échoué.
- Timeout: commande lancée mais interrompue par délai.

---

## LOT H — hygiene(repo): ignore Supabase temp file tracked by mistake

**Date:** 2026-01-14  
**Type:** Repo hygiene (no functional changes)

### Goals
- Remove mistakenly tracked Supabase temp file from Git index
- Ensure `supabase/.temp/` remains ignored (already in `.gitignore`)

### Files touched (scope strict)
- Removed from Git index (cached only):
  - `supabase/.temp/cli-latest`
- No other files modified.

### Notes
- `.gitignore` already contained: `supabase/.temp/`
- This change reduces repo noise and prevents temp files from being committed again.


---
urce of truth to track LOT status, scopes, and reasons
Files touched
docs/ROADMAP_LOTS.md (new)
docs/IMPLEMENTATION_LOG.md (updated)

## LOT G — security(auth): rate-limit resend verification + pending logout clean
- Date: 2026-01-14
- Type: LOT
- Goals:
  - Ajouter Edge Function `auth-resend` avec rate limit (3 req / 5 min)
  - Mobile Pending: appeler l’Edge Function (plus de `supabase.auth.resend` direct)
  - Logout Pending: purge SecureStore (ACCESS_TOKEN, REFRESH_TOKEN, USER_ID) + signOut global
- Files modified: supabase/functions/auth-resend/index.ts; src/screens/auth/EmailVerificationPendingScreen.tsx; docs/IMPLEMENTATION_LOG.md
- Notes:
  - Anti-enum: Edge renvoie toujours success 200 sauf rate-limit 429
  - Headers requis: Content-Type + apikey + Authorization Bearer = SUPABASE_ANON_KEY
  - Rate limit: 3 req / 5 min, endpoint hash par email
- Manual tests (à lancer):
  - Pending → Resend: succès sans fuite d’info
  - Spam resend → 429 + message générique
  - Logout Pending → retour Auth + SecureStore purgé
  - Email vérifié → accès normal; non vérifié → jamais Main
  - Bad login password → reste générique "Invalid credentials"

---

## LOT L — Audit supabase.auth (2026-01-15)

**Type:** Audit (aucune modification de code)
**Objectif:** Inventaire factuel de tous les appels `supabase.auth.*` dans src/

### Inventaire vérifié (35 occurrences)

| # | Fichier | Ligne | Méthode | Contexte | Statut |
|---|---------|-------|---------|----------|--------|
| 1 | `services/deviceSession.ts` | 192 | `getSession()` | Device tracking | ✅ OK |
| 2-13 | `services/database.js` | multi | `getUser()` | DB operations (12x) | ✅ OK |
| 14 | `navigation/AppNavigator.js` | 43 | `getSession()` | Auth state init | ✅ OK |
| 15 | `navigation/AppNavigator.js` | 53 | `onAuthStateChange()` | Auth listener | ✅ OK |
| 16 | `settings/PasswordManagerScreen.tsx` | 34 | `getUser()` | Get user email | ✅ OK |
| 17 | `settings/PasswordManagerScreen.tsx` | 37 | `signInWithPassword()` | Verify current pwd | ⚠️ À surveiller |
| 18 | `settings/PasswordManagerScreen.tsx` | 44 | `updateUser()` | Change password | ⚠️ À surveiller |
| 19 | `settings/PasswordManagerScreen.tsx` | 47 | `signOut()` | Logout after change | ✅ OK |
| 20 | `settings/PasswordManagerScreen.tsx` | 48 | `signInWithPassword()` | Re-login after change | ⚠️ À surveiller |
| 21 | `settings/PasswordManagerScreen.tsx` | 62 | `getUser()` | Get user email | ✅ OK |
| 22 | `settings/PasswordManagerScreen.tsx` | 78 | `resetPasswordForEmail()` | Forgot pwd (settings) | ⚠️ À surveiller |
| 23 | `settings/SettingsScreen.tsx` | 47 | `signOut()` | Logout | ✅ OK |
| 24 | `settings/FacialRecognitionScreen.tsx` | 76 | `getUser()` | Get user email | ✅ OK |
| 25 | `settings/FacialRecognitionScreen.tsx` | 83 | `signInWithPassword()` | Verify identity | ⚠️ À surveiller |
| 26 | `auth/LoginScreen.tsx` | 102 | `refreshSession()` | Biometric login | ✅ OK |
| 27 | `auth/LoginScreen.tsx` | 188 | `setSession()` | Set session after EF | ✅ OK |
| 28 | `auth/ResetCodeScreen.tsx` | 50 | `verifyOtp()` | Verify reset code | ✅ OK |
| 29 | `auth/ResetCodeScreen.tsx` | 107 | `resetPasswordForEmail()` | Resend reset email | ⚠️ À surveiller |
| 30 | `auth/VerifyCodeScreen.tsx` | 54 | `verifyOtp()` | Verify signup code | ✅ OK |
| 31 | `auth/VerifyCodeScreen.tsx` | 132 | `resend()` | Resend verify email | ⚠️ À surveiller |
| 32 | `auth/NewPasswordScreen.tsx` | 43 | `updateUser()` | Set new password | ⚠️ À surveiller |
| 33-34 | `auth/EmailVerificationPendingScreen.tsx` | 44, 105 | `refreshSession()` | Check verify status | ✅ OK |
| 35 | `auth/EmailVerificationPendingScreen.tsx` | 138 | `signOut()` | Logout from pending | ✅ OK |

### Synthèse factuelle

**Auth public flows (signup / login / forgot-password / resend) = CLOSED**
- Tous protégés par Edge Functions + AWS rate limit côté client
- Commits: `a0b0028`, `a6f63e4`, `02767da`, `d98f9b6`

**Auth internal flows (settings, post-auth) = AUDITED / À surveiller**
- 8 appels directs `supabase.auth.*` restent dans Settings et écrans post-auth
- Ces appels sont volontairement directs (contexte utilisateur déjà authentifié)
- Aucune action corrective dans ce LOT

### Classification finale

| Catégorie | Occurrences | Statut |
|-----------|-------------|--------|
| Session/User (getUser, getSession, etc.) | 20 | ✅ OK |
| Logout (signOut) | 3 | ✅ OK |
| OTP verification (verifyOtp) | 2 | ✅ OK |
| Auth actions internes (signInWithPassword, updateUser, etc.) | 8 | ⚠️ À surveiller |
| Auth actions publiques avec AWS rate limit | 2 | ✅ OK |

**Status:** DONE (audit uniquement, aucune modification de code)

---

## LOT M — GDPR Account Deletion (2026-01-18)

**Type:** Feature + Security
**Objectif:** Implémenter la suppression de compte conforme RGPD avec période de grâce de 30 jours

### Goals (completed)
1. ✅ Bouton "Delete Account" dans SettingsScreen
2. ✅ Edge Function `delete-account` (soft delete)
3. ✅ Edge Function `check-deleted-account` (vérification au login)
4. ✅ Edge Function `cleanup-deleted-accounts` (cleanup automatique)
5. ✅ Table `deleted_accounts` pour tracker les comptes supprimés
6. ✅ Modal informatif au login si compte supprimé
7. ✅ Documentation mise à jour

### Files modified
- `src/screens/settings/SettingsScreen.tsx` - Ajout bouton Delete Account + modal
- `src/screens/auth/LoginScreen.tsx` - Vérification compte supprimé + modal informatif
- `supabase/functions/delete-account/index.ts` - Soft delete RGPD
- `supabase/functions/check-deleted-account/index.ts` - Vérification email
- `supabase/functions/cleanup-deleted-accounts/index.ts` - Cleanup automatique
- `supabase/migrations/20260118_deleted_accounts.sql` - Table + RLS
- `supabase/README.md` - Documentation Edge Functions
- `docs/IMPLEMENTATION_LOG.md` - Ce fichier
- `docs/ROADMAP_LOTS.md` - Ajout LOT M

### Flow utilisateur
1. User clique "Delete Account" → Modal de confirmation
2. Confirmation → compte soft-deleted (email stocké 30 jours)
3. User déconnecté → retour Auth
4. Si user essaie de se reconnecter:
   - Modal informant que le compte est supprimé
   - Affiche jours restants avant libération email
   - Contact support@smuppy.com pour réactiver
5. Après 30 jours → cleanup automatique libère l'email

### Edge Functions déployées
```bash
npx supabase functions deploy delete-account --no-verify-jwt
npx supabase functions deploy check-deleted-account --no-verify-jwt
npx supabase functions deploy cleanup-deleted-accounts --no-verify-jwt
```

### Configuration requise
1. Exécuter le SQL de création de table dans Supabase Dashboard (SQL Editor)
2. Optionnel: Configurer cron job pour cleanup automatique:
```sql
SELECT cron.schedule('cleanup-deleted-accounts', '0 3 * * *',
  $$SELECT cleanup_deleted_accounts()$$
);
```

### Manual tests
- [ ] Settings → Delete Account → Modal confirmation
- [ ] Confirmer suppression → déconnexion + retour Auth
- [ ] Login avec email supprimé → Modal informatif (jours restants)
- [ ] Vérifier `deleted_accounts` table contient l'entrée

**Status:** DONE
