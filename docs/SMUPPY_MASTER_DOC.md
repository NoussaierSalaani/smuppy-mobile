# SMUPPY - DOCUMENTATION MASTER
> Version: 3.0.0 | Mise a jour: 26 Janvier 2026

---

## TABLE DES MATIERES

1. [Resume Executif](#1-resume-executif)
2. [Architecture](#2-architecture)
3. [Endpoints API](#3-endpoints-api)
4. [Securite](#4-securite)
5. [Tests & CI/CD](#5-tests--cicd)
6. [Guide de Developpement](#6-guide-de-developpement)

---

## 1. RESUME EXECUTIF

### Scores Globaux

| Aspect | Score | Etat |
|--------|-------|------|
| Frontend (UI/UX) | 8/10 | Complet (50+ ecrans) |
| Backend (API) | 9/10 | 57 endpoints deployes |
| Infrastructure | 9/10 | Production-ready |
| Securite | 9/10 | Hardened (WAF, TLS, rotation) |
| Tests | 6/10 | 46 unit tests + CI |
| **GLOBAL** | **8.2/10** | **Production Ready** |

### Verdict

L'application est prete pour la production. Infrastructure AWS complete avec 57+ endpoints Lambda, securite renforcee, et pipeline CI/CD.

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
| Rate limiting (2000 req/5min global, 100 req/5min auth) | OK |
| CORS restrictif (pas de `*` en production) | OK |
| Secrets dans AWS Secrets Manager | OK |
| Redis TLS + auth token | OK |
| Secret rotation automatique | OK |
| KMS encryption avec key rotation | OK |
| Error handling sans information leakage | OK |
| Middleware securite (SQL, XSS, Path Traversal) | OK |
| Security headers (HSTS, CSP, X-Frame-Options) | OK |

### WAF Rules

1. AWS Managed - Common Rule Set (OWASP Top 10)
2. AWS Managed - Known Bad Inputs
3. AWS Managed - SQL Injection Protection
4. AWS Managed - Bot Control
5. Rate Limiting Global
6. Geographic Blocking (pays sanctionnes)
7. Anonymous IP List
8. IP Reputation List

---

## 5. TESTS & CI/CD

### Tests Unitaires

| Suite | Tests | Status |
|-------|-------|--------|
| aws-api.test.ts | 22 tests | OK |
| aws-auth.test.ts | 12 tests | OK |
| validation.test.ts | 12 tests | OK |
| **Total** | **46 tests** | **OK** |

### Pre-commit Hooks

- ESLint + TypeScript type checking (lint-staged)
- Detection de secrets (AWS keys, private keys, passwords)

### CI Pipeline (GitHub Actions)

| Job | Description |
|-----|-------------|
| Lint & Typecheck | ESLint + TypeScript strict |
| Unit Tests | Jest avec coverage |
| Lambda Check | TypeScript compilation Lambda |
| CDK Synth | Validation infrastructure |
| Secret Scan | Gitleaks detection |

---

## 6. GUIDE DE DEVELOPPEMENT

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
| pro_creator | Createur de contenu |
| pro_local | Business local |

---

*Document genere le 26 Janvier 2026*
