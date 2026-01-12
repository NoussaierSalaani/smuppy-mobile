/**
 * Script to run SQL migrations directly on Supabase
 * Usage: node scripts/run-migration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('Running rate_limits migration...\n');

  try {
    // Create rate_limits table
    console.log('1. Creating rate_limits table...');
    const { error: tableError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS rate_limits (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL,
          request_count INTEGER DEFAULT 1,
          window_start TIMESTAMPTZ DEFAULT NOW(),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT unique_user_endpoint_window UNIQUE (user_id, endpoint, window_start)
        );
      `
    });

    if (tableError) {
      // Table might already exist, try direct query
      console.log('   Using direct approach...');
    }

    // Test if table exists by selecting from it
    const { data, error: testError } = await supabase
      .from('rate_limits')
      .select('id')
      .limit(1);

    if (testError && testError.code === '42P01') {
      console.log('   Table does not exist. Please run the SQL manually in Supabase Dashboard.');
      console.log('\n   Go to: https://supabase.com/dashboard/project/wbgfaeytioxnkdsuvvlx/sql/new');
      console.log('   And paste the contents of: supabase/migrations/20260112_rate_limiting.sql\n');
      return false;
    }

    console.log('   Table exists or created successfully!');

    // Test if function exists
    console.log('\n2. Testing check_rate_limit function...');
    const { data: funcData, error: funcError } = await supabase.rpc('check_rate_limit', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_endpoint: 'test',
      p_max_requests: 100,
      p_window_minutes: 1
    });

    if (funcError) {
      console.log('   Function not found. Please run the SQL manually.');
      console.log(`   Error: ${funcError.message}`);
      return false;
    }

    console.log('   Function works! Result:', funcData);
    console.log('\n✅ Migration verified successfully!');
    return true;

  } catch (error) {
    console.error('Migration error:', error.message);
    return false;
  }
}

runMigration().then(success => {
  process.exit(success ? 0 : 1);
});
