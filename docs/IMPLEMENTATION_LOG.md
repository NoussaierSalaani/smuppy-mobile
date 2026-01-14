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
