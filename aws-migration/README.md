# Smuppy AWS Migration Documentation

## Overview

This document describes the complete AWS infrastructure migration for the Smuppy mobile application. The migration replaces the previous Firebase/Supabase backend with a fully managed AWS infrastructure.

## Architecture

```
                                    ┌─────────────────────────────────────────────────────────────────┐
                                    │                         AWS Cloud                               │
                                    │  ┌──────────────────────────────────────────────────────────┐  │
                                    │  │                    VPC (10.0.0.0/16)                     │  │
┌──────────────┐                    │  │  ┌────────────────┐    ┌────────────────┐               │  │
│              │                    │  │  │ Public Subnet  │    │ Private Subnet │               │  │
│   React      │◄──────────────────►│  │  │  (10.0.1.0/24) │    │ (10.0.2.0/24)  │               │  │
│   Native     │                    │  │  │                │    │                │               │  │
│   App        │                    │  │  │  ┌──────────┐  │    │  ┌──────────┐  │               │  │
│              │                    │  │  │  │  NAT GW  │  │    │  │ RDS PG   │  │               │  │
└──────────────┘                    │  │  │  └──────────┘  │    │  │ Serverless│ │               │  │
       │                            │  │  └────────────────┘    │  └──────────┘  │               │  │
       │                            │  │                        └────────────────┘               │  │
       │                            │  └──────────────────────────────────────────────────────────┘  │
       │                            │                                                                │
       │  ┌─────────────────────────┼────────────────────────────────────────────────────────────┐   │
       │  │                         │                                                            │   │
       │  │  ┌──────────────┐   ┌───┴───────────┐   ┌───────────────┐   ┌───────────────┐       │   │
       └──┼──►  CloudFront  │   │  API Gateway  │   │  WebSocket    │   │     SNS       │       │   │
          │  │   (CDN)      │   │   (REST)      │   │  API Gateway  │   │ (Push iOS)    │       │   │
          │  └──────┬───────┘   └───────┬───────┘   └───────┬───────┘   └───────┬───────┘       │   │
          │         │                   │                   │                   │               │   │
          │         │                   │                   │                   │               │   │
          │  ┌──────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐          │               │   │
          │  │     S3       │   │    Lambda     │   │    Lambda     │          │               │   │
          │  │  (Storage)   │   │  (API Handlers)│  │  (WebSocket)  │          │               │   │
          │  └──────────────┘   └───────────────┘   └───────────────┘          │               │   │
          │                                                                     │               │   │
          │  ┌──────────────┐   ┌───────────────┐   ┌───────────────┐          │               │   │
          │  │   Cognito    │   │ Secrets       │   │   Firebase    │◄─────────┘               │   │
          │  │ (Auth)       │   │ Manager       │   │ Admin SDK     │                          │   │
          │  └──────────────┘   └───────────────┘   │ (Push Android)│                          │   │
          │                                         └───────────────┘                          │   │
          └────────────────────────────────────────────────────────────────────────────────────┘   │
                                    └─────────────────────────────────────────────────────────────────┘
```

## Environments

| Environment | Stack Name | Status |
|-------------|------------|--------|
| Staging | SmuppyStack-staging | ✅ Deployed |
| Production | SmuppyStack-production | ✅ Deployed |

## Infrastructure Components

### Phase 1: VPC & Networking

**Resources Created:**
- VPC with CIDR `10.0.0.0/16`
- Public Subnet (`10.0.1.0/24`) - Internet-facing resources
- Private Subnet (`10.0.2.0/24`) - Database and internal resources
- Internet Gateway
- NAT Gateway (for Lambda outbound access)
- Route Tables with appropriate routing

### Phase 2: Database (RDS)

**Resources Created:**
- RDS PostgreSQL 15.x Aurora Serverless v2
- Database subnet group (private subnets)
- Security group allowing internal VPC access on port 5432
- Secrets Manager secret for database credentials

**Connection Details:**
- Staging: `smuppy-staging-db.cluster-xxxxx.us-east-1.rds.amazonaws.com`
- Production: `smuppy-production-db.cluster-xxxxx.us-east-1.rds.amazonaws.com`

### Phase 3: Authentication (Cognito)

**Resources Created:**
- User Pool with email/phone sign-in
- User Pool Client (native app)
- Identity Pool for federated identities
- Apple Sign-In Identity Provider
- Google Sign-In Identity Provider

**Cognito Configuration:**
```typescript
{
  userPoolId: 'us-east-1_xxxxxxxx',
  userPoolClientId: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
  identityPoolId: 'us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
}
```

### Phase 4: Storage (S3 + CloudFront)

**Resources Created:**
- S3 Bucket for user uploads (photos, videos, audio)
- CloudFront Distribution for global CDN
- Origin Access Identity for secure S3 access
- CORS configuration for React Native uploads

**Bucket Structure:**
```
smuppy-{env}-storage/
├── users/{userId}/
│   ├── profile/
│   │   └── avatar.jpg
│   ├── photos/
│   ├── videos/
│   └── audio/
├── posts/{postId}/
│   ├── images/
│   └── videos/
└── conversations/{conversationId}/
    ├── images/
    ├── videos/
    └── audio/
```

### Phase 5: REST API Gateway

**Resources Created:**
- HTTP API Gateway (REST)
- Lambda functions for API handlers
- Cognito Authorizer
- API Routes

**API Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | /users/profile | Get user profile |
| PUT | /users/profile | Update profile |
| GET | /posts | List posts |
| POST | /posts | Create post |
| GET | /posts/{id} | Get post details |
| POST | /posts/{id}/like | Like a post |
| DELETE | /posts/{id}/like | Unlike a post |
| GET | /conversations | List conversations |
| POST | /conversations | Create conversation |
| GET | /conversations/{id}/messages | Get messages |
| POST | /conversations/{id}/messages | Send message |
| POST | /push-token | Register push token |
| DELETE | /push-token | Unregister push token |

**Staging URL:** `https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging`
**Production URL:** `https://xxxxx.execute-api.us-east-1.amazonaws.com/production`

### Phase 6: WebSocket API Gateway

**Resources Created:**
- WebSocket API Gateway
- Lambda integrations ($connect, $disconnect, $default, sendMessage)
- DynamoDB table for connection management
- Cognito Authorizer for WebSocket

**WebSocket Events:**

| Route | Description |
|-------|-------------|
| $connect | Establish WebSocket connection |
| $disconnect | Handle disconnection |
| sendMessage | Send message to conversation |
| typing | Send typing indicator |
| read | Mark messages as read |

**Staging URL:** `wss://35hlodqnj9.execute-api.us-east-1.amazonaws.com/staging`
**Production URL:** `wss://xxxxx.execute-api.us-east-1.amazonaws.com/production`

### Phase 7: Push Notifications

**Resources Created:**
- SNS Topic for notifications
- SNS Platform Application for iOS (APNS)
- Secrets Manager secrets for APNs credentials
- Secrets Manager secrets for FCM credentials

**iOS (APNs):**
- Using Token-Based Authentication (.p8 key)
- Key ID: `UP8PNB6DT5`
- Team ID: `V3S26WFD3Q`
- Bundle ID: `com.smuppy.app`
- Environment: Sandbox + Production

**Android (FCM):**
- Using Firebase Admin SDK
- Project: `smuppy-483804`
- Service Account credentials stored in Secrets Manager

## AWS Secrets

| Secret Name | Content |
|-------------|---------|
| `smuppy/{env}/db-credentials` | RDS database username/password |
| `smuppy/{env}/apns-credentials` | APNs .p8 key, Key ID, Team ID, Bundle ID |
| `smuppy/{env}/fcm-credentials` | Firebase service account JSON |

## Client-Side Integration

### Configuration File

`/src/config/aws-config.ts`:
```typescript
export const awsConfig: AWSConfig = {
  region: 'us-east-1',
  cognito: {
    userPoolId: 'us-east-1_xxxxxxxx',
    userPoolClientId: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
    identityPoolId: 'us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  },
  s3: {
    bucket: 'smuppy-staging-storage',
    region: 'us-east-1',
  },
  cloudFront: {
    distributionDomain: 'dxxxxxxxxxx.cloudfront.net',
  },
  api: {
    restEndpoint: 'https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging',
    graphqlEndpoint: 'https://xxxxx.appsync-api.us-east-1.amazonaws.com/graphql',
    websocketEndpoint: 'wss://35hlodqnj9.execute-api.us-east-1.amazonaws.com/staging',
  },
};
```

### Services

| File | Description |
|------|-------------|
| `/src/services/aws-auth.ts` | Cognito authentication (sign up, sign in, social auth) |
| `/src/services/aws-api.ts` | REST API calls |
| `/src/services/aws-storage.ts` | S3 uploads with presigned URLs |
| `/src/services/websocket.ts` | WebSocket connection management |

### Hooks

| File | Description |
|------|-------------|
| `/src/hooks/useWebSocket.ts` | WebSocket connection React hook |
| `/src/hooks/useConversations.ts` | Conversations and messages hook |

## Database Migrations

Migrations are located in `/aws-migration/scripts/`:

| File | Description |
|------|-------------|
| `migration-001-base-schema.sql` | Initial schema (users, profiles, posts) |
| `migration-002-conversations.sql` | Messaging tables |
| `migration-003-notifications.sql` | Notification preferences |
| `migration-004-followers.sql` | Follow system |
| `migration-005-reports.sql` | Content moderation |
| `migration-006-websocket-connections.sql` | WebSocket connection tracking |
| `migration-007-push-notifications.sql` | Push token management |

### Running Migrations

```bash
# Connect to staging database
aws rds-data execute-statement \
  --resource-arn "arn:aws:rds:us-east-1:ACCOUNT_ID:cluster:smuppy-staging-db" \
  --secret-arn "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:smuppy/staging/db-credentials" \
  --sql "$(cat migration-007-push-notifications.sql)"

# Or via psql
psql -h smuppy-staging-db.cluster-xxxxx.us-east-1.rds.amazonaws.com \
  -U smuppy_admin -d smuppy \
  -f migration-007-push-notifications.sql
```

## Deployment

### Prerequisites

1. AWS CLI configured with appropriate credentials
2. Node.js 18+ installed
3. CDK CLI installed: `npm install -g aws-cdk`

### Deploy Staging

```bash
cd aws-migration/infrastructure
npm install
npx cdk deploy SmuppyStack-staging --context environment=staging
```

### Deploy Production

```bash
cd aws-migration/infrastructure
npm install
npx cdk deploy SmuppyStack-production --context environment=production
```

### Update Secrets After Deployment

After CDK creates the secret placeholders, update with real credentials:

```bash
# iOS APNs credentials
aws secretsmanager update-secret \
  --secret-id smuppy/production/apns-credentials \
  --region us-east-1 \
  --secret-string '{
    "PlatformCredential": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
    "PlatformPrincipal": "UP8PNB6DT5",
    "ApplePlatformTeamID": "V3S26WFD3Q",
    "ApplePlatformBundleID": "com.smuppy.app"
  }'

# Android FCM credentials
aws secretsmanager update-secret \
  --secret-id smuppy/production/fcm-credentials \
  --region us-east-1 \
  --secret-string "$(cat ~/Downloads/firebase-service-account.json)"
```

## Lambda Functions

| Function | Purpose |
|----------|---------|
| `smuppy-{env}-api` | REST API handler (all routes) |
| `smuppy-{env}-ws-connect` | WebSocket $connect handler |
| `smuppy-{env}-ws-disconnect` | WebSocket $disconnect handler |
| `smuppy-{env}-ws-message` | WebSocket message handler |

### Lambda Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_SECRET_ARN` | RDS credentials secret ARN |
| `DATABASE_HOST` | RDS cluster endpoint |
| `DATABASE_NAME` | Database name |
| `S3_BUCKET` | Storage bucket name |
| `CLOUDFRONT_DOMAIN` | CDN domain |
| `USER_POOL_ID` | Cognito User Pool ID |
| `IOS_PLATFORM_APPLICATION_ARN` | SNS iOS platform ARN |
| `FCM_SECRET_ARN` | Firebase credentials secret ARN |
| `WEBSOCKET_API_ENDPOINT` | WebSocket callback URL |
| `CONNECTIONS_TABLE` | DynamoDB connections table |

## Cost Optimization

The infrastructure uses cost-optimized services:

- **RDS Aurora Serverless v2**: Scales to zero when not in use
- **Lambda**: Pay per invocation
- **API Gateway HTTP APIs**: Lower cost than REST APIs
- **NAT Gateway**: Single instance (consider NAT instances for dev)
- **CloudFront**: Pay per request + data transfer

## Monitoring

### CloudWatch Logs

All Lambda functions log to CloudWatch:
- `/aws/lambda/smuppy-{env}-api`
- `/aws/lambda/smuppy-{env}-ws-connect`
- `/aws/lambda/smuppy-{env}-ws-disconnect`
- `/aws/lambda/smuppy-{env}-ws-message`

### Useful Commands

```bash
# View API logs
aws logs tail /aws/lambda/smuppy-staging-api --follow

# View WebSocket logs
aws logs tail /aws/lambda/smuppy-staging-ws-message --follow
```

## Security

### Infrastructure Security ✅
- **WAF (Web Application Firewall)** - 8 rules active:
  - Rate limiting (2000 req/5min global, 100 req/5min for /auth)
  - SQL injection protection
  - OWASP Common Rule Set
  - Known bad inputs blocking
  - Anonymous IP/TOR blocking
  - IP reputation blocking
  - Linux-specific protections
- **VPC Flow Logs** - All network traffic logged
- **CloudTrail** - API audit logging with S3 storage (1 year retention)
- **Encryption at rest** - RDS and Redis encrypted
- **Encryption in transit** - TLS everywhere
- **Database isolation** - RDS in private isolated subnet
- **Security groups** - Least privilege (Lambda → DB only)
- **Secrets Manager** - All credentials stored securely
- **Secret rotation** - DB credentials auto-rotate every 30 days (production)

### Authentication Security ✅
- **Cognito Advanced Security** - ENFORCED mode (anomaly detection)
- **Short-lived tokens** - 15 min access tokens
- **Token revocation** - Logout invalidates tokens
- **Anti-enumeration** - No user existence leaks
- **Strong password policy** - 8+ chars, uppercase, lowercase, digit

### IAM Security ✅
- **Identity Pool roles** - Least privilege for authenticated/unauthenticated users
- **S3 access control** - Users can only access their own folders
- **Cognito sub isolation** - `${cognito-identity.amazonaws.com:sub}` in policies

### Monitoring ✅
- **CloudWatch Alarms** for:
  - API 5xx errors
  - API 4xx errors (potential attacks)
  - High latency (p95 > 3s)
  - Database CPU > 80%
  - Database connections threshold
  - WAF blocked requests (attack detection)
- **SNS alerts topic** - Email notifications for all alarms
- **X-Ray tracing** - Request tracing enabled

### Manual Security Tasks

#### 1. Verify SES Domain (Required for emails)
```bash
# In AWS Console: SES > Verified identities > Create identity
# Domain: smuppy.com
# Add the DNS records to your domain registrar
```

#### 2. Subscribe to Alerts
```bash
# Get the alerts topic ARN from stack outputs
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:smuppy-alerts-production \
  --protocol email \
  --notification-endpoint your-email@example.com
```

#### 3. Enable MFA for AWS Root Account
- AWS Console > IAM > Security credentials > MFA

## Troubleshooting

### Common Issues

1. **Lambda timeout**: Increase timeout in CDK stack
2. **Database connection refused**: Check security group rules
3. **Push notifications not delivered**: Verify APNs/FCM credentials
4. **WebSocket disconnects**: Check IAM permissions for API Gateway management

### Debug Commands

```bash
# Check stack status
aws cloudformation describe-stacks --stack-name SmuppyStack-staging

# List all resources
aws cloudformation list-stack-resources --stack-name SmuppyStack-staging

# Test API endpoint
curl -H "Authorization: Bearer TOKEN" \
  https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging/users/profile
```

## Future Improvements

1. **CI/CD Pipeline**: GitHub Actions for automated deployments
2. **CloudWatch Dashboards**: Visual dashboards for metrics (alarms already configured)
3. **Multi-region DR**: Disaster recovery in secondary region
4. **Custom Domain**: api.smuppy.com with ACM certificate
5. **S3 Cross-Region Replication**: Media backup to secondary region

## Files Structure

```
aws-migration/
├── infrastructure/
│   ├── bin/
│   │   └── smuppy-infra.ts          # CDK app entry point
│   ├── lib/
│   │   └── smuppy-stack.ts          # Main CDK stack
│   ├── cdk.json                      # CDK configuration
│   ├── package.json
│   └── tsconfig.json
├── lambda/
│   ├── api/
│   │   ├── index.ts                  # API Lambda entry
│   │   ├── routes/                   # API route handlers
│   │   ├── services/                 # Business logic
│   │   │   └── push-notification.ts  # Push notification service
│   │   └── package.json
│   └── websocket/
│       ├── connect.ts                # $connect handler
│       ├── disconnect.ts             # $disconnect handler
│       ├── message.ts                # Message handler
│       └── package.json
├── scripts/
│   ├── migration-001-base-schema.sql
│   ├── migration-002-conversations.sql
│   ├── migration-003-notifications.sql
│   ├── migration-004-followers.sql
│   ├── migration-005-reports.sql
│   ├── migration-006-websocket-connections.sql
│   └── migration-007-push-notifications.sql
└── README.md                         # This file
```

## Credentials Reference

### Apple Developer (iOS Push)
- **Key ID**: UP8PNB6DT5
- **Team ID**: V3S26WFD3Q
- **Bundle ID**: com.smuppy.app
- **Key File**: AuthKey_UP8PNB6DT5.p8

### Firebase (Android Push)
- **Project ID**: smuppy-483804
- **Service Account**: smuppy-483804-firebase-adminsdk-fbsvc-716a30af6a.json

### AWS Resources
- **Region**: us-east-1
- **Account**: Check with `aws sts get-caller-identity`

---

*Last Updated: January 2026*
*Migration completed by: Claude Code Assistant*
