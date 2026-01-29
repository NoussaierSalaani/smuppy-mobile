/**
 * Profile Update Handler - Complete Coverage Tests
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock database
const mockQuery = jest.fn();
jest.mock('../../../shared/db', () => ({
  getPool: jest.fn().mockResolvedValue({
    query: mockQuery,
  }),
}));

// Mock rate limiter to always allow in tests
jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

// Helper to create mock event
const createMockEvent = (body: any, userId = 'test-user-id'): APIGatewayProxyEvent => ({
  body: JSON.stringify(body),
  headers: { origin: 'https://smuppy.com' },
  requestContext: {
    requestId: 'test-request-id',
    authorizer: {
      claims: { sub: userId },
    },
    identity: { sourceIp: '127.0.0.1' },
  } as any,
} as unknown as APIGatewayProxyEvent);

describe('Profile Update Handler - Complete Coverage', () => {
  let handler: any;

  beforeAll(async () => {
    const module = await import('../../profiles/update');
    handler = module.handler;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should reject unauthenticated request', async () => {
      const event = {
        ...createMockEvent({ username: 'test' }),
        requestContext: { authorizer: null } as any,
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(401);
    });

    it('should reject missing claims', async () => {
      const event = {
        ...createMockEvent({ username: 'test' }),
        requestContext: { authorizer: { claims: {} } } as any,
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(401);
    });
  });

  describe('Input Validation', () => {
    it('should reject username with special characters', async () => {
      const event = createMockEvent({ username: 'test<script>' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.errors).toContain('username has invalid format');
    });

    it('should reject username too short', async () => {
      const event = createMockEvent({ username: 'ab' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should truncate and accept a long username', async () => {
      // Long username gets truncated to 30 chars by sanitizer
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-user-id', username: 'a'.repeat(30) }],
      });

      const event = createMockEvent({ username: 'a'.repeat(40) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid avatar URL', async () => {
      const event = createMockEvent({ avatarUrl: 'not-a-url' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors).toContain('avatarUrl has invalid format');
    });

    it('should reject javascript: URL', async () => {
      const event = createMockEvent({ avatarUrl: 'javascript:alert(1)' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid accountType', async () => {
      const event = createMockEvent({ accountType: 'invalid' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors).toContain("Invalid account type 'invalid'.");
    });

    it('should reject non-boolean isPrivate', async () => {
      const event = createMockEvent({ isPrivate: 'yes' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors).toContain('isPrivate must be a boolean');
    });

    it('should reject too many interests', async () => {
      const interests = Array(25).fill('interest');
      const event = createMockEvent({ interests });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors).toContain('interests cannot have more than 20 items');
    });

    it('should reject non-array interests', async () => {
      const event = createMockEvent({ interests: 'not-array' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid dateOfBirth format', async () => {
      const event = createMockEvent({ dateOfBirth: '01-01-2000' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors).toContain('dateOfBirth must be in YYYY-MM-DD format');
    });

    it('should reject invalid locationsMode', async () => {
      const event = createMockEvent({ locationsMode: 'invalid' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors).toContain('locationsMode must be one of: all, followers, none');
    });

    it('should reject non-boolean onboardingCompleted', async () => {
      const event = createMockEvent({ onboardingCompleted: 'yes' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should reject non-object socialLinks', async () => {
      const event = createMockEvent({ socialLinks: 'not-object' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should reject array as socialLinks', async () => {
      const event = createMockEvent({ socialLinks: ['value'] });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should handle empty body as no fields to update', async () => {
      const event = createMockEvent({});
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('No fields to update');
    });
  });

  describe('Profile Update Success', () => {
    it('should update profile with valid data', async () => {
      // Mock find profile - profile exists
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
      // Mock update
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-user-id',
          username: 'newusername',
          full_name: 'New Name',
          bio: 'New bio',
          avatar_url: null,
          cover_url: null,
          is_verified: false,
          is_private: false,
          account_type: 'personal',
        }],
      });

      const event = createMockEvent({
        username: 'newusername',
        fullName: 'New Name',
        bio: 'New bio',
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.username).toBe('newusername');
    });

    it('should handle boolean isPrivate correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-user-id',
          is_private: true,
        }],
      });

      const event = createMockEvent({ isPrivate: true });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should accept valid accountType values', async () => {
      for (const accountType of ['personal', 'pro_creator', 'pro_business']) {
        jest.clearAllMocks();
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'test-user-id', account_type: accountType }],
        });

        const event = createMockEvent({ accountType });
        const response = await handler(event);

        expect(response.statusCode).toBe(200);
      }
    });

    it('should accept valid date format', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-user-id', date_of_birth: '2000-01-15' }],
      });

      const event = createMockEvent({ dateOfBirth: '2000-01-15' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should accept valid interests array', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-user-id', interests: ['fitness', 'music'] }],
      });

      const event = createMockEvent({ interests: ['fitness', 'music'] });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should accept valid socialLinks object', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-user-id', social_links: { twitter: 'https://twitter.com/user' } }],
      });

      const event = createMockEvent({ socialLinks: { twitter: 'https://twitter.com/user' } });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should accept valid locationsMode values', async () => {
      for (const mode of ['all', 'followers', 'none']) {
        jest.clearAllMocks();
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'test-user-id', locations_mode: mode }],
        });

        const event = createMockEvent({ locationsMode: mode });
        const response = await handler(event);

        expect(response.statusCode).toBe(200);
      }
    });

    it('should handle valid HTTPS avatar URL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-user-id', avatar_url: 'https://example.com/photo.jpg' }],
      });

      const event = createMockEvent({ avatarUrl: 'https://example.com/photo.jpg' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Profile Creation (New User)', () => {
    it('should create profile if it does not exist', async () => {
      // Mock check profile - not found
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Mock insert
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-user-id',
          username: 'newuser',
          full_name: 'New User',
        }],
      });

      const event = createMockEvent({
        username: 'newuser',
        fullName: 'New User',
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.username).toBe('newuser');
    });
  });

  describe('Database Errors', () => {
    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      const event = createMockEvent({ username: 'validuser' });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).message).toBe('Internal server error');
    });

    it('should handle update returning no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No rows returned from update

      const event = createMockEvent({ username: 'validuser' });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize HTML in bio', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-user-id', bio: 'Clean bio' }],
      });

      const event = createMockEvent({ bio: '<script>alert(1)</script>Clean bio' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should accept expertise array', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-user-id', expertise: ['coding', 'design'] }],
      });

      const event = createMockEvent({ expertise: ['coding', 'design'] });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should reject non-array expertise', async () => {
      const event = createMockEvent({ expertise: 'not-array' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should reject too many expertise items', async () => {
      const expertise = Array(25).fill('skill');
      const event = createMockEvent({ expertise });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Business Fields', () => {
    it('should accept valid business fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-user-id' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-user-id',
          business_name: 'My Business',
          business_category: 'Tech',
          business_address: '123 Main St',
          business_phone: '+1-555-1234',
        }],
      });

      const event = createMockEvent({
        businessName: 'My Business',
        businessCategory: 'Tech',
        businessAddress: '123 Main St',
        businessPhone: '+1-555-1234',
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid phone format', async () => {
      const event = createMockEvent({ businessPhone: 'not-a-phone-number!@#' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });
  });
});
