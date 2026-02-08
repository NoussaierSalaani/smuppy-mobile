-- =====================================================
-- CRITICAL FIX: Unify subscriptions tables
-- Problem: subscriptions.ts uses 'subscriptions' table
--          webhook.ts uses 'channel_subscriptions' table
-- Solution: Migrate data and ensure consistency
-- =====================================================

-- Step 1: Check if we have data in the old subscriptions table
SELECT 'Subscriptions in old table' as check_type, COUNT(*) as count FROM subscriptions;
SELECT 'Subscriptions in correct table' as check_type, COUNT(*) as count FROM channel_subscriptions;

-- Step 2: Migrate any data from old table to new table (if needed)
-- This migrates data that was created via the API but not via Stripe webhook
INSERT INTO channel_subscriptions (
    fan_id, 
    creator_id, 
    stripe_subscription_id, 
    price_cents, 
    status,
    created_at,
    updated_at
)
SELECT 
    subscriber_id,
    creator_id,
    stripe_subscription_id,
    0, -- price_cents unknown, will be updated by webhook
    status,
    created_at,
    updated_at
FROM subscriptions s
WHERE NOT EXISTS (
    SELECT 1 FROM channel_subscriptions cs 
    WHERE cs.stripe_subscription_id = s.stripe_subscription_id
)
ON CONFLICT (stripe_subscription_id) DO NOTHING;

-- Step 3: Verify the migration
SELECT 'After migration - channel_subscriptions' as check_type, COUNT(*) as count FROM channel_subscriptions;

-- Step 4: Create index for performance if not exists
CREATE INDEX IF NOT EXISTS idx_channel_subs_fan ON channel_subscriptions(fan_id);
CREATE INDEX IF NOT EXISTS idx_channel_subs_creator ON channel_subscriptions(creator_id);
CREATE INDEX IF NOT EXISTS idx_channel_subs_stripe ON channel_subscriptions(stripe_subscription_id);

-- =====================================================
-- ROLLBACK (only if needed):
-- DROP INDEX IF EXISTS idx_channel_subs_fan;
-- DROP INDEX IF EXISTS idx_channel_subs_creator;
-- DELETE FROM channel_subscriptions WHERE price_cents = 0; -- Remove migrated entries
-- =====================================================
