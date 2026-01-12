/**
 * Email Validation Service
 * Provides comprehensive email validation with Edge Function support
 * Falls back to local validation if Edge Function is unavailable
 */

import { supabase } from '../config/supabase';
import { validate, isDisposableEmail, detectDomainTypo } from '../utils/validation';

/**
 * Validation result codes
 */
export const EMAIL_VALIDATION_CODES = {
  VALID: 'VALID',
  MISSING_EMAIL: 'MISSING_EMAIL',
  INVALID_FORMAT: 'INVALID_FORMAT',
  DISPOSABLE_EMAIL: 'DISPOSABLE_EMAIL',
  TYPO_DETECTED: 'TYPO_DETECTED',
  INVALID_DOMAIN: 'INVALID_DOMAIN',
  SERVER_ERROR: 'SERVER_ERROR',
};

/**
 * Error messages for each validation code (user-friendly)
 */
export const EMAIL_ERROR_MESSAGES = {
  MISSING_EMAIL: 'Email is required',
  INVALID_FORMAT: 'Please enter a valid email address',
  DISPOSABLE_EMAIL: 'Temporary/disposable emails are not allowed',
  TYPO_DETECTED: 'Did you mean',
  INVALID_DOMAIN: 'This email domain does not exist',
  SERVER_ERROR: 'Unable to validate email. Please try again.',
};

/**
 * Validate email using Supabase Edge Function
 * Falls back to local validation if Edge Function fails
 *
 * @param {string} email - Email to validate
 * @returns {Promise<{valid: boolean, error?: string, code?: string}>}
 */
export const validateEmailAdvanced = async (email) => {
  if (!email || !email.trim()) {
    return {
      valid: false,
      error: EMAIL_ERROR_MESSAGES.MISSING_EMAIL,
      code: EMAIL_VALIDATION_CODES.MISSING_EMAIL,
    };
  }

  const emailLower = email.toLowerCase().trim();

  // First, do quick local validation
  if (!validate.email(emailLower)) {
    // Check if it's a typo of a popular domain
    const typoCheck = detectDomainTypo(emailLower);
    if (typoCheck.isTypo && typoCheck.suggestion) {
      return {
        valid: false,
        error: `Did you mean @${typoCheck.suggestion}?`,
        code: EMAIL_VALIDATION_CODES.TYPO_DETECTED,
        suggestion: typoCheck.suggestion,
      };
    }
    // Check if it's specifically a disposable email
    if (isDisposableEmail(emailLower)) {
      return {
        valid: false,
        error: EMAIL_ERROR_MESSAGES.DISPOSABLE_EMAIL,
        code: EMAIL_VALIDATION_CODES.DISPOSABLE_EMAIL,
      };
    }
    return {
      valid: false,
      error: EMAIL_ERROR_MESSAGES.INVALID_FORMAT,
      code: EMAIL_VALIDATION_CODES.INVALID_FORMAT,
    };
  }

  // Try Edge Function for advanced validation (MX records)
  try {
    const { data, error } = await supabase.functions.invoke('validate-email', {
      body: { email: emailLower },
    });

    if (error) {
      console.warn('Edge Function error, falling back to local validation:', error);
      // Edge Function not available, local validation already passed
      return { valid: true, email: emailLower };
    }

    if (data) {
      if (data.valid) {
        return { valid: true, email: data.email || emailLower };
      }
      return {
        valid: false,
        error: EMAIL_ERROR_MESSAGES[data.code] || data.error,
        code: data.code,
      };
    }

    // Unexpected response, assume valid (local validation passed)
    return { valid: true, email: emailLower };

  } catch (err) {
    console.warn('Email validation service error:', err);
    // Network error or Edge Function not deployed
    // Local validation already passed, so allow signup
    return { valid: true, email: emailLower };
  }
};

/**
 * Check if domain has MX records using DNS-over-HTTPS
 * This is a client-side fallback if Edge Function is not available
 *
 * @param {string} email - Email to check
 * @returns {Promise<boolean>} - True if domain appears valid
 */
export const checkDomainMx = async (email) => {
  try {
    const domain = email.toLowerCase().split('@')[1];
    if (!domain) return false;

    // Use Cloudflare DNS-over-HTTPS
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`,
      {
        headers: { Accept: 'application/dns-json' },
        // Short timeout for better UX
        signal: AbortSignal.timeout(3000),
      }
    );

    if (!response.ok) return true; // Fail open

    const data = await response.json();
    return data.Answer && data.Answer.length > 0;

  } catch (error) {
    console.warn('MX check failed:', error);
    return true; // Fail open - don't block on network errors
  }
};

/**
 * Full email validation with MX check (use sparingly - has latency)
 * Call this before final signup submission
 *
 * @param {string} email - Email to validate
 * @returns {Promise<{valid: boolean, error?: string, code?: string}>}
 */
export const validateEmailFull = async (email) => {
  // First do advanced validation (Edge Function or local)
  const result = await validateEmailAdvanced(email);

  if (!result.valid) {
    return result;
  }

  // Additional MX check if Edge Function didn't do it
  const hasMx = await checkDomainMx(email);

  if (!hasMx) {
    return {
      valid: false,
      error: EMAIL_ERROR_MESSAGES.INVALID_DOMAIN,
      code: EMAIL_VALIDATION_CODES.INVALID_DOMAIN,
    };
  }

  return { valid: true, email: email.toLowerCase().trim() };
};
