/**
 * Pre-Signup Cognito Trigger Tests
 *
 * Tests the pre-signup Lambda trigger that:
 * - Validates email format
 * - Blocks disposable email domains
 * - Blocks spam TLDs (.tk, .ml, .xyz, etc.)
 * - Auto-confirms social sign-in users (Apple/Google)
 *
 * Since validateEmail() and isSocialSignIn() are NOT exported,
 * we test them indirectly through the handler.
 */

import { PreSignUpTriggerEvent } from 'aws-lambda';

// Logger is auto-mocked by setup.ts (resolves to api/utils/logger)

import { handler } from '../../../triggers/pre-signup';

// ---------------------------------------------------------------------------
// Helper: build a Cognito PreSignUpTriggerEvent
// ---------------------------------------------------------------------------
function makePreSignUpEvent(overrides: Record<string, unknown> = {}): PreSignUpTriggerEvent {
  return {
    version: '1',
    triggerSource: (overrides.triggerSource as PreSignUpTriggerEvent['triggerSource']) ?? 'PreSignUp_SignUp',
    region: 'eu-west-3',
    userPoolId: 'eu-west-3_test',
    userName: (overrides.userName as string) ?? 'testuser123',
    callerContext: { awsSdkVersion: '1', clientId: 'test-client' },
    request: {
      userAttributes: {
        email: overrides.email as string ?? 'user@example.com',
        ...((overrides.userAttributes as Record<string, string>) ?? {}),
      },
    },
    response: {
      autoConfirmUser: false,
      autoVerifyEmail: false,
      autoVerifyPhone: false,
    },
  } as PreSignUpTriggerEvent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Pre-Signup Trigger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Email validation (via handler) ──────────────────────────────────────

  describe('Email Validation', () => {
    it('accepts a valid email (handler returns event without throwing)', async () => {
      const event = makePreSignUpEvent({ email: 'alice@gmail.com' });
      const result = await handler(event, {} as never, () => {});

      expect(result).toBeDefined();
      expect(result!.request.userAttributes.email).toBe('alice@gmail.com');
    });

    it('rejects an invalid email format (no @)', async () => {
      const event = makePreSignUpEvent({ email: 'invalidemail' });

      await expect(handler(event, {} as never, () => {})).rejects.toThrow(
        'Invalid email format',
      );
    });

    it('rejects disposable email domain (tempmail.com)', async () => {
      const event = makePreSignUpEvent({ email: 'user@tempmail.com' });

      await expect(handler(event, {} as never, () => {})).rejects.toThrow(
        'Disposable email addresses are not allowed',
      );
    });

    it('rejects another disposable domain (yopmail.com)', async () => {
      const event = makePreSignUpEvent({ email: 'user@yopmail.com' });

      await expect(handler(event, {} as never, () => {})).rejects.toThrow(
        'Disposable email addresses are not allowed',
      );
    });

    it('rejects blocked TLD (.tk)', async () => {
      const event = makePreSignUpEvent({ email: 'user@spam.tk' });

      await expect(handler(event, {} as never, () => {})).rejects.toThrow(
        'not supported',
      );
    });

    it('rejects blocked TLD (.ml)', async () => {
      const event = makePreSignUpEvent({ email: 'user@freehost.ml' });

      await expect(handler(event, {} as never, () => {})).rejects.toThrow(
        'not supported',
      );
    });

    it('rejects blocked TLD (.xyz)', async () => {
      const event = makePreSignUpEvent({ email: 'user@random.xyz' });

      await expect(handler(event, {} as never, () => {})).rejects.toThrow(
        'not supported',
      );
    });

    it('accepts a valid domain that is not disposable or blocked TLD', async () => {
      const event = makePreSignUpEvent({ email: 'user@mycompany.com' });
      const result = await handler(event, {} as never, () => {});

      expect(result).toBeDefined();
      expect(result!.request.userAttributes.email).toBe('user@mycompany.com');
    });
  });

  // ── Social sign-in auto-confirm ─────────────────────────────────────────

  describe('Social Sign-In Auto-Confirm', () => {
    it('auto-confirms external provider (PreSignUp_ExternalProvider)', async () => {
      const event = makePreSignUpEvent({
        triggerSource: 'PreSignUp_ExternalProvider',
        email: 'social@gmail.com',
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.response.autoConfirmUser).toBe(true);
    });

    it('auto-verifies email for external provider when email is present', async () => {
      const event = makePreSignUpEvent({
        triggerSource: 'PreSignUp_ExternalProvider',
        email: 'social@gmail.com',
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.response.autoVerifyEmail).toBe(true);
    });

    it('auto-confirms admin-created users (PreSignUp_AdminCreateUser)', async () => {
      const event = makePreSignUpEvent({
        triggerSource: 'PreSignUp_AdminCreateUser',
        email: 'admin@company.com',
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.response.autoConfirmUser).toBe(true);
      expect(result!.response.autoVerifyEmail).toBe(true);
    });

    it('does NOT auto-confirm regular sign-up (PreSignUp_SignUp)', async () => {
      const event = makePreSignUpEvent({
        triggerSource: 'PreSignUp_SignUp',
        email: 'regular@example.com',
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.response.autoConfirmUser).toBe(false);
      expect(result!.response.autoVerifyEmail).toBe(false);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles event with no email attribute (no validation error)', async () => {
      const event = makePreSignUpEvent();
      // Remove email from userAttributes
      delete (event.request.userAttributes as Record<string, string>).email;

      const result = await handler(event, {} as never, () => {});

      // Should not throw — email validation is skipped when email is absent
      expect(result).toBeDefined();
    });

    it('social sign-in with no email: autoConfirmUser=true but autoVerifyEmail=false', async () => {
      const event = makePreSignUpEvent({
        triggerSource: 'PreSignUp_ExternalProvider',
      });
      // Remove email
      delete (event.request.userAttributes as Record<string, string>).email;

      const result = await handler(event, {} as never, () => {});

      expect(result!.response.autoConfirmUser).toBe(true);
      expect(result!.response.autoVerifyEmail).toBe(false);
    });

    it('rejects disposable domain regardless of case (TEMPMAIL.COM)', async () => {
      // The source lowercases the domain before checking the disposable set,
      // so uppercase variants should still be blocked.
      const event = makePreSignUpEvent({ email: 'user@TEMPMAIL.COM' });

      await expect(handler(event, {} as never, () => {})).rejects.toThrow(
        'Disposable email addresses are not allowed',
      );
    });
  });
});
