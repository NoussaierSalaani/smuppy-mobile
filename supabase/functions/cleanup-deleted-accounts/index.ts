/**
 * Supabase Edge Function: Cleanup Deleted Accounts
 * Permanently removes accounts that have passed their 30-day grace period
 *
 * This function should be called by a cron job (e.g., daily)
 * You can set up a cron job in Supabase dashboard or use pg_cron
 *
 * Example cron (daily at 3 AM):
 * SELECT cron.schedule('cleanup-deleted-accounts', '0 3 * * *',
 *   $$SELECT cleanup_deleted_accounts()$$
 * );
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://smuppy.com',
  'https://www.smuppy.com',
  'https://app.smuppy.com',
];

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
};

serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify authorization (service role or secret key)
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');

  // Allow if: has valid service key header OR matches cron secret
  const isAuthorized =
    (authHeader && authHeader.includes(supabaseServiceKey)) ||
    (cronSecret && authHeader === `Bearer ${cronSecret}`);

  if (!isAuthorized) {
    // Also allow calls from Supabase itself (internal cron)
    const apiKey = req.headers.get('apikey');
    if (apiKey !== supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // Create admin client
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get all accounts past their grace period
    const { data: expiredAccounts, error: fetchError } = await supabaseAdmin
      .from('deleted_accounts')
      .select('id, email, user_id, deleted_at')
      .lte('hard_delete_at', new Date().toISOString());

    if (fetchError) {
      console.error('Error fetching expired accounts:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch expired accounts' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!expiredAccounts || expiredAccounts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No accounts to clean up',
          cleaned_count: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete each expired account from deleted_accounts table
    // This frees up the email for reuse
    const deleteIds = expiredAccounts.map((a) => a.id);

    const { error: deleteError } = await supabaseAdmin
      .from('deleted_accounts')
      .delete()
      .in('id', deleteIds);

    if (deleteError) {
      console.error('Error deleting expired accounts:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to clean up accounts' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the cleanup
    console.log(`Cleaned up ${expiredAccounts.length} deleted accounts:`, expiredAccounts.map((a) => a.email));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleaned up ${expiredAccounts.length} account(s)`,
        cleaned_count: expiredAccounts.length,
        cleaned_emails: expiredAccounts.map((a) => a.email),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Cleanup error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
