# AUDIT COMPLET & PLAN DE MODERATION — SMUPPY

> **Parent**: [CLAUDE.md](../CLAUDE.md) | **Moderation**: [MODERATION_SYSTEM.md](./MODERATION_SYSTEM.md) | **Stability**: [STABILITY.md](./STABILITY.md)
>
> **Version:** 3.0 — Post-implementation update
> **Date:** 2026-02-09
> **Base de donnees:** PostgreSQL (pas DynamoDB)
> **Stack:** React Native (Expo 54) + AWS Lambda + Cognito + S3 + Rekognition + Comprehend

---

## PARTIE 1 — INVENTAIRE DE L'EXISTANT

### 1.1 Statistiques globales

- **116 ecrans** React Native (23 modules)
- **~76,500 lignes** de code frontend
- **3 API Gateways** (REST principal, REST payments, WebSocket live)
- **Base de donnees:** PostgreSQL via `getPool()` connection pooling
- **Auth:** Cognito (email + Apple + Google)

### 1.2 Systeme de signalement (COMPLET)

| Endpoint | Lambda | Table DB | Rate Limit |
|----------|--------|----------|------------|
| `POST /reports/post` | `report-post.ts` | `post_reports` | 5/300s |
| `POST /reports/user` | `report-user.ts` | `user_reports` | 5/300s |
| `POST /reports/peak` | `report-peak.ts` | `peak_reports` | 5/300s |
| `GET /profiles/{id}/reported` | `check-user-report.ts` | `user_reports` | — |
| `GET /posts/{id}/reported` | `check-post-report.ts` | `post_reports` | — |

**Raisons disponibles:** `inappropriate`, `spam`, `harassment`, `violence`, `misinformation`, `copyright`, `other`

**Tables DB (migration-005 + migration-044):**
- `user_reports` — reporter_id, reported_user_id, reason, description, status (pending/reviewed/resolved/dismissed), reviewed_by, reviewed_at
- `post_reports` — meme structure, cible un post
- `comment_reports` — meme structure, cible un comment (**table existe, pas de Lambda**)
- `peak_reports` — meme structure avec UNIQUE (reporter_id, peak_id)
- `moderation_log` — moderator_id, action_type (warn/suspend/ban/delete_post/delete_comment), target_user_id, target_post_id, reason (**table existe, pas de Lambda**)

**Frontend UI:**
- Report modal dans PostDetailFanFeedScreen, PostDetailVibesFeedScreen, PeakViewScreen
- ReportProblemScreen (rapport general, min 20 chars, 3/heure client-side)

### 1.3 Blocage / Mute (COMPLET)

| Endpoint | Lambda | Table DB | Rate Limit |
|----------|--------|----------|------------|
| `POST /profiles/{id}/block` | `block.ts` | `blocked_users` | 10/60s |
| `POST /profiles/{id}/unblock` | `unblock.ts` | `blocked_users` | 10/60s |
| `GET /profiles/blocked` | `get-blocked.ts` | `blocked_users` | — |
| `POST /profiles/{id}/mute` | `mute.ts` | `muted_users` | 20/60s |
| `POST /profiles/{id}/unmute` | `unmute.ts` | `muted_users` | 20/60s |
| `GET /profiles/muted` | `get-muted.ts` | `muted_users` | — |

**Frontend:**
- `BlockedUsersScreen.tsx` — liste + unblock avec confirmation
- `MutedUsersScreen.tsx` — liste + unmute avec confirmation
- `useUserSafetyStore.ts` (Zustand + Immer) — `isMuted()`, `isBlocked()`, `isHidden()`, optimistic updates

**Comportement du block:** supprime les follows mutuels (accepted + pending) en transaction

### 1.4 Scan de securite media (PARTIEL)

**Fichier:** `security-phase2-stack.ts` (lignes 275-467)

| Feature | Statut | Details |
|---------|--------|---------|
| Magic bytes validation | Actif | Verifie headers fichier vs extension |
| Formats supportes | Actif | jpg, png, gif, webp, heic, mp4, mov, webm, mp3, wav, aac |
| Taille max | Actif | 500 MB |
| Quarantaine fichiers suspects | Actif | Bucket `smuppy-quarantine-{env}`, retention 90j |
| SNS alertes securite | Actif | `SecurityAlertsTopic` (KMS encrypted) |
| GuardDuty | Actif | Runtime threat detection, S3 logs, EBS malware |
| **ClamAV deep scan** | **Absent** | Seulement magic bytes, pas d'antivirus reel |
| **Rekognition NSFW** | **Absent** | Pas d'analyse de contenu image/video |

### 1.5 Sanitization & Validation (COMPLET)

Applique sur **tous** les endpoints:
- Strip HTML: `.replace(/<[^>]*>/g, '')`
- Strip control chars: `.replace(/[\x00-\x1F\x7F]/g, '')`
- Trim + max lengths (100 chars reason, 1000 chars description)
- UUID validation: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- Cognito JWT obligatoire sur chaque mutation
- Requetes SQL parametrees uniquement ($1, $2...)

### 1.6 Bien-etre utilisateur

- **VibeGuardian** (`useVibeGuardian.ts`) — anti-doom-scroll, alerte si session longue, recap en background
- Feature flag: `VIBE_GUARDIAN`

---

## PARTIE 2 — VULNERABILITES IDENTIFIEES

### Critique (Impact immediat)

| # | Probleme | Statut | Resolution |
|---|----------|--------|------------|
| V1 | **Chat live non modere** | **RESOLU** | filterText + analyzeTextToxicity dans `websocket/live-stream.ts` |
| V2 | **Upload media sans analyse NSFW** | **RESOLU** | AWS Rekognition via EventBridge trigger (`analyze-image.ts`) |
| V3 | **Pas de filtre profanite** | **RESOLU** | filterText (S3 wordlist) + analyzeTextToxicity (Comprehend) dans 19 handlers + client-side contentFilters.ts |
| V4 | **Pas de suspension/ban de compte** | **RESOLU** | requireActiveAccount middleware sur 19 handlers + ecrans frontend (suspended/banned) |

### Eleve (Gaps fonctionnels)

| # | Probleme | Statut | Resolution |
|---|----------|--------|------------|
| V5 | **Pas de report pour comments** | **RESOLU** | `report-comment.ts` deploye avec auto-escalation |
| V6 | **Pas de report pour live streams** | **RESOLU** | `report-livestream.ts` deploye (migration-046) |
| V7 | **Pas de report pour messages prives** | **RESOLU** | `report-message.ts` deploye (migration-046) |
| V8 | **Pas de dashboard moderateur** | A FAIRE | Phase 4 — API admin + dashboard web |
| V9 | **Pas de notifications de moderation** | **PARTIEL** | Push notifications auto-escalation (post hidden, suspension). Dashboard notification manquant. |
| V10 | **Pas de systeme d'appel** | A FAIRE | Phase 4 — table appeals + endpoints |

### Moyen (Ameliorations)

| # | Probleme | Statut | Resolution |
|---|----------|--------|------------|
| V11 | **Pas de shadow ban** | **RESOLU** | Feed filtering dans 7 handlers (posts/list, posts/get, posts/search, comments/list, peaks/list, peaks/search, peaks/comment) |
| V12 | **Pas de reputation score** | A FAIRE | Phase 5 — trust_score column |
| V13 | **Pas de detection de spam patterns** | A FAIRE | Phase 5 — contenu similaire |
| V14 | **Messages audio non verifies** | A FAIRE | Phase 5 — Transcribe → Comprehend |

---

## PARTIE 3 — ARCHITECTURE CIBLE

```
PIPELINE DE MODERATION

  ┌─────────────────────┐
  │   CONTENU CREE      │  (post, comment, peak, message, live chat, bio, avatar)
  └──────────┬──────────┘
             │
  ┌──────────▼──────────┐
  │  FILTRE CLIENT      │  Profanity wordlist (sync, <5ms)
  │  contentFilters.ts  │  Spam detection (caps, repetitions, URLs)
  └──────────┬──────────┘
             │ Si passe →
  ┌──────────▼──────────┐
  │  API GATEWAY        │  Rate limiting (WAF + per-endpoint)
  │  + Lambda Handler   │  Auth Cognito + profile status check
  └──────────┬──────────┘
             │ Si passe →
  ┌──────────▼──────────┐
  │  MODERATION BACKEND │  (async, post-creation)
  │                     │
  │  Texte:             │  AWS Comprehend DetectToxicContent
  │  Images:            │  AWS Rekognition DetectModerationLabels
  │  Video:             │  Rekognition sur thumbnails extraits
  │  Audio:             │  Transcribe → Comprehend
  └──────────┬──────────┘
             │
     ┌───────┼───────┐
     │       │       │
  ┌──▼──┐ ┌─▼──┐ ┌──▼───┐
  │PASS │ │FLAG│ │BLOCK │
  │     │ │    │ │      │
  │Publie│ │Tag │ │Quara-│
  │     │ │under│ │ntaine│
  │     │ │review│ │+ SNS │
  └─────┘ └──┬─┘ └──────┘
             │
  ┌──────────▼──────────┐
  │  QUEUE MODERATEUR   │  Dashboard web admin
  │  (PostgreSQL)       │  Actions: approve/reject/warn/suspend/ban
  └──────────┬──────────┘
             │
  ┌──────────▼──────────┐
  │  NOTIFICATION USER  │  Push + in-app
  │  + APPEL POSSIBLE   │  "Votre contenu a ete supprime parce que..."
  └─────────────────────┘
```

**Decision architecturale: PAS de nsfwjs client-side.**
Raison: TensorFlow.js necessite ~20MB de modele, augmente le bundle de 30%, consomme 200MB+ de RAM sur le device, et ralentit le startup. Toute l'analyse se fait cote serveur via Rekognition (plus precis, ~$1/1000 images).

**Decision architecturale: PostgreSQL partout.**
Raison: Toute l'app utilise deja PostgreSQL. Ajouter DynamoDB pour la moderation creee une complexite inutile (2 DB, 2 SDK, 2 patterns). Les tables existent deja.

---

## PARTIE 4 — PLAN D'IMPLEMENTATION

### Phase 1: Protection immediate (Semaine 1)

> **Objectif:** Bloquer le contenu manifestement toxique AVANT qu'il soit vu par d'autres

#### 1A. Filtre profanite client-side (Jour 1)

**Creer:** `src/utils/contentFilters.ts`

```typescript
interface FilterResult {
  clean: boolean;
  filtered: string;        // texte nettoye (mots remplaces par ***)
  violations: string[];    // categories violees
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

// Detections:
// - Wordlist profanite multilingue (FR/EN/AR) — regex avec variantes leetspeak
// - Caps lock excessif (>70% majuscules sur 20+ chars)
// - Repetition de caracteres (aaaaaa, !!!!!!)
// - URLs suspectes (phishing patterns)
// - Donnees personnelles (numeros de tel, emails dans les commentaires publics)

export function filterContent(text: string): FilterResult;
export function isSpam(text: string, recentMessages: string[]): boolean;
```

**Integrer dans:** CreatePostScreen, AddPostDetailsScreen, ChatScreen, LiveStreamingScreen (sendComment), CreatePeakScreen, CreateGroupScreen, CreateEventScreen, SuggestSpotScreen, profile bio edit

#### 1B. Suspension / Ban de comptes (Jour 2-3)

**Migration:**
```sql
ALTER TABLE profiles
  ADD COLUMN moderation_status VARCHAR(20) DEFAULT 'active'
    CHECK (moderation_status IN ('active', 'suspended', 'banned', 'shadow_banned')),
  ADD COLUMN suspended_until TIMESTAMP WITH TIME ZONE,
  ADD COLUMN ban_reason TEXT;

CREATE INDEX idx_profiles_moderation_status ON profiles(moderation_status);
```

**Lambda middleware** (`checkAccountStatus.ts`):
- Verifie `moderation_status` sur chaque requete authentifiee
- `suspended` → 403 avec `{ reason, suspended_until }`
- `banned` → 403 permanent
- `shadow_banned` → 200 normal (le user ne sait pas)
- Importe dans tous les handlers de creation (posts, comments, peaks, messages, live)

**Frontend:**
- Ecran "Compte suspendu" avec raison + duree restante
- Ecran "Compte banni" avec lien vers support/appel

#### 1C. Report de commentaires — combler le gap (Jour 3)

**Lambda:** `POST /reports/comment` — meme pattern que `report-post.ts`
**Frontend:** long press sur commentaire → menu avec "Signaler"
**Table:** `comment_reports` existe deja

#### 1D. Filtre profanite backend (Jour 4-5)

**Creer:** `aws-migration/lambda/shared/moderation/textFilter.ts`

```typescript
// Wordlist chargee depuis S3 (configurable sans redeploy)
// Meme logique que client mais cote serveur = source de verite
// Appele dans: create-post, create-comment, create-peak, send-message handlers
// Si violation critique → rejet 400 { error: 'Content policy violation' }
// Si violation moyenne → publish avec tag 'flagged' pour review
```

**Fichier wordlist:** `s3://smuppy-config-{env}/moderation/wordlist.json`

---

### Phase 2: Detection automatique IA (Semaine 2-3)

> **Objectif:** Detecter le contenu NSFW, violent, toxique automatiquement

#### 2A. AWS Rekognition — Images (Jour 1-3)

**Lambda trigger:** EventBridge sur S3 PutObject (posts/, peaks/, users/ prefixes)
**Action:** `DetectModerationLabels` sur chaque image uploadee

**Seuils:**
| Confidence | Action | Notification |
|------------|--------|-------------|
| > 90% | Quarantaine immediate + suppression du post | SNS admin + push user "contenu supprime" |
| 70-90% | Tag `under-review`, visible mais flag | SNS admin pour review manuel |
| < 70% | Publie normalement | — |

**Categories detectees:** Explicit Nudity, Suggestive, Violence, Visually Disturbing, Drugs, Tobacco, Alcohol, Gambling, Hate Symbols

**Lambda:** `aws-migration/lambda/api/moderation/analyze-image.ts`
**CDK:** Ajouter IAM policy `rekognition:DetectModerationLabels` au Lambda
**Cout:** ~$1/1000 images

#### 2B. AWS Comprehend — Texte (Jour 4-6)

**Appel synchrone** dans les handlers de creation (create-post, create-comment, create-peak)

**API:** `DetectToxicContent` (endpoint Comprehend Toxicity Detection)

**Seuils:**
| Score toxicite | Action |
|----------------|--------|
| > 0.9 | Rejet 400 + log dans moderation_log |
| 0.7-0.9 | Publie avec tag `under-review` + notif admin |
| < 0.7 | Publie normalement |

**Categories:** HATE_SPEECH, INSULT, THREAT, SEXUAL, PROFANITY, GRAPHIC

**Lambda:** Integre dans les handlers existants (pas de Lambda separe)
**CDK:** IAM policy `comprehend:DetectToxicContent`
**Cout:** ~$0.0001/unite (100 chars) ≈ $20/mois pour 200K analyses

#### 2C. Report live streams + messages (Jour 7-8)

**Migrations:**
```sql
CREATE TABLE live_stream_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id),
  live_stream_id UUID NOT NULL REFERENCES live_streams(id),
  reason VARCHAR(50) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(reporter_id, live_stream_id)
);

CREATE TABLE message_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id),
  message_id UUID NOT NULL REFERENCES messages(id),
  conversation_id UUID NOT NULL,
  reason VARCHAR(50) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(reporter_id, message_id)
);
```

**Lambdas:** `report-livestream.ts`, `report-message.ts`
**Frontend:** bouton report dans ViewerLiveStreamScreen + long press message dans ChatScreen

#### 2D. Auto-escalation (Jour 9-10)

**Regle:** Si un user/post/peak accumule N reports en X heures → action automatique

| Seuil | Action |
|-------|--------|
| 3 reports en 1h sur un post | Auto-hide le post + notif admin |
| 5 reports en 24h sur un user | Suspension temporaire 24h |
| 10 reports confirmed en 30j sur un user | Ban permanent (require review) |

**Implementation:** Trigger PostgreSQL ou check dans le report handler

---

### Phase 3: Moderation temps reel (Semaine 3-4)

> **Objectif:** Moderer le contenu live et les conversations en temps reel

#### 3A. Moderation chat live (Jour 1-3)

**Architecture:**
```
User tape message
  → sendComment() appelle filterContent() (client, <5ms)
  → Si clean → WebSocket → Lambda moderator
    → Comprehend DetectToxicContent (async, <200ms)
    → Si toxique → supprimer le message + warn user
    → Si clean → broadcast aux viewers
```

**Modifier:** `LiveStreamingScreen.tsx` et `ViewerLiveStreamScreen.tsx`
**Lambda WebSocket:** ajouter moderation dans le handler `sendmessage`

**Regles specifiques live:**
- Cooldown: 1 message/3 secondes par user
- Si 3 messages bloques en 5 min → mute automatique du viewer pour 10 min
- Host peut muter/bannir un viewer du chat

#### 3B. Shadow ban (Jour 4-5)

**Backend:**
- `moderation_status = 'shadow_banned'` sur le profile
- Middleware: ne bloque PAS les requetes du user
- Mais les handlers de lecture (get-feed, get-comments, search) **excluent** les posts/comments de ce user pour les AUTRES
- Le user shadow-banne voit son propre contenu normalement

**Implementation:**
```sql
-- Dans chaque query de feed/comments/search, ajouter:
AND author_id NOT IN (
  SELECT id FROM profiles WHERE moderation_status = 'shadow_banned'
)
-- Sauf si le viewer EST le shadow-banne lui-meme
```

#### 3C. Notifications de moderation (Jour 6-7)

**Push + in-app notifications pour:**
- Contenu supprime (avec raison generique, pas la raison exacte du signaleur)
- Avertissement (1er, 2e, 3e strike)
- Suspension (duree + raison)
- Ban (raison + lien appel)
- Appel traite (resultat)

**Ne JAMAIS reveler:** qui a signale, combien de signalements, score de confiance IA

**Lambda:** `send-moderation-notification.ts` — utilise le systeme de notifs existant

---

### Phase 4: Dashboard moderateur + appels (Semaine 4-5)

> **Objectif:** Donner aux moderateurs les outils pour traiter les reports efficacement

#### 4A. API Admin moderation (Jour 1-3)

**Endpoints (protege par groupe Cognito `Moderators`):**

| Endpoint | Description |
|----------|-------------|
| `GET /admin/reports?status=pending&type=post&page=1` | Liste paginee de tous les reports |
| `GET /admin/reports/{id}` | Detail d'un report avec contenu + historique user |
| `PUT /admin/reports/{id}` | Update status: reviewed/resolved/dismissed |
| `POST /admin/actions` | Appliquer action: warn/suspend/ban/delete_post/delete_comment |
| `GET /admin/users/{id}/history` | Historique moderation d'un user |
| `GET /admin/stats` | Stats: reports/jour, resolution time, top offenders |
| `GET /admin/queue` | Queue priorisee (par nombre de reports, anciennete, severity) |

**CDK:** Creer route `/admin/*` avec authorizer Cognito group-based

#### 4B. Dashboard web (Jour 4-7)

**Technologie:** React (Vite) SPA hebergee sur CloudFront + S3
**PAS un ecran React Native** — les moderateurs travaillent sur desktop

**Features:**
- Queue de reports avec preview du contenu (image/texte/video)
- Actions en 1 clic: Approuver / Supprimer / Warn / Suspend / Ban
- Historique de moderation par user (timeline)
- Stats en temps reel (reports/heure, queue size, resolution time)
- Recherche par user, par contenu, par date
- Bulk actions (selectionner plusieurs reports → dismiss all)

#### 4C. Systeme d'appels (Jour 8-10)

**Migration:**
```sql
CREATE TABLE appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  moderation_action_id UUID NOT NULL REFERENCES moderation_log(id),
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewing', 'accepted', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMP,
  reviewer_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Max 1 appel par action, max 3 appels par mois
CREATE UNIQUE INDEX idx_appeals_action ON appeals(moderation_action_id);
```

**Lambdas:**
- `POST /appeals` — soumettre un appel (rate limit: 3/mois)
- `GET /admin/appeals` — liste pour moderateurs
- `PUT /admin/appeals/{id}` — traiter l'appel (accept = lever la sanction, reject = confirmer)

**Frontend:** Bouton "Contester" sur l'ecran de suspension + ecran "Mes appels" dans Settings

---

### Phase 5: Intelligence & Automatisation (Semaine 5+)

> **Objectif:** Reduire la charge humaine et ameliorer la precision

#### 5A. Reputation score interne (Jour 1-3)

**Migration:**
```sql
ALTER TABLE profiles
  ADD COLUMN trust_score INTEGER DEFAULT 100
    CHECK (trust_score BETWEEN 0 AND 100);
```

**Regles:**
| Evenement | Impact |
|-----------|--------|
| Report confirme contre le user | -10 |
| Contenu supprime par moderation | -5 |
| Suspension | -20 |
| Ban (puis reinstalle sur appel) | -30 |
| 0 reports sur 6 mois | +5 |
| Anciennete: chaque mois actif | +1 |

**Usage:**
- `trust_score < 30` → tous les posts passent en review manuelle avant publication
- `trust_score < 10` → auto-suggestion de ban au moderateur
- `trust_score > 80` → moderation IA seulement (pas de queue humaine sauf si flag)

**Jamais affiche au user.**

#### 5B. Analytics moderation (Jour 4-5)

**Metriques trackees:**
- Reports/jour par categorie
- Temps moyen de resolution
- Taux de faux positifs (reports dismissed / total)
- Top 10 users les plus reportes
- Volume de contenu auto-modere vs humain
- Distribution des trust scores

**Implementation:** Queries SQL aggregees dans `GET /admin/stats`, affichees dans le dashboard web

#### 5C. Amelioration continue (Ongoing)

- Exporter les decisions moderateur (approved/rejected) comme training data
- Si assez de donnees (10K+ decisions) → entrainer un modele custom Comprehend
- Ajuster les seuils Rekognition/Comprehend en fonction des faux positifs mesures
- Ajouter ClamAV Lambda Layer pour deep virus scanning (quand le volume justifie le cout)

---

## PARTIE 5 — ECRANS & POINTS D'INTEGRATION

### Tous les points de creation de contenu dans l'app

| Ecran | Type de contenu | Filtre client | Filtre backend | Rekognition | Comprehend |
|-------|----------------|---------------|----------------|-------------|------------|
| `CreatePostScreen` | Images, video, texte | Profanite + spam | Wordlist S3 | Oui (images) | Oui (texte) |
| `AddPostDetailsScreen` | Description, hashtags, location | Profanite | Wordlist S3 | — | Oui |
| `CreatePeakScreen` | Images, video, texte | Profanite + spam | Wordlist S3 | Oui | Oui |
| `ChatScreen` | Texte, images, audio, posts partages | Profanite | Wordlist S3 | Oui (images) | Oui (texte) |
| `LiveStreamingScreen` | Chat en direct | Profanite + cooldown | Comprehend real-time | — | Oui |
| `ViewerLiveStreamScreen` | Chat en direct | Profanite + cooldown | Comprehend real-time | — | Oui |
| `CreateGroupScreen` | Nom, description | Profanite | Wordlist S3 | — | Oui |
| `CreateEventScreen` | Titre, description, lieu | Profanite | Wordlist S3 | — | Oui |
| `SuggestSpotScreen` | Localisation, review | Profanite | Wordlist S3 | — | Oui |
| `ProfileScreen` (edit bio) | Bio, username | Profanite | Wordlist S3 | — | Oui |
| `BusinessProfileScreen` | Description, services | Profanite | Wordlist S3 | — | Oui |
| `VideoRecorderScreen` | Video capture | — | — | Oui (thumbnail) | — |

### Tous les points de signalement

| Contenu | Ecran(s) | Endpoint | Statut |
|---------|----------|----------|--------|
| Post | PostDetailFanFeedScreen, PostDetailVibesFeedScreen | `POST /reports/post` | Existant |
| User | UserProfileScreen | `POST /reports/user` | Existant |
| Peak | PeakViewScreen | `POST /reports/peak` | Existant |
| Comment | PostDetailScreen (tous) | `POST /reports/comment` | **A creer (Phase 1C)** |
| Live stream | ViewerLiveStreamScreen | `POST /reports/livestream` | **A creer (Phase 2C)** |
| Message | ChatScreen | `POST /reports/message` | **A creer (Phase 2C)** |

---

## PARTIE 6 — KPIS & METRIQUES

### Objectifs de performance

| Metrique | Objectif | Comment mesurer |
|----------|----------|-----------------|
| Taux de detection | > 95% | Contenu NSFW/toxique detecte vs passe a travers |
| Faux positifs | < 2% | Contenu legitime bloque par erreur |
| Latence filtre client | < 5ms | Performance du wordlist check |
| Latence Comprehend | < 200ms | Temps d'analyse texte |
| Latence Rekognition | < 2s | Temps d'analyse image (async, pas bloquant) |
| Temps moyen resolution report | < 24h | De "pending" a "resolved" |
| Satisfaction users moderes | > 4/5 | Survey in-app apres action de moderation |
| Reports/mois en baisse | -50% apres 3 mois | Mesure l'effet preventif |
| Taux moderation humaine | < 5% du contenu total | Le reste est auto-modere |

### Metriques de securite

- Zero contenu NSFW non detecte dans les 30 jours post-lancement
- Zero spam depassant 100 messages/heure par user
- 100% des suspensions/bans ont une trace dans `moderation_log`
- 100% des users bannis recoivent une notification avec raison

---

## PARTIE 7 — COUTS

### Infrastructure AWS (mensuel, base 10K users actifs)

| Service | Usage | Cout/mois |
|---------|-------|-----------|
| Rekognition (images) | ~50K images | ~$50 |
| Comprehend (toxicite texte) | ~200K analyses | ~$20 |
| Lambda (moderation handlers) | ~500K invocations | ~$5 |
| S3 (wordlist + quarantine) | < 1 GB | ~$1 |
| SNS (alertes admin) | < 1000 notifs | ~$0 |
| **Total infra** | | **~$76/mois** |

### Scaling (pour 100K users actifs)

| Service | Usage | Cout/mois |
|---------|-------|-----------|
| Rekognition | ~500K images | ~$500 |
| Comprehend | ~2M analyses | ~$200 |
| Lambda | ~5M invocations | ~$50 |
| **Total** | | **~$750/mois** |

---

## PARTIE 8 — CONFORMITE RGPD / CCPA

### Obligations

| Obligation | Implementation |
|------------|---------------|
| **Consentement** | Mention dans Terms of Service: "le contenu est analyse automatiquement pour la securite" |
| **Transparence** | Politique de moderation accessible dans Settings > Community Guidelines |
| **Droit a l'oubli** | Endpoint `DELETE /profiles/{id}` supprime aussi les logs de moderation |
| **Recours humain** | Systeme d'appels (Phase 4C) — toute decision IA peut etre contestee |
| **Minimisation** | Ne stocker que le minimum: raison + timestamp + action. Pas le contenu original sauf si quarantine |

### Retention des donnees

| Type | Duree | Apres expiration |
|------|-------|-----------------|
| Logs de moderation | 90 jours | Anonymise (user_id → hash) |
| Contenu signale | 1 an | Supprime |
| Appeals | 2 ans | Anonymise |
| Contenu quarantine | 90 jours | Supprime automatiquement (lifecycle S3) |
| Trust score | Vie du compte | Supprime avec le compte |

---

## PARTIE 9 — FICHIERS A CREER / MODIFIER

### Nouveaux fichiers

| Fichier | Phase | Description |
|---------|-------|-------------|
| `src/utils/contentFilters.ts` | 1A | Wordlist profanite + spam detection client |
| `src/hooks/useContentModeration.ts` | 1A | Hook React pour integrer les filtres |
| `aws-migration/lambda/shared/moderation/textFilter.ts` | 1D | Filtre texte backend (wordlist S3) |
| `aws-migration/lambda/shared/moderation/checkAccountStatus.ts` | 1B | Middleware suspension/ban |
| `aws-migration/lambda/api/reports/report-comment.ts` | 1C | Report de commentaires |
| `aws-migration/lambda/api/reports/report-livestream.ts` | 2C | Report de live streams |
| `aws-migration/lambda/api/reports/report-message.ts` | 2C | Report de messages |
| `aws-migration/lambda/api/moderation/analyze-image.ts` | 2A | Trigger Rekognition |
| `aws-migration/lambda/api/admin/get-reports.ts` | 4A | Liste reports pour admin |
| `aws-migration/lambda/api/admin/update-report.ts` | 4A | Traiter un report |
| `aws-migration/lambda/api/admin/apply-action.ts` | 4A | Appliquer sanction |
| `aws-migration/lambda/api/admin/get-stats.ts` | 4A | Stats moderation |
| `aws-migration/lambda/api/appeals/create-appeal.ts` | 4C | Soumettre un appel |
| `aws-migration/lambda/api/appeals/review-appeal.ts` | 4C | Traiter un appel |
| `aws-migration/lambda/api/moderation/send-notification.ts` | 3C | Notif moderation |

### Fichiers a modifier

| Fichier | Phase | Modification |
|---------|-------|-------------|
| `src/screens/home/CreatePostScreen.tsx` | 1A | Ajouter `filterContent()` avant submit |
| `src/screens/home/AddPostDetailsScreen.tsx` | 1A | Ajouter `filterContent()` |
| `src/screens/messages/ChatScreen.tsx` | 1A | Ajouter `filterContent()` + bouton report message |
| `src/screens/live/LiveStreamingScreen.tsx` | 1A, 3A | Filtre + cooldown chat |
| `src/screens/live/ViewerLiveStreamScreen.tsx` | 1A, 3A | Filtre + cooldown + bouton report |
| `src/screens/peaks/CreatePeakScreen.tsx` | 1A | Ajouter `filterContent()` |
| `aws-migration/lambda/api/posts/create-post.ts` | 1D, 2B | Filtre backend + Comprehend |
| `aws-migration/lambda/api/comments/create-comment.ts` | 1D, 2B | Filtre backend + Comprehend |
| `aws-migration/lambda/api/peaks/create-peak.ts` | 1D, 2B | Filtre backend + Comprehend |
| `aws-migration/infrastructure/lib/security-phase2-stack.ts` | 2A | Ajouter Rekognition trigger |
| `aws-migration/infrastructure/lib/lambda-stack.ts` | 1B, 4A | Nouveaux Lambdas + IAM policies |

### Migrations SQL

| Fichier | Phase | Contenu |
|---------|-------|---------|
| `migration-XXX-moderation-status.sql` | 1B | `ALTER profiles ADD moderation_status, suspended_until, ban_reason` |
| `migration-XXX-livestream-reports.sql` | 2C | `CREATE TABLE live_stream_reports` |
| `migration-XXX-message-reports.sql` | 2C | `CREATE TABLE message_reports` |
| `migration-XXX-appeals.sql` | 4C | `CREATE TABLE appeals` |
| `migration-XXX-trust-score.sql` | 5A | `ALTER profiles ADD trust_score` |

---

## PARTIE 10 — CHECKLIST PRE-DEPLOIEMENT

### Par phase

**Phase 1: (COMPLETE)**
- [x] `contentFilters.ts` cree et integre dans 7 ecrans
- [x] Tous les ecrans de creation integrent le filtre client
- [x] Migration `moderation_status` deployee (migration-045)
- [x] Middleware `requireActiveAccount` integre dans 19 handlers de mutation
- [x] `report-comment.ts` Lambda deploye
- [x] Filtre backend `textFilter.ts` deploye avec wordlist S3
- [x] `npx tsc --noEmit` passe (0 erreurs)

**Phase 2: (COMPLETE)**
- [x] IAM policy Rekognition ajoutee
- [x] Lambda `analyze-image.ts` deploye
- [x] IAM policy Comprehend ajoutee
- [x] Comprehend integre dans 19 handlers (posts, comments, peaks, DMs, live chat, bios, groups, events, spots, battles, challenges, disputes, tips, reviews)
- [x] Tables `live_stream_reports` et `message_reports` creees (migration-046)
- [x] Lambdas report-livestream et report-message deployes
- [x] Auto-escalation complete (6 types de reports, peak_reports inclus, notifications push)

**Phase 3: (QUASI-COMPLETE)**
- [x] Chat live modere (filterText + analyzeTextToxicity dans `websocket/live-stream.ts`)
- [x] DMs moderes (REST `conversations/send-message.ts` + WebSocket `websocket/send-message.ts`)
- [x] Shadow ban fonctionne (contenu invisible aux autres dans 7 handlers)
- [x] Notifications push de moderation (post masque, suspension)
- [x] Content status persistence (content_status, toxicity_score, toxicity_category)
- [ ] Cooldown live chat : 1 message/3s, auto-mute apres 3 messages bloques en 5min

**Phase 4: (A FAIRE)**
- [ ] API admin protegee par groupe Cognito `Moderators`
- [ ] Dashboard web deploye sur CloudFront
- [ ] Queue de reports fonctionnelle
- [ ] Actions moderateur (approve/reject/warn/suspend/ban) testees
- [ ] Systeme d'appels fonctionnel
- [ ] Bulk actions testees

**Phase 5: (A FAIRE)**
- [ ] Trust score calcule et mis a jour automatiquement
- [ ] Analytics dashboard avec metriques en temps reel
- [ ] Seuils Rekognition/Comprehend ajustes selon faux positifs

### Verification globale

- [ ] Zero TODO dans le code de moderation
- [ ] Toutes les requetes SQL parametrees ($1, $2...)
- [ ] Aucune donnee PII dans les logs
- [ ] Rate limiting sur tous les nouveaux endpoints
- [ ] Tests de charge sur les endpoints de moderation
- [ ] Politique de confidentialite mise a jour
- [ ] Guide moderateur redige
- [ ] Playbook d'incidents (que faire si faux positif massif, si Rekognition down, etc.)

---

### Bilan implementation (2026-02-09)

**Phases completees:**
- Phase 1: Protection immediate — COMPLETE (filterText, contentFilters.ts, suspension/ban, reports comments)
- Phase 2: Detection IA — COMPLETE (Rekognition, Comprehend, reports livestream/message, auto-escalation)
- Phase 3: Moderation temps reel — COMPLETE (sauf cooldown live chat)

**Phases restantes:**
- Phase 4: Dashboard moderateur + appels
- Phase 5: Trust score & analytics

**Statistiques finales:**
- 19 handlers proteges par requireActiveAccount
- 19 handlers avec filterText + analyzeTextToxicity
- 7 handlers avec shadow ban / feed filtering
- 3 handlers (posts, comments, peaks) avec content_status persistence
- 6 types de reports (post, comment, peak, user, livestream, message)
- Auto-escalation sur les 6 types de reports

**Prochaine revue:** Post-implementation Phase 4
