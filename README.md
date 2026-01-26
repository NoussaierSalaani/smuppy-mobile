# Smuppy

Application mobile sociale fitness en React Native (Expo) connectant les utilisateurs autour du sport, du bien-etre et d'un mode de vie sain.

## Etat Actuel

| Aspect | Score | Status |
|--------|-------|--------|
| Frontend | 8/10 | 50+ ecrans complets |
| Backend | 9/10 | 57 endpoints Lambda |
| Securite | 9.5/10 | WAF, CSRF, TLS, logging structure |
| Tests | 8/10 | 137 unit tests (80% coverage) + E2E |
| **Global** | **8.6/10** | **Production Ready** |

## Stack Technique

| Categorie | Technologie |
|-----------|-------------|
| Framework | React Native + Expo SDK 54 |
| Backend | AWS (Cognito + API Gateway + Lambda) |
| Database | PostgreSQL (Aurora Serverless v2) |
| Cache | Redis (ElastiCache) |
| Storage | S3 + CloudFront CDN |
| State | Zustand + React Query v5 |
| Tests | Jest + Maestro E2E |

## Quick Start

```bash
# Installation
npm install

# Configuration
cp .env.example .env
# Editer .env avec vos cles

# Demarrer
npm start

# Tests unitaires
npm test
npm run test:coverage   # Avec coverage

# Tests E2E (Maestro)
npm run test:e2e        # Tous les tests
npm run test:e2e:auth   # Auth seulement
```

## Structure

```
src/
├── components/     # UI components
├── screens/        # 50+ ecrans
├── services/       # AWS services (auth, api)
├── stores/         # Zustand stores
├── hooks/          # Custom hooks
└── __tests__/      # Unit tests

aws-migration/
├── infrastructure/ # CDK Stack
├── lambda/
│   ├── api/        # 57 Lambda handlers
│   └── __tests__/  # 137 tests (80%+ coverage)
└── scripts/        # Database migrations

.maestro/           # E2E Tests
├── auth/           # Login, Signup flows
├── feed/           # Feed, Post creation
└── profile/        # Profile view, Edit
```

## Fonctionnalites

- Authentication complete (email, Apple, Google, biometric)
- Posts (CRUD, likes, saves, comments)
- Peaks/Stories (CRUD, likes, comments)
- Profils (view, edit, search, followers/following)
- Follow/Unfollow avec follow requests
- Notifications (push tokens, read/unread)
- Messages/Conversations (WebSocket temps reel)
- Feed personnalise
- Upload media (S3 presigned URLs)

## Deploiement

```bash
# Deployer AWS Staging
cd aws-migration/infrastructure
npx cdk deploy SmuppyStack-staging

# Deployer AWS Production
npx cdk deploy SmuppyStack-production
```

## Endpoints

| Env | URL |
|-----|-----|
| Staging | https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging |
| Production | https://api.smuppy.com |

## Capacite

| Metrique | Actuel | Optimise |
|----------|--------|----------|
| Utilisateurs simultanes | 50,000 | 500,000+ |
| Requetes/seconde | 3,300 | 50,000+ |
| DAU supportes | 500,000 | 2,000,000+ |

Voir [CAPACITY_ANALYSIS.md](aws-migration/CAPACITY_ANALYSIS.md) pour les details.

## Tests

### Unit Tests (Jest)
```bash
npm test                    # Run all tests
npm run test:coverage       # With coverage report
npm run test:ci             # CI mode
```

**Coverage actuelle:**
- Statements: 91.88%
- Branches: 80%
- Functions: 92.68%
- Lines: 93.51%

### E2E Tests (Maestro)
```bash
# Prerequis: installer Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash

# Lancer les tests
npm run test:e2e            # Tous
npm run test:e2e:auth       # Auth flows
npm run test:e2e:feed       # Feed flows
npm run test:e2e:profile    # Profile flows
```

## Documentation

| Document | Description |
|----------|-------------|
| [SMUPPY_MASTER_DOC.md](docs/SMUPPY_MASTER_DOC.md) | Documentation technique complete |
| [FEATURES_SPECS.md](docs/FEATURES_SPECS.md) | Specifications UI/UX |
| [aws-migration/README.md](aws-migration/README.md) | Documentation infrastructure AWS |
| [CAPACITY_ANALYSIS.md](aws-migration/CAPACITY_ANALYSIS.md) | Analyse de capacite |
| [SECURITY.md](.github/SECURITY.md) | Politique de securite |
| [.maestro/README.md](.maestro/README.md) | Guide tests E2E |

## Securite

### Infrastructure
- WAF avec 8 regles actives (OWASP Top 10, Bot Control, Rate Limiting)
- CORS restrictif (domaines Smuppy uniquement en production)
- Secrets Manager avec rotation automatique
- Redis TLS + auth token
- KMS encryption avec key rotation

### Application
- CSRF protection avec tokens HMAC
- Input validation et sanitization
- SQL injection / XSS / Path traversal detection
- Structured logging avec PII masking
- Pre-commit hooks avec detection de secrets

### Dependances
- Dependabot configure pour mises a jour automatiques
- Scans hebdomadaires (npm, CDK, GitHub Actions)
- Groupement des updates minor/patch

## Scripts

| Commande | Description |
|----------|-------------|
| `npm start` | Demarrer Expo |
| `npm test` | Tests unitaires |
| `npm run test:coverage` | Tests avec coverage |
| `npm run test:e2e` | Tests E2E Maestro |
| `npm run lint` | Linter ESLint |
| `npm run typecheck` | TypeScript check |

## License

Private - All rights reserved
