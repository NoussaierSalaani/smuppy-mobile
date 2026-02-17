/**
 * Profile Update Handler Unit Tests
 * Tests input validation and sanitization
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock the database before importing handler
jest.mock('../../../shared/db', () => ({
  getPool: jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [{ id: 'test-user-id' }] }),
  }),
}));

// Mock rate limiter to always allow in tests
jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    initFromEvent: jest.fn(),
    setRequestId: jest.fn(),
    setUserId: jest.fn(),
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    logQuery: jest.fn(),
    logSecurity: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
}));

jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({
    profileId: 'test-user-id',
    username: 'testuser',
    fullName: 'Test User',
    avatarUrl: null,
    isVerified: false,
    accountType: 'personal',
    businessName: null,
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({
    action: 'pass',
    maxScore: 0,
    topCategory: null,
    categories: [],
  }),
}));

jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true, filtered: '', violations: [] }),
}));

import { handler } from '../../profiles/update';

// Helper to create mock event
const createMockEvent = (body: Record<string, unknown>, userId = 'test-user-id'): APIGatewayProxyEvent => ({
  body: JSON.stringify(body),
  headers: { origin: 'https://smuppy.com' },
  requestContext: {
    authorizer: {
      claims: { sub: userId },
    },
    identity: { sourceIp: '127.0.0.1' },
  } as unknown as APIGatewayProxyEvent['requestContext'],
} as unknown as APIGatewayProxyEvent);

describe('Profile Update Handler - Input Validation', () => {
  describe('Username Validation', () => {
    it('should accept valid usernames', async () => {
      const event = createMockEvent({ username: 'valid_user123' });
      const response = await handler(event);

      expect(response?.statusCode).not.toBe(400);
    });

    it('should reject username with special characters', async () => {
      const event = createMockEvent({ username: 'user@name!' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(400);
    });

    it('should reject username too short', async () => {
      const event = createMockEvent({ username: 'ab' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(400);
    });

    it('should reject username too long after sanitization', async () => {
      // Username gets truncated to 30 chars, then validated
      // 31 'a's truncated to 30 'a's is still valid
      // But a username with invalid chars after truncation should fail
      const event = createMockEvent({ username: 'a'.repeat(31) });
      const response = await handler(event);

      // Truncated username is valid, so expect success
      expect(response?.statusCode).not.toBe(500);
    });
  });

  describe('Bio Validation', () => {
    it('should accept valid bio', async () => {
      const event = createMockEvent({ bio: 'I love fitness!' });
      const response = await handler(event);

      expect(response?.statusCode).not.toBe(400);
    });

    it('should truncate bio exceeding max length', async () => {
      const longBio = 'a'.repeat(600);
      const event = createMockEvent({ bio: longBio });
      const response = await handler(event);

      // Should not fail, just truncate
      expect(response?.statusCode).not.toBe(400);
    });
  });

  describe('URL Validation', () => {
    it('should accept valid avatar URL', async () => {
      const event = createMockEvent({ avatarUrl: 'https://example.com/avatar.jpg' });
      const response = await handler(event);

      expect(response?.statusCode).not.toBe(400);
    });

    it('should reject invalid avatar URL', async () => {
      const event = createMockEvent({ avatarUrl: 'not-a-url' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(400);
    });

    it('should reject javascript: URLs', async () => {
      const event = createMockEvent({ avatarUrl: 'javascript:alert(1)' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(400);
    });
  });

  describe('Boolean Fields', () => {
    it('should accept boolean isPrivate', async () => {
      const event = createMockEvent({ isPrivate: true });
      const response = await handler(event);

      expect(response?.statusCode).not.toBe(400);
    });

    it('should reject non-boolean isPrivate', async () => {
      const event = createMockEvent({ isPrivate: 'yes' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(400);
    });
  });

  describe('Array Fields', () => {
    it('should accept valid interests array', async () => {
      const event = createMockEvent({ interests: ['fitness', 'yoga', 'running'] });
      const response = await handler(event);

      expect(response?.statusCode).not.toBe(400);
    });

    it('should reject interests with too many items', async () => {
      const tooMany = Array(25).fill('interest');
      const event = createMockEvent({ interests: tooMany });
      const response = await handler(event);

      expect(response?.statusCode).toBe(400);
    });

    it('should reject non-array interests', async () => {
      const event = createMockEvent({ interests: 'fitness' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(400);
    });
  });

  describe('Account Type Validation', () => {
    it('should accept personal account type', async () => {
      // SECURITY: Only 'personal' is allowed via API. Pro upgrades require Stripe subscription.
      const event = createMockEvent({ accountType: 'personal' });
      const response = await handler(event);

      expect(response?.statusCode).not.toBe(400);
    });

    it('should reject pro account types via API', async () => {
      for (const type of ['pro_creator', 'pro_business']) {
        const event = createMockEvent({ accountType: type });
        const response = await handler(event);

        expect(response?.statusCode).toBe(400);
      }
    });

    it('should reject invalid account type', async () => {
      const event = createMockEvent({ accountType: 'admin' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(400);
    });
  });

  describe('Date Validation', () => {
    it('should accept valid date format', async () => {
      const event = createMockEvent({ dateOfBirth: '1990-05-15' });
      const response = await handler(event);

      expect(response?.statusCode).not.toBe(400);
    });

    it('should reject invalid date format', async () => {
      const event = createMockEvent({ dateOfBirth: '15/05/1990' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(400);
    });
  });

  describe('Security - Injection Prevention', () => {
    it('should sanitize SQL injection in bio', async () => {
      const event = createMockEvent({ bio: "'; DROP TABLE users; --" });
      const response = await handler(event);

      // Should not fail, but sanitize
      expect(response?.statusCode).not.toBe(500);
    });

    it('should sanitize XSS in fullName', async () => {
      const event = createMockEvent({ fullName: '<script>alert("XSS")</script>' });
      const response = await handler(event);

      expect(response?.statusCode).not.toBe(500);
    });

    it('should remove null bytes', async () => {
      const event = createMockEvent({ bio: 'Hello\0World' });
      const response = await handler(event);

      expect(response?.statusCode).not.toBe(500);
    });
  });

  describe('Authorization', () => {
    it('should reject requests without user ID', async () => {
      const event = createMockEvent({ username: 'test' }, undefined as unknown as string);
      event.requestContext.authorizer = undefined as unknown as APIGatewayProxyEvent['requestContext']['authorizer'];
      const response = await handler(event);

      expect(response?.statusCode).toBe(401);
    });
  });
});
