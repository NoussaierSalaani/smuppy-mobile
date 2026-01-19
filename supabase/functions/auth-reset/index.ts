/**
 * Supabase Edge Function: Auth Password Reset (rate limited)
 * Sends password reset email via Resend API
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
const ENDPOINT_NAME = 'auth_reset';

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

// Send password reset email via Resend API
const sendResetEmail = async (email: string, resetLink: string, resendApiKey: string): Promise<boolean> => {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Smuppy <noreply@smuppy.com>',
        to: email,
        subject: 'Reset Your Smuppy Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #00cdb5; font-size: 36px; margin: 0;">Smuppy</h1>
            </div>
            <h2 style="text-align: center; color: #0a252f;">Reset your password</h2>
            <p style="text-align: center; font-size: 16px; color: #666;">You requested to reset your password. Click the button below to create a new one:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #00cdb5 0%, #0066ac 100%); color: #ffffff; font-size: 16px; font-weight: bold; padding: 15px 40px; border-radius: 12px; text-decoration: none;">Reset Password</a>
            </div>
            <p style="text-align: center; color: #999; font-size: 14px;">This link expires in 1 hour.</p>
            <p style="text-align: center; color: #999; font-size: 14px;">If the button doesn't work, copy and paste this link:<br><a href="${resetLink}" style="color: #00cdb5; word-break: break-all;">${resetLink}</a></p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="text-align: center; color: #999; font-size: 12px;">If you didn't request this, please ignore this email. Your password will remain unchanged.</p>
          </div>
        `,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Resend error:', error);
    return false;
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
  const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !rateLimitUserId) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const apiKey = req.headers.get('apikey');
  if (!apiKey) {
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

  // Generate password reset link using admin API
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: {
      redirectTo: 'https://wbgfaeytioxnkdsuvvlx.supabase.co/functions/v1/reset-redirect',
    },
  });

  // SECURITY: Always return success regardless of whether email exists
  // This prevents email enumeration attacks
  if (linkError || !linkData) {
    // Don't reveal if email exists or not
    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }

  // Send email via Resend if we have the API key
  if (resendApiKey && linkData.properties?.action_link) {
    const sent = await sendResetEmail(email, linkData.properties.action_link, resendApiKey);
    if (!sent) {
      console.error('Failed to send reset email via Resend');
    }
  }

  return new Response(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    }
  );
});
