/**
 * Supabase Edge Function: Auth Resend Verification Email (rate limited)
 *
 * Anti-enum: always return { success: true } on non-rate-limit cases,
 * even if the underlying resend fails (e.g., email not found).
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RATE_LIMIT_MAX_REQUESTS = 3;
const RATE_LIMIT_WINDOW_MINUTES = 5;
const ENDPOINT_NAME = 'auth_resend';

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
};

const isAllowedOrigin = (origin: string | null) => {
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
};

const hashValue = async (value: string): Promise<string> => {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

const getRateLimitEndpoint = async (action: string, email: string): Promise<string> => {
  const hash = await hashValue(email);
  return `${action}:${hash}`;
};

interface RateLimitResult {
  allowed: boolean;
  current_count: number;
  max_requests: number;
  remaining?: number;
  retry_after?: number;
  message?: string;
}

const checkRateLimit = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  rateLimitUserId: string,
  endpoint: string
): Promise<RateLimitResult> => {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
      p_user_id: rateLimitUserId,
      p_endpoint: endpoint,
      p_max_requests: RATE_LIMIT_MAX_REQUESTS,
      p_window_minutes: RATE_LIMIT_WINDOW_MINUTES,
    });

    if (error) {
      return { allowed: true, current_count: 0, max_requests: RATE_LIMIT_MAX_REQUESTS };
    }

    return data as RateLimitResult;
  } catch {
    return { allowed: true, current_count: 0, max_requests: RATE_LIMIT_MAX_REQUESTS };
  }
};

serve(async (req: Request) => {
  const origin = req.headers.get('Origin');

  if (!isAllowedOrigin(origin)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

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
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const rateLimitUserId = Deno.env.get('RATE_LIMIT_USER_ID') || '';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !rateLimitUserId) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const apiKey = req.headers.get('apikey');
  const authHeader = req.headers.get('Authorization');
  const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (apiKey !== supabaseAnonKey && bearerKey !== supabaseAnonKey) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: { email?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_REGEX.test(email)) {
    return new Response(
      JSON.stringify({ error: 'Invalid request' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

  const endpoint = await getRateLimitEndpoint(ENDPOINT_NAME, email);
  const rateLimitResult = await checkRateLimit(supabaseAdmin, rateLimitUserId, endpoint);

  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many attempts. Please try again later.' }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimitResult.retry_after || 60),
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // Anti-enum: never expose whether the email exists or not
  try {
    await supabaseAnon.auth.resend({ type: 'signup', email });
  } catch {
    // ignore
  }

  return new Response(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    }
  );
});
