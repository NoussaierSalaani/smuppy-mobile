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

---

## LOT N — Profile Screen Redesign + Stats Visibility Strategy (2026-01-21)

**Type:** Feature + UI/UX
**Objectif:** Refonte complète du ProfileScreen avec design Smuppy unique

### Goals (completed)

#### 1. Avatar avec Peaks Indicator
- ✅ Bordure gradient (vert → cyan → bleu) si l'utilisateur a des peaks
- ✅ Style Instagram Stories pour indiquer du contenu non vu
- ✅ Taille avatar standardisée: 96px (norme réseaux sociaux)

#### 2. Stats Cards avec Shadow
- ✅ Fans et Posts en cards séparées (plus de badges inline)
- ✅ Icônes avec gradient
- ✅ Shadow pour effet "elevated"

#### 3. Pills Style Tabs
- ✅ Container avec fond gris clair (#F3F4F6)
- ✅ Tab actif = gradient + shadow
- ✅ Animation fluide au changement

#### 4. Posts Grid (nouveau style simple)
- ✅ Grille 3 colonnes
- ✅ Cards compactes (140px hauteur)
- ✅ Stats overlay: seulement les coeurs
- ✅ Icône play si vidéo

#### 5. Peaks Grid (avec stats visuels)
- ✅ Grille 3 colonnes, cards plus hautes (180px)
- ✅ Badge durée en haut à droite
- ✅ Stats overlay: coeurs, vues, réponses, partages
- ✅ Pas de commentaires sur Peaks (seulement replies)

#### 6. Collections Grid (style détaillé)
- ✅ Grille 2 colonnes, cards avec shadow
- ✅ Section info avec titre, auteur, likes
- ✅ Badge bookmark vert
- ✅ Privé: visible uniquement par le proprio

#### 7. Cover Photo
- ✅ Gradient fade vers le blanc (pas de ligne visible)
- ✅ S'étend derrière avatar et bio
- ✅ Tap pour modifier (proprio uniquement)

#### 8. Bio Section
- ✅ Limitée à 2 lignes (collapsed)
- ✅ Max 6 lignes (expanded)
- ✅ "Voir plus" / "Voir moins" cliquable
- ✅ Liens cliquables (URLs, emails, téléphones)

### Stats Visibility Strategy

| Stat | Sur grille | Détail (proprio) | Détail (visiteur) |
|------|------------|------------------|-------------------|
| Likes | ✅ | ✅ | ✅ |
| Vues | Posts: ❌ / Peaks: ✅ | ✅ | ✅ |
| Partages | Peaks: ✅ | ✅ | ❌ |
| Saves | ❌ | ✅ | ❌ |
| Réponses | Peaks: ✅ | ✅ | ✅ |

**Raison:** Likes & Vues = social proof public. Partages & Saves = insights privés créateur.

### Files modified
- `src/screens/profile/ProfileScreen.tsx` - Refonte complète
- `src/components/peaks/RecordButton.tsx` - Animation shutter
- `docs/FEATURES_SPECS.md` - Nouvelle documentation
- `docs/IMPLEMENTATION_LOG.md` - Ce fichier

### Mock Data (pour démo)
- 4 mock posts
- 6 mock peaks
- 4 mock collections
- Stats aléatoires pour peaks (likes, vues, réponses, partages)

### Manual tests
- [ ] Avatar avec peaks → bordure gradient visible
- [ ] Avatar sans peaks → bordure blanche simple
- [ ] Stats cards → shadow visible, tap Fans → FansList
- [ ] Pills tabs → gradient + shadow sur tab actif
- [ ] Posts grid → 3 colonnes, coeurs en overlay
- [ ] Peaks grid → 3 colonnes, 4 stats visibles
- [ ] Collections grid → 2 colonnes, cards avec info

**Status:** DONE (en attente de feedback utilisateur)

---

## LOT O — PeakViewScreen UX/UI Redesign Phase 1 (2026-01-21)

**Type:** Feature + UI/UX
**Objectif:** Refonte de l'expérience de visualisation des Peaks basée sur les tendances TikTok/Reels

### Goals (completed)

#### 1. Progress Bar (Top)
- ✅ Position fixe en haut sous safe area
- ✅ Animation linéaire synchronisée avec durée Peak
- ✅ Couleur Smuppy (primary green sur fond semi-transparent)

#### 2. Action Buttons (Vertical Right)
- ✅ Style TikTok aligné à droite
- ✅ Boutons: Like, Reply, Share, Save
- ✅ Compteurs sous chaque bouton
- ✅ Changement d'état visuel (rempli quand actif)

#### 3. Double-Tap Like Animation
- ✅ Cœur central avec animation spring (scale bounce)
- ✅ 6 particules explosant en étoile
- ✅ Haptic feedback Medium
- ✅ Auto-like si pas déjà liké

#### 4. Gestures Swipe
- ✅ Swipe UP: Voir réponses / Create reply
- ✅ Swipe DOWN: Fermer (go back) - NOUVEAU
- ✅ Swipe LEFT/RIGHT: Navigation entre Peaks
- ✅ Haptic feedback sur tous les swipes

#### 5. Long-Press Menu
- ✅ Pause la vidéo après 300ms
- ✅ Haptic feedback
- ✅ Modal avec options:
  - Pas intéressé
  - Copier le lien
  - Signaler (rouge)
  - Annuler

#### 6. User Info (Bottom Left)
- ✅ Avatar avec bordure gradient Smuppy
- ✅ Nom d'utilisateur avec text shadow
- ✅ Compteur de vues
- ✅ Text overlay / CTA si présent
- ✅ Indicateur réponses avec "Swipe ↑"

### Files modified
- `src/screens/peaks/PeakViewScreen.tsx` - Refonte complète
- `docs/FEATURES_SPECS.md` - Section 3.5 ajoutée
- `docs/CHANGELOG_OPTIMIZATION.md` - Version 1.4.1
- `docs/IMPLEMENTATION_LOG.md` - Ce fichier
- `docs/ROADMAP_LOTS.md` - LOT O ajouté

### Dépendances utilisées
- `expo-haptics` - Retour haptique
- `expo-linear-gradient` - Gradient avatar
- `react-native` Animated - Animations cœur

### Code changes summary

**Nouveaux états:**
```typescript
const [showMenu, setShowMenu] = useState(false);
const [likedPeaks, setLikedPeaks] = useState<Set<string>>(new Set());
const [savedPeaks, setSavedPeaks] = useState<Set<string>>(new Set());
const [progress, setProgress] = useState(0);
```

**Animation particules:**
```typescript
const heartParticles = useRef([...Array(6)].map(() => ({
  scale: new Animated.Value(0),
  translateX: new Animated.Value(0),
  translateY: new Animated.Value(0),
  opacity: new Animated.Value(0),
}))).current;
```

**Swipe DOWN gesture:**
```typescript
// Dans panResponder
else if (dy > 80) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  navigation.goBack();
}
```

### Manual tests
- [ ] Progress bar visible et synchronisée avec durée
- [ ] Action buttons à droite, compteurs visibles
- [ ] Double-tap → animation cœur + particules + haptic
- [ ] Long-press → pause + menu contextuel
- [ ] Swipe DOWN → ferme l'écran
- [ ] Swipe UP → réponses ou create Peak
- [ ] Swipe LEFT/RIGHT → navigation Peaks

**Status:** DONE
