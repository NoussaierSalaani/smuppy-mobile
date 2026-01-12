// Supabase Edge Function: validate-email
// Validates email format, blocks disposable emails, and verifies MX records

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://smuppy.com',
  'https://www.smuppy.com',
  'https://app.smuppy.com',
  'http://localhost:8081', // Expo dev
  'http://localhost:19006', // Expo web
];

// Get CORS headers with origin validation
// Note: This is a public validation service, no auth required
const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
};

// Known disposable email domains
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

// Verify MX records exist for domain using DNS-over-HTTPS
async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    // Use Cloudflare DNS-over-HTTPS API
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`,
      {
        headers: { 'Accept': 'application/dns-json' },
      }
    );

    if (!response.ok) return true; // Fail open on DNS errors

    const data = await response.json();

    // Check if MX records exist (Answer array has entries)
    return data.Answer && data.Answer.length > 0;
  } catch (error) {
    console.error('MX lookup error:', error);
    return true; // Fail open - don't block if DNS check fails
  }
}

serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Email is required', code: 'MISSING_EMAIL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailLower = email.toLowerCase().trim();

    // 1. Check format
    if (!isValidFormat(emailLower)) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid email format', code: 'INVALID_FORMAT' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Check for typos in popular domains
    const typoCheck = detectTypo(emailLower);
    if (typoCheck.isTypo) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: `Did you mean @${typoCheck.suggestion}?`,
          code: 'TYPO_DETECTED',
          suggestion: typoCheck.suggestion,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check disposable
    if (isDisposable(emailLower)) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Temporary emails are not allowed', code: 'DISPOSABLE_EMAIL' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Check MX records
    const domain = emailLower.split('@')[1];
    const hasMx = await hasMxRecords(domain);

    if (!hasMx) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Email domain does not exist', code: 'INVALID_DOMAIN' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // All checks passed
    return new Response(
      JSON.stringify({ valid: true, email: emailLower }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Validation error:', error);
    return new Response(
      JSON.stringify({ valid: false, error: 'Validation failed', code: 'SERVER_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
