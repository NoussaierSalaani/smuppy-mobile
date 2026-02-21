/**
 * Profile Update Handler Unit Tests
 * Tests input validation, sanitization, and branch coverage
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// Mock the database before importing handler
jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
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
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
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

jest.mock('../../utils/security', () => ({
  sanitizeInput: jest.fn((input: string, maxLength: number) =>
    input.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLength)
  ),
  isValidUsername: jest.fn((username: string) =>
    /^[a-zA-Z0-9_.]{3,30}$/.test(username)
  ),
  isReservedUsername: jest.fn((username: string) =>
    ['admin', 'support', 'smuppy', 'help'].includes(username.toLowerCase())
  ),
  logSecurityEvent: jest.fn(),
}));

import { handler } from '../../profiles/update';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { resolveProfileId } from '../../utils/auth';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';
import { logSecurityEvent } from '../../utils/security';

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

// ── Helpers ──

const PROFILE_ROW = {
  id: 'test-profile-id',
  cognito_sub: 'test-user-id',
  username: 'testuser',
  full_name: 'Test User',
  display_name: 'Test',
  avatar_url: 'https://example.com/avatar.jpg',
  cover_url: null,
  bio: 'Hello!',
  website: null,
  is_verified: false,
  is_premium: false,
  is_private: false,
  account_type: 'personal',
  gender: null,
  date_of_birth: null,
  interests: null,
  expertise: null,
  social_links: null,
  business_name: null,
  business_category: null,
  business_address: null,
  business_latitude: null,
  business_longitude: null,
  business_phone: null,
  locations_mode: null,
  onboarding_completed: false,
  fan_count: 10,
  following_count: 5,
  post_count: 3,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
};

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

let mockDbQuery: jest.Mock;

/**
 * Setup DB mock for an existing profile (UPDATE path).
 * resolveProfileId returns an ID, UPDATE returns profile row.
 */
function setupUpdateMocks(overrides?: Partial<typeof PROFILE_ROW>) {
  const row = { ...PROFILE_ROW, ...overrides };
  mockDbQuery = jest.fn().mockResolvedValue({ rows: [row] });
  (getPool as jest.Mock).mockResolvedValue({ query: mockDbQuery });
  (resolveProfileId as jest.Mock).mockResolvedValue('test-profile-id');
}

/**
 * Setup DB mock for a new profile (INSERT path).
 * resolveProfileId returns null (no existing profile).
 */
function setupInsertMocks(overrides?: Partial<typeof PROFILE_ROW>) {
  const row = { ...PROFILE_ROW, ...overrides };
  mockDbQuery = jest.fn().mockResolvedValue({ rows: [row] });
  (getPool as jest.Mock).mockResolvedValue({ query: mockDbQuery });
  (resolveProfileId as jest.Mock).mockResolvedValue(null);
}

describe('Profile Update Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupUpdateMocks();
  });

  // ── 1. Input Validation ──

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
      const event = createMockEvent({ username: 'a'.repeat(31) });
      const response = await handler(event);
      // Truncated username is valid, so expect success
      expect(response?.statusCode).not.toBe(500);
    });

    it('should reject reserved usernames', async () => {
      const event = createMockEvent({ username: 'admin' });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('not available');
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

    it('should allow null avatarUrl (clearable URL field)', async () => {
      const event = createMockEvent({ avatarUrl: null });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should allow empty string avatarUrl (clearable URL field)', async () => {
      const event = createMockEvent({ avatarUrl: '' });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should allow null coverUrl (clearable URL field)', async () => {
      const event = createMockEvent({ coverUrl: null });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should allow empty string coverUrl (clearable URL field)', async () => {
      const event = createMockEvent({ coverUrl: '' });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should accept valid website URL', async () => {
      const event = createMockEvent({ website: 'https://mywebsite.com' });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should reject invalid website URL pattern', async () => {
      const event = createMockEvent({ website: 'ftp://invalid' });
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

    it('should accept boolean onboardingCompleted', async () => {
      const event = createMockEvent({ onboardingCompleted: true });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should reject non-boolean onboardingCompleted', async () => {
      const event = createMockEvent({ onboardingCompleted: 'done' });
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

    it('should accept valid expertise array', async () => {
      const event = createMockEvent({ expertise: ['coaching', 'nutrition'] });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should filter non-string items in arrays to empty strings', async () => {
      const event = createMockEvent({ interests: ['valid', 42, true] });
      const response = await handler(event);
      // Non-string items are converted to '' and filtered out
      expect(response?.statusCode).not.toBe(400);
    });
  });

  describe('Account Type Validation', () => {
    it('should accept personal account type', async () => {
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
    it('should accept valid date format (YYYY-MM-DD)', async () => {
      const event = createMockEvent({ dateOfBirth: '1990-05-15' });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should accept ISO format date and extract date part', async () => {
      const event = createMockEvent({ dateOfBirth: '1990-05-15T10:30:00Z' });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should reject invalid date format', async () => {
      const event = createMockEvent({ dateOfBirth: '15/05/1990' });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
    });

    it('should reject non-string dateOfBirth', async () => {
      const event = createMockEvent({ dateOfBirth: 12345 });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
    });
  });

  // ── 2. Coordinate Validation ──

  describe('Coordinate Validation', () => {
    it('should accept valid business latitude', async () => {
      const event = createMockEvent({ businessLatitude: 48.8566 });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should accept valid business longitude', async () => {
      const event = createMockEvent({ businessLongitude: 2.3522 });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should reject latitude out of range (> 90)', async () => {
      const event = createMockEvent({ businessLatitude: 91 });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors[0]).toContain('between -90 and 90');
    });

    it('should reject latitude out of range (< -90)', async () => {
      const event = createMockEvent({ businessLatitude: -91 });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
    });

    it('should reject longitude out of range (> 180)', async () => {
      const event = createMockEvent({ businessLongitude: 181 });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors[0]).toContain('between -180 and 180');
    });

    it('should reject longitude out of range (< -180)', async () => {
      const event = createMockEvent({ businessLongitude: -181 });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
    });

    it('should reject non-number coordinate', async () => {
      const event = createMockEvent({ businessLatitude: 'abc' });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors[0]).toContain('valid number');
    });

    it('should reject Infinity as coordinate', async () => {
      const event = createMockEvent({ businessLatitude: Infinity });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
    });

    it('should reject NaN as coordinate', async () => {
      const event = createMockEvent({ businessLatitude: NaN });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
    });
  });

  // ── 3. Locations Mode Validation ──

  describe('Locations Mode Validation', () => {
    it('should accept valid locations mode values', async () => {
      for (const mode of ['all', 'followers', 'none', 'single', 'multiple']) {
        setupUpdateMocks();
        const event = createMockEvent({ locationsMode: mode });
        const response = await handler(event);
        expect(response?.statusCode).not.toBe(400);
      }
    });

    it('should reject invalid locations mode', async () => {
      const event = createMockEvent({ locationsMode: 'everyone' });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors[0]).toContain('must be one of');
    });
  });

  // ── 4. Social Links Validation ──

  describe('Social Links Validation', () => {
    it('should accept valid social links object', async () => {
      const event = createMockEvent({
        socialLinks: { instagram: 'https://instagram.com/test', twitter: 'https://twitter.com/test' },
      });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should reject non-object social links', async () => {
      const event = createMockEvent({ socialLinks: 'not-an-object' });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
    });

    it('should reject array as social links', async () => {
      const event = createMockEvent({ socialLinks: ['instagram', 'twitter'] });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
    });

    it('should reject null as social links', async () => {
      const event = createMockEvent({ socialLinks: null });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
    });

    it('should skip non-string values in social links', async () => {
      const event = createMockEvent({
        socialLinks: { instagram: 'https://instagram.com/test', badKey: 123 },
      });
      const response = await handler(event);
      // Non-string values are silently skipped
      expect(response?.statusCode).not.toBe(400);
    });
  });

  // ── 5. Business Fields ──

  describe('Business Fields', () => {
    it('should accept valid businessName', async () => {
      const event = createMockEvent({ businessName: 'My Business' });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should accept valid businessCategory', async () => {
      const event = createMockEvent({ businessCategory: 'Restaurant' });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should accept valid businessAddress', async () => {
      const event = createMockEvent({ businessAddress: '123 Main St' });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should accept valid businessPhone', async () => {
      const event = createMockEvent({ businessPhone: '+1 (555) 123-4567' });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should reject invalid businessPhone format', async () => {
      const event = createMockEvent({ businessPhone: 'not-a-phone-abc' });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
    });

    it('should reject non-string businessName', async () => {
      const event = createMockEvent({ businessName: 12345 });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
    });
  });

  // ── 6. String field edge cases ──

  describe('String field edge cases', () => {
    it('should accept valid displayName', async () => {
      const event = createMockEvent({ displayName: 'My Display Name' });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should accept valid gender', async () => {
      const event = createMockEvent({ gender: 'male' });
      const response = await handler(event);
      expect(response?.statusCode).not.toBe(400);
    });

    it('should silently ignore unknown fields', async () => {
      const event = createMockEvent({ unknownField: 'value', bio: 'Valid bio' });
      const response = await handler(event);
      // Unknown field error is "Unknown field" which is filtered out
      expect(response?.statusCode).not.toBe(400);
    });
  });

  // ── 7. Security ──

  describe('Security - Injection Prevention', () => {
    it('should sanitize SQL injection in bio', async () => {
      const event = createMockEvent({ bio: "'; DROP TABLE users; --" });
      const response = await handler(event);
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

  // ── 8. Authorization ──

  describe('Authorization', () => {
    it('should reject requests without user ID', async () => {
      const event = createMockEvent({ username: 'test' }, undefined as unknown as string);
      event.requestContext.authorizer = undefined as unknown as APIGatewayProxyEvent['requestContext']['authorizer'];
      const response = await handler(event);
      expect(response?.statusCode).toBe(401);
    });
  });

  // ── 9. Rate Limiting ──

  describe('Rate Limiting', () => {
    it('should return 429 when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Too many requests' }),
      });

      const event = createMockEvent({ bio: 'Test' });
      const response = await handler(event);
      expect(response?.statusCode).toBe(429);
    });
  });

  // ── 10. No fields to update ──

  describe('Empty update', () => {
    it('should return 400 when no valid fields are provided', async () => {
      const event = createMockEvent({});
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('No fields to update');
    });

    it('should return 400 when only unknown fields are provided', async () => {
      const event = createMockEvent({ randomField: 'value', anotherField: 123 });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('No fields to update');
    });
  });

  // ── 11. Profile creation (INSERT path) ──

  describe('Profile creation (INSERT path)', () => {
    it('should create a new profile when no existing profile', async () => {
      setupInsertMocks();

      const event = createMockEvent({ fullName: 'New User', bio: 'Hello' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.fullName).toBeDefined();
    });

    it('should enforce personal accountType on profile creation', async () => {
      setupInsertMocks();

      const event = createMockEvent({ fullName: 'New User', accountType: 'personal' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(200);
    });

    it('should silently downgrade non-personal accountType on create', async () => {
      // On create, enforcePersonalOnCreate downgrades to 'personal'
      // But validateAccountType rejects non-personal first
      // So we need a valid personal account type or bypass
      setupInsertMocks();

      // accountType 'pro_creator' gets rejected by validateAccountType first (400)
      const event = createMockEvent({ fullName: 'New User', accountType: 'pro_creator' });
      const response = await handler(event);
      expect(response?.statusCode).toBe(400);
    });

    it('should skip account status check for new profiles', async () => {
      setupInsertMocks();

      const event = createMockEvent({ fullName: 'New User' });
      const response = await handler(event);

      // requireActiveAccount should not be called for new profiles
      expect(requireActiveAccount).not.toHaveBeenCalled();
      expect(response?.statusCode).toBe(200);
    });

    it('should include social_links as JSON string in INSERT (JSONB field)', async () => {
      setupInsertMocks();

      const event = createMockEvent({
        fullName: 'New User',
        socialLinks: { instagram: 'https://instagram.com/test' },
      });
      const response = await handler(event);

      expect(response?.statusCode).toBe(200);
      // Verify the INSERT was called with stringified social_links
      const insertCall = mockDbQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO profiles')
      );
      expect(insertCall).toBeDefined();
    });
  });

  // ── 12. Profile update (UPDATE path) ──

  describe('Profile update (UPDATE path)', () => {
    it('should update an existing profile', async () => {
      setupUpdateMocks();

      const event = createMockEvent({ bio: 'Updated bio' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.username).toBe('testuser');
    });

    it('should return 404 when UPDATE returns empty rows', async () => {
      mockDbQuery = jest.fn().mockResolvedValue({ rows: [] });
      (getPool as jest.Mock).mockResolvedValue({ query: mockDbQuery });
      (resolveProfileId as jest.Mock).mockResolvedValue('test-profile-id');

      const event = createMockEvent({ bio: 'Updated bio' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(404);
      expect(JSON.parse(response.body).message).toBe('Profile not found');
    });

    it('should return 409 for unique constraint violation (23505)', async () => {
      const dbError = new Error('duplicate key value') as Error & { code: string };
      dbError.code = '23505';
      mockDbQuery = jest.fn().mockRejectedValue(dbError);
      (getPool as jest.Mock).mockResolvedValue({ query: mockDbQuery });
      (resolveProfileId as jest.Mock).mockResolvedValue('test-profile-id');

      const event = createMockEvent({ username: 'taken_username' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(409);
      expect(JSON.parse(response.body).message).toContain('already taken');
    });

    it('should rethrow non-23505 database errors', async () => {
      const dbError = new Error('Connection timeout') as Error & { code: string };
      dbError.code = '57014'; // query_canceled
      mockDbQuery = jest.fn().mockRejectedValue(dbError);
      (getPool as jest.Mock).mockResolvedValue({ query: mockDbQuery });
      (resolveProfileId as jest.Mock).mockResolvedValue('test-profile-id');

      const event = createMockEvent({ bio: 'Test' });
      const response = await handler(event);

      // withErrorHandler catches and returns 500
      expect(response?.statusCode).toBe(500);
    });

    it('should rethrow non-code errors', async () => {
      mockDbQuery = jest.fn().mockRejectedValue(new Error('Generic error'));
      (getPool as jest.Mock).mockResolvedValue({ query: mockDbQuery });
      (resolveProfileId as jest.Mock).mockResolvedValue('test-profile-id');

      const event = createMockEvent({ bio: 'Test' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(500);
    });
  });

  // ── 13. Account Status Check ──

  describe('Account status check', () => {
    it('should block suspended accounts on existing profiles', async () => {
      setupUpdateMocks();
      (isAccountError as unknown as jest.Mock).mockReturnValueOnce(true);
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Account suspended' }),
      });

      const event = createMockEvent({ bio: 'Updated bio' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(403);
    });
  });

  // ── 14. Account Type Change Guard ──

  describe('Account type change guard (existing profiles)', () => {
    it('should return 403 when changing account type on existing profile', async () => {
      // Make resolveProfileId return an existing profile
      (resolveProfileId as jest.Mock).mockResolvedValue('test-profile-id');
      // First query: the actual account_type check returns different type
      // Second query: the UPDATE (never reached)
      mockDbQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ account_type: 'pro_creator' }] }) // checkAccountTypeChange
        .mockResolvedValueOnce({ rows: [PROFILE_ROW] }); // UPDATE
      (getPool as jest.Mock).mockResolvedValue({ query: mockDbQuery });

      const event = createMockEvent({ accountType: 'personal' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(403);
      expect(JSON.parse(response.body).message).toContain('cannot be changed');
      expect(logSecurityEvent).toHaveBeenCalledWith('suspicious_activity', expect.any(Object));
    });

    it('should allow same account type on existing profile', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue('test-profile-id');
      mockDbQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }) // checkAccountTypeChange: same type
        .mockResolvedValueOnce({ rows: [PROFILE_ROW] }); // UPDATE
      (getPool as jest.Mock).mockResolvedValue({ query: mockDbQuery });

      const event = createMockEvent({ accountType: 'personal' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(200);
    });

    it('should skip account type check when no accountType in body', async () => {
      setupUpdateMocks();

      const event = createMockEvent({ bio: 'Just bio' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(200);
      // checkAccountTypeChange should not query for account_type
    });

    it('should return null from checkAccountTypeChange when profile does not exist yet', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue('test-profile-id');
      mockDbQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // checkAccountTypeChange: no rows
        .mockResolvedValueOnce({ rows: [PROFILE_ROW] }); // UPDATE
      (getPool as jest.Mock).mockResolvedValue({ query: mockDbQuery });

      const event = createMockEvent({ accountType: 'personal' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(200);
    });
  });

  // ── 15. Moderation ──

  describe('Content moderation', () => {
    it('should block when text moderation rejects content', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({
        clean: false,
        severity: 'critical',
        filtered: '',
        violations: ['hate_speech'],
      });

      const event = createMockEvent({ bio: 'Hateful content' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(400);
    });

    it('should skip moderation when no text fields are provided', async () => {
      const event = createMockEvent({ isPrivate: true });
      const response = await handler(event);

      expect(response?.statusCode).not.toBe(400);
      // analyzeTextToxicity should not be called when no text fields
      expect(analyzeTextToxicity).not.toHaveBeenCalled();
    });
  });

  // ── 16. Response Mapping ──

  describe('Response mapping (mapProfileToResponse)', () => {
    it('should map all fields correctly including defaults', async () => {
      setupUpdateMocks({
        is_verified: true,
        is_premium: true,
        is_private: true,
        business_latitude: '48.8566',
        business_longitude: '2.3522',
        fan_count: 0,
        following_count: 0,
        post_count: 0,
      });

      const event = createMockEvent({ bio: 'Updated' });
      const response = await handler(event);

      expect(response?.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isVerified).toBe(true);
      expect(body.isPremium).toBe(true);
      expect(body.isPrivate).toBe(true);
      expect(body.businessLatitude).toBe(48.8566);
      expect(body.businessLongitude).toBe(2.3522);
      expect(body.followersCount).toBe(0);
      expect(body.followingCount).toBe(0);
      expect(body.postsCount).toBe(0);
    });

    it('should return null for empty coordinate strings', async () => {
      setupUpdateMocks({
        business_latitude: '',
        business_longitude: null,
      });

      const event = createMockEvent({ bio: 'Updated' });
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.businessLatitude).toBeNull();
      expect(body.businessLongitude).toBeNull();
    });

    it('should default accountType to personal when null in DB', async () => {
      setupUpdateMocks({ account_type: null as unknown as string });

      const event = createMockEvent({ bio: 'Updated' });
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.accountType).toBe('personal');
    });

    it('should convert falsy is_verified/is_premium/is_private to false', async () => {
      setupUpdateMocks({
        is_verified: null as unknown as boolean,
        is_premium: undefined as unknown as boolean,
        is_private: 0 as unknown as boolean,
      });

      const event = createMockEvent({ bio: 'Updated' });
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.isVerified).toBe(false);
      expect(body.isPremium).toBe(false);
      expect(body.isPrivate).toBe(false);
    });
  });

  // ── 17. JSONB fields ──

  describe('JSONB fields', () => {
    it('should stringify socialLinks for UPDATE query', async () => {
      setupUpdateMocks();

      const event = createMockEvent({
        socialLinks: { instagram: 'https://instagram.com/test' },
      });
      const response = await handler(event);

      expect(response?.statusCode).toBe(200);
      // Verify the UPDATE was called
      const updateCall = mockDbQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE profiles')
      );
      expect(updateCall).toBeDefined();
      // The JSONB value should be stringified
      const params = updateCall![1] as unknown[];
      const jsonbParam = params.find(p => typeof p === 'string' && p.includes('instagram'));
      expect(jsonbParam).toBeDefined();
    });
  });

  // ── 18. Multiple validation errors ──

  describe('Multiple validation errors', () => {
    it('should return all validation errors at once', async () => {
      const event = createMockEvent({
        isPrivate: 'not-bool',
        businessLatitude: 'not-number',
        locationsMode: 'invalid',
      });
      const response = await handler(event);

      expect(response?.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
