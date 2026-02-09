# Systeme de Moderation Smuppy — Documentation Technique

> **Version:** 1.0
> **Date:** 2026-02-08
> **Stack:** React Native (Expo 54) + AWS Lambda + PostgreSQL + Cognito + S3 + Rekognition
> **Statut:** Production-ready

---

## Table des matieres

1. [Vue d'ensemble](#1-vue-densemble)
2. [Pipeline de moderation](#2-pipeline-de-moderation)
3. [Filtre client-side](#3-filtre-client-side)
4. [Filtre backend (serveur)](#4-filtre-backend-serveur)
5. [Moderation images — AWS Rekognition](#5-moderation-images--aws-rekognition)
6. [Scan antivirus & validation fichiers](#6-scan-antivirus--validation-fichiers)
7. [Systeme de signalement (Reports)](#7-systeme-de-signalement-reports)
8. [Auto-escalation](#8-auto-escalation)
9. [Suspension & bannissement de comptes](#9-suspension--bannissement-de-comptes)
10. [Blocage & sourdine (Block/Mute)](#10-blocage--sourdine-blockmute)
11. [Rate limiting](#11-rate-limiting)
12. [Sanitization & securite SQL](#12-sanitization--securite-sql)
13. [VibeGuardian — Anti-doom-scroll](#13-vibeguardian--anti-doom-scroll)
14. [Journalisation (Moderation Log)](#14-journalisation-moderation-log)
15. [Infrastructure AWS](#15-infrastructure-aws)
16. [Schemas de base de donnees](#16-schemas-de-base-de-donnees)
17. [Roadmap (prochaines phases)](#17-roadmap-prochaines-phases)

---

## 1. Vue d'ensemble

Smuppy utilise un systeme de moderation **multi-couche** combinant :

- **Filtres client-side** — detection instantanee (<5ms) avant envoi au serveur
- **Filtres backend** — wordlist S3 dynamique, source de verite serveur
- **IA automatique** — Rekognition (images NSFW), Comprehend (texte toxique)
- **Validation fichiers** — magic bytes + quarantaine par defaut
- **Signalement communautaire** — 7 types de reports avec anti-doublon transactionnel
- **Auto-escalation** — regles automatiques basees sur les seuils de signalements
- **Suspension/ban** — middleware sur toutes les requetes avec auto-reactivation
- **Rate limiting** — WAF + DynamoDB per-endpoint + client-side AsyncStorage
- **VibeGuardian** — protection anti-doom-scroll avec detection degradation de mood

Chaque contenu cree passe par **minimum 3 couches** de verification avant d'etre visible.

---

## 2. Pipeline de moderation

```
CREATION DE CONTENU (post, comment, peak, message, live chat, bio, avatar)
        │
        ▼
┌─────────────────────────┐
│  1. FILTRE CLIENT       │  contentFilters.ts (<5ms)
│     Profanite FR/EN/AR  │  Leetspeak, harassment, spam, phishing, data perso
│     7 categories         │  Severity: none / low / medium / high / critical
└──────────┬──────────────┘
           │ Si clean →
           ▼
┌─────────────────────────┐
│  2. API GATEWAY + WAF   │  DDoS protection, auth rate limit, write rate limit
│     Rate limiting       │  AWS Managed Rules (SQLi, XSS, known bad inputs)
│     Cognito JWT auth    │  Per-endpoint DynamoDB rate limit
└──────────┬──────────────┘
           │ Si autorise →
           ▼
┌─────────────────────────┐
│  3. MIDDLEWARE LAMBDA    │  requireActiveAccount() — check moderation_status
│     Statut du compte    │  active → OK | suspended → 403 | banned → 403
│     Filtre texte backend│  filterText() — wordlist S3 (cache 5min, fallback)
└──────────┬──────────────┘
           │ Si clean →
           ▼
┌─────────────────────────┐
│  4. INSERTION DB         │  Transaction atomique + validation
│     Contenu publie      │  Requetes parametrees ($1, $2) uniquement
└──────────┬──────────────┘
           │ Async (post-creation) →
           ▼
┌─────────────────────────┐
│  5. IA ASYNCHRONE       │  EventBridge → Lambda
│     Images: Rekognition │  DetectModerationLabels (seuils 70/90%)
│     Fichiers: Virus scan│  Magic bytes + quarantaine non-media
└──────────┬──────────────┘
           │
    ┌──────┼───────┐
    ▼      ▼       ▼
 [PASS]  [FLAG]  [BLOCK]
   │    under_    quarantaine
   │    review     + SNS alert
   │       │
   ▼       ▼
┌─────────────────────────┐
│  6. SIGNALEMENT         │  Reports communautaires → auto-escalation
│     3 reports/1h        │  → hide post
│     5 reporters/24h     │  → suspend user 24h
│     10 confirmed/30j    │  → flag pour ban review
└─────────────────────────┘
```

---

## 3. Filtre client-side

### Fichier
`src/utils/contentFilters.ts`

### Fonction principale
```typescript
filterContent(text: string, options?: FilterOptions): FilterResult

interface FilterResult {
  clean: boolean;
  violations: ViolationCategory[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  reason: string;
}

interface FilterOptions {
  context: 'post' | 'comment' | 'chat' | 'live_chat' | 'bio' | 'group' | 'event' | 'spot';
  skipPersonalDataCheck?: boolean;  // true pour les DMs
}
```

### Categories de detection

| Categorie | Severity | Description |
|-----------|----------|-------------|
| `hate_speech` | critical | Slurs, termes racistes (FR/EN/AR) — bloque dans tout contexte |
| `harassment` | critical | Menaces, incitation a la violence, suicide baiting |
| `profanity` | high | Gros mots, insultes — leetspeak normalise (@ → a, 0 → o, etc.) |
| `phishing` | high | Patterns URL suspects, offres frauduleuses |
| `spam` | medium | Caps excessif (>70% sur 20+ chars), repetition de caracteres |
| `caps_abuse` | medium | Texte tout en majuscules |
| `personal_data` | low | Numeros de telephone, adresses email dans contenu public |

### Langues supportees
- **Francais** — wordlist + variantes leetspeak
- **Anglais** — wordlist + variantes leetspeak
- **Arabe** (translittere) — termes courants

### Detection anti-spam
```typescript
isSpamMessage(text: string, recentMessages: string[]): boolean
```
- Detecte les duplicatas exacts
- Detecte la similarite >80% avec les messages recents
- Utilise dans le live chat pour prevenir le flood

### Ecrans integres

| Ecran | Contexte | Severite bloquee |
|-------|----------|------------------|
| `AddPostDetailsScreen` | `post` | critical, high |
| `ChatScreen` | `chat` | critical, high |
| `LiveStreamingScreen` | `live_chat` | toutes severites |
| `ViewerLiveStreamScreen` | `live_chat` | toutes severites |
| `SuggestSpotScreen` | `spot` | critical, high |
| `CreateEventScreen` | `event` / `group` | critical, high |
| `PeakPreviewScreen` | `post` | critical, high |

---

## 4. Filtre backend (serveur)

### Fichier
`aws-migration/lambda/shared/moderation/textFilter.ts`

### Fonction
```typescript
filterText(text: string): Promise<TextFilterResult>

interface TextFilterResult {
  clean: boolean;
  violations: ViolationCategory[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}
```

### Architecture
- **Source primaire** : wordlist JSON sur S3 (`s3://smuppy-config-{env}/moderation/wordlist.json`)
- **Cache** : 5 minutes en memoire Lambda
- **Fallback** : wordlist critique embarquee dans le code (si S3 indisponible)
- **Detections** : profanite, hate_speech, harassment, spam, phishing
- **Normalisation** : leetspeak (@ → a, 0 → o, 3 → e, 1 → i, 5 → s, $ → s)

### Handlers integres

| Handler | Fichier | Comportement si violation |
|---------|---------|---------------------------|
| Create Post | `posts/create.ts` | 400 `Content policy violation` |
| Create Comment | `comments/create.ts` | 400 `Content policy violation` |
| Create Peak | `peaks/create.ts` | 400 `Content policy violation` |

Seules les violations `critical` et `high` bloquent la creation. Les violations `medium` et `low` sont publiees normalement (le filtre client les a deja traitees).

---

## 5. Moderation images — AWS Rekognition

### Fichier
`aws-migration/lambda/api/moderation/analyze-image.ts`

### Trigger
EventBridge → S3 `Object Created` sur les prefixes `uploads/`, `posts/`, `peaks/`, `users/`

### Formats analyses
`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.heic`

### Seuils de decision

| Confidence Rekognition | Action | Notification |
|------------------------|--------|-------------|
| **> 90%** | Quarantaine immediate | SNS alert `BLOCK` |
| **70–90%** | Tag `under_review` | SNS alert `FLAG` |
| **< 70%** | Tag `passed_low_signal` | — |
| **Aucun label** | Tag `passed` | — |

### Categories detectees
- Explicit Nudity / Suggestive
- Violence / Visually Disturbing
- Drugs / Tobacco / Alcohol
- Gambling
- Hate Symbols

### Comportement quarantaine
```
1. Copie vers s3://smuppy-quarantine-{env}/moderation/{original-key}
2. Suppression de l'image source
3. Publication SNS avec details (labels, confidence, timestamp)
```

### Tags S3 appliques
- `moderation-status` : `passed` | `passed_low_signal` | `under_review` | `scan_error`
- `moderation-scanned-at` : timestamp ISO-8601

### Protection anti-doublon
- Verifie si le tag `moderation-status` existe deja avant analyse
- Skip les fichiers >15 MB (limite Rekognition)
- Skip les fichiers dans le prefix `quarantine/`

### Cout estime
~$1 pour 1000 images analysees

### CDK
- **Lambda** : `smuppy-image-moderation-{env}` (512 MB, 30s timeout)
- **IAM** : `rekognition:DetectModerationLabels`, S3 read/delete/tag, SNS publish
- **EventBridge** : `smuppy-image-moderation-trigger-{env}`

---

## 6. Scan antivirus & validation fichiers

### Fichier
`aws-migration/infrastructure/lib/security-phase2-stack.ts` (Lambda inline Python)

### Trigger
EventBridge → S3 `Object Created` (memes prefixes que la moderation image)

### Strategie de validation

#### A. Fichiers media (extensions connues)
Validation des **magic bytes** (headers de fichier) :

| Extension | Magic Bytes attendus |
|-----------|---------------------|
| `.png` | `0x89504E47` |
| `.jpg` / `.jpeg` | `0xFFD8FF` |
| `.gif` | `GIF87a` ou `GIF89a` |
| `.webp` | `RIFF` |
| `.mp4` | `ftyp` ou `0x00000000` |
| `.mp3` | `ID3` ou `0xFFFB` |
| `.wav` | `RIFF` |

**Si le header ne correspond pas a l'extension** :
- Quarantaine dans `s3://smuppy-quarantine-{env}/suspicious/{key}`
- Suppression du fichier source
- Alerte SNS `HEADER_MISMATCH`

**Si le header est valide** :
- Tag `virus-scan: header-verified`

#### B. Fichiers non-media
**Quarantaine par defaut** (defense en profondeur) :
- Copie dans `quarantine/infected/{key}`
- Suppression du fichier source
- Alerte SNS `MALWARE_DETECTED`

### Infrastructure
- **Bucket quarantaine** : `smuppy-quarantine-{env}` (chiffre S3, retention 90 jours)
- **GuardDuty** : Detection de menaces runtime + S3 logs + malware EBS

---

## 7. Systeme de signalement (Reports)

### Endpoints

| Endpoint | Handler | Table DB | Rate Limit |
|----------|---------|----------|------------|
| `POST /reports/post` | `report-post.ts` | `post_reports` | 5/300s |
| `POST /reports/comment` | `report-comment.ts` | `comment_reports` | 5/300s |
| `POST /reports/peak` | `report-peak.ts` | `peak_reports` | 5/300s |
| `POST /reports/user` | `report-user.ts` | `user_reports` | 5/300s |
| `POST /reports/livestream` | `report-livestream.ts` | `live_stream_reports` | 5/300s |
| `POST /reports/message` | `report-message.ts` | `message_reports` | 5/300s |
| `GET /posts/{id}/reported` | `check-post-report.ts` | `post_reports` | — |
| `GET /profiles/{id}/reported` | `check-user-report.ts` | `user_reports` | — |

### Raisons acceptees
`inappropriate`, `spam`, `harassment`, `violence`, `misinformation`, `copyright`, `other`

### Protections

| Protection | Implementation |
|------------|---------------|
| **Anti-doublon** | Transaction PostgreSQL avec `SELECT ... FOR UPDATE` |
| **Auth obligatoire** | Cognito JWT verifie sur chaque requete |
| **Self-report impossible** | Verification reporter_id ≠ target author_id |
| **Participant check (messages)** | JOIN sur `conversations` pour verifier l'acces |
| **Sanitization** | HTML stripping + truncation (100 chars raison, 1000 chars details) |
| **UUID validation** | Regex stricte sur tous les IDs |

### Statuts d'un report
`pending` → `reviewed` → `resolved` / `dismissed`

### Frontend
- `reportPost()`, `reportComment()`, `reportPeak()`, `reportUser()`, `reportLivestream()`, `reportMessage()` dans `src/services/database.ts`
- Gestion `already_reported` (409) affichee a l'utilisateur
- Report modal dans les ecrans de detail (PostDetail, PeakView, etc.)

---

## 8. Auto-escalation

### Fichier
`aws-migration/lambda/shared/moderation/autoEscalation.ts`

### Regles

| Seuil | Periode | Action automatique | Reversible |
|-------|---------|--------------------|------------|
| **3 reports** sur un post | 1 heure | Masquer le post (`visibility = 'private'`) | Oui (moderateur) |
| **5 reporters uniques** sur un user | 24 heures | Suspension 24h (`moderation_status = 'suspended'`) | Auto (expiration) |
| **10 reports confirmes** sur un user | 30 jours | Flag pour ban review (`action = 'flag_for_ban'`) | Moderateur requis |

### Fonctions

```typescript
checkPostEscalation(db: Pool, postId: string): Promise<EscalationResult>
// Compte post_reports WHERE created_at > NOW() - INTERVAL '1 hour'
// Si >= 3 → UPDATE posts SET visibility = 'private'

checkUserEscalation(db: Pool, targetUserId: string): Promise<EscalationResult>
// Compte DISTINCT reporter_id across post_reports + user_reports + comment_reports
// Si >= 5 en 24h → suspend (si pas deja suspendu)
// Si >= 10 resolved en 30j → flag_for_ban
```

### Integration
Appele automatiquement apres chaque insertion de report dans :
- `report-post.ts` — checkPostEscalation + checkUserEscalation
- `report-comment.ts` — checkUserEscalation (auteur du commentaire)
- `report-livestream.ts` — checkUserEscalation (host du stream)
- `report-message.ts` — checkUserEscalation (expediteur du message)

Les checks sont **non-bloquants** (try/catch) : si l'escalation echoue, le report est quand meme cree.

---

## 9. Suspension & bannissement de comptes

### Migration (migration-045)
```sql
ALTER TABLE profiles
  ADD COLUMN moderation_status VARCHAR(20) DEFAULT 'active'
    CHECK (moderation_status IN ('active', 'suspended', 'banned', 'shadow_banned')),
  ADD COLUMN suspended_until TIMESTAMP WITH TIME ZONE,
  ADD COLUMN ban_reason TEXT;

CREATE INDEX idx_profiles_moderation_status
  ON profiles(moderation_status) WHERE moderation_status != 'active';
```

### Middleware
`aws-migration/lambda/api/utils/account-status.ts`

```typescript
requireActiveAccount(cognitoSub, headers): Promise<AccountStatusResult | APIGatewayProxyResult>
```

| Statut | Comportement |
|--------|-------------|
| `active` | Requete autorisee — retourne profil (id, username, fullName, avatarUrl) |
| `suspended` (expire) | Auto-reactivation → `UPDATE moderation_status = 'active'` |
| `suspended` (actif) | 403 Forbidden avec `{ moderationStatus, reason, suspendedUntil }` |
| `banned` | 403 Forbidden permanent avec `{ moderationStatus, reason }` |
| `shadow_banned` | Requete autorisee (l'utilisateur ne sait pas qu'il est shadow ban) |

### Ecrans frontend

**AccountSuspendedScreen** (`src/screens/moderation/AccountSuspendedScreen.tsx`)
- Affiche la raison et le temps restant (countdown)
- Bouton de deconnexion
- L'utilisateur peut naviguer mais pas creer de contenu

**AccountBannedScreen** (`src/screens/moderation/AccountBannedScreen.tsx`)
- Affiche la raison du ban
- Bouton "Contacter le support" (mailto:support@smuppy.com)
- Verrouillage complet de l'app

### Store Zustand
`src/stores/moderationStore.ts`
```typescript
State: { status, reason, suspendedUntil }
Actions: setModeration(), clearModeration()
```

### Detection cote frontend
`src/services/aws-api.ts` intercepte les reponses 403 avec `moderationStatus` et met a jour le `moderationStore` automatiquement.

---

## 10. Blocage & sourdine (Block/Mute)

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /profiles/{id}/block` | Bloquer un utilisateur |
| `POST /profiles/{id}/unblock` | Debloquer un utilisateur |
| `POST /profiles/{id}/mute` | Mettre en sourdine |
| `POST /profiles/{id}/unmute` | Retirer la sourdine |
| `GET /profiles/blocked` | Liste des bloques |
| `GET /profiles/muted` | Liste des sourdines |

### Comportement du blocage
- Suppression des follows mutuels (accepted + pending) en transaction
- Les posts du bloque sont masques du feed
- Le bloque ne peut plus envoyer de messages
- Le bloque ne sait pas qu'il est bloque (pas de notification)

### Store client
`src/stores/userSafetyStore.ts` (Zustand + Immer)
```typescript
Actions: mute(id), unmute(id), block(id), unblock(id)
Checks: isMuted(id), isBlocked(id), isHidden(id)
```
- Mise a jour optimiste avec rollback en cas d'erreur
- Initialise au lancement de l'app
- Integre dans tous les flux de feed et messages

### Rate limits
- Block/Unblock : 10/60s
- Mute/Unmute : 20/60s

---

## 11. Rate limiting

### Couche 1 — WAF (AWS Web Application Firewall)

| Regle | Limite | Scope |
|-------|--------|-------|
| DDoS Protection | 100K req/5min (prod) | Par IP |
| Auth Rate Limit | 2K req/5min (prod) | Par IP, paths `/auth/` |
| Write Operations | 5K req/5min (prod) | Par IP, methodes POST/PUT/DELETE |
| AWS Managed Rules | — | SQLi, XSS, Known Bad Inputs |

### Couche 2 — Backend per-endpoint (DynamoDB)

`aws-migration/lambda/api/utils/rate-limit.ts`

| Configuration | Valeur |
|---------------|--------|
| Table | `smuppy-rate-limit-{env}` (DynamoDB) |
| Cle | `{prefix}#{identifier}#{windowTimestamp}` |
| Compteur | Atomic UpdateItem (`if_not_exists + 1`) |
| TTL | windowEnd + 60s (auto-cleanup) |
| Mode | **Fail-open** par defaut (WAF couvre si DynamoDB down) |

Exemples de limites per-endpoint :
- Reports : 5 par 300s par utilisateur
- Block/Unblock : 10 par 60s
- Mute/Unmute : 20 par 60s

### Couche 3 — Client-side (AsyncStorage)

`src/utils/rateLimiter.ts`

| Action | Max | Fenetre | Blocage |
|--------|-----|---------|---------|
| Login | 5 | 60s | 15min |
| Signup | 3 | 60s | 5min |
| Forgot Password | 3 | 5min | 10min |
| Create Post | 10 | 60s | 5min |
| Send Message | 30 | 60s | 2min |
| Follow | 50 | 60s | 5min |
| Like | 100 | 60s | 2min |
| Comment | 20 | 60s | 5min |
| Report | 5 | 5min | 1h |

---

## 12. Sanitization & securite SQL

### Sanitization appliquee sur tous les inputs

| Technique | Implementation |
|-----------|---------------|
| **Strip HTML** | `.replace(/<[^>]*>/g, '')` |
| **Strip control chars** | `.replace(/[\x00-\x1F\x7F]/g, '')` |
| **Trim + truncation** | `.trim().slice(0, MAX_LENGTH)` |
| **UUID validation** | `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` |

### Securite SQL

- **100% requetes parametrees** — `$1`, `$2`, ... sans exception
- **Jamais d'interpolation** de string dans les requetes SQL
- **Transactions** avec `BEGIN/COMMIT/ROLLBACK` et `client.release()` dans `finally`
- **FOR UPDATE** locks pour les verifications de doublons (reports)
- **Read replicas** via `getReaderPool()` pour les requetes en lecture

### Securite des reponses
- Les messages d'erreur internes ne sont **jamais** retournes au client
- Reponse generique `Internal server error` pour toutes les erreurs 500
- Les stack traces sont logguees cote serveur uniquement
- Pas de PII dans les logs (masquage email/username)

---

## 13. VibeGuardian — Anti-doom-scroll

### Fichier
`src/services/vibeGuardian.ts`

### Concept
Systeme de protection du bien-etre qui detecte la degradation de l'experience utilisateur en temps reel.

### Configuration

| Parametre | Valeur |
|-----------|--------|
| Intervalle de snapshot | 30 secondes |
| Fenetre d'analyse | 10 minutes (20 snapshots) |
| Seuil de passivite | 90 secondes sans interaction |
| Seuil d'alerte | Score de degradation >= 0.7 |
| Session minimum | 2 minutes |

### Score de degradation
```
degradation = (moodTrend × 0.4) + (passiveScore × 0.35) + (engagementScore × 0.25)
```

| Composante | Poids | Mesure |
|------------|-------|--------|
| moodTrend | 40% | Evolution des emotions positives (premiere vs deuxieme moitie) |
| passiveScore | 35% | Temps depuis la derniere interaction vs seuil 90s |
| engagementScore | 25% | Interactions positives par minute (attendu >= 0.5/min) |

### Niveaux de sante

| Score | Statut | Action |
|-------|--------|--------|
| < 0.2 | `thriving` | Rien |
| 0.2–0.4 | `stable` | Rien |
| 0.4–0.7 | `declining` | Monitoring |
| >= 0.7 | `alert` | Alerte affichee a l'utilisateur |

### Recap de session
Quand l'app passe en arriere-plan, un recap est affiche :
- Duree de la session
- Trajectoire (improved / stable / declined)
- Nombre d'interactions positives
- Mood de debut vs fin

### Feature flag
`VIBE_GUARDIAN` — desactivable par type de compte (Pro Business desactive par defaut)

---

## 14. Journalisation (Moderation Log)

### Table
`moderation_log` (migration-005)

### Schema
```sql
CREATE TABLE moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID NOT NULL REFERENCES profiles(id),
  action_type VARCHAR(50) NOT NULL,
  target_user_id UUID REFERENCES profiles(id),
  target_post_id UUID REFERENCES posts(id),
  target_comment_id UUID REFERENCES comments(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Actions loguees

| Action | Declencheur |
|--------|-------------|
| `suspend` | Auto-escalation (5+ reporters en 24h) |
| `hide_post` | Auto-escalation (3+ reports en 1h) |
| `flag_for_ban` | Auto-escalation (10+ confirmed reports en 30j) |

### Alertes SNS
Les evenements critiques sont publies sur le topic `smuppy-security-alerts-{env}` (chiffre KMS) :
- Image quarantainee (>90% confidence Rekognition)
- Image flaggee (70-90% confidence)
- Fichier suspect (header mismatch)
- Fichier non-media quarantine
- Echecs de backup AWS

---

## 15. Infrastructure AWS

### Services utilises

| Service | Usage |
|---------|-------|
| **API Gateway** | REST API avec WAF, body validation, Cognito authorizer |
| **Lambda** | Handlers pour tous les endpoints (Node.js 22) |
| **Cognito** | Auth (email + Apple + Google), JWT tokens |
| **S3** | Stockage media + quarantaine |
| **Rekognition** | DetectModerationLabels sur images |
| **DynamoDB** | Rate limiting per-endpoint |
| **SNS** | Alertes securite (KMS encrypted) |
| **EventBridge** | Triggers S3 → Lambda (virus scan, image moderation) |
| **GuardDuty** | Detection de menaces runtime, S3 logs, malware EBS |
| **CloudWatch** | Alarms sur erreurs payment webhook, DLQ, backup failures |
| **AWS Backup** | Backup quotidien RDS + DynamoDB, cross-region (production) |

### Stacks CDK

| Stack | Contenu |
|-------|---------|
| `LambdaStack` | Tous les Lambda handlers (reports, profiles, posts, etc.) |
| `ApiGatewayStack` | REST API + routes + WAF |
| `SecurityPhase2Stack` | Virus scan, image moderation, backup, GuardDuty, SNS |

---

## 16. Schemas de base de donnees

### Tables de moderation

```sql
-- Signalements
post_reports      (id, reporter_id, post_id, reason, description, status, reviewed_by, reviewed_at, created_at)
comment_reports   (id, reporter_id, comment_id, reason, description, status, reviewed_by, reviewed_at, created_at)
peak_reports      (id, reporter_id, peak_id, reason, description, status, UNIQUE(reporter_id, peak_id))
user_reports      (id, reporter_id, reported_user_id, reason, description, status, reviewed_by, reviewed_at)
live_stream_reports (id, reporter_id, live_stream_id, reason, description, status, UNIQUE(reporter_id, live_stream_id))
message_reports   (id, reporter_id, message_id, conversation_id, reason, description, status, UNIQUE(reporter_id, message_id))

-- Actions
moderation_log    (id, moderator_id, action_type, target_user_id, target_post_id, target_comment_id, reason, created_at)

-- Statut compte
profiles          (... moderation_status, suspended_until, ban_reason)

-- Blocage / Sourdine
blocked_users     (id, blocker_id, blocked_id, created_at)
muted_users       (id, muter_id, muted_id, created_at)
```

### Migrations

| Migration | Description |
|-----------|-------------|
| migration-005 | Tables initiales: user_reports, post_reports, comment_reports, moderation_log |
| migration-020 | Table muted_users |
| migration-024 | Table blocked_users |
| migration-044 | Table peak_reports, index optimisation |
| migration-045 | Colonnes moderation_status, suspended_until, ban_reason sur profiles |
| migration-046 | Tables live_stream_reports, message_reports |

---

## 17. Roadmap (prochaines phases)

### Phase 3 — Moderation temps reel (a venir)
- [ ] AWS Comprehend DetectToxicContent dans les handlers de creation
- [ ] Moderation du chat live via WebSocket (Comprehend async <200ms)
- [ ] Cooldown live chat : 1 message/3s, auto-mute apres 3 messages bloques en 5min
- [ ] Shadow ban effectif : exclusion des feeds/search pour les autres users
- [ ] Notifications de moderation push + in-app (contenu supprime, avertissement, suspension)

### Phase 4 — Dashboard moderateur + appels
- [ ] API admin `/admin/reports` (liste, detail, action) avec auth Cognito group `Moderators`
- [ ] Dashboard web React (Vite + CloudFront) pour traitement des reports
- [ ] Systeme d'appels : table `appeals`, soumission par user, review par moderateur
- [ ] Bulk actions et stats en temps reel

### Phase 5 — Trust score & analytics
- [ ] Score de reputation par utilisateur (historique reports, actions, anciennete)
- [ ] Priorisation automatique de la queue moderateur
- [ ] Detection de patterns de spam (contenu similaire, creation en rafale)
- [ ] Analyse audio des messages vocaux (Transcribe → Comprehend)
- [ ] Metriques de moderation (temps de resolution, taux de confirmation, top offenders)

---

> **Derniere mise a jour** : 2026-02-08
> **Maintenu par** : Equipe Smuppy
