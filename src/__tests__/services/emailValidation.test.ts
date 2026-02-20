/**
 * Email Validation Service Tests
 *
 * Tests validateEmailAdvanced, checkDomainMx, and validateEmailFull
 * from src/services/emailValidation.ts
 *
 * Mocks: aws-api, validation utilities, and global fetch.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockValidateEmail = jest.fn();

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    validateEmail: mockValidateEmail,
  },
}));

const mockValidate = {
  email: jest.fn(),
};
const mockIsDisposableEmail = jest.fn();
const mockDetectDomainTypo = jest.fn();

jest.mock('../../utils/validation', () => ({
  validate: mockValidate,
  isDisposableEmail: mockIsDisposableEmail,
  detectDomainTypo: mockDetectDomainTypo,
}));

// Provide __DEV__ global
(global as Record<string, unknown>).__DEV__ = false;

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  validateEmailAdvanced,
  checkDomainMx,
  validateEmailFull,
  EMAIL_VALIDATION_CODES,
  EMAIL_ERROR_MESSAGES,
} from '../../services/emailValidation';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('emailValidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: local validation passes, not disposable, no typos
    mockValidate.email.mockReturnValue(true);
    mockIsDisposableEmail.mockReturnValue(false);
    mockDetectDomainTypo.mockReturnValue({ isTypo: false });
  });

  // =========================================================================
  // Constants
  // =========================================================================

  describe('EMAIL_VALIDATION_CODES', () => {
    it('should define all expected validation codes', () => {
      expect(EMAIL_VALIDATION_CODES.VALID).toBe('VALID');
      expect(EMAIL_VALIDATION_CODES.MISSING_EMAIL).toBe('MISSING_EMAIL');
      expect(EMAIL_VALIDATION_CODES.INVALID_FORMAT).toBe('INVALID_FORMAT');
      expect(EMAIL_VALIDATION_CODES.DISPOSABLE_EMAIL).toBe('DISPOSABLE_EMAIL');
      expect(EMAIL_VALIDATION_CODES.TYPO_DETECTED).toBe('TYPO_DETECTED');
      expect(EMAIL_VALIDATION_CODES.INVALID_DOMAIN).toBe('INVALID_DOMAIN');
      expect(EMAIL_VALIDATION_CODES.SERVER_ERROR).toBe('SERVER_ERROR');
    });
  });

  describe('EMAIL_ERROR_MESSAGES', () => {
    it('should have user-friendly messages for all codes', () => {
      expect(EMAIL_ERROR_MESSAGES.MISSING_EMAIL).toBe('Email is required');
      expect(EMAIL_ERROR_MESSAGES.INVALID_FORMAT).toBe('Please enter a valid email address');
      expect(EMAIL_ERROR_MESSAGES.DISPOSABLE_EMAIL).toBe('Temporary/disposable emails are not allowed');
      expect(EMAIL_ERROR_MESSAGES.TYPO_DETECTED).toBe('Did you mean');
      expect(EMAIL_ERROR_MESSAGES.INVALID_DOMAIN).toBe('This email domain does not exist');
      expect(EMAIL_ERROR_MESSAGES.SERVER_ERROR).toBe('Unable to validate email. Please try again.');
    });
  });

  // =========================================================================
  // validateEmailAdvanced
  // =========================================================================

  describe('validateEmailAdvanced', () => {
    it('should reject empty string', async () => {
      const result = await validateEmailAdvanced('');

      expect(result.valid).toBe(false);
      expect(result.code).toBe(EMAIL_VALIDATION_CODES.MISSING_EMAIL);
      expect(result.error).toBe(EMAIL_ERROR_MESSAGES.MISSING_EMAIL);
    });

    it('should reject whitespace-only string', async () => {
      const result = await validateEmailAdvanced('   ');

      expect(result.valid).toBe(false);
      expect(result.code).toBe(EMAIL_VALIDATION_CODES.MISSING_EMAIL);
    });

    it('should detect domain typos when local validation fails', async () => {
      mockValidate.email.mockReturnValue(false);
      mockDetectDomainTypo.mockReturnValue({ isTypo: true, suggestion: 'gmail.com' });

      const result = await validateEmailAdvanced('user@gmial.com');

      expect(result.valid).toBe(false);
      expect(result.code).toBe(EMAIL_VALIDATION_CODES.TYPO_DETECTED);
      expect(result.error).toContain('gmail.com');
      expect(result.suggestion).toBe('gmail.com');
    });

    it('should detect disposable email when local validation fails', async () => {
      mockValidate.email.mockReturnValue(false);
      mockDetectDomainTypo.mockReturnValue({ isTypo: false });
      mockIsDisposableEmail.mockReturnValue(true);

      const result = await validateEmailAdvanced('user@tempmail.com');

      expect(result.valid).toBe(false);
      expect(result.code).toBe(EMAIL_VALIDATION_CODES.DISPOSABLE_EMAIL);
      expect(result.error).toBe(EMAIL_ERROR_MESSAGES.DISPOSABLE_EMAIL);
    });

    it('should return invalid format when local validation fails (not typo, not disposable)', async () => {
      mockValidate.email.mockReturnValue(false);
      mockDetectDomainTypo.mockReturnValue({ isTypo: false });
      mockIsDisposableEmail.mockReturnValue(false);

      const result = await validateEmailAdvanced('not-an-email');

      expect(result.valid).toBe(false);
      expect(result.code).toBe(EMAIL_VALIDATION_CODES.INVALID_FORMAT);
      expect(result.error).toBe(EMAIL_ERROR_MESSAGES.INVALID_FORMAT);
    });

    it('should call AWS Lambda when local validation passes', async () => {
      mockValidateEmail.mockResolvedValue({ valid: true, email: 'user@example.com' });

      const result = await validateEmailAdvanced('User@Example.COM');

      expect(mockValidateEmail).toHaveBeenCalledWith('user@example.com');
      expect(result.valid).toBe(true);
      expect(result.email).toBe('user@example.com');
    });

    it('should return valid with normalized email when AWS returns valid', async () => {
      mockValidateEmail.mockResolvedValue({ valid: true, email: 'user@example.com' });

      const result = await validateEmailAdvanced('user@example.com');

      expect(result.valid).toBe(true);
      expect(result.email).toBe('user@example.com');
    });

    it('should return invalid when AWS says invalid with code', async () => {
      mockValidateEmail.mockResolvedValue({
        valid: false,
        code: 'INVALID_DOMAIN',
        error: 'Domain does not exist',
      });

      const result = await validateEmailAdvanced('user@nonexistent.xyz');

      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_DOMAIN');
      expect(result.error).toBe(EMAIL_ERROR_MESSAGES.INVALID_DOMAIN);
    });

    it('should fall back to error message when code has no mapping', async () => {
      mockValidateEmail.mockResolvedValue({
        valid: false,
        code: 'UNKNOWN_CODE',
        error: 'Some custom error',
      });

      const result = await validateEmailAdvanced('user@example.com');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Some custom error');
    });

    it('should treat null AWS response as valid (local passed)', async () => {
      mockValidateEmail.mockResolvedValue(null);

      const result = await validateEmailAdvanced('user@example.com');

      expect(result.valid).toBe(true);
      expect(result.email).toBe('user@example.com');
    });

    it('should treat undefined AWS response as valid (local passed)', async () => {
      mockValidateEmail.mockResolvedValue(undefined);

      const result = await validateEmailAdvanced('user@example.com');

      expect(result.valid).toBe(true);
      expect(result.email).toBe('user@example.com');
    });

    it('should fall back to valid on AWS network error (local passed)', async () => {
      mockValidateEmail.mockRejectedValue(new Error('Network error'));

      const result = await validateEmailAdvanced('user@example.com');

      expect(result.valid).toBe(true);
      expect(result.email).toBe('user@example.com');
    });

    it('should lowercase and trim the email before processing', async () => {
      mockValidateEmail.mockResolvedValue({ valid: true, email: 'user@example.com' });

      await validateEmailAdvanced('  User@Example.COM  ');

      expect(mockValidate.email).toHaveBeenCalledWith('user@example.com');
      expect(mockValidateEmail).toHaveBeenCalledWith('user@example.com');
    });
  });

  // =========================================================================
  // checkDomainMx
  // =========================================================================

  describe('checkDomainMx', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should return false if email has no domain', async () => {
      const result = await checkDomainMx('no-at-sign');
      expect(result).toBe(false);
    });

    it('should return true when MX records are found', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ Answer: [{ type: 15, data: '10 mx.example.com' }] }),
      });

      const result = await checkDomainMx('user@example.com');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://cloudflare-dns.com/dns-query?name=example.com&type=MX',
        expect.objectContaining({
          headers: { Accept: 'application/dns-json' },
        }),
      );
    });

    it('should return false when no MX records found (empty Answer)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ Answer: [] }),
      });

      const result = await checkDomainMx('user@no-mx.com');

      expect(result).toBe(false);
    });

    it('should return falsy when no Answer field in DNS response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await checkDomainMx('user@no-answer.com');

      // data.Answer is undefined, so `data.Answer && data.Answer.length > 0` is undefined (falsy)
      expect(result).toBeFalsy();
    });

    it('should fail open (return true) on non-ok HTTP response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await checkDomainMx('user@example.com');

      expect(result).toBe(true);
    });

    it('should fail open (return true) on network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network failure'));

      const result = await checkDomainMx('user@example.com');

      expect(result).toBe(true);
    });

    it('should fail open (return true) on abort/timeout', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new DOMException('Aborted', 'AbortError'));

      const result = await checkDomainMx('user@example.com');

      expect(result).toBe(true);
    });

    it('should lowercase the domain', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ Answer: [{ type: 15 }] }),
      });

      await checkDomainMx('user@EXAMPLE.COM');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://cloudflare-dns.com/dns-query?name=example.com&type=MX',
        expect.anything(),
      );
    });
  });

  // =========================================================================
  // validateEmailFull
  // =========================================================================

  describe('validateEmailFull', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should return invalid if advanced validation fails', async () => {
      // Make validateEmailAdvanced fail
      const result = await validateEmailFull('');

      expect(result.valid).toBe(false);
      expect(result.code).toBe(EMAIL_VALIDATION_CODES.MISSING_EMAIL);
    });

    it('should check MX records after advanced validation passes', async () => {
      mockValidateEmail.mockResolvedValue({ valid: true, email: 'user@example.com' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ Answer: [{ type: 15 }] }),
      });

      const result = await validateEmailFull('user@example.com');

      expect(result.valid).toBe(true);
      expect(result.email).toBe('user@example.com');
    });

    it('should return invalid domain when MX check fails', async () => {
      mockValidateEmail.mockResolvedValue({ valid: true, email: 'user@fake.xyz' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ Answer: [] }),
      });

      const result = await validateEmailFull('user@fake.xyz');

      expect(result.valid).toBe(false);
      expect(result.code).toBe(EMAIL_VALIDATION_CODES.INVALID_DOMAIN);
      expect(result.error).toBe(EMAIL_ERROR_MESSAGES.INVALID_DOMAIN);
    });

    it('should return valid when MX check succeeds', async () => {
      mockValidateEmail.mockResolvedValue({ valid: true, email: 'user@gmail.com' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ Answer: [{ type: 15, data: '5 gmail-smtp-in.l.google.com' }] }),
      });

      const result = await validateEmailFull('User@Gmail.COM');

      expect(result.valid).toBe(true);
      expect(result.email).toBe('user@gmail.com');
    });
  });
});
