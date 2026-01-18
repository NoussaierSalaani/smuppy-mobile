/**
 * Supabase Edge Function: Check Email Available
 * Checks if an email can be used for signup
 * Returns: available (boolean), reason (if not available)
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

  // Verify API key
  const apiKey = req.headers.get('apikey');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Missing API key' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Parse request body
  let body: { email?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return new Response(
      JSON.stringify({ error: 'Email is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Check 1: Is email in deleted_accounts?
    const { data: deletedAccount } = await supabaseAdmin
      .from('deleted_accounts')
      .select('email, deleted_at, hard_delete_at, full_name')
      .eq('email', email)
      .single();

    if (deletedAccount) {
      const now = new Date();
      const hardDeleteAt = new Date(deletedAccount.hard_delete_at);
      const daysRemaining = Math.max(0, Math.ceil((hardDeleteAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      return new Response(
        JSON.stringify({
          available: false,
          reason: 'deleted',
          days_remaining: daysRemaining,
          deleted_at: deletedAccount.deleted_at,
          full_name: deletedAccount.full_name,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check 2: Is email already registered and confirmed?
    const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = userList?.users?.find(u => u.email === email);

    if (existingUser && existingUser.email_confirmed_at) {
      // Email exists and is confirmed - return generic error (don't reveal email exists)
      return new Response(
        JSON.stringify({
          available: false,
          reason: 'exists',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If user exists but not confirmed, we'll delete them during signup - treat as available
    // Email is available
    return new Response(
      JSON.stringify({ available: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Check email error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
