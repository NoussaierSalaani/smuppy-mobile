/**
 * Tests for Custom Message Lambda Trigger
 *
 * Verifies that Cognito custom message triggers produce correct branded
 * email templates for all 6 trigger sources plus the default fallback.
 */

jest.mock('../../../api/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

import { handler } from '../../../triggers/custom-message';

function makeCustomMessageEvent(triggerSource: string, email?: string) {
  return {
    version: '1',
    triggerSource,
    region: 'eu-west-3',
    userPoolId: 'eu-west-3_test',
    userName: 'testuser',
    callerContext: { awsSdkVersion: '1', clientId: 'test-client' },
    request: {
      userAttributes: { email: email ?? 'test@example.com' },
      codeParameter: '{####}',
      usernameParameter: '',
      linkParameter: '',
      clientMetadata: {},
    },
    response: {
      smsMessage: '',
      emailMessage: '',
      emailSubject: '',
    },
  } as any;
}

describe('Custom Message Trigger', () => {
  // ── Per trigger source ──

  it('CustomMessage_SignUp — sets subject and message correctly', async () => {
    const event = makeCustomMessageEvent('CustomMessage_SignUp');
    const result = await handler(event, {} as any, () => {});

    expect(result!.response.emailSubject).toBe(
      'Welcome to Smuppy - Verify Your Email'
    );
    expect(result!.response.emailMessage).toContain('Verify Your Email');
    expect(result!.response.emailMessage).toContain('{####}');
  });

  it('CustomMessage_ResendCode — sets subject and message correctly', async () => {
    const event = makeCustomMessageEvent('CustomMessage_ResendCode');
    const result = await handler(event, {} as any, () => {});

    expect(result!.response.emailSubject).toBe(
      'Smuppy - Your New Verification Code'
    );
    expect(result!.response.emailMessage).toContain('New Verification Code');
  });

  it('CustomMessage_ForgotPassword — sets subject and message correctly', async () => {
    const event = makeCustomMessageEvent('CustomMessage_ForgotPassword');
    const result = await handler(event, {} as any, () => {});

    expect(result!.response.emailSubject).toBe(
      'Smuppy - Reset Your Password'
    );
    expect(result!.response.emailMessage).toContain('Reset Your Password');
  });

  it('CustomMessage_AdminCreateUser — sets subject and message correctly', async () => {
    const event = makeCustomMessageEvent('CustomMessage_AdminCreateUser');
    const result = await handler(event, {} as any, () => {});

    expect(result!.response.emailSubject).toBe(
      'Welcome to Smuppy - Your Account is Ready'
    );
    expect(result!.response.emailMessage).toContain('Your Account is Ready');
  });

  it('CustomMessage_UpdateUserAttribute — sets subject and message correctly', async () => {
    const event = makeCustomMessageEvent('CustomMessage_UpdateUserAttribute');
    const result = await handler(event, {} as any, () => {});

    expect(result!.response.emailSubject).toBe(
      'Smuppy - Verify Your New Email'
    );
    expect(result!.response.emailMessage).toContain('Verify New Email');
  });

  it('CustomMessage_VerifyUserAttribute — sets subject and message correctly', async () => {
    const event = makeCustomMessageEvent('CustomMessage_VerifyUserAttribute');
    const result = await handler(event, {} as any, () => {});

    expect(result!.response.emailSubject).toBe(
      'Smuppy - Verification Code'
    );
    expect(result!.response.emailMessage).toContain('Verification Code');
  });

  it('unknown trigger source — falls back to default verification template', async () => {
    const event = makeCustomMessageEvent('CustomMessage_Unknown');
    const result = await handler(event, {} as any, () => {});

    expect(result!.response.emailSubject).toBe(
      'Smuppy - Verification Code'
    );
    expect(result!.response.emailMessage).toContain('Verification Code');
  });

  // ── Template content ──

  it('all templates contain the security notice "Never share this code"', async () => {
    const triggerSources = [
      'CustomMessage_SignUp',
      'CustomMessage_ResendCode',
      'CustomMessage_ForgotPassword',
      'CustomMessage_AdminCreateUser',
      'CustomMessage_UpdateUserAttribute',
      'CustomMessage_VerifyUserAttribute',
    ];

    for (const source of triggerSources) {
      const event = makeCustomMessageEvent(source);
      const result = await handler(event, {} as any, () => {});
      expect(result!.response.emailMessage).toContain('Never share this code');
    }
  });

  it('all templates contain the Smuppy brand name', async () => {
    const triggerSources = [
      'CustomMessage_SignUp',
      'CustomMessage_ResendCode',
      'CustomMessage_ForgotPassword',
      'CustomMessage_AdminCreateUser',
      'CustomMessage_UpdateUserAttribute',
      'CustomMessage_VerifyUserAttribute',
    ];

    for (const source of triggerSources) {
      const event = makeCustomMessageEvent(source);
      const result = await handler(event, {} as any, () => {});
      expect(result!.response.emailMessage).toContain('Smuppy');
    }
  });

  it('all templates contain the code placeholder {####}', async () => {
    const triggerSources = [
      'CustomMessage_SignUp',
      'CustomMessage_ResendCode',
      'CustomMessage_ForgotPassword',
      'CustomMessage_AdminCreateUser',
      'CustomMessage_UpdateUserAttribute',
      'CustomMessage_VerifyUserAttribute',
    ];

    for (const source of triggerSources) {
      const event = makeCustomMessageEvent(source);
      const result = await handler(event, {} as any, () => {});
      expect(result!.response.emailMessage).toContain('{####}');
    }
  });

  // ── Passthrough & edge cases ──

  it('handler returns the event (passthrough pattern)', async () => {
    const event = makeCustomMessageEvent('CustomMessage_SignUp');
    const result = await handler(event, {} as any, () => {});

    expect(result).toBe(event);
  });

  it('handles missing email gracefully (email undefined -> maskedEmail = "User")', async () => {
    const event = makeCustomMessageEvent('CustomMessage_SignUp');
    event.request.userAttributes = {};

    // Should not throw
    const result = await handler(event, {} as any, () => {});
    expect(result).toBe(event);
    expect(result!.response.emailSubject).toBe(
      'Welcome to Smuppy - Verify Your Email'
    );
  });
});
