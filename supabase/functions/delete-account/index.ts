/**
 * Supabase Edge Function: Delete Account (Soft Delete)
 * GDPR compliant - 30 day grace period before permanent deletion
 *
 * Flow:
 * 1. Store account info in deleted_accounts table
 * 2. Delete user profile
 * 3. Delete auth user (makes email unusable until hard delete)
 *
 * After 30 days, cleanup job removes from deleted_accounts, freeing the email
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://smuppy.com',
  'https://www.smuppy.com',
  'https://app.smuppy.com',
  'http://localhost:8081',
  'http://localhost:19006',
];

const GRACE_PERIOD_DAYS = 30;

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
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

  // Verify authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.replace('Bearer ', '');

  // Create client with user's token to verify identity
  const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Get the authenticated user
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid session' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Parse request body
  let body: { userId?: string; reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify the user is deleting their own account
  if (body.userId !== user.id) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: Can only delete your own account' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Create admin client with service role
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get user profile info before deletion
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, username, avatar_url')
      .eq('id', user.id)
      .single();

    // Calculate hard delete date (30 days from now)
    const hardDeleteAt = new Date();
    hardDeleteAt.setDate(hardDeleteAt.getDate() + GRACE_PERIOD_DAYS);

    // Step 1: Store in deleted_accounts table for GDPR compliance
    const { error: insertError } = await supabaseAdmin
      .from('deleted_accounts')
      .upsert({
        user_id: user.id,
        email: user.email?.toLowerCase(),
        full_name: profile?.full_name || user.user_metadata?.full_name || null,
        deleted_at: new Date().toISOString(),
        hard_delete_at: hardDeleteAt.toISOString(),
        reason: body.reason || 'user_requested',
        metadata: {
          username: profile?.username,
          avatar_url: profile?.avatar_url,
          provider: user.app_metadata?.provider,
        },
      }, {
        onConflict: 'email',
      });

    if (insertError) {
      console.error('Failed to store deleted account:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to process deletion request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Delete user profile
    await supabaseAdmin.from('profiles').delete().eq('id', user.id);

    // Step 3: Delete related data (posts, comments, etc.)
    // Add more cleanup here as needed for your app
    // await supabaseAdmin.from('posts').delete().eq('user_id', user.id);
    // await supabaseAdmin.from('comments').delete().eq('user_id', user.id);

    // Step 4: Delete the auth user
    // This makes the email "taken" until we clean up deleted_accounts after 30 days
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('Delete user error:', deleteError);
      // Rollback: remove from deleted_accounts
      await supabaseAdmin.from('deleted_accounts').delete().eq('user_id', user.id);
      return new Response(
        JSON.stringify({ error: 'Failed to delete account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account scheduled for deletion',
        grace_period_days: GRACE_PERIOD_DAYS,
        hard_delete_at: hardDeleteAt.toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Delete account error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
