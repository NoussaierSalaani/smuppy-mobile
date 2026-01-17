# ROADMAP UI/FLOW MVP - SMUPPY MOBILE

> **Date:** 2026-01-16
> **Version:** 1.1
> **Status:** En cours - UI-P0-1 ✅ UI-P0-1b ✅

---

## Table des matières

1. [Inventaire Modules MVP](#a-inventaire-modules-mvp)
2. [Flows Reconstruits](#b-flows-reconstruits)
3. [Écrans Manquants](#c-écrans-manquants-à-créer)
4. [Gaps P0/P1/P2](#d-gaps-mis-à-jour)
5. [MVP Definition of Done](#e-mvp-dod-final)
6. [Plan LOTs UI](#f-lots-ui)
7. [Next LOT Recommandé](#g-next-lot-recommandé)
8. [Erreurs Spec SVG](#h-erreurs-détectées-dans-spec-svg)
9. [Résumé](#résumé-final)
10. [SPEC UI-P0-1](#spec-ui-p0-1--profile-api-connect)

---

## A) Inventaire Modules MVP

> Basé sur 243 fichiers SVG dans `UI_Mobile_Version/SCREENS/`

### 1. AUTH MODULE

| Fichier SVG | Type | Écran/Fonction |
|-------------|------|----------------|
| `Login.svg` | Principal | Login form (email/password) |
| `Login-1.svg` à `Login-4.svg` | Variants | États (focus, error, filled, keyboard) |
| `Login loading.svg` | État | Loading pendant auth |
| `Login loading-1.svg`, `-2.svg` | Variants | Animation states |
| `Sign Up.svg` | Principal | Formulaire inscription |
| `Sign in.svg` | Principal | Écran sign in |
| `Create an Account.svg` | Principal | CTA initial inscription |
| `Creat Account.svg` | Modal/Intro | Intro création compte |
| `Create Account - name.svg` | Step | Saisie nom |
| `Create Account - name-1.svg` à `-24.svg` | Variants | 24 états (keyboard, validation, error) |
| `Create Account - Gender.svg`, `-1.svg` | Step | Sélection genre |
| `Create Account - Interested in.svg`, `-1.svg` | Step | Sélection centres d'intérêt |
| `Create Account - Règle.svg` | Step | Acceptation règles/CGU |
| `Forgot password.svg` à `-3.svg` | Flow | 4 étapes reset password |
| `Facial recognition - create account-1.svg` à `-9.svg` | Flow | 9 étapes setup Face ID |
| `Facial recognition - login.svg` | Principal | Login via Face ID |
| `Code.svg` | Principal | Saisie code OTP/vérification |
| `verify your identity.svg` | Modal | Vérification identité |

**Popups/Modals:** `Popup redirect after change password.svg`

---

### 2. HOME/VIBES MODULE

| Fichier SVG | Type | Écran/Fonction |
|-------------|------|----------------|
| `Vibes - individual.svg`, `-1.svg` | Principal | Post detail (single post view) |
| `Fan.svg` | Composant | Label/Tab "Fan" feed |
| `Vibes - allow Smuppy.svg` | Permission | Permission camera/location |
| `Vibes - Pro.svg` | Variant | Vue pro du feed |

---

### 3. CREATE POST MODULE

| Fichier SVG | Type | Écran/Fonction |
|-------------|------|----------------|
| `Vibes - new post.svg` | Principal | Sélection média |
| `Vibes - new post- detail.svg` | Principal | Ajout description |
| `Vibes - new post- detail - location.svg`, `-1.svg` | Step | Tag localisation |
| `Vibes - new post- detail - tag people.svg` | Step | Tag personnes |
| `Vibes - new post- detail - visibility.svg` | Step | Réglage visibilité |
| `Vibes - new post- progress.svg` | État | Upload en cours |
| `Vibes - new post success.svg` | État | Succès publication |
| `Add.svg`, `Add-1.svg`, `Add tab.svg` | Composant | Bouton/Tab création |
| `EDIT post.svg` | Principal | Édition post existant |

---

### 4. PEAKS MODULE

| Fichier SVG | Type | Écran/Fonction |
|-------------|------|----------------|
| `Peaks.svg`, `-1.svg`, `-2.svg` | Principal | Feed Peaks (3 variants) |
| `Vibes - new peak.svg` | Principal | Création peak |
| `Vibes - new peak - add details.svg` | Step | Ajout détails peak |
| `Vibes - new peak - progress.svg` | État | Upload peak |
| `Vibes - new peak success.svg` | État | Succès peak |

---

### 5. PROFILE MODULE

| Fichier SVG | Type | Écran/Fonction |
|-------------|------|----------------|
| `Profil.svg`, `-1.svg`, `-2.svg`, `-3.svg` | Principal | Profile (4 variants/tabs) |
| `Profil user.svg` | Principal | Profil autre utilisateur |
| `Profil & Settings.svg` | Navigation | Accès settings depuis profil |
| `Profil - premium.svg` | Badge | Profil utilisateur premium |
| `Profil - pro.svg` | Badge | Profil utilisateur pro |
| `My Profile - Posts.svg` à `-6.svg` | Tab | Onglet Posts (7 variants) |
| `My Profile - Collection.svg`, `-1.svg` | Tab | Onglet Collection |
| `My Profile - Collection detail.svg` | Detail | Détail collection |
| `My Profile - lives.svg`, `-1.svg` | Tab | Onglet Lives |
| `My Profile - add palmares tab.svg` | Tab | Onglet Palmarès |
| `Edit profil.svg` | Principal | Édition profil |
| `QR Code popup.svg` | Modal | QR code partage profil |
| `View user.svg` | Principal | Vue utilisateur |
| `Info user.svg` | Modal | Info utilisateur |
| `Followed.svg`, `-1.svg` | Liste | Liste following |
| `Followed - search.svg` | Recherche | Recherche dans following |
| `user add.svg`, `-1.svg` | Action | Ajouter utilisateur |
| `user not add.svg` | État | Utilisateur non ajouté |

**POST-MVP:** `My Profile - Private Sessions*.svg` (10 fichiers), `My Profile - lives*.svg`

---

### 6. NOTIFICATIONS MODULE

| Fichier SVG | Type | Écran/Fonction |
|-------------|------|----------------|
| `Notifications.svg`, `-1.svg`, `-2.svg` | Principal | Feed notifications (3 variants) |
| `Notification - search.svg` | Recherche | Recherche dans notifs |
| `option notif.svg` | Menu | Options notification |

---

### 7. MESSAGES MODULE

| Fichier SVG | Type | Écran/Fonction |
|-------------|------|----------------|
| `Messages.svg`, `-1.svg` | Principal | Liste conversations |
| `Messages - detail.svg` | Principal | Chat conversation |
| `Messages - Search.svg` | Recherche | Recherche messages |
| `Messages Add.svg` | Action | Nouvelle conversation |
| `Messages Add group.svg` | Action | Créer groupe |
| `Messages Add group detail.svg` | Step | Détails groupe |

---

### 8. XPLORER MODULE

| Fichier SVG | Type | Écran/Fonction |
|-------------|------|----------------|
| `Xplorer.svg`, `-1.svg`, `-2.svg` | Principal | Vue carte (3 variants) |
| `Explore.svg` | Principal | Écran exploration |
| `Explore - Pro.svg` | Variant | Vue pro |
| `Filters reserach.svg` | Modal | Filtres recherche |
| `position.svg`, `-1.svg` | État | Position/localisation |
| `Saved Places.svg` | Liste | Lieux sauvegardés |

---

### 9. SEARCH MODULE

| Fichier SVG | Type | Écran/Fonction |
|-------------|------|----------------|
| `Search.svg` | Composant | Barre recherche |
| `Recherche.svg`, `-1.svg` | Principal | Écran recherche |
| `Résultat recherche.svg` | Principal | Résultats recherche |

---

### 10. SAFETY MODULE

| Fichier SVG | Type | Écran/Fonction |
|-------------|------|----------------|
| `Report post.svg` | Modal | Signaler post |
| `Report msg.svg` | Modal | Signaler message |
| `Popup report.svg` | Modal | Confirmation report |
| `Rapport.svg` | Principal | Écran rapport |
| `option user.svg`, `-1.svg` | Menu | Options utilisateur (mute/block) |

---

### 11. SETTINGS MODULE

| Fichier SVG | Type | Écran/Fonction |
|-------------|------|----------------|
| `Settings.svg`, `-1.svg` | Principal | Menu settings |
| `Password.svg`, `-1.svg` | Principal | Gestion mot de passe |
| `Settings- Facial Recognition.svg` à `-2.svg` | Principal | Settings Face ID |
| `Facial recognition - Settings.svg` | Principal | Config Face ID |

---

### 12. POST-MVP (Liste uniquement - À HIDE)

**1-to-1 Live Sessions (8 fichiers):**
- `1-to-1 Live LIVE.svg`, `1-to-1 Live wait.svg`
- `1-to-1 Payment*.svg`, `1-to-1 Plan Your Private Session*.svg`
- `1-to-1 Session Booked*.svg`

**Premium Account (8 fichiers):**
- `Premium account*.svg` (8 variants)

**Verified Account (8 fichiers):**
- `Verified Account*.svg` (8 variants)

**Events/Groups (12 fichiers):**
- `Create Groups and Events*.svg`, `Events*.svg`, `Event*.svg`
- `Info event*.svg`, `option event.svg`

**Live Streaming (12 fichiers):**
- `Explore - pro - live streaming*.svg`
- `Streaming - pro.svg`, `View user live streaming.svg`
- `Live streaming Trial Period.svg`
- `Starting a private*.svg`

---

## B) Flows Reconstruits

### FLOW 1: AUTH - LOGIN

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Login.svg     │────▶│ Login loading   │────▶│     Main        │
│  Email/Password │     │   (spinner)     │     │   (Home tab)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │
        ├──▶ [Error] Login-1/2/3/4.svg (variants erreur)
        │
        ├──▶ [Forgot] Forgot password.svg ──▶ -1 ──▶ -2 ──▶ -3 ──▶ Popup redirect
        │
        └──▶ [Face ID] Facial recognition - login.svg
```

**Edge cases:**
- ✅ Error state (Login-1 à -4)
- ✅ Loading state (Login loading)
- ✅ Forgot password flow (4 étapes)
- ✅ Face ID alternative
- ❌ **MANQUANT:** Offline/network error

---

### FLOW 2: AUTH - REGISTER

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Create Account  │────▶│  - name.svg     │────▶│  - Gender.svg   │
│    (intro)      │     │  (24 variants)  │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
        ┌───────────────────────────────────────────────┘
        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ - Interested in │────▶│   - Règle.svg   │────▶│   Code.svg      │
│    (sports)     │     │  (CGU accept)   │     │  (vérif email)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Edge cases:**
- ✅ Validation name (24 variants)
- ✅ Code vérification email
- ⚠️ Face ID setup (optionnel?)
- ❌ **MANQUANT:** Email already exists error

---

### FLOW 3: CREATE POST

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Add tab / Add   │────▶│ new post.svg    │────▶│ new post-       │
│   (+ button)    │     │ (camera/gallery)│     │ detail.svg      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
        ┌───────────────────────────────────────────────┤
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ detail-location │     │ detail-tag      │     │ detail-         │
│    .svg         │     │ people.svg      │     │ visibility.svg  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │ new post-       │────▶│ new post        │
                        │ progress.svg    │     │ success.svg     │
                        └─────────────────┘     └─────────────────┘
```

**Edge cases:**
- ✅ Progress (upload)
- ✅ Success
- ❌ **MANQUANT:** Upload failed/retry
- ❌ **MANQUANT:** Permission camera denied

---

### FLOW 4: PROFILE (OWN)

```
┌─────────────────┐
│   Profil.svg    │──┬──▶ Tab: My Profile - Posts.svg
│   (own profile) │  │
└─────────────────┘  ├──▶ Tab: My Profile - Collection.svg
        │            │
        │            └──▶ [Tap post] ──▶ Vibes - individual.svg
        │
        ├──▶ [Settings icon] ──▶ Settings.svg
        │
        ├──▶ [Edit] ──▶ Edit profil.svg
        │
        └──▶ [QR] ──▶ QR Code popup.svg
```

**Edge cases:**
- ✅ Multiple tabs
- ✅ QR Code modal
- ❌ **MANQUANT:** Empty posts state
- ❌ **MANQUANT:** Empty collection state

---

### FLOW 5: OTHER USER PROFILE

```
┌─────────────────┐     ┌─────────────────┐
│  Profil user    │────▶│  option user    │──┬──▶ Mute
│  (tap on user)  │     │  (3-dot menu)   │  ├──▶ Block
└─────────────────┘     └─────────────────┘  ├──▶ Report
                                             └──▶ Share
```

---

### FLOW 6: NOTIFICATIONS

```
┌─────────────────┐     ┌─────────────────┐
│ Notifications   │────▶│ Notification-   │──▶ Navigate to content
│    .svg         │     │ search.svg      │
└─────────────────┘     └─────────────────┘
        │
        └──▶ [Long press] ──▶ option notif.svg
```

**Edge cases:**
- ✅ Search in notifications
- ✅ Options menu
- ❌ **MANQUANT:** Empty notifications state

---

### FLOW 7: MESSAGES

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Messages.svg   │────▶│ Messages-detail │────▶│  [Send message] │
│  (conv list)    │     │    .svg         │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │
        ├──▶ Messages Add ──▶ New conversation
        │
        ├──▶ Messages Add group ──▶ Group creation
        │
        └──▶ Messages-Search
```

**Edge cases:**
- ✅ New conversation
- ✅ Group chat
- ✅ Report message
- ❌ **MANQUANT:** Empty conversations
- ❌ **MANQUANT:** Message failed to send

---

### FLOW 8: XPLORER

```
┌─────────────────┐     ┌─────────────────┐
│  Xplorer.svg    │────▶│ Filters         │
│  (map view)     │     │ reserach.svg    │
└─────────────────┘     └─────────────────┘
        │
        ├──▶ [Tap marker] ──▶ Info user/event
        │
        └──▶ Saved Places.svg
```

**Edge cases:**
- ✅ Filters
- ✅ Saved places
- ❌ **MANQUANT:** Permission location denied
- ❌ **MANQUANT:** No results found

---

### FLOW 9: SAFETY

```
┌─────────────────┐
│  Post/User/Msg  │
│    (3-dot)      │
└─────────────────┘
        │
        ├──▶ Report post.svg ──▶ Popup report.svg (confirm)
        │
        ├──▶ Report msg.svg ──▶ Popup report.svg
        │
        └──▶ option user.svg ──▶ Mute/Block
```

---

## C) Écrans Manquants à Créer

| ID | Écran | Déclencheur | Contenu Minimal | CTA | Navigation |
|----|-------|-------------|-----------------|-----|------------|
| **M-1** | Network Error | API fail | Icon wifi barré + "No connection" | "Retry" | Stay |
| **M-2** | Empty Feed | Feed vide | Illustration + "No posts yet" | "Explore" | - |
| **M-3** | Empty Notifications | Pas de notifs | Illustration + "No notifications" | - | - |
| **M-4** | Empty Messages | Pas de conv | Illustration + "No messages yet" | "Start conversation" | Messages Add |
| **M-5** | Empty Collection | Collection vide | Illustration + "No saved posts" | - | - |
| **M-6** | Empty Search | Recherche vide | "No results for 'X'" | - | - |
| **M-7** | Camera Denied | Create sans permission | "Camera access required" | "Open Settings" | System |
| **M-8** | Location Denied | Xplorer sans permission | "Location access required" | "Open Settings" | System |
| **M-9** | Upload Failed | Post fail | "Upload failed" | "Retry" / "Cancel" | Stay |
| **M-10** | Block Confirm | Tap Block | "Block @username?" | "Block" / "Cancel" | Dismiss |
| **M-11** | Mute Confirm | Tap Mute | "Mute @username?" | "Mute" / "Cancel" | Dismiss |
| **M-12** | Logout Confirm | Tap Logout | "Are you sure?" | "Logout" / "Cancel" | Login |
| **M-13** | Delete Post Confirm | Tap Delete | "Delete this post?" | "Delete" / "Cancel" | Dismiss |
| **M-14** | Report Success | After report | "Thanks for reporting" | "Done" | Dismiss |
| **M-15** | Xplorer No Results | Filters vides | "No places found" | "Clear filters" | - |

---

## D) Gaps Mis à Jour

### P0 - BLOQUANT LAUNCH

| ID | Gap | Source | Impact | Action |
|----|-----|--------|--------|--------|
| **G-P0-1** | ProfileScreen mock data | App | Profil affiche "Ronald Richards" | Connecter API user |
| **G-P0-2** | NotificationsScreen 100% mock | App | Notifications inutilisables | Connecter API |
| **G-P0-3** | MessagesScreen 100% mock | App | Chat inutilisable | Connecter API |
| **G-P0-4** | ChatScreen 100% mock | App | Envoi messages impossible | Connecter API |
| **G-P0-5** | XplorerFeed mock markers | App | Carte fausses données | Connecter API |
| **G-P0-6** | No Network Error state | Spec+App | Crash/silent fail offline | Ajouter M-1 |

### P1 - IMPORTANT

| ID | Gap | Source | Impact | Action |
|----|-----|--------|--------|--------|
| **G-P1-1** | No Empty States | Spec | UX confuse feeds vides | Ajouter M-2 à M-6 |
| **G-P1-2** | No Permission Denied | Spec | UX bloquée sans feedback | Ajouter M-7, M-8 |
| **G-P1-3** | No Upload Failed | Spec | Perte contenu silencieuse | Ajouter M-9 |
| **G-P1-4** | Mute/Block sans confirm | App | Action irréversible | Ajouter M-10, M-11 |
| **G-P1-5** | Blocked/Muted list absent | App | User ne peut pas gérer | Créer écran Settings |
| **G-P1-6** | UserProfile données mixtes | App | Incohérence affichage | Cleanup API |
| **G-P1-7** | PEAKS flow non vérifié | App | Potentiellement cassé | Audit + fix |
| **G-P1-8** | Onboarding simplifié | Spec | App skip Gender/Interests | Évaluer MVP |

### P2 - POST-LAUNCH

| ID | Gap | Source | Action |
|----|-----|--------|--------|
| **G-P2-1** | Location tag posts | Spec | Post-MVP |
| **G-P2-2** | Tag people posts | Spec | Post-MVP |
| **G-P2-3** | Visibility settings | Spec | Post-MVP |
| **G-P2-4** | Notification search | Spec | Nice-to-have |
| **G-P2-5** | Group messages | Spec | Post-MVP |
| **G-P2-6** | Edit post | Spec | Post-MVP |
| **G-P2-7** | Saved Places | Spec | Post-MVP |
| **G-P2-8** | Report message | Spec | P1 si chat MVP |

---

## E) MVP DoD Final

### Auth

- [x] Login email/password (Supabase)
- [x] Register avec email verification
- [x] Forgot password flow
- [x] Email verification gate
- [ ] Loading state sur boutons
- [ ] Error states visibles (toast)
- [ ] Network error handling

### Feeds (Vibes/Fan)

- [x] Charge posts depuis API
- [x] Filtre under_review posts
- [x] Filtre muted/blocked users
- [x] Post detail avec Mute/Block
- [ ] Empty state "No posts yet"
- [ ] Error state "Failed to load"
- [ ] Pull-to-refresh feedback

### Create Post

- [x] Camera/gallery selection
- [x] Description input
- [x] Submit to API
- [x] Success screen
- [ ] Upload progress visible
- [ ] Upload failed + retry
- [ ] Camera permission denied state

### Profile

- [ ] **Own profile from API (not mock)**
- [ ] **Stats dynamiques (fans/following/posts)**
- [x] Navigate to Settings
- [x] QR Code modal
- [ ] Empty posts state

### Notifications

- [ ] **From API (not mock)**
- [ ] Tap → navigate to content
- [ ] Empty state

### Messages

- [ ] **Conversations from API**
- [ ] **Chat send/receive**
- [ ] Empty state

### Xplorer

- [ ] **Markers from API**
- [x] Location permission handling
- [x] Filters
- [ ] No results state

### Safety

- [x] Report content
- [x] Mute user
- [x] Block user
- [ ] Confirmation modals Mute/Block
- [ ] Blocked/Muted users list in Settings

### Settings

- [x] Menu complet
- [x] Logout fonctionnel
- [ ] Edit profile fonctionnel
- [ ] Password change fonctionnel

### Global

- [ ] Network error screen (reusable)
- [ ] No memory leaks / crashes

---

## F) LOTs UI

### Phase 1: P0 Bloquants (LOT 1-6)

| LOT | Nom | Objectif | Fichiers | Tests Manuels | Do NOT DO |
|-----|-----|----------|----------|---------------|-----------|
| **UI-P0-1** | Profile API | ✅ DONE - Déjà implémenté | `ProfileScreen.tsx` | Vrai nom/avatar/bio | - |
| **UI-P0-1b** | Settings Header | ✅ DONE | `SettingsScreen.tsx` | Vrai nom/avatar (pas "Ronald Richards") | Ne pas toucher menu |
| **UI-P0-2** | Profile Stats | Stats dynamiques fans/following/posts | `ProfileScreen.tsx` | Counts = réels | Ne pas implémenter follow |
| **UI-P0-3** | Notifications API | Notifications depuis API | `NotificationsScreen.js`, service | Vraies notifs, tap navigation | Ne pas faire mark as read |
| **UI-P0-4** | Messages List | Conversations depuis API | `MessagesScreen.tsx`, service | Vraies conversations | Ne pas faire envoi |
| **UI-P0-5** | Chat API | Chat lecture + envoi | `ChatScreen.tsx`, service | Envoyer/recevoir messages | Pas WebSocket |
| **UI-P0-6** | Xplorer Markers | Markers map depuis API | `XplorerFeed.tsx`, service | Vrais lieux, filtre OK | Ne pas changer style |

### Phase 2: P1 Critiques (LOT 7-11)

| LOT | Nom | Objectif | Fichiers | Tests Manuels | Do NOT DO |
|-----|-----|----------|----------|---------------|-----------|
| **UI-P1-1** | Empty States | Empty states sur feeds | `FanFeed.tsx`, `VibesFeed.tsx`, `NotificationsScreen.js` | Feed vide → message | Ne pas modifier fetch |
| **UI-P1-2** | Error States | Network error + retry | `FanFeed.tsx`, `VibesFeed.tsx`, composant shared | Couper réseau → erreur | Pas offline mode |
| **UI-P1-3** | Mute/Block Confirm | Modals confirmation | `PostDetailFanFeedScreen.tsx`, `PostDetailVibesFeedScreen.tsx` | Confirm avant action | Ne pas changer logique |
| **UI-P1-4** | Blocked/Muted List | Écran Settings gestion | `BlockedMutedScreen.tsx`, `SettingsScreen.tsx`, `MainNavigator.tsx` | Voir/gérer blocked users | Pas de search |
| **UI-P1-5** | UserProfile Fix | Cohérence données | `UserProfileScreen.tsx` | API only, pas mock | Pas de features |

### Phase 3: P1 Suite (LOT 12-14)

| LOT | Nom | Objectif | Fichiers | Tests Manuels | Do NOT DO |
|-----|-----|----------|----------|---------------|-----------|
| **UI-P1-6** | PEAKS Audit | Vérifier + fix flow PEAKS | `PeaksFeedScreen.tsx`, `CreatePeakScreen.tsx`, `PeakViewScreen.tsx` | Feed/Create/View OK | Pas de features |
| **UI-P1-7** | Edit Profile | Vérifier édition profil | `EditProfilScreen.tsx` | Modifier nom/avatar/bio | Pas de redesign |
| **UI-P1-8** | Auth Loading | Loading sur boutons auth | `LoginScreen.js`, `RegisterScreen.js` | Button loading visible | Pas de validations |

---

## G) Next LOT Recommandé

### UI-P0-1 - Profile API Connect

**Justification:**
1. **Visibilité maximale** - Le profil est visible à CHAQUE session
2. **Crédibilité** - "Ronald Richards" hardcodé = app non finie
3. **Fondation** - UI-P0-2 (stats), UI-P1-5 (UserProfile) en dépendent
4. **Quick win** - 1-2 fichiers, changement ciblé
5. **Zéro dépendance** - Peut commencer immédiatement

---

## H) Erreurs Détectées dans Spec SVG

| ID | Type | Détail | Impact |
|----|------|--------|--------|
| **E-1** | Doublon | `Sign in.svg` vs `Login.svg` | Confusion |
| **E-2** | Typo | `Creat Account.svg` (manque 'e') | Mineur |
| **E-3** | Typo | `Filters reserach.svg` | Mineur |
| **E-4** | Over-design | 24 variants `Create Account - name*.svg` | À clarifier |
| **E-5** | Manquant | Pas de "FanFeed.svg" explicite | Feed non spécifié |
| **E-6** | Manquant | Pas d'écran "Network Error" | Critique |
| **E-7** | Manquant | Pas d'écrans Empty States | Critique |
| **E-8** | Incomplet | PEAKS - seulement 3 écrans feed | Flow incomplet |
| **E-9** | Contradictoire | `Profil & Settings.svg` vs `Settings.svg` | Clarifier nav |

---

## Résumé Final

| Métrique | Valeur |
|----------|--------|
| **Écrans spec total** | 243 SVG |
| **Écrans MVP** | ~80 |
| **Écrans POST-MVP** | ~60 (à HIDE) |
| **État app actuel** | ~55% fonctionnel |
| **Gaps P0** | 6 |
| **Gaps P1** | 8 |
| **Écrans manquants** | 15 |
| **LOTs nécessaires** | 14 |
| **NEXT LOT** | UI-P0-2 Profile Stats |

---

---

# SPEC UI-P0-1 - Profile API Connect

> **LOT:** UI-P0-1
> **Status:** SPEC ONLY - En attente validation
> **Date:** 2026-01-16

---

## 1. But du LOT

Connecter `ProfileScreen.tsx` aux données utilisateur réelles (Supabase/UserContext) pour remplacer les données mock hardcodées ("Ronald Richards").

---

## 2. Écran(s) Concerné(s)

| Fichier | Rôle | Modification |
|---------|------|--------------|
| `src/screens/profile/ProfileScreen.tsx` | Écran principal | **OUI** - Source données |
| `src/context/UserContext.tsx` | Contexte user | **PEUT-ÊTRE** - Si besoin getter |

**Dépendances minimales:**
- Supabase auth session (déjà disponible)
- UserContext (déjà wrappé dans AppNavigator)

---

## 3. États de l'Écran

| État | Déclencheur | Affichage |
|------|-------------|-----------|
| **Loading** | Fetch user data en cours | Skeleton ou spinner sur avatar/nom |
| **Success** | Données chargées | Nom, avatar, bio affichés |
| **Empty fields** | User sans avatar/bio | Placeholders appropriés |
| **Error** | Session invalide / fetch fail | Redirect login OU message erreur |
| **Offline** | Pas de réseau | Afficher dernières données cached OU message |

---

## 4. Données à Afficher

| Champ | Source | Type | Fallback si null |
|-------|--------|------|------------------|
| **displayName** | `user.user_metadata.full_name` OU `profile.display_name` | string | "Anonymous User" |
| **avatar** | `user.user_metadata.avatar_url` OU `profile.avatar_url` | URL | Placeholder initiales |
| **bio** | `profile.bio` | string \| null | "" (vide) ou "No bio yet" |
| **username** | `profile.username` OU `user.email` (avant @) | string | - |
| **createdAt** | `user.created_at` | ISO date | - (si non affiché) |

**Ordre de priorité des sources:**
1. `profile` table (données enrichies)
2. `user.user_metadata` (données Supabase auth)
3. Fallback statique

---

## 5. Source des Données

### Option A: Via UserContext (recommandé)

```
UserContext.user → données auth Supabase
UserContext.profile → données table profiles (si fetch)
```

### Option B: Direct Supabase

```
supabase.auth.getUser() → user object
supabase.from('profiles').select().eq('id', user.id) → profile
```

### Comportement si `null`:

| Cas | Comportement |
|-----|--------------|
| `user === null` | Redirect vers Login (session expirée) |
| `profile === null` | Utiliser `user.user_metadata` uniquement |
| `avatar_url === null` | Afficher placeholder avec initiales |
| `bio === null` | Afficher string vide ou "No bio yet" |
| `display_name === null` | Utiliser email prefix ou "Anonymous User" |

---

## 6. Navigation Impact

| Élément | Changement |
|---------|------------|
| Routes | **AUCUN** |
| Tabs (Posts/Collection) | **AUCUN** - Ne pas toucher |
| Settings entry | **AUCUN** |
| Bottom navigation | **AUCUN** |
| Back button | **AUCUN** |

---

## 7. QA Checklist (Tests Manuels)

### Tests obligatoires:

- [ ] **TC-1:** User complet (nom/avatar/bio définis) → Affiche correctement
- [ ] **TC-2:** User sans avatar → Affiche placeholder (initiales ou icône)
- [ ] **TC-3:** User sans bio → Affiche vide ou "No bio yet"
- [ ] **TC-4:** User sans display_name → Affiche email prefix ou fallback
- [ ] **TC-5:** Nouveau user (créé il y a 5 min) → Pas de crash, données par défaut
- [ ] **TC-6:** Session invalide/expirée → Redirect vers Login (pas crash)
- [ ] **TC-7:** Offline (mode avion) → Pas de crash, message erreur propre
- [ ] **TC-8:** Refresh profile → Données mises à jour
- [ ] **TC-9:** Changement de compte → Nouveau profil affiché

### Tests optionnels (si i18n):

- [ ] **TC-10:** Changement de langue → Labels traduits

---

## 8. Do NOT DO

| Interdit | Raison |
|----------|--------|
| ❌ Toucher tabs Posts/Collection | Scope différent (UI-P0-2) |
| ❌ Implémenter stats (fans/following/posts) | LOT séparé (UI-P0-2) |
| ❌ Refactor UI/styles | Hors scope - stabilité only |
| ❌ Ajouter follow/edit buttons | Features hors scope |
| ❌ Modifier navigation | Aucun changement routes |
| ❌ Ajouter loading skeleton fancy | Simple spinner OK |
| ❌ Implémenter cache offline | Post-MVP |
| ❌ Modifier UserContext structure | Minimal changes only |

---

## 9. Acceptance Criteria

**Le LOT est DONE quand:**

1. ✅ ProfileScreen affiche le vrai nom de l'utilisateur connecté
2. ✅ ProfileScreen affiche le vrai avatar (ou placeholder)
3. ✅ ProfileScreen affiche la vraie bio (ou vide)
4. ✅ Aucune donnée hardcodée "Ronald Richards" visible
5. ✅ Pas de crash sur user nouveau/incomplet
6. ✅ Pas de crash offline
7. ✅ Session expirée → redirect login
8. ✅ Tests manuels TC-1 à TC-9 passent

---

## 10. Notes Techniques

### Code actuel à remplacer:

```tsx
// ❌ AVANT (hardcodé)
const user = {
  displayName: 'Ronald Richards',
  avatar: 'https://i.pravatar.cc/150?img=12'
};

// ✅ APRÈS (dynamique)
const { user, profile } = useUser(); // ou useContext
const displayName = profile?.display_name || user?.user_metadata?.full_name || 'Anonymous';
const avatar = profile?.avatar_url || user?.user_metadata?.avatar_url || null;
const bio = profile?.bio || '';
```

### Points d'attention:

1. Vérifier que `UserContext` expose bien `user` et/ou `profile`
2. Si `profile` n'existe pas encore, créer le fetch ou utiliser `user_metadata`
3. Gérer le loading state pendant le fetch initial
4. Ne pas bloquer le rendu si bio/avatar manquants

---

## 11. Estimation

| Métrique | Valeur |
|----------|--------|
| Fichiers touchés | 1-2 |
| Complexité | Faible |
| Risque régression | Faible |
| Dépendances | UserContext (existant) |

---

**FIN DE SPEC UI-P0-1**

---

> **Next step:** Validation specs → Implémentation LOT UI-P0-1
