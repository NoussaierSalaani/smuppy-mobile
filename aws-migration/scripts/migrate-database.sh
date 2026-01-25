#!/bin/bash

# ============================================
# Migrate Supabase Database to Aurora
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   📦 DATABASE MIGRATION: Supabase → Aurora   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Configuration - Update these values!
SUPABASE_HOST="db.wbgfaeytioxnkdsuvvlx.supabase.co"
SUPABASE_USER="postgres"
SUPABASE_DB="postgres"
SUPABASE_PORT="5432"

# Get Aurora endpoint from CDK output
AURORA_HOST=$(aws cloudformation describe-stacks \
  --stack-name SmuppyStack-staging \
  --query "Stacks[0].Outputs[?OutputKey=='DatabaseEndpoint'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [ -z "$AURORA_HOST" ]; then
    echo -e "${RED}❌ Could not find Aurora endpoint. Deploy CDK stack first.${NC}"
    exit 1
fi

# Get database credentials from Secrets Manager
echo -e "${YELLOW}🔐 Fetching Aurora credentials...${NC}"
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name SmuppyStack-staging \
  --query "Stacks[0].Outputs[?contains(OutputKey,'DBCredentials')].OutputValue" \
  --output text 2>/dev/null || echo "")

if [ -n "$SECRET_ARN" ]; then
    AURORA_CREDS=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)
    AURORA_USER=$(echo $AURORA_CREDS | jq -r '.username')
    AURORA_PASSWORD=$(echo $AURORA_CREDS | jq -r '.password')
else
    # Manual input
    read -p "Aurora username: " AURORA_USER
    read -s -p "Aurora password: " AURORA_PASSWORD
    echo ""
fi

AURORA_DB="smuppy"
AURORA_PORT="5432"

# Backup directory
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo ""
echo -e "${YELLOW}📤 Step 1: Exporting Supabase schema...${NC}"
read -s -p "Enter Supabase password: " SUPABASE_PASSWORD
echo ""

PGPASSWORD=$SUPABASE_PASSWORD pg_dump \
  -h $SUPABASE_HOST \
  -U $SUPABASE_USER \
  -d $SUPABASE_DB \
  -p $SUPABASE_PORT \
  --schema-only \
  --no-owner \
  --no-privileges \
  --no-comments \
  --exclude-schema=auth \
  --exclude-schema=storage \
  --exclude-schema=realtime \
  --exclude-schema=extensions \
  --exclude-schema=supabase_functions \
  > "$BACKUP_DIR/schema.sql"

echo -e "${GREEN}✅ Schema exported to $BACKUP_DIR/schema.sql${NC}"

echo ""
echo -e "${YELLOW}📤 Step 2: Exporting Supabase data...${NC}"

PGPASSWORD=$SUPABASE_PASSWORD pg_dump \
  -h $SUPABASE_HOST \
  -U $SUPABASE_USER \
  -d $SUPABASE_DB \
  -p $SUPABASE_PORT \
  --data-only \
  --no-owner \
  --no-privileges \
  --exclude-schema=auth \
  --exclude-schema=storage \
  --exclude-schema=realtime \
  --exclude-schema=extensions \
  --exclude-schema=supabase_functions \
  > "$BACKUP_DIR/data.sql"

echo -e "${GREEN}✅ Data exported to $BACKUP_DIR/data.sql${NC}"

echo ""
echo -e "${YELLOW}📥 Step 3: Importing schema to Aurora...${NC}"

# Clean schema for Aurora compatibility
sed -i '' 's/SECURITY DEFINER//g' "$BACKUP_DIR/schema.sql"
sed -i '' 's/SET search_path = .*//g' "$BACKUP_DIR/schema.sql"
sed -i '' '/^--/d' "$BACKUP_DIR/schema.sql"

PGPASSWORD=$AURORA_PASSWORD psql \
  -h $AURORA_HOST \
  -U $AURORA_USER \
  -d $AURORA_DB \
  -p $AURORA_PORT \
  -f "$BACKUP_DIR/schema.sql"

echo -e "${GREEN}✅ Schema imported to Aurora${NC}"

echo ""
echo -e "${YELLOW}📥 Step 4: Importing data to Aurora...${NC}"

PGPASSWORD=$AURORA_PASSWORD psql \
  -h $AURORA_HOST \
  -U $AURORA_USER \
  -d $AURORA_DB \
  -p $AURORA_PORT \
  -f "$BACKUP_DIR/data.sql"

echo -e "${GREEN}✅ Data imported to Aurora${NC}"

echo ""
echo -e "${YELLOW}🔧 Step 5: Creating indexes...${NC}"

PGPASSWORD=$AURORA_PASSWORD psql \
  -h $AURORA_HOST \
  -U $AURORA_USER \
  -d $AURORA_DB \
  -p $AURORA_PORT \
  << 'EOF'
-- Performance indexes for Aurora
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_author_created
  ON posts(author_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_visibility_created
  ON posts(visibility, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follows_follower
  ON follows(follower_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follows_following
  ON follows(following_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_likes_post
  ON likes(post_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_post
  ON comments(post_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_username
  ON profiles(username);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_search
  ON profiles USING gin(to_tsvector('english', username || ' ' || COALESCE(full_name, '')));

-- Analyze tables for query optimization
ANALYZE;
EOF

echo -e "${GREEN}✅ Indexes created${NC}"

echo ""
echo -e "${YELLOW}📊 Step 6: Verifying migration...${NC}"

# Count rows in each table
PGPASSWORD=$AURORA_PASSWORD psql \
  -h $AURORA_HOST \
  -U $AURORA_USER \
  -d $AURORA_DB \
  -p $AURORA_PORT \
  -c "
SELECT
  schemaname,
  relname as table_name,
  n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;
"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ✅ DATABASE MIGRATION COMPLETE!          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "Backup files saved in: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "  1. Verify data integrity"
echo "  2. Migrate users to Cognito"
echo "  3. Update app configuration"
echo ""
