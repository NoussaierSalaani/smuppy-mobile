#!/bin/bash
# Critical Migrations Fix Script
# Run this after deploying the CDK fixes

set -e

ADMIN_KEY=${1:-$(aws secretsmanager get-secret-value --secret-id smuppy-admin-api-key-staging --region us-east-1 --query SecretString --output text)}
ADMIN_API_URL="https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging/admin/migrate"

echo "=== SMUPPY CRITICAL MIGRATIONS ==="
echo ""

# Migration 041: Add expires_at to peaks
echo "[1/4] Adding expires_at column to peaks table..."
curl -s -X POST "$ADMIN_API_URL" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-ddl",
    "sql": "ALTER TABLE peaks ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;"
  }' | jq -r '.message // .error // "OK"'

# Migration 041b: Create index
echo "[2/4] Creating index on expires_at..."
curl -s -X POST "$ADMIN_API_URL" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-ddl",
    "sql": "CREATE INDEX IF NOT EXISTS idx_peaks_expires_at ON peaks(expires_at);"
  }' | jq -r '.message // .error // "OK"'

# Migration 042: Add saved_to_profile
echo "[3/4] Adding saved_to_profile column to peaks table..."
curl -s -X POST "$ADMIN_API_URL" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-ddl",
    "sql": "ALTER TABLE peaks ADD COLUMN IF NOT EXISTS saved_to_profile BOOLEAN DEFAULT NULL;"
  }' | jq -r '.message // .error // "OK"'

# Migration 042b: Create index
echo "[4/4] Creating index on saved_to_profile..."
curl -s -X POST "$ADMIN_API_URL" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-ddl",
    "sql": "CREATE INDEX IF NOT EXISTS idx_peaks_saved_decision ON peaks(author_id, expires_at) WHERE saved_to_profile IS NULL;"
  }' | jq -r '.message // .error // "OK"'

echo ""
echo "=== VERIFICATION ==="

# Verify peaks columns
echo "Verifying peaks table columns..."
curl -s -X POST "$ADMIN_API_URL" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "action": "run-sql",
    "sql": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '"'"'peaks'"'"' ORDER BY ordinal_position;"
  }' | jq -r '.data[] | "  - " + .column_name + " (" + .data_type + ")"' 2>/dev/null || echo "  Could not verify (check manually)"

echo ""
echo "=== MIGRATIONS COMPLETE ==="
echo ""
echo "IMPORTANT: If any step above shows an error, please:"
echo "1. Check the admin API key is correct"
echo "2. Run the failed migration manually"
echo "3. Contact support if the issue persists"
