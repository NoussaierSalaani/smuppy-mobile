/**
 * Supabase Edge Function: Check Deleted Account
 * Checks if an email belongs to a recently deleted account
 *
 * Returns:
 * - is_deleted: boolean
 * - days_remaining: number (days until email is freed)
 * - can_reactivate: boolean (true if within 30 day window)
 * - deleted_at: timestamp
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

  // Create admin client
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Check if email exists in deleted_accounts
    const { data, error } = await supabaseAdmin
      .from('deleted_accounts')
      .select('email, deleted_at, hard_delete_at, full_name')
      .eq('email', email)
      .single();

    if (error || !data) {
      // Email not in deleted accounts - not deleted
      return new Response(
        JSON.stringify({
          is_deleted: false,
          days_remaining: 0,
          can_reactivate: false,
          deleted_at: null,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate days remaining
    const now = new Date();
    const hardDeleteAt = new Date(data.hard_delete_at);
    const daysRemaining = Math.max(0, Math.ceil((hardDeleteAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const canReactivate = hardDeleteAt > now;

    return new Response(
      JSON.stringify({
        is_deleted: true,
        days_remaining: daysRemaining,
        can_reactivate: canReactivate,
        deleted_at: data.deleted_at,
        full_name: data.full_name,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Check deleted account error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
