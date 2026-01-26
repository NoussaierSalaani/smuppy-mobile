/**
 * Pre-signup Lambda Trigger
 * SECURITY: Validates user registration before account creation
 *
 * Features:
 * - Blocks disposable email domains
 * - Validates email format
 * - Rate limiting protection (handled by Cognito)
 * - Auto-confirms social sign-in users (Apple/Google)
 */

import { PreSignUpTriggerEvent, PreSignUpTriggerHandler } from 'aws-lambda';

// List of common disposable email domains to block
// SECURITY: Prevents abuse from temporary email services
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com',
  'throwaway.email',
  'guerrillamail.com',
  'guerrillamail.org',
  'mailinator.com',
  'maildrop.cc',
  '10minutemail.com',
  '10minutemail.net',
  'temp-mail.org',
  'fakeinbox.com',
  'sharklasers.com',
  'trashmail.com',
  'yopmail.com',
  'dispostable.com',
  'mailnesia.com',
  'tempail.com',
  'tempmailaddress.com',
  'getairmail.com',
  'fakemailgenerator.com',
  'emailondeck.com',
  'getnada.com',
  'mohmal.com',
  'tempmailo.com',
  'emailfake.com',
  'crazymailing.com',
  'mytrashmail.com',
  'mt2009.com',
  'trash-mail.com',
  'anonymbox.com',
  'burnermail.io',
]);

// Blocked TLDs commonly used for spam
const BLOCKED_TLDS = new Set([
  '.tk',
  '.ml',
  '.ga',
  '.cf',
  '.gq',
  '.top',
  '.xyz', // High spam, but some legitimate use - keep monitoring
]);

/**
 * Validate email format and domain
 */
function validateEmail(email: string): { valid: boolean; reason?: string } {
  // Basic format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, reason: 'Invalid email format' };
  }

  const domain = email.toLowerCase().split('@')[1];
  if (!domain) {
    return { valid: false, reason: 'Invalid email domain' };
  }

  // Check disposable email domains
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    console.log(`[PreSignup] Blocked disposable email domain: ${domain}`);
    return { valid: false, reason: 'Disposable email addresses are not allowed' };
  }

  // Check blocked TLDs
  for (const tld of BLOCKED_TLDS) {
    if (domain.endsWith(tld)) {
      console.log(`[PreSignup] Blocked TLD: ${tld} from ${domain}`);
      return { valid: false, reason: 'This email domain is not supported' };
    }
  }

  return { valid: true };
}

/**
 * Check if this is a social sign-in (Apple/Google)
 */
function isSocialSignIn(event: PreSignUpTriggerEvent): boolean {
  // External provider triggers have different trigger source
  const triggerSource = event.triggerSource;
  return (
    triggerSource === 'PreSignUp_ExternalProvider' ||
    triggerSource === 'PreSignUp_AdminCreateUser'
  );
}

export const handler: PreSignUpTriggerHandler = async (event) => {
  console.log('[PreSignup] Trigger invoked:', {
    triggerSource: event.triggerSource,
    username: event.userName?.substring(0, 3) + '***', // Masked for security
    hasEmail: !!event.request.userAttributes?.email,
  });

  try {
    const email = event.request.userAttributes?.email;

    // Validate email if present
    if (email) {
      const validation = validateEmail(email);
      if (!validation.valid) {
        console.error(`[PreSignup] Email validation failed: ${validation.reason}`);
        throw new Error(validation.reason || 'Email validation failed');
      }
    }

    // Auto-confirm and verify social sign-in users (Apple/Google)
    // These users have already verified their identity with the provider
    if (isSocialSignIn(event)) {
      console.log('[PreSignup] Social sign-in detected, auto-confirming user');
      event.response.autoConfirmUser = true;
      event.response.autoVerifyEmail = !!email;
    }

    // Log successful validation (masked email for security)
    if (email) {
      const maskedEmail = email.substring(0, 2) + '***@' + email.split('@')[1];
      console.log(`[PreSignup] Validation passed for: ${maskedEmail}`);
    }

    return event;
  } catch (error: any) {
    console.error('[PreSignup] Error:', error.message);
    throw error;
  }
};
