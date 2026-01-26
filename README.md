# Smuppy

Application mobile sociale fitness en React Native (Expo) connectant les utilisateurs autour du sport, du bien-etre et d'un mode de vie sain.

## Etat Actuel

| Aspect | Score | Status |
|--------|-------|--------|
| Frontend | 8/10 | 50+ ecrans complets |
| Backend | 9/10 | 57 endpoints Lambda |
| Securite | 9/10 | WAF, TLS, rotation secrets |
| Tests | 6/10 | 46 unit tests + CI |
| **Global** | **8.2/10** | **Production Ready** |

## Stack Technique

| Categorie | Technologie |
|-----------|-------------|
| Framework | React Native + Expo SDK 54 |
| Backend | AWS (Cognito + API Gateway + Lambda) |
| Database | PostgreSQL (Aurora Serverless v2) |
| Cache | Redis (ElastiCache) |
| Storage | S3 + CloudFront CDN |
| State | Zustand + React Query v5 |

## Quick Start

```bash
# Installation
npm install

# Configuration
cp .env.example .env
# Editer .env avec vos cles

# Demarrer
npm start

# Tests
npm test
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
└── lambda/api/     # 57 Lambda handlers
```

## Fonctionnalites

- Authentication complete (email, Apple, Google, biometric)
- Posts (CRUD, likes, saves, comments)
- Peaks/Stories (CRUD, likes, comments)
- Profils (view, edit, search, followers/following)
- Follow/Unfollow avec follow requests
- Notifications (push tokens, read/unread)
- Messages/Conversations
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

## Documentation

| Document | Description |
|----------|-------------|
| [SMUPPY_MASTER_DOC.md](docs/SMUPPY_MASTER_DOC.md) | Documentation technique complete |
| [FEATURES_SPECS.md](docs/FEATURES_SPECS.md) | Specifications UI/UX |
| [aws-migration/README.md](aws-migration/README.md) | Documentation infrastructure AWS |

## Securite

- WAF avec 8 regles actives (OWASP Top 10, Bot Control, Rate Limiting)
- CORS restrictif (domaines Smuppy uniquement en production)
- Secrets Manager avec rotation automatique
- Redis TLS + auth token
- KMS encryption avec key rotation
- Security middleware (SQL injection, XSS, Path Traversal)
- Pre-commit hooks avec detection de secrets

## License

Private - All rights reserved
