# Smuppy

Application mobile sociale fitness en React Native (Expo) connectant les utilisateurs autour du sport, du bien-etre et d'un mode de vie sain.

## Etat Actuel

| Aspect | Score | Status |
|--------|-------|--------|
| Frontend | 8/10 | Complet |
| Backend | 5/10 | ~30 endpoints manquants |
| Securite | 5/10 | Corrections requises |
| **Global** | **6.2/10** | **En developpement** |

> **Documentation complete:** [docs/SMUPPY_MASTER_DOC.md](docs/SMUPPY_MASTER_DOC.md)

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
```

## Structure

```
src/
├── components/     # UI components
├── screens/        # 50+ ecrans
├── services/       # AWS services (auth, api)
├── stores/         # Zustand stores
└── hooks/          # Custom hooks

aws-migration/
├── infrastructure/ # CDK Stack
└── lambda/api/     # Lambda handlers
```

## Fonctionnalites

### Fonctionnel
- Authentication complete (email, Apple, Google, biometric)
- Creation/affichage de posts
- Profils (view, edit, search)
- Follow/Unfollow
- Upload media (S3)

### En cours
- Like/Unlike posts (endpoint manquant)
- Commentaires (endpoints manquants)
- Peaks/Stories (0% backend)
- Notifications (0% backend)
- Messages/Chat (0% backend)

## Deploiement

```bash
# Deployer AWS
cd aws-migration/infrastructure
npx cdk deploy SmuppyStack-staging --require-approval never
```

## Endpoints

| Env | URL |
|-----|-----|
| Staging | https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging |
| Production | https://api.smuppy.com |

## Documentation

| Document | Description |
|----------|-------------|
| [SMUPPY_MASTER_DOC.md](docs/SMUPPY_MASTER_DOC.md) | Documentation complete, audit, roadmap |
| [FEATURES_SPECS.md](docs/FEATURES_SPECS.md) | Specifications UI/UX detaillees |

## Prochaines Etapes

1. **Semaine 1:** Corriger failles securite (CORS, secrets)
2. **Semaine 2:** Endpoints posts/comments
3. **Semaine 3:** Peaks/Stories
4. **Semaine 4:** Notifications
5. **Semaine 5-6:** Messages/Chat

## License

Private - All rights reserved
