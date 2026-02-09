# PLAN ULTRA-DETAILLE — SMUPPY PRODUCTION LAUNCH

> **Date**: 9 fevrier 2026
> **Auteur**: Noussaier Salaani
> **Etat actuel**: 80% complet — 6 bugs critiques corriges ce jour
> **Objectif**: App Store Launch en 2-3 semaines

---

## BUGS CRITIQUES CORRIGES (9 fevrier 2026)

| # | Bug | Fichier | Correction |
|---|-----|---------|------------|
| 1 | Navigation `PostDetail` inexistante | NotificationsScreen.tsx:471 | → `PostDetailFanFeed` |
| 2 | Navigation `ChallengeDetail` inexistante | NotificationsScreen.tsx:483 | → `Challenges` |
| 3 | Navigation `LiveStream` inexistante | NotificationsScreen.tsx:491 | → `ViewerLiveStream` |
| 4 | FormData detruit par JSON.stringify | aws-api.ts:427 | Detection FormData + skip stringify |
| 5 | `ProfileTab as never` (4 fichiers) | PostDetailProfileScreen, VibesFeed, FanFeed | → `Tabs, { screen: 'Profile' }` |
| 6 | Stripe apiVersion `'2024-06-20'` | admin-resolve.ts:24 | → `'2025-12-15.clover'` |
| 7 | Promises non gerees (6 instances) | ChatScreen, UserProfileScreen | Ajout `.catch()` |
| 8 | Deps Lambda shared layer non pinnees | shared/nodejs/package.json | Retrait `^` sur 4 deps |

---

## PHASE 1 — STABILISATION & TESTS (Semaine 1, Jours 1-3)

### 1.1 Tests E2E Messagerie (4h)

**Objectif**: Couvrir le flux messaging complet avec Maestro

**Fichiers a creer**:
```
.maestro/flows/07-messaging-send.yaml
.maestro/flows/08-messaging-reactions.yaml
.maestro/flows/09-messaging-forward.yaml
```

**Scenarios a couvrir**:
- [ ] Ouvrir la liste des conversations
- [ ] Creer une nouvelle conversation
- [ ] Envoyer un message texte
- [ ] Envoyer une image
- [ ] Swipe to reply
- [ ] Ajouter une reaction emoji
- [ ] Supprimer un message (dans la fenetre 15min)
- [ ] Forward un message
- [ ] Verifier read receipts (double check bleu)

**Commande**: `npm run test:e2e:all`

---

### 1.2 Tests E2E Moderation (3h)

**Fichiers a creer**:
```
.maestro/flows/10-moderation-report.yaml
.maestro/flows/11-moderation-block.yaml
```

**Scenarios a couvrir**:
- [ ] Reporter un post (menu ... → Report)
- [ ] Reporter un commentaire
- [ ] Reporter un utilisateur
- [ ] Bloquer un utilisateur
- [ ] Muter un utilisateur
- [ ] Verifier que l'utilisateur bloque n'apparait plus dans le feed

---

### 1.3 Tests E2E Notifications (2h)

**Fichier a creer**:
```
.maestro/flows/12-notifications.yaml
```

**Scenarios a couvrir**:
- [ ] Voir la liste des notifications
- [ ] Tap sur notification de like → PostDetailFanFeed
- [ ] Tap sur notification de follow → UserProfile
- [ ] Tap sur notification de message → ChatScreen
- [ ] Pull to refresh

---

### 1.4 Tests Unitaires Manquants (3h)

**Fichiers cibles** (logique complexe):
- [ ] `src/services/aws-api.ts` — test FormData detection, retry logic, 401 handling
- [ ] `src/services/analytics.ts` — test queue, flush, offline storage
- [ ] `src/config/featureFlags.ts` — test flag override en dev
- [ ] `src/i18n/config.ts` — test language detection fallback

---

### 1.5 Load Testing Backend (2h)

**Outil**: Artillery ou k6

**Endpoints critiques a tester**:
```
GET  /posts/feed          — 100 req/sec pendant 5min
POST /posts               — 50 req/sec pendant 2min
GET  /conversations       — 50 req/sec pendant 5min
POST /conversations/:id/messages — 100 req/sec pendant 5min
POST /media/upload-url    — 30 req/sec pendant 2min
GET  /profiles/search     — 50 req/sec pendant 3min
```

**Metriques cibles**:
- p95 latency < 200ms
- p99 latency < 500ms
- Error rate < 0.1%
- Cold start Lambda < 100ms (avec Provisioned Concurrency)

---

## PHASE 2 — INFRASTRUCTURE PRODUCTION (Semaine 1, Jours 3-5)

### 2.1 Custom Domain + SSL (2h)

**Actions**:
1. ACM Certificate: `api.smuppy.com` (avec `*.smuppy.com` SAN)
2. API Gateway Custom Domain: `api.smuppy.com`
3. Route53 records:
   - `api.smuppy.com` → API Gateway distribution
   - `cdn.smuppy.com` → CloudFront distribution
   - `app.smuppy.com` → Expo Updates / deep link target
4. Mettre a jour `src/config/aws-config.ts`:
   ```typescript
   // Production
   API_URL_PROD: 'https://api.smuppy.com'
   CDN_URL: 'https://cdn.smuppy.com'
   ```

**Fichiers a modifier**:
- `aws-migration/infrastructure/lib/api-gateway-stack.ts` — custom domain
- `aws-migration/infrastructure/lib/smuppy-stack.ts` — Route53 records
- `src/config/aws-config.ts` — URL prod
- `app.config.js` — deep link domains

---

### 2.2 CloudFront Caching Strategy (2h)

**Fichiers a modifier**:
- `aws-migration/infrastructure/lib/smuppy-stack.ts`

**Politiques de cache**:
```
/media/*          → Cache 1 an (images immutables par UUID)
/avatars/*        → Cache 24h (changement possible)
/covers/*         → Cache 24h
/api/*            → No cache (dynamique)
/static/*         → Cache 1 semaine
```

**Headers**:
- `Cache-Control: public, max-age=31536000, immutable` pour media
- `Cache-Control: public, max-age=86400` pour avatars/covers
- Compression Brotli activee

---

### 2.3 Lambda Provisioned Concurrency (1h)

**Lambdas critiques** (cold start > 200ms):
```
POST /posts/feed           — 5 instances
POST /conversations/:id/messages — 3 instances
POST /media/upload-url     — 3 instances
GET  /profiles/me          — 3 instances
POST /posts                — 2 instances
```

**Fichier a modifier**:
- `aws-migration/infrastructure/lib/lambda-stack.ts`

**Config CDK**:
```typescript
const alias = fn.addAlias('live', {
  provisionedConcurrentExecutions: 5,
});
```

---

### 2.4 Monitoring & Alerting (3h)

**CloudWatch Dashboards** a creer:

**Dashboard 1: API Health**
- Request count par endpoint
- Error rate (4xx, 5xx)
- Latency p50/p95/p99
- Lambda duration
- Lambda concurrent executions

**Dashboard 2: Business Metrics**
- Signups/jour
- Posts crees/jour
- Messages envoyes/jour
- DAU/WAU/MAU
- Notifications envoyees

**Dashboard 3: Infrastructure**
- RDS CPU/Memory/Connections
- ElastiCache hit rate
- S3 storage
- Lambda throttles/errors
- WAF blocked requests

**Alarmes SNS**:
| Alarme | Condition | Severite |
|--------|-----------|----------|
| API 5xx rate > 1% | 5min window | CRITICAL |
| Lambda errors > 10/min | 5min window | CRITICAL |
| RDS CPU > 80% | 15min sustained | HIGH |
| RDS connections > 80% | 5min window | HIGH |
| Lambda throttles > 0 | Any | MEDIUM |
| WAF blocks > 100/min | 5min window | MEDIUM |
| S3 storage > 80% quota | Daily check | LOW |

**Integration**: SNS → Email + Slack webhook

---

### 2.5 Backup Verification (1h)

**Verifications a faire**:
- [ ] RDS automated backups actifs (retention 7 jours)
- [ ] RDS point-in-time recovery teste (restore vers une DB temporaire)
- [ ] S3 versioning actif sur le bucket media
- [ ] DynamoDB (si utilise) — backups actifs
- [ ] Cognito user export teste
- [ ] Secrets Manager rotation configuree

**RTO/RPO cibles**:
- RTO: < 30 minutes
- RPO: < 5 minutes (point-in-time recovery)

---

## PHASE 3 — TRADUCTIONS & i18n (Semaine 2, Jours 1-2)

### 3.1 Etat Actuel des Traductions

| Module | EN | FR | ES | PT-BR | AR |
|--------|----|----|----|----|-----|
| auth.json | 100% | 100% | 36% | 36% | 36% |
| common.json | 100% | 100% | 58% | 58% | 58% |
| disputes.json | 100% | 100% | 15% | 15% | 15% |
| errors.json | 100% | 100% | 60% | 60% | 60% |
| feed.json | 100% | 100% | 100% | 100% | 100% |
| live.json | 100% | 12% | 52% | 52% | 52% |
| messages.json | 100% | 100% | 60% | 60% | 60% |
| notifications.json | 100% | 100% | 63% | 63% | 63% |
| onboarding.json | 100% | 100% | 16% | 16% | 16% |
| payments.json | 100% | 82% | 82% | 82% | 82% |
| peaks.json | 100% | 100% | 40% | 40% | 40% |
| profile.json | 100% | 100% | 38% | 38% | 38% |
| sessions.json | 100% | 100% | 20% | 20% | 20% |
| settings.json | 100% | 100% | 100% | 100% | 100% |
| validation.json | 100% | 100% | 48% | 48% | 48% |
| **TOTAL** | **100%** | **~96%** | **~53%** | **~53%** | **~53%** |

### 3.2 Strategie de Completion (8h)

**Priorite 1 — Francais** (manque live.json): 30min
- Completer `src/i18n/locales/fr/live.json` (29 cles manquantes)

**Priorite 2 — Espagnol** (53% → 100%): 3h
- 15 fichiers JSON a completer
- Utiliser Crowdin ou traduction manuelle

**Priorite 3 — Portugais-Bresil** (53% → 100%): 3h
- Meme scope que Espagnol

**Priorite 4 — Arabe** (53% → 100%): 3h
- Meme scope que Espagnol
- IMPORTANT: Tester RTL layout apres completion

### 3.3 RTL Support Verification (2h)

**Apres** completion de l'arabe:
- [ ] Verifier alignement texte (right-to-left)
- [ ] Verifier icones directionnelles (fleches, chevrons)
- [ ] Verifier layout des cartes (avatar a droite)
- [ ] Verifier swipe gestures (inversees en RTL)
- [ ] Verifier navigation (back button a droite)
- [ ] Tester sur simulateur iOS + Android

**Fichier cle**: `src/i18n/config.ts` — verifier `I18nManager.forceRTL(true)` pour arabe

### 3.4 Crowdin Integration (1h)

**Scripts existants** dans package.json:
```bash
npm run crowdin:upload    # Upload EN source vers Crowdin
npm run crowdin:download  # Download traductions
npm run crowdin:sync      # Upload + Download
npm run i18n:extract      # Extraire les cles du code
npm run i18n:check        # Verifier les cles manquantes
```

**Actions**:
1. Configurer le projet Crowdin (si pas deja fait)
2. `npm run i18n:extract` — extraire toutes les cles
3. `npm run crowdin:upload` — pousser les sources EN
4. Assigner des traducteurs pour ES, PT-BR, AR
5. `npm run crowdin:download` — recuperer les traductions

---

## PHASE 4 — ACCESSIBILITE (Semaine 2, Jours 2-3)

### 4.1 Etat Actuel

**Ecrans avec accessibilite** (7/121 = 6%):
- ProfileScreen, LiveStreamingScreen, FanFeed
- PostDetailFanFeedScreen, LoginScreen, SignupScreen, WelcomeScreen

**Labels accessibilite**: 165 instances

### 4.2 Ecrans Prioritaires (WCAG 2.1 AA)

**Priorite CRITIQUE** (parcours utilisateur principal):

| Ecran | Actions requises |
|-------|-----------------|
| FeedScreen | accessibilityLabel sur posts, boutons like/comment/share |
| MessagesScreen | accessibilityLabel sur conversations, badges non-lus |
| ChatScreen | accessibilityLabel sur messages, input, bouton envoi |
| NotificationsScreen | accessibilityLabel sur chaque notification |
| SearchScreen | accessibilityLabel sur barre de recherche, resultats |
| CreatePostScreen | accessibilityLabel sur input, media picker, bouton publish |
| SettingsScreen | accessibilityLabel sur chaque option menu |

**Priorite HAUTE** (ecrans frequents):

| Ecran | Actions requises |
|-------|-----------------|
| UserProfileScreen | accessibilityLabel sur stats, boutons follow/message |
| PeaksFeedScreen | accessibilityLabel sur stories, swipe hints |
| ActivityDetailScreen | accessibilityLabel sur details, bouton join |
| EditProfileScreen | accessibilityLabel sur champs form |

### 4.3 Checklist par Ecran (2h par lot de 10 ecrans)

Pour chaque ecran:
- [ ] `accessibilityLabel` sur tous les TouchableOpacity/Pressable
- [ ] `accessibilityRole` ("button", "link", "header", "image", "text")
- [ ] `accessibilityHint` sur les actions non evidentes
- [ ] `accessibilityState` pour disabled, selected, checked
- [ ] Images decoratives: `accessibilityElementsHidden={true}`
- [ ] Headers: `accessibilityRole="header"` + ordre hierarchique
- [ ] Textes dynamiques: `accessibilityLiveRegion="polite"`

### 4.4 Dynamic Type & Reduce Motion (1h)

**Dynamic Type**:
- Verifier que tous les textes utilisent des tailles relatives
- Tester avec "Larger Accessibility Sizes" dans iOS Settings

**Reduce Motion**:
```typescript
import { AccessibilityInfo } from 'react-native';
// Verifier si les animations respectent:
const [reduceMotion, setReduceMotion] = useState(false);
useEffect(() => {
  AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
}, []);
```

---

## PHASE 5 — ANALYTICS BACKEND (Semaine 2, Jour 3)

### 5.1 Etat Actuel

- Framework analytics local implemente (`src/services/analytics.ts`)
- 46 event types definis
- Queue locale avec AsyncStorage
- `flush()` methode prepare mais pas connectee a un backend

### 5.2 Options d'Integration

| Option | Cout | Effort | Fonctionnalites |
|--------|------|--------|----------------|
| **Mixpanel** | Gratuit < 20M events/mois | 2h | Funnels, retention, A/B |
| **PostHog** (self-hosted) | Gratuit | 4h | Open source, feature flags |
| **AWS Pinpoint** | ~$0.001/event | 3h | Natif AWS, segments |
| **Custom Lambda** | ~$5/mois | 4h | Controle total |

**Recommandation**: Mixpanel (gratuit, rapide a integrer, dashboard puissant)

### 5.3 Integration Mixpanel (2h)

```bash
npx expo install mixpanel-react-native
```

**Modifier** `src/services/analytics.ts`:
```typescript
import { Mixpanel } from 'mixpanel-react-native';

const mixpanel = new Mixpanel('YOUR_PROJECT_TOKEN');

// Dans flush():
async flush(): Promise<void> {
  const events = await this.getQueuedEvents();
  for (const event of events) {
    mixpanel.track(event.name, event.properties);
  }
  await this.clearQueue();
}
```

---

## PHASE 6 — APP STORE PREPARATION (Semaine 2, Jours 4-5)

### 6.1 iOS Build & TestFlight

**Pre-requis verifies**:
- [x] Bundle ID: `com.nou09.Smuppy`
- [x] ASC App ID: `6757627406`
- [x] EAS production profile configure
- [x] Auto-increment build number
- [x] Push certificates (APNs via Expo)

**Commandes**:
```bash
# 1. Build production iOS
eas build --platform ios --profile production

# 2. Soumettre a TestFlight
eas submit --platform ios

# 3. Tester sur TestFlight (minimum 3 jours de beta)
```

### 6.2 Android Build & Play Store

**Pre-requis a verifier**:
- [ ] Google Play Developer Account actif
- [ ] Signing key configuree dans EAS
- [ ] FCM (Firebase Cloud Messaging) configure

**Commandes**:
```bash
# 1. Build production Android
eas build --platform android --profile production

# 2. Soumettre au Play Store
eas submit --platform android
```

### 6.3 App Store Assets

**Screenshots requis (iPhone)**:
- [ ] 6.7" (iPhone 15 Pro Max): 1290 x 2796 px — 5 screenshots minimum
- [ ] 6.5" (iPhone 14 Plus): 1284 x 2778 px — 5 screenshots minimum
- [ ] 5.5" (iPhone 8 Plus): 1242 x 2208 px — optionnel

**Screenshots requis (iPad)**:
- [ ] 12.9" (iPad Pro): 2048 x 2732 px — 5 screenshots minimum

**Screenshots suggeres** (contenu):
1. Feed principal (FanFeed avec posts)
2. Messagerie (ChatScreen avec reactions)
3. Peaks/Stories (PeaksFeedScreen)
4. Map Xplorer (XplorerFeed avec carte)
5. Profil utilisateur (ProfileScreen avec stats)

**App Preview Video** (optionnel mais recommande):
- 15-30 secondes
- Montrer: scroll feed → like → create post → messaging → map

### 6.4 App Store Listing

**Champs a remplir**:

| Champ | Contenu |
|-------|---------|
| **Nom** | Smuppy |
| **Sous-titre** | Social Discovery & Vibes |
| **Categorie** | Social Networking |
| **Description** | [150-4000 chars, focus sur features V1] |
| **Mots-cles** | social,discovery,vibes,events,messaging,community |
| **URL Support** | https://smuppy.com/support |
| **URL Privacy Policy** | https://smuppy.com/privacy |
| **Copyright** | 2026 Noussaier Salaani |
| **Age Rating** | 12+ (social interactions, user-generated content) |

### 6.5 Compliance Review

**Apple Guidelines a verifier**:
- [ ] 1.2 User Generated Content — moderation system (Phase 3 done)
- [ ] 2.1 App Completeness — toutes les features V1 fonctionnelles
- [ ] 3.1.1 In-App Purchase — monetisation OFF en V1 (OK)
- [ ] 4.0 Design — HIG compliance
- [ ] 5.1.1 Data Collection — privacy labels configurees
- [ ] 5.1.2 Data Use and Sharing — GDPR/privacy policy

**Privacy Nutrition Labels (App Store)**:
| Donnee | Collecte | Usage |
|--------|----------|-------|
| Email | Oui | Compte, communication |
| Nom | Oui | Profil public |
| Photos | Oui | Posts, profil |
| Location | Oui | Events, Xplorer map |
| Contacts | Optionnel | Find Friends |
| Usage Data | Oui | Analytics (si active) |
| Identifiers | Oui | Device ID, user ID |

---

## PHASE 7 — PRODUCTION DEPLOYMENT (Semaine 3, Jours 1-2)

### 7.1 Checklist Pre-Deploy

**Infrastructure**:
- [ ] Custom domain `api.smuppy.com` actif et SSL valide
- [ ] CloudFront caching configure
- [ ] Lambda Provisioned Concurrency actif
- [ ] CloudWatch dashboards et alarmes actifs
- [ ] Backup RDS teste + PITR valide
- [ ] Secrets Manager rotation active

**Backend**:
- [ ] Toutes les migrations deployees
- [ ] Lambda test avec `aws lambda invoke` sur TOUS les endpoints
- [ ] Rate limiting actif sur tous les endpoints
- [ ] WAF regles actives (8 regles)
- [ ] CORS configure pour domaine production

**Frontend**:
- [ ] `npx tsc --noEmit` — 0 erreurs
- [ ] `npm run lint` — 0 erreurs
- [ ] `npm run test` — 137 tests passent
- [ ] `npm run test:e2e:all` — tous les flows passent
- [ ] Feature flags V1 corrects (15 ON, 14 OFF)
- [ ] Sentry DSN production configure
- [ ] API URLs production dans `aws-config.ts`

**App Store**:
- [ ] TestFlight build teste pendant 3+ jours
- [ ] Screenshots et assets uploades
- [ ] App listing complete
- [ ] Privacy policy URL accessible

### 7.2 Deployment Steps

```bash
# 1. Tag la release
git tag -a v1.0.0 -m "Smuppy V1.0.0 - Production Launch"
git push origin v1.0.0

# 2. Deploy backend production
cd aws-migration && npx cdk deploy --all --context env=production

# 3. Verifier les endpoints
aws lambda invoke --function-name SmuppyApi-GetFeed out.json && cat out.json
aws lambda invoke --function-name SmuppyApi-SendMessage out.json && cat out.json

# 4. Build + Submit iOS
eas build --platform ios --profile production
eas submit --platform ios

# 5. Build + Submit Android
eas build --platform android --profile production
eas submit --platform android

# 6. Monitorer
# → CloudWatch dashboards
# → Sentry dashboard
# → App Store Connect (review status)
```

### 7.3 Post-Deploy Monitoring (72h)

**Heure 0-1**: Surveillance intensive
- CloudWatch: errors, latency, throttles
- Sentry: crash-free rate > 99.5%
- App Store: review status

**Heure 1-24**: Surveillance active
- Verifier DAU, signups, engagement
- Verifier push notifications delivrees
- Verifier media uploads (S3 presigned URLs)

**Jour 2-3**: Surveillance standard
- Metriques de retention J1
- Bug reports utilisateurs
- Performance p95 stable

---

## PHASE 8 — POST-LAUNCH (Semaine 3+)

### 8.1 Feature Flags V2 (Sprint suivant)

| Feature | Sprint | Effort | Pre-requis |
|---------|--------|--------|------------|
| BUSINESS_DASHBOARD | V2.0 | 1 semaine | - |
| BUSINESS_SCANNER | V2.0 | 3 jours | Camera QR |

### 8.2 Feature Flags V3 (2 mois post-launch)

| Feature | Sprint | Effort | Pre-requis |
|---------|--------|--------|------------|
| PRIVATE_SESSIONS | V3.0 | 2 semaines | Apple IAP approval |
| CHANNEL_SUBSCRIBE | V3.0 | 1 semaine | Apple IAP approval |
| TIPPING | V3.0 | 1 semaine | Apple IAP approval |
| CREATOR_WALLET | V3.0 | 1 semaine | Stripe Connect |
| GIFTING | V3.0 | 3 jours | Stripe Connect |
| UPGRADE_TO_PRO | V3.0 | 3 jours | IAP |
| IDENTITY_VERIFICATION | V3.0 | 1 semaine | Stripe Identity |
| PLATFORM_SUBSCRIPTION | V3.0 | 3 jours | IAP |
| BUSINESS_BOOKING | V3.0 | 1 semaine | Stripe Connect |
| DISPUTES | V3.0 | 3 jours | Backend done |

### 8.3 Feature Flags V4 (3 mois post-launch)

| Feature | Sprint | Effort | Pre-requis |
|---------|--------|--------|------------|
| GO_LIVE | V4.0 | 2 semaines | Agora license prod, moderation temps reel |
| VIEWER_LIVE_STREAM | V4.0 | inclus | GO_LIVE |
| BATTLES | V4.0 | 1 semaine | GO_LIVE + scoring |

### 8.4 Messaging V3 Roadmap

| Feature | Effort | Dependances |
|---------|--------|-------------|
| Typing Indicator | 2 jours | WebSocket events |
| Message Search | 3 jours | Full-text search Lambda |
| Message Copy | 1 jour | Clipboard API |
| Swipe to Delete | 1 jour | Gesture handler |
| Group Chats | 1 semaine | New DB tables, UI |
| Ephemeral Messages | 3 jours | Timer + cleanup Lambda |

### 8.5 Performance Optimizations Roadmap

| Optimisation | Effort | Impact |
|-------------|--------|--------|
| WebP conversion server-side | 2 jours | -40% bandwidth |
| Blur hash placeholders | 1 jour | Meilleur UX loading |
| Progressive image loading | 1 jour | Perceived speed |
| Bundle analysis + tree shaking | 2 jours | -15% bundle size |
| Hermes bytecode caching | 1 jour | -20% TTI |
| FlashList tuning (estimatedItemSize) | 1 jour | Smoother scroll |

---

## TIMELINE VISUELLE

```
Semaine 1:
├── Jour 1-2: Tests E2E (messaging, moderation, notifications)
├── Jour 2-3: Tests unitaires + load testing
├── Jour 3-4: Infrastructure (domain, SSL, CloudFront, monitoring)
└── Jour 5:   Backup verification + Lambda provisioned concurrency

Semaine 2:
├── Jour 1-2: Traductions (FR 100%, ES/PT-BR/AR → 100%)
├── Jour 2-3: Accessibilite (ecrans critiques)
├── Jour 3:   Analytics backend (Mixpanel integration)
├── Jour 4:   iOS build + TestFlight submission
└── Jour 5:   Android build + Play Store + App Store listing

Semaine 3:
├── Jour 1:   Production deployment (backend + frontend)
├── Jour 2-3: Post-deploy monitoring (72h)
└── Jour 4-5: Hotfixes si necessaire + App Store review
```

---

## ESTIMATION GLOBALE

| Phase | Effort | Priorite |
|-------|--------|----------|
| 1. Stabilisation & Tests | 14h | CRITIQUE |
| 2. Infrastructure Production | 9h | CRITIQUE |
| 3. Traductions & i18n | 11h | HAUTE |
| 4. Accessibilite | 5h | HAUTE |
| 5. Analytics Backend | 2h | MOYENNE |
| 6. App Store Preparation | 8h | CRITIQUE |
| 7. Production Deployment | 4h | CRITIQUE |
| **TOTAL** | **53h** | |

---

*Plan genere le 9 fevrier 2026 — Mise a jour apres chaque phase completee*
