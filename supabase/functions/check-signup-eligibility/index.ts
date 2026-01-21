/**
 * Supabase Edge Function: Check Signup Eligibility
 *
 * Combined endpoint for signup validation - performs ALL checks in a single call:
 * 1. Email format validation
 * 2. Typo detection (gmail.con -> gmail.com)
 * 3. Disposable email blocking
 * 4. MX record verification
 * 5. Check if email is deleted (waiting period)
 * 6. Check if email is already registered
 *
 * Returns: { eligible: boolean, reason?: string, ...details }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Allowed origins for CORS
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

// Known disposable email domains (same as validate-email)
const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'temp-mail.org', 'tempmail.net', 'temp-mail.io',
  'guerrillamail.com', 'guerrillamail.org', 'guerrillamail.net', 'guerrillamail.biz',
  'mailinator.com', 'mailinator.net', 'mailinator.org',
  '10minutemail.com', '10minutemail.net', '10minmail.com',
  'throwaway.email', 'throwamail.com', 'throwawaymail.com',
  'fakeinbox.com', 'fakemailgenerator.com', 'fakemail.net',
  'trashmail.com', 'trashmail.net', 'trashmail.org',
  'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'dispostable.com', 'disposablemail.com', 'disposable.email',
  'maildrop.cc', 'mailnesia.com', 'mailcatch.com',
  'getnada.com', 'nada.email', 'tempinbox.com',
  'mohmal.com', 'sharklasers.com', 'spam4.me',
  'grr.la', 'guerrillamailblock.com', 'pokemail.net',
  'spamgourmet.com', 'mytrashmail.com', 'mt2009.com',
  'thankyou2010.com', 'trash2009.com', 'mt2014.com',
  'mailsac.com', 'harakirimail.com', 'discard.email',
  'spamex.com', 'emailondeck.com', 'tempr.email',
  'dropmail.me', 'getairmail.com', 'meltmail.com',
  'mailnull.com', 'e4ward.com', 'incognitomail.org',
  'mailexpire.com', 'spamfree24.org', 'jetable.org',
  'mail-temporaire.fr', 'tmpmail.org', 'tmpmail.net',
  'mintemail.com', 'tempmailer.com', 'burnermail.io',
  'mailslite.com', 'inboxkitten.com', 'emailfake.com',
  '33mail.com', 'amilegit.com', 'anonymbox.com',
  'crazymailing.com', 'tempail.com', 'tmails.net',
  'emkei.cz', 'anonymmail.net', 'mailforspam.com',
  'spamherelots.com', 'spamobox.com', 'tempomail.fr',
]);

// Common domain typos -> correct domain
const DOMAIN_TYPOS: Record<string, string> = {
  // Gmail
  'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com',
  'gmail.con': 'gmail.com', 'gmail.cpm': 'gmail.com', 'gmail.vom': 'gmail.com',
  'gmai.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmil.com': 'gmail.com',
  'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gimail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'ggmail.com': 'gmail.com',
  // Hotmail
  'hotmail.co': 'hotmail.com', 'hotmail.cm': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmil.com': 'hotmail.com',
  'hitmail.com': 'hotmail.com', 'hoymail.com': 'hotmail.com',
  // Outlook
  'outlook.co': 'outlook.com', 'outlook.cm': 'outlook.com', 'outlook.con': 'outlook.com',
  'outloook.com': 'outlook.com', 'outlok.com': 'outlook.com',
  // Yahoo
  'yahoo.co': 'yahoo.com', 'yahoo.cm': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yhoo.com': 'yahoo.com',
  // iCloud
  'icloud.co': 'icloud.com', 'icloud.cm': 'icloud.com', 'icloud.con': 'icloud.com',
  // Orange
  'orange.com': 'orange.fr', 'oange.fr': 'orange.fr',
};

// Validate email format
function isValidFormat(email: string): boolean {
  const regex = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
  return regex.test(email.trim());
}

// Check if disposable email
function isDisposable(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1];
  return DISPOSABLE_DOMAINS.has(domain);
}

// Check for domain typos
function detectTypo(email: string): { isTypo: boolean; suggestion?: string } {
  const domain = email.toLowerCase().split('@')[1];
  if (DOMAIN_TYPOS[domain]) {
    return { isTypo: true, suggestion: DOMAIN_TYPOS[domain] };
  }
  return { isTypo: false };
}

// Verify MX records exist (with timeout)
async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout

    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`,
      {
        headers: { 'Accept': 'application/dns-json' },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) return true; // Fail open on DNS errors

    const data = await response.json();
    return data.Answer && data.Answer.length > 0;
  } catch (error) {
    console.error('MX lookup error:', error);
    return true; // Fail open
  }
}

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
      JSON.stringify({ eligible: false, reason: 'invalid_request', error: 'Invalid request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return new Response(
      JSON.stringify({ eligible: false, reason: 'missing_email', error: 'Email is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // ===== STEP 1: Format validation (instant) =====
    if (!isValidFormat(email)) {
      return new Response(
        JSON.stringify({ eligible: false, reason: 'invalid_format', error: 'Invalid email format' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== STEP 2: Typo detection (instant) =====
    const typoCheck = detectTypo(email);
    if (typoCheck.isTypo) {
      return new Response(
        JSON.stringify({
          eligible: false,
          reason: 'typo',
          error: `Did you mean @${typoCheck.suggestion}?`,
          suggestion: typoCheck.suggestion,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== STEP 3: Disposable email check (instant) =====
    if (isDisposable(email)) {
      return new Response(
        JSON.stringify({ eligible: false, reason: 'disposable', error: 'Temporary emails are not allowed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== STEP 4 & 5: Run MX check and DB checks in parallel =====
    const domain = email.split('@')[1];

    // Create Supabase client for DB checks
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Run checks in parallel for speed
    const [hasMx, deletedAccountResult, userListResult] = await Promise.all([
      hasMxRecords(domain),
      supabaseAdmin
        .from('deleted_accounts')
        .select('email, deleted_at, hard_delete_at, full_name')
        .eq('email', email)
        .single(),
      supabaseAdmin.auth.admin.listUsers(),
    ]);

    // Check MX records
    if (!hasMx) {
      return new Response(
        JSON.stringify({ eligible: false, reason: 'invalid_domain', error: 'Email domain does not exist' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if email belongs to a deleted account
    const deletedAccount = deletedAccountResult.data;
    if (deletedAccount) {
      const now = new Date();
      const hardDeleteAt = new Date(deletedAccount.hard_delete_at);
      const daysRemaining = Math.max(0, Math.ceil((hardDeleteAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      return new Response(
        JSON.stringify({
          eligible: false,
          reason: 'deleted',
          days_remaining: daysRemaining,
          full_name: deletedAccount.full_name || '',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if email is already registered and confirmed
    const existingUser = userListResult.data?.users?.find((u: { email: string }) => u.email === email);
    if (existingUser && existingUser.email_confirmed_at) {
      // Email exists and is confirmed - return generic error (security: don't reveal email exists)
      return new Response(
        JSON.stringify({ eligible: false, reason: 'exists' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== ALL CHECKS PASSED =====
    return new Response(
      JSON.stringify({ eligible: true, email }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Check signup eligibility error:', error);
    return new Response(
      JSON.stringify({ eligible: false, reason: 'server_error', error: 'Unable to verify email' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
