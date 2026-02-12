# SMUPPY - DOCUMENTATION MASTER

> **Parent**: [CLAUDE.md](../CLAUDE.md) | **Workflow**: [CLAUDE-WORKFLOW.md](../CLAUDE-WORKFLOW.md) | **Features**: [FEATURES.md](./FEATURES.md)
>
> Version: 4.0.0 | Mise a jour: 26 Janvier 2026

---

## TABLE DES MATIERES

1. [Resume Executif](#1-resume-executif)
2. [Architecture](#2-architecture)
3. [Endpoints API](#3-endpoints-api)
4. [Securite](#4-securite)
5. [Tests & CI/CD](#5-tests--cicd)
6. [Capacite & Performance](#6-capacite--performance)
7. [Guide de Developpement](#7-guide-de-developpement)
8. [Documentation Index](#8-documentation-index)

---

## 1. RESUME EXECUTIF

### Scores Globaux

| Aspect | Score | Etat |
|--------|-------|------|
| Frontend (UI/UX) | 8/10 | Complet (50+ ecrans) |
| Backend (API) | 9/10 | 57 endpoints deployes |
| Infrastructure | 9/10 | Production-ready |
| Securite | 9.5/10 | WAF, CSRF, TLS, logging structure |
| Tests | 8/10 | 137 unit tests (80%+ coverage) + E2E |
| **GLOBAL** | **8.6/10** | **Production Ready** |

### Verdict

L'application est prete pour la production. Infrastructure AWS complete avec 57+ endpoints Lambda, securite renforcee (CSRF, structured logging, Dependabot), et 137 tests avec 80%+ de couverture.

---

## 2. ARCHITECTURE

### Stack Technique

| Categorie | Technologie |
|-----------|-------------|
| Framework | React Native + Expo SDK 54 |
| Backend | AWS (CDK) |
| Auth | AWS Cognito |
| API | API Gateway + Lambda (57 handlers) |
| Database | PostgreSQL (Aurora Serverless v2) |
| Cache | Redis (ElastiCache) |
| Storage | S3 + CloudFront CDN |
| State | Zustand + React Query v5 |
| WebSocket | API Gateway WebSocket |

### Structure du Code

```
smuppy-mobile/
|-- src/
|   |-- components/       # Composants UI
|   |-- screens/          # 50+ ecrans
|   |-- services/         # AWS services (auth, api)
|   |-- stores/           # Zustand stores
|   |-- hooks/            # Custom hooks
|   |-- __tests__/        # Unit tests
|
|-- aws-migration/
|   |-- infrastructure/   # CDK Stack
|   |-- lambda/
|       |-- api/          # 57 Lambda handlers
|       |-- triggers/     # Cognito triggers
|       |-- websocket/    # WebSocket handlers
```

---

## 3. ENDPOINTS API

### Environnements

| Environnement | URL |
|---------------|-----|
| Staging | `https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging` |
| Production | `https://api.smuppy.com` |

### Endpoints par Categorie (57 total)

#### Auth (9 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/signup | Inscription |
| POST | /auth/confirm-signup | Verification email |
| POST | /auth/resend-code | Renvoyer code |
| POST | /auth/forgot-password | Mot de passe oublie |
| POST | /auth/confirm-forgot-password | Reset password |
| POST | /auth/check-user | Verifier si user existe |
| POST | /auth/validate-email | Valider format email |
| POST | /auth/apple | Apple Sign-In |
| POST | /auth/google | Google Sign-In |

#### Posts (9 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /posts | Liste des posts |
| POST | /posts | Creer un post |
| GET | /posts/:id | Details d'un post |
| DELETE | /posts/:id | Supprimer un post |
| POST | /posts/:id/like | Liker un post |
| DELETE | /posts/:id/like | Unliker un post |
| POST | /posts/:id/save | Sauvegarder un post |
| DELETE | /posts/:id/save | Retirer de sauvegarde |
| GET | /posts/:id/saved | Verifier si sauvegarde |

#### Comments (4 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /posts/:id/comments | Liste des commentaires |
| POST | /posts/:id/comments | Ajouter commentaire |
| PATCH | /comments/:id | Modifier commentaire |
| DELETE | /comments/:id | Supprimer commentaire |

#### Profiles (7 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /profiles/:id | Profil utilisateur |
| GET | /profiles?search= | Recherche profils |
| GET | /profiles/suggested | Profils suggeres |
| PATCH | /profiles/me | Modifier mon profil |
| GET | /profiles/:id/followers | Liste des fans |
| GET | /profiles/:id/following | Liste des suivis |
| GET | /profiles/:id/is-following | Verifier si suivi |

#### Follows (2 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| POST | /follows | Suivre un utilisateur |
| DELETE | /follows/:userId | Ne plus suivre |

#### Follow Requests (3 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /follow-requests | Liste des demandes |
| POST | /follow-requests/:id/accept | Accepter |
| POST | /follow-requests/:id/decline | Refuser |

#### Peaks/Stories (7 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /peaks | Liste des peaks |
| POST | /peaks | Creer un peak |
| GET | /peaks/:id | Details d'un peak |
| DELETE | /peaks/:id | Supprimer un peak |
| POST | /peaks/:id/like | Liker un peak |
| DELETE | /peaks/:id/like | Unliker un peak |
| POST | /peaks/:id/comments | Commenter un peak |

#### Notifications (5 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /notifications | Liste notifications |
| POST | /notifications/:id/read | Marquer comme lu |
| POST | /notifications/read-all | Tout marquer comme lu |
| GET | /notifications/unread-count | Compteur non lus |
| POST | /notifications/push-token | Enregistrer push token |

#### Conversations & Messages (5 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /conversations | Liste conversations |
| POST | /conversations | Creer conversation |
| GET | /conversations/:id/messages | Messages d'une conversation |
| POST | /conversations/:id/messages | Envoyer message |
| DELETE | /messages/:id | Supprimer message |

#### Media (1 endpoint)
| Method | Path | Description |
|--------|------|-------------|
| POST | /media/upload-url | URL presignee pour upload |

#### Feed (1 endpoint)
| Method | Path | Description |
|--------|------|-------------|
| GET | /feed | Feed personnalise |

#### Admin (4 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| POST | /admin/migrate | Executer migrations |
| POST | /admin/migrate-data | Migrer donnees |
| POST | /admin/migrate-users | Migrer utilisateurs |
| GET | /admin/check-profiles | Verifier profils |

---

## 4. SECURITE

### Mesures Implementees

| Element | Status |
|---------|--------|
| WAF avec 8 regles actives | OK |
| Rate limiting (10000 req/5min global, 100 req/5min auth) | OK |
| CORS restrictif (pas de `*` en production) | OK |
| Secrets dans AWS Secrets Manager | OK |
| Redis TLS + auth token | OK |
| Secret rotation automatique | OK |
| KMS encryption avec key rotation | OK |
| Error handling sans information leakage | OK |
| Middleware securite (SQL, XSS, Path Traversal) | OK |
| Security headers (HSTS, CSP, X-Frame-Options) | OK |
| CSRF protection avec tokens HMAC | OK |
| Structured logging avec PII masking | OK |
| Dependabot pour mises a jour automatiques | OK |
| Pre-commit hooks (secrets detection) | OK |

### WAF Rules

1. AWS Managed - Common Rule Set (OWASP Top 10)
2. AWS Managed - Known Bad Inputs
3. AWS Managed - SQL Injection Protection
4. AWS Managed - Bot Control
5. Rate Limiting Global (10000 req/5min per IP)
6. Geographic Blocking (pays sanctionnes)
7. Anonymous IP List
8. IP Reputation List

### Politique de Securite

Voir [.github/SECURITY.md](../.github/SECURITY.md) pour:
- Signalement de vulnerabilites
- Politique de divulgation responsable
- Contact securite: security@smuppy.com

---

## 5. TESTS & CI/CD

### Tests Unitaires (Jest)

| Metrique | Valeur |
|----------|--------|
| Tests totaux | 137 |
| Suites | 7 |
| Statements | 91.88% |
| Branches | 80% |
| Functions | 92.68% |
| Lines | 93.51% |

**Commandes:**
```bash
npm test                # Run all tests
npm run test:coverage   # With coverage report
npm run test:ci         # CI mode
```

### Tests E2E (Maestro)

| Flow | Description |
|------|-------------|
| auth/login.yaml | Flux de connexion |
| auth/signup.yaml | Flux d'inscription |
| feed/view-feed.yaml | Visualisation du feed |
| feed/create-post.yaml | Creation de post |
| profile/view-profile.yaml | Visualisation profil |
| profile/edit-profile.yaml | Edition profil |

**Commandes:**
```bash
npm run test:e2e           # Tous les tests
npm run test:e2e:auth      # Auth seulement
npm run test:e2e:feed      # Feed seulement
npm run test:e2e:profile   # Profile seulement
```

### Pre-commit Hooks

- ESLint + TypeScript type checking (lint-staged)
- Detection de secrets (AWS keys, private keys, passwords)
- Verification des dependances vulnerables

### CI Pipeline (GitHub Actions)

| Job | Description |
|-----|-------------|
| Lint & Typecheck | ESLint + TypeScript strict |
| Unit Tests | Jest avec coverage (80% threshold) |
| Lambda Check | TypeScript compilation Lambda |
| CDK Synth | Validation infrastructure |
| Secret Scan | Gitleaks detection |

### Dependabot

Configuration automatique pour:
- npm (root, lambda, CDK)
- GitHub Actions
- Scans hebdomadaires (lundi 09:00 Paris)

---

## 6. CAPACITE & PERFORMANCE

### Limites Infrastructure

| Composant | Limite Production |
|-----------|-------------------|
| API Gateway | 100,000 req/s |
| Lambda Concurrency | 1,000 (default, extensible a 10,000+) |
| Aurora ACU | 0.5-128 auto-scaling |
| WAF Rate Limit | 10,000 req/5min per IP |

### Capacite Estimee

| Metrique | Actuel | Optimise |
|----------|--------|----------|
| Utilisateurs simultanes | 50,000 | 500,000+ |
| Requetes/seconde | 3,300 | 50,000+ |
| DAU supportes | 500,000 | 2,000,000+ |

### Couts Estimes

| DAU | Cout mensuel |
|-----|-------------|
| 100,000 | ~$650 |
| 500,000 | ~$2,450 |
| 1,000,000 | ~$5,000 |

Voir [CAPACITY_ANALYSIS.md](../aws-migration/CAPACITY_ANALYSIS.md) pour les details complets.

---

## 7. GUIDE DE DEVELOPPEMENT

### Commandes Utiles

```bash
# Demarrer l'app
npm start

# Tests
npm test
npm run test:coverage

# Deployer AWS
cd aws-migration/infrastructure
npx cdk deploy SmuppyStack-staging

# Voir les logs Lambda
aws logs tail /aws/lambda/smuppy-staging-api --follow
```

### Creer un Nouveau Endpoint

1. Creer le handler dans `aws-migration/lambda/api/[resource]/[action].ts`
2. Ajouter la Lambda dans `smuppy-stack.ts`
3. Ajouter la route API Gateway
4. Deployer: `npx cdk deploy SmuppyStack-staging`

### Configuration

| Variable | Description |
|----------|-------------|
| `DATABASE_SECRET_ARN` | RDS credentials |
| `REDIS_AUTH_SECRET_ARN` | Redis auth token |
| `USER_POOL_ID` | Cognito User Pool |
| `MEDIA_BUCKET` | S3 bucket media |

---

## 8. DOCUMENTATION INDEX

| Document | Description | Lien |
|----------|-------------|------|
| README.md | Vue d'ensemble projet | [Lien](../README.md) |
| FEATURES_SPECS.md | Specifications UI/UX | [Lien](FEATURES_SPECS.md) |
| aws-migration/README.md | Infrastructure AWS | [Lien](../aws-migration/README.md) |
| CAPACITY_ANALYSIS.md | Analyse de capacite | [Lien](../aws-migration/CAPACITY_ANALYSIS.md) |
| AWS_SCALING_GUIDE.md | Guide de scaling 5M+ | [Lien](../aws-scaling/AWS_SCALING_GUIDE.md) |
| SECURITY.md | Politique de securite | [Lien](../.github/SECURITY.md) |
| .maestro/README.md | Guide tests E2E | [Lien](../.maestro/README.md) |
| AGENTS.md | Regles pour AI agents | [Lien](../AGENTS.md) |

---

## ANNEXES

### Couleurs du Theme

| Nom | Hex | Usage |
|-----|-----|-------|
| Primary | #0EBF8A | Actions, liens |
| Cyan | #00B5C1 | Gradient |
| Blue | #0081BE | Gradient |
| Dark | #0A252F | Texte |

### Types de Comptes

| Type | Description |
|------|-------------|
| personal | Utilisateur standard |
| creator | Createur de contenu |
| business | Business/entreprise |

---

*Document genere le 26 Janvier 2026*
*Version 4.0.0 - Tests 137 (80%+ coverage) - Securite 9.5/10*
