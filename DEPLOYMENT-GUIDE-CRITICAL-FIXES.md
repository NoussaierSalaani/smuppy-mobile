# 🚨 CRITICAL FIXES DEPLOYMENT GUIDE

## Overview
This guide covers the deployment of critical bug fixes identified in the deep audit:
1. **Peaks creation failing** - Missing database columns
2. **Subscriptions not working** - Table mismatch between API and webhook
3. **Follow system issues** - Double implementation

---

## Pre-Deployment Checklist

- [ ] You have AWS CLI configured with appropriate credentials
- [ ] You have the admin API key for staging/production
- [ ] You have access to deploy CDK stacks
- [ ] You have tested the changes locally (if possible)

---

## Step 1: Deploy Lambda Code Fixes

### 1.1 Deploy the Fixed Lambda Functions

```bash
cd aws-migration/infrastructure

# Install dependencies (if needed)
npm install

# Deploy only the Lambda stack (faster than full deploy)
npx cdk deploy SmuppyStack-staging-lambda --require-approval never

# Or deploy full stack if needed
# npx cdk deploy SmuppyStack-staging --require-approval never
```

### 1.2 Verify Deployment

```bash
# Check if the Lambda was updated
aws lambda get-function --function-name smuppy-staging-payments-subscriptions --region us-east-1
```

---

## Step 2: Execute Database Migrations

### 2.1 Get Admin API Key

```bash
# For staging
ADMIN_KEY=$(aws secretsmanager get-secret-value \
  --secret-id smuppy-admin-api-key-staging \
  --region us-east-1 \
  --query SecretString \
  --output text)

echo "Admin key retrieved: ${ADMIN_KEY:0:10}..."
```

### 2.2 Run Critical Migrations Script

```bash
cd aws-migration/scripts

# Run the migration script
./execute-critical-migrations.sh "$ADMIN_KEY"
```

### 2.3 Manual Migration (if script fails)

```bash
# Migration 041: Add expires_at
ADMIN_KEY="your-key-here"

# Add expires_at column
curl -X POST "https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging/admin/migrate" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-ddl",
    "sql": "ALTER TABLE peaks ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;"
  }'

# Create index
curl -X POST "https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging/admin/migrate" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-ddl",
    "sql": "CREATE INDEX IF NOT EXISTS idx_peaks_expires_at ON peaks(expires_at);"
  }'

# Migration 042: Add saved_to_profile
curl -X POST "https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging/admin/migrate" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-ddl",
    "sql": "ALTER TABLE peaks ADD COLUMN IF NOT EXISTS saved_to_profile BOOLEAN DEFAULT NULL;"
  }'

# Create index
curl -X POST "https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging/admin/migrate" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-ddl",
    "sql": "CREATE INDEX IF NOT EXISTS idx_peaks_saved_decision ON peaks(author_id, expires_at) WHERE saved_to_profile IS NULL;"
  }'
```

### 2.4 Fix Subscriptions Table Unification

```bash
# Run the SQL to unify subscriptions tables
curl -X POST "https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging/admin/migrate" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-ddl",
    "sql": "INSERT INTO channel_subscriptions (fan_id, creator_id, stripe_subscription_id, price_cents, status, created_at, updated_at) SELECT subscriber_id, creator_id, stripe_subscription_id, 0, status, created_at, updated_at FROM subscriptions s WHERE NOT EXISTS (SELECT 1 FROM channel_subscriptions cs WHERE cs.stripe_subscription_id = s.stripe_subscription_id) ON CONFLICT (stripe_subscription_id) DO NOTHING;"
  }'
```

---

## Step 3: Verify Fixes

### 3.1 Verify Peaks Table Schema

```bash
curl -X POST "https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging/admin/migrate" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-sql",
    "sql": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '"'"'peaks'"'"' ORDER BY ordinal_position;"
  }'
```

**Expected columns:** `expires_at` and `saved_to_profile` should be present.

### 3.2 Verify Subscriptions Table

```bash
curl -X POST "https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging/admin/migrate" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-sql",
    "sql": "SELECT COUNT(*) as count FROM channel_subscriptions;"
  }'
```

### 3.3 Test Lambda Functions

```bash
# Test payments/subscriptions Lambda
aws lambda invoke \
  --function-name smuppy-staging-payments-subscriptions \
  --payload '{"action":"list"}' \
  --region us-east-1 \
  /tmp/test-subscriptions.json

cat /tmp/test-subscriptions.json
```

---

## Step 4: Production Deployment

### 4.1 Merge to Main

```bash
# After testing in staging
git checkout main
git merge --squash fix/critical-bugs-subscriptions-and-peaks
git commit -m "fix(payments,peaks): critical bug fixes for subscriptions and peaks"
git push origin main
```

### 4.2 Deploy to Production

```bash
cd aws-migration/infrastructure

# Deploy production stack
npx cdk deploy SmuppyStack-production --require-approval never

# Execute migrations on production (use production admin key)
ADMIN_KEY=$(aws secretsmanager get-secret-value \
  --secret-id smuppy-admin-api-key-production \
  --region us-east-1 \
  --query SecretString \
  --output text)

# Run migrations script with production key
../scripts/execute-critical-migrations.sh "$ADMIN_KEY"
```

---

## Step 5: Post-Deployment Testing

### 5.1 Test Peaks Creation

```bash
# Create a test peak via API
curl -X POST "https://90pg0i63ff.execute-api.us-east-1.amazonaws.com/staging/peaks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "videoUrl": "https://test-cdn.smuppy.com/test-video.mp4",
    "thumbnailUrl": "https://test-cdn.smuppy.com/test-thumb.jpg",
    "caption": "Test peak after fix",
    "duration": 10
  }'
```

### 5.2 Test Follow/Unfollow

```bash
# Follow a user
curl -X POST "https://90pg0i63ff.execute-api.us-east-1.amazonaws.com/staging/follows" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{"followingId": "test-user-id"}'
```

### 5.3 Test Subscription Flow

1. Open the app
2. Navigate to a creator profile
3. Click "Subscribe"
4. Complete payment flow
5. Verify subscription appears in "My Subscriptions"

---

## Troubleshooting

### Issue: "Unauthorized" on migrations

**Cause:** Admin key is incorrect or expired.

**Fix:**
```bash
# Get fresh admin key from Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id smuppy-admin-api-key-staging \
  --region us-east-1

# If key is rotated, update it in your environment
```

### Issue: Peaks still failing after migration

**Cause:** Lambda code not deployed or caching issue.

**Fix:**
```bash
# Redeploy Lambda
npx cdk deploy SmuppyStack-staging-lambda --force

# Test Lambda directly
aws lambda invoke \
  --function-name smuppy-staging-peaks-create \
  --payload '{"body": "{\"videoUrl\":\"test\",\"duration\":10}"}' \
  --region us-east-1 \
  /tmp/test-peaks.json
```

### Issue: Subscriptions still not working

**Cause:** Table mismatch not fully resolved.

**Fix:**
```bash
# Verify which table has data
curl -X POST "https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging/admin/migrate" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-sql",
    "sql": "SELECT '"'"'old_table'"'"' as source, COUNT(*) from subscriptions UNION ALL SELECT '"'"'new_table'"'"' as source, COUNT(*) from channel_subscriptions;"
  }'
```

---

## Rollback Plan

If issues occur after deployment:

```bash
# Rollback Lambda changes
git revert HEAD
git push origin main
npx cdk deploy SmuppyStack-staging --require-approval never

# Note: Database migrations cannot be rolled back easily
# Contact the team before attempting any DB rollback
```

---

## Summary of Changes

| Component | Change | Reason |
|-----------|--------|--------|
| `subscriptions.ts` | Use `channel_subscriptions` table | Align with webhook.ts |
| Peaks table | Add `expires_at` column | Required for peak creation |
| Peaks table | Add `saved_to_profile` column | Required for peak lifecycle |
| Subscriptions data | Migrate to `channel_subscriptions` | Unify data model |

---

## Contact

If you encounter issues during deployment:
- Check CloudWatch logs: `/aws/lambda/smuppy-staging-*`
- Review API Gateway logs in CloudWatch
- Contact the infrastructure team

---

**Last Updated:** February 2026  
**Author:** Deep Audit Team  
**Status:** Ready for Deployment
