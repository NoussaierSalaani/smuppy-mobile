# 🚀 Smuppy - Migration Supabase → AWS

## Vue d'ensemble

Migration complète de l'infrastructure Supabase vers AWS pour supporter 500K+ utilisateurs simultanés.

## Architecture Cible

```
Mobile App (React Native)
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                      AWS Cloud                               │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │   Cognito   │    │ API Gateway │    │   AppSync   │      │
│  │   (Auth)    │    │   (REST)    │    │ (Realtime)  │      │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘      │
│         │                  │                   │             │
│         │           ┌──────┴──────┐           │             │
│         │           │   Lambda    │           │             │
│         │           │  Functions  │           │             │
│         │           └──────┬──────┘           │             │
│         │                  │                   │             │
│  ┌──────┴──────────────────┴───────────────────┴──────┐     │
│  │              Aurora PostgreSQL Serverless           │     │
│  │                   (Compatible Supabase)             │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │     S3      │    │ CloudFront  │    │ ElastiCache │      │
│  │  (Storage)  │    │   (CDN)     │    │   (Redis)   │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Mapping Supabase → AWS

| Supabase | AWS | Notes |
|----------|-----|-------|
| Auth | Cognito | OAuth, Email/Password, MFA |
| Database (PostgreSQL) | Aurora Serverless v2 | Schema identique |
| Storage | S3 | Déjà en place |
| Realtime | AppSync | WebSocket + Subscriptions |
| Edge Functions | Lambda | Node.js 20.x |
| RPC Functions | Lambda + API Gateway | REST endpoints |
| Row Level Security | Lambda + IAM | Policies dans le code |

## Phase 1: Setup Infrastructure (Jour 1-2)

### 1.1 Prérequis
```bash
# Installer AWS CLI
brew install awscli

# Configurer credentials
aws configure
# AWS Access Key ID: [votre key]
# AWS Secret Access Key: [votre secret]
# Default region: eu-west-3 (Paris)
# Default output format: json

# Installer AWS CDK
npm install -g aws-cdk

# Vérifier
aws sts get-caller-identity
```

### 1.2 Créer le VPC et Réseau
- VPC avec 2 AZs minimum
- Subnets privés pour Aurora
- Subnets publics pour Lambda/API Gateway
- NAT Gateway pour accès internet

### 1.3 Créer Aurora Serverless v2
```sql
-- Configuration
Engine: PostgreSQL 15.x
Capacity: 0.5 - 64 ACUs (auto-scaling)
Storage: 10GB - 128TB (auto-scaling)
```

## Phase 2: Migration Auth - Cognito (Jour 3-4)

### 2.1 Créer User Pool
```javascript
// Configuration Cognito
{
  userPoolName: 'smuppy-users',
  selfSignUpEnabled: true,
  signInAliases: { email: true, username: true },
  autoVerify: { email: true },
  passwordPolicy: {
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits: true,
    requireSymbols: false,
  },
  mfa: 'OPTIONAL',
  accountRecovery: 'EMAIL_ONLY',
}
```

### 2.2 Migration des utilisateurs
1. Exporter les users de Supabase Auth
2. Importer dans Cognito avec migration Lambda
3. Les passwords seront re-hashés au premier login

### 2.3 Mettre à jour l'app
```typescript
// Remplacer
import { supabase } from './supabase';
// Par
import { Auth } from '@aws-amplify/auth';
```

## Phase 3: Migration Database - Aurora (Jour 5-7)

### 3.1 Exporter le schema Supabase
```bash
pg_dump -h db.xxx.supabase.co -U postgres -d postgres \
  --schema-only --no-owner --no-privileges \
  > schema.sql
```

### 3.2 Exporter les données
```bash
pg_dump -h db.xxx.supabase.co -U postgres -d postgres \
  --data-only --no-owner \
  > data.sql
```

### 3.3 Importer dans Aurora
```bash
psql -h smuppy-aurora.xxx.eu-west-3.rds.amazonaws.com \
  -U admin -d smuppy < schema.sql

psql -h smuppy-aurora.xxx.eu-west-3.rds.amazonaws.com \
  -U admin -d smuppy < data.sql
```

### 3.4 Adapter les RLS en code Lambda
Les Row Level Security policies de Supabase deviennent des checks dans Lambda:

```typescript
// Avant (Supabase RLS)
// CREATE POLICY "Users can view own posts" ON posts
//   FOR SELECT USING (author_id = auth.uid());

// Après (Lambda)
async function getPosts(userId: string) {
  const posts = await db.query(
    'SELECT * FROM posts WHERE author_id = $1',
    [userId]
  );
  return posts;
}
```

## Phase 4: Migration API - Lambda (Jour 8-11)

### 4.1 Structure des Lambda Functions
```
lambda/
├── auth/
│   ├── postConfirmation.ts    # Créer profile après signup
│   └── preTokenGeneration.ts  # Ajouter claims custom
├── api/
│   ├── posts/
│   │   ├── create.ts
│   │   ├── get.ts
│   │   ├── list.ts
│   │   ├── update.ts
│   │   └── delete.ts
│   ├── profiles/
│   ├── follows/
│   ├── likes/
│   ├── comments/
│   ├── peaks/
│   ├── conversations/
│   └── messages/
└── realtime/
    ├── onMessage.ts
    └── onNotification.ts
```

### 4.2 API Gateway Routes
```
POST   /posts           → lambda:posts-create
GET    /posts           → lambda:posts-list
GET    /posts/{id}      → lambda:posts-get
PUT    /posts/{id}      → lambda:posts-update
DELETE /posts/{id}      → lambda:posts-delete

GET    /profiles/{id}   → lambda:profiles-get
PUT    /profiles/{id}   → lambda:profiles-update

POST   /follows         → lambda:follows-create
DELETE /follows/{id}    → lambda:follows-delete

... etc
```

## Phase 5: Migration Realtime - AppSync (Jour 12-14)

### 5.1 Schema GraphQL
```graphql
type Message {
  id: ID!
  conversationId: ID!
  senderId: ID!
  content: String!
  createdAt: AWSDateTime!
}

type Subscription {
  onNewMessage(conversationId: ID!): Message
    @aws_subscribe(mutations: ["sendMessage"])

  onNotification(userId: ID!): Notification
    @aws_subscribe(mutations: ["createNotification"])
}

type Mutation {
  sendMessage(conversationId: ID!, content: String!): Message
  createNotification(userId: ID!, type: String!, data: AWSJSON): Notification
}
```

### 5.2 Mettre à jour l'app
```typescript
// Remplacer Supabase Realtime
// supabase.channel('messages').on(...)

// Par AppSync Subscriptions
import { API, graphqlOperation } from '@aws-amplify/api';
import { onNewMessage } from './graphql/subscriptions';

const subscription = API.graphql(
  graphqlOperation(onNewMessage, { conversationId })
).subscribe({
  next: ({ value }) => {
    console.log('New message:', value.data.onNewMessage);
  }
});
```

## Phase 6: Tests et Déploiement (Jour 15-17)

### 6.1 Tests de charge
```bash
# Réutiliser les stress tests avec les nouveaux endpoints AWS
cd stress-tests
./run-tests.sh stress api
```

### 6.2 Déploiement progressif
1. Déployer en staging
2. Tests QA complets
3. Migration 10% des users
4. Monitoring 24h
5. Migration 50% des users
6. Monitoring 24h
7. Migration 100%

### 6.3 Rollback plan
- Garder Supabase actif pendant 2 semaines
- DNS switch instantané si problème
- Logs et métriques sur CloudWatch

## Checklist Finale

- [ ] AWS Account configuré
- [ ] VPC et réseau créés
- [ ] Aurora Serverless v2 déployé
- [ ] Schema et données migrés
- [ ] Cognito User Pool créé
- [ ] Users migrés
- [ ] Lambda functions déployées
- [ ] API Gateway configuré
- [ ] AppSync configuré
- [ ] App mise à jour avec Amplify
- [ ] Tests de charge passés
- [ ] Monitoring configuré
- [ ] Rollback testé

## Coûts Mensuels Estimés (500K users)

| Service | Min | Max |
|---------|-----|-----|
| Aurora Serverless | $200 | $500 |
| Cognito | $275 | $275 |
| Lambda | $50 | $200 |
| API Gateway | $100 | $300 |
| AppSync | $200 | $600 |
| ElastiCache | $100 | $200 |
| S3 + CloudFront | $200 | $400 |
| CloudWatch | $50 | $100 |
| **TOTAL** | **$1,175** | **$2,575** |

## Support

- AWS Support: Business tier recommandé (~$100/mois)
- Documentation: https://docs.aws.amazon.com
- Communauté: https://repost.aws
