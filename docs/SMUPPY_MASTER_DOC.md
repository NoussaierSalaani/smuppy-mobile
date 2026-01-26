# SMUPPY - DOCUMENTATION MASTER
> Version: 2.0.0 | Mise a jour: 25 Janvier 2026 | Audit Complet

---

## TABLE DES MATIERES

1. [Resume Executif](#1-resume-executif)
2. [Architecture](#2-architecture)
3. [Etat Actuel - Audit](#3-etat-actuel---audit)
4. [Endpoints API](#4-endpoints-api)
5. [Securite](#5-securite)
6. [Roadmap & TODO](#6-roadmap--todo)
7. [Guide de Developpement](#7-guide-de-developpement)
8. [Configuration](#8-configuration)

---

## 1. RESUME EXECUTIF

### Scores Globaux

| Aspect | Score | Etat |
|--------|-------|------|
| Frontend (UI/UX) | 8/10 | Tres bien |
| Backend (API) | 5/10 | Incomplet - 30+ endpoints manquants |
| Infrastructure | 7/10 | Bien configure |
| Securite | 5/10 | Failles critiques a corriger |
| Architecture | 7/10 | Bien structure |
| **GLOBAL** | **6.2/10** | **Non pret pour production** |

### Verdict
L'application n'est PAS prete pour la production. Il manque ~30 endpoints Lambda critiques et il y a des failles de securite importantes (CORS, secrets exposes).

**Effort estime pour production-ready:** 4-6 semaines

---

## 2. ARCHITECTURE

### Stack Technique

| Categorie | Technologie | Version |
|-----------|-------------|---------|
| Framework | React Native + Expo | SDK 54 |
| Backend | AWS (CDK) | - |
| Auth | AWS Cognito | - |
| API | API Gateway + Lambda | REST |
| Database | PostgreSQL (RDS Aurora Serverless v2) | - |
| Cache | Redis (ElastiCache) | 7.0 |
| Storage | S3 + CloudFront CDN | - |
| State | Zustand + React Query | v5 |
| Lists | @shopify/flash-list | - |

### Schema Architecture

```
                    SMUPPY ARCHITECTURE

+------------------+     +------------------+     +------------------+
|   Mobile App     |     |   CloudFront     |     |       S3         |
|  (React Native)  |---->|      CDN         |---->|    (Media)       |
+--------+---------+     +------------------+     +------------------+
         |
         v
+------------------+     +------------------+     +------------------+
|  API Gateway     |---->|     Lambda       |---->|  PostgreSQL      |
| (REST + WAF)     |     |   (24 funcs)     |     |  (Aurora RDS)    |
+--------+---------+     +------------------+     +------------------+
         |                        |
         v                        v
+------------------+     +------------------+
|  AWS Cognito     |     |     Redis        |
|  (Auth + JWT)    |     |  (ElastiCache)   |
+------------------+     +------------------+
```

### Structure du Code

```
smuppy-mobile/
|-- src/
|   |-- components/       # Composants UI reutilisables
|   |-- config/           # Configuration (theme, env, aws)
|   |-- hooks/            # Custom hooks React
|   |-- navigation/       # React Navigation
|   |-- screens/          # Ecrans de l'app (50+)
|   |-- services/         # Services backend (aws-auth, aws-api, database)
|   |-- stores/           # Zustand stores
|   |-- utils/            # Utilitaires
|
|-- aws-migration/
|   |-- infrastructure/   # CDK Stack (smuppy-stack.ts)
|   |-- lambda/
|       |-- api/          # Lambda handlers
|           |-- auth/     # Authentication endpoints
|           |-- posts/    # Posts endpoints
|           |-- profiles/ # Profiles endpoints
|           |-- follows/  # Follow endpoints
|           |-- feed/     # Feed endpoints
```

---

## 3. ETAT ACTUEL - AUDIT

### 3.1 Fonctionnalites - Matrice Complete

| Fonctionnalite | Frontend | Backend | Status |
|----------------|:--------:|:-------:|:------:|
| **AUTHENTICATION** |
| Signup email | OK | OK | FONCTIONNEL |
| Login email | OK | OK | FONCTIONNEL |
| Apple Sign-In | OK | OK | FONCTIONNEL |
| Google Sign-In | OK | OK | FONCTIONNEL |
| Biometric | OK | OK | FONCTIONNEL |
| Forgot password | OK | OK | FONCTIONNEL |
| Email verification | OK | OK | FONCTIONNEL |
| **POSTS** |
| Create post | OK | OK | FONCTIONNEL |
| View posts | OK | OK | FONCTIONNEL |
| Like post | OK | MANQUE | NON FONCTIONNEL |
| Unlike post | OK | MANQUE | NON FONCTIONNEL |
| Delete post | OK | MANQUE | NON FONCTIONNEL |
| Save post | OK | MANQUE | NON FONCTIONNEL |
| **COMMENTS** |
| View comments | OK | MANQUE | NON FONCTIONNEL |
| Add comment | OK | MANQUE | NON FONCTIONNEL |
| Delete comment | OK | MANQUE | NON FONCTIONNEL |
| **PROFILES** |
| View profile | OK | OK | FONCTIONNEL |
| Edit profile | OK | OK | FONCTIONNEL |
| Search profiles | OK | OK | FONCTIONNEL |
| Suggested profiles | OK | OK | FONCTIONNEL |
| Get followers | OK | MANQUE | NON FONCTIONNEL |
| Get following | OK | MANQUE | NON FONCTIONNEL |
| **FOLLOWS** |
| Follow user | OK | OK | FONCTIONNEL |
| Unfollow user | OK | OK | FONCTIONNEL |
| Check is following | OK | OK | FONCTIONNEL |
| Follow requests list | OK | MANQUE | NON FONCTIONNEL |
| Accept/Decline request | OK | MANQUE | NON FONCTIONNEL |
| **PEAKS (Stories)** |
| Create peak | OK | MANQUE | NON FONCTIONNEL |
| View peaks | OK | MANQUE | NON FONCTIONNEL |
| Like peak | OK | MANQUE | NON FONCTIONNEL |
| Peak comments | OK | MANQUE | NON FONCTIONNEL |
| **NOTIFICATIONS** |
| Get notifications | OK | MANQUE | NON FONCTIONNEL |
| Mark as read | OK | MANQUE | NON FONCTIONNEL |
| Push token | OK | MANQUE | NON FONCTIONNEL |
| **MESSAGES** |
| Get conversations | OK | MANQUE | NON FONCTIONNEL |
| Send message | OK | MANQUE | NON FONCTIONNEL |
| Real-time chat | OK | MANQUE | NON FONCTIONNEL |
| **LIVE/CALLS** |
| Video calls (Agora) | OK | Partiel | PARTIEL |
| Live streaming | OK | MANQUE | NON FONCTIONNEL |

### 3.2 Endpoints Existants (24)

```
AUTH (10):
  POST /auth/signup
  POST /auth/confirm-signup
  POST /auth/resend-code
  POST /auth/forgot-password
  POST /auth/confirm-forgot-password
  POST /auth/validate-email
  POST /auth/check-user
  POST /auth/apple
  POST /auth/google

POSTS (3):
  GET  /posts           (list)
  GET  /posts/:id       (get)
  POST /posts           (create)

PROFILES (5):
  GET   /profiles/:id
  GET   /profiles?search=
  GET   /profiles/suggested
  PATCH /profiles/me
  GET   /profiles/:id/is-following

FOLLOWS (2):
  POST   /follows
  DELETE /follows/:userId

FEED (1):
  GET /feed

ADMIN (3):
  POST /admin/migrate
  POST /admin/migrate-data
```

### 3.3 Endpoints Manquants (30+)

```
POSTS INTERACTIONS (6):
  POST   /posts/:id/like
  POST   /posts/:id/unlike
  DELETE /posts/:id
  POST   /posts/:id/save
  DELETE /posts/:id/unsave
  GET    /posts/:id/saved

COMMENTS (4):
  GET    /posts/:id/comments
  POST   /posts/:id/comments
  DELETE /comments/:id
  PATCH  /comments/:id

PROFILES (2):
  GET /profiles/:id/followers
  GET /profiles/:id/following

FOLLOW REQUESTS (3):
  GET  /follow-requests
  POST /follow-requests/:id/accept
  POST /follow-requests/:id/decline

PEAKS (6):
  POST   /peaks
  GET    /peaks
  GET    /peaks/:id
  POST   /peaks/:id/like
  DELETE /peaks/:id
  POST   /peaks/:id/comments

NOTIFICATIONS (5):
  GET  /notifications
  POST /notifications/:id/read
  POST /notifications/read-all
  GET  /notifications/unread-count
  POST /notifications/push-token

MESSAGES (5):
  GET    /conversations
  GET    /conversations/:id/messages
  POST   /messages
  DELETE /messages/:id
  WS     /messages (WebSocket)

FEED (2):
  GET /feed/following
  GET /feed/discover
```

---

## 4. ENDPOINTS API

### Environnements

| Environnement | URL | TLS |
|---------------|-----|-----|
| **Staging** | `https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging` | TLS 1.0+ |
| **Production** | `https://api.smuppy.com` | TLS 1.2 |

### Format des Reponses

```json
// Succes
{
  "data": { ... },
  "message": "Success"
}

// Erreur
{
  "message": "Error description",
  "code": "ERROR_CODE"
}

// Pagination
{
  "data": [...],
  "cursor": "next_page_cursor",
  "hasMore": true
}
```

### Authentication Header

```
Authorization: Bearer <cognito_access_token>
```

---

## 5. SECURITE

### 5.1 Problemes Corriges (Phase 1 - 25 Jan 2026)

| # | Probleme | Status | Fix Applique |
|---|----------|--------|--------------|
| 1 | CORS = '*' partout | CORRIGE | Domaines Smuppy uniquement |
| 2 | Admin Key en plaintext | CORRIGE | AWS Secrets Manager |
| 3 | Token TTL trop long | CORRIGE | Access: 15min, Refresh: 7j |
| 4 | Pas de rate limiting | CORRIGE | WAF + rate limits par endpoint |
| 5 | WAF staging desactive | CORRIGE | WAF actif partout |
| 6 | Pas de protection auth | CORRIGE | 100 req/5min sur /auth/* |

### 5.2 Problemes Restants

| # | Probleme | Risque | Priorite |
|---|----------|--------|----------|
| 1 | Pas de MFA | Auth faible | MOYEN |
| 2 | Pas de TLS Pinning mobile | MITM | MOYEN |
| 3 | Redis version 7.0 (EOL) | Securite | FAIBLE |

### 5.2 Corrections Requises

#### CORS (CRITIQUE)

```typescript
// AVANT (mauvais)
defaultCorsPreflightOptions: {
  allowOrigins: apigateway.Cors.ALL_ORIGINS,  // DANGER
}

// APRES (correct)
defaultCorsPreflightOptions: {
  allowOrigins: [
    'https://smuppy.com',
    'https://app.smuppy.com',
    'https://*.smuppy.com'
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
}
```

#### Secrets (CRITIQUE)

```typescript
// AVANT (mauvais)
ADMIN_KEY: 'smuppy-migration-secret-key-2026',  // En plaintext!

// APRES (correct)
// Utiliser AWS Secrets Manager
const adminSecret = secretsmanager.Secret.fromSecretNameV2(...);
ADMIN_KEY: adminSecret.secretValue.toString(),
```

### 5.3 Ce qui est Bien Configure

| Element | Status |
|---------|--------|
| AWS WAF avec rate limiting global | OK |
| Aurora encryption at-rest | OK |
| Redis encryption in-transit | OK |
| S3 encryption | OK |
| CloudFront HTTPS only | OK |
| Cognito password policy | OK |
| VPC avec subnets isoles | OK |

---

## 6. ROADMAP & TODO

### Phase 1: Securite (Semaine 1) - COMPLETE

- [x] Corriger CORS (API Gateway + S3 + CloudFront)
- [x] Deplacer secrets vers AWS Secrets Manager
- [x] Reduire Token TTL (Access: 15min, Refresh: 7 jours)
- [x] Ajouter rate limiting par endpoint (WAF)
- [x] Activer WAF pour staging
- [x] Ajouter protections auth (100 req/5min)
- [x] Creer middleware de securite (SQL, XSS, Path Traversal, etc.)
- [x] Ajouter security headers (HSTS, CSP, X-Frame-Options, etc.)

**Status:** COMPLETE - Deploye le 25 Jan 2026

### Phase 2: Endpoints Posts/Comments (Semaine 2)

- [ ] POST /posts/:id/like
- [ ] POST /posts/:id/unlike
- [ ] DELETE /posts/:id
- [ ] GET /posts/:id/comments
- [ ] POST /posts/:id/comments
- [ ] DELETE /comments/:id
- [ ] POST /posts/:id/save
- [ ] DELETE /posts/:id/unsave

**Effort:** ~16 heures

### Phase 3: Profiles & Follows (Semaine 2-3)

- [ ] GET /profiles/:id/followers
- [ ] GET /profiles/:id/following
- [ ] GET /follow-requests
- [ ] POST /follow-requests/:id/accept
- [ ] POST /follow-requests/:id/decline

**Effort:** ~10 heures

### Phase 4: Peaks (Semaine 3)

- [ ] POST /peaks
- [ ] GET /peaks
- [ ] GET /peaks/:id
- [ ] DELETE /peaks/:id
- [ ] POST /peaks/:id/like
- [ ] POST /peaks/:id/comments

**Effort:** ~12 heures

### Phase 5: Notifications (Semaine 4)

- [ ] GET /notifications
- [ ] POST /notifications/:id/read
- [ ] POST /notifications/read-all
- [ ] GET /notifications/unread-count
- [ ] POST /notifications/push-token

**Effort:** ~10 heures

### Phase 6: Messages (Semaine 5-6)

- [ ] GET /conversations
- [ ] GET /conversations/:id/messages
- [ ] POST /messages
- [ ] DELETE /messages/:id
- [ ] Implémenter WebSocket pour real-time

**Effort:** ~24 heures

### Phase 7: Tests & QA (Semaine 6)

- [ ] Tests d'integration
- [ ] Tests de charge
- [ ] Penetration testing
- [ ] Audit securite final

**Effort:** ~16 heures

---

## 7. GUIDE DE DEVELOPPEMENT

### 7.1 Creer un Nouveau Lambda Endpoint

1. Creer le fichier handler:
```typescript
// aws-migration/lambda/api/[resource]/[action].ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let pool: Pool | null = null;
const secretsClient = new SecretsManagerClient({});

async function getDbCredentials() {
  const command = new GetSecretValueCommand({
    SecretId: process.env.DB_SECRET_ARN,
  });
  const response = await secretsClient.send(command);
  return JSON.parse(response.SecretString || '{}');
}

async function getPool(): Promise<Pool> {
  if (!pool) {
    const credentials = await getDbCredentials();
    pool = new Pool({
      host: credentials.host,
      port: credentials.port,
      database: credentials.dbname || 'smuppy',
      user: credentials.username,
      password: credentials.password,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
  }
  return pool;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const db = await getPool();

    // Logic here...

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: result }),
    };
  } catch (error: any) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
```

2. Ajouter la Lambda dans CDK (smuppy-stack.ts):
```typescript
const newFn = createLambda('NewFunctionName', 'resource/action');
```

3. Ajouter la route API Gateway:
```typescript
const resource = api.root.addResource('resource');
resource.addMethod('POST', new apigateway.LambdaIntegration(newFn), {
  authorizer,
  authorizationType: apigateway.AuthorizationType.COGNITO,
});
```

4. Deployer:
```bash
cd aws-migration/infrastructure
npx cdk deploy SmuppyStack-staging --require-approval never
```

### 7.2 Ajouter dans le Frontend

1. Ajouter la methode dans aws-api.ts:
```typescript
async newMethod(param: string): Promise<ResponseType> {
  return this.request('/resource', {
    method: 'POST',
    body: { param },
  });
}
```

2. Ajouter la fonction dans database.ts:
```typescript
export const newFunction = async (param: string): Promise<DbResponse<Type>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.newMethod(param);
    return { data: result, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};
```

### 7.3 Commandes Utiles

```bash
# Demarrer l'app
npm start

# Deployer le stack AWS
cd aws-migration/infrastructure && npx cdk deploy SmuppyStack-staging

# Voir les logs Lambda
aws logs tail /aws/lambda/SmuppyStack-staging-PostsListFunction --follow

# Audit securite npm
npm audit

# TypeScript check
npm run typecheck
```

---

## 8. CONFIGURATION

### 8.1 Variables d'Environnement (.env)

```env
# API
API_URL_DEV=https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging
API_URL_PROD=https://api.smuppy.com
APP_ENV=dev

# AWS
AWS_REGION=us-east-1

# Google OAuth
GOOGLE_IOS_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_ANDROID_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_WEB_CLIENT_ID=xxx.apps.googleusercontent.com

# Agora (Video Calls)
AGORA_APP_ID=xxx

# Sentry (Optional)
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### 8.2 AWS Resources

| Resource | ID/ARN | Region |
|----------|--------|--------|
| User Pool | us-east-1_mvBH1S3yX | us-east-1 |
| User Pool Client | 60bt4bafj98q0nkjprpidegr0t | us-east-1 |
| Identity Pool | us-east-1:ff7c6b31-86c7-4bd1-8b91-f0f41adc828a | us-east-1 |
| API Gateway | bmkd8zayee | us-east-1 |
| RDS Cluster | smuppystack-staging-smuppydatabase... | us-east-1 |
| Redis | master.smrmven2feeb0h5.lwwzdn.use1.cache.amazonaws.com | us-east-1 |

---

## ANNEXES

### A. Couleurs du Theme

| Nom | Hex | Usage |
|-----|-----|-------|
| Primary | #0EBF8A | Actions, liens |
| Cyan | #00B5C1 | Gradient |
| Blue | #0081BE | Gradient |
| Dark | #0A252F | Texte |
| Gray | #8E8E93 | Texte secondaire |
| Red | #FF6B6B | Erreurs, likes |

### B. Types de Comptes

| Type | Description | Permissions |
|------|-------------|-------------|
| personal | Utilisateur standard | Posts, Follows, Messages |
| pro_creator | Createur de contenu | + Live, Sessions, Subscriptions |
| pro_local | Business local | + Business profile, Location features |

### C. Contacts

- **Repo:** smuppy-mobile
- **Stack:** SmuppyStack-staging
- **Region:** us-east-1

---

*Document genere le 25 Janvier 2026*
*Prochaine revision recommandee: apres Phase 2*
