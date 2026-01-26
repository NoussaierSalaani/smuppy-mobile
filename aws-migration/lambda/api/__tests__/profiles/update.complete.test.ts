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
    it('should reject empty body', async () => {
      const event = { ...createMockEvent({}), body: null };
      const response = await handler(event);
      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid JSON', async () => {
      const event = { ...createMockEvent({}), body: 'not-json' };
      const response = await handler(event);
      expect(response.statusCode).toBe(400);
    });

    it('should reject username with special characters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });

      const event = createMockEvent({ username: 'test<script>' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors).toContain('username has invalid format');
    });

    it('should reject username too short', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });

      const event = createMockEvent({ username: 'ab' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should reject username too long', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });

      const event = createMockEvent({ username: 'a'.repeat(40) });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid avatar URL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });

      const event = createMockEvent({ avatarUrl: 'not-a-url' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors).toContain('avatarUrl has invalid format');
    });

    it('should reject javascript: URL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });

      const event = createMockEvent({ avatarUrl: 'javascript:alert(1)' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid accountType', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });

      const event = createMockEvent({ accountType: 'invalid' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors).toContain('accountType must be one of: personal, creator, business');
    });

    it('should reject non-boolean isPrivate', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });

      const event = createMockEvent({ isPrivate: 'yes' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors).toContain('isPrivate must be a boolean');
    });

    it('should reject too many interests', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });

      const interests = Array(25).fill('interest');
      const event = createMockEvent({ interests });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors).toContain('interests cannot have more than 20 items');
    });

    it('should reject non-array interests', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });

      const event = createMockEvent({ interests: 'not-array' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid dateOfBirth format', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });

      const event = createMockEvent({ dateOfBirth: '01-01-2000' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).errors).toContain('dateOfBirth must be in YYYY-MM-DD format');
    });
  });

  describe('Profile Update Success', () => {
    it('should update profile with valid data', async () => {
      // Mock find profile
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });
      // Mock check username not taken
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Mock update
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'profile-1',
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
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'profile-1',
          is_private: true,
        }],
      });

      const event = createMockEvent({ isPrivate: true });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should accept valid accountType values', async () => {
      for (const accountType of ['personal', 'creator', 'business']) {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'profile-1', account_type: accountType }],
        });

        const event = createMockEvent({ accountType });
        const response = await handler(event);

        expect(response.statusCode).toBe(200);
      }
    });

    it('should accept valid date format', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'profile-1', date_of_birth: '2000-01-15' }],
      });

      const event = createMockEvent({ dateOfBirth: '2000-01-15' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Profile Not Found', () => {
    it('should return 404 for non-existent profile', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = createMockEvent({ username: 'test' });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Username Conflict', () => {
    it('should reject if username already taken', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-2' }] }); // Username taken

      const event = createMockEvent({ username: 'takenusername' });
      const response = await handler(event);

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body).message).toContain('already taken');
    });
  });

  describe('Database Errors', () => {
    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      const event = createMockEvent({ username: 'test' });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).message).toBe('Internal server error');
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize HTML in bio', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'profile-1', bio: 'Clean bio' }],
      });

      const event = createMockEvent({ bio: '<script>alert(1)</script>Clean bio' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should handle valid HTTPS avatar URL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'profile-1', avatar_url: 'https://example.com/photo.jpg' }],
      });

      const event = createMockEvent({ avatarUrl: 'https://example.com/photo.jpg' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should accept valid interests array', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'profile-1', interests: ['fitness', 'music'] }],
      });

      const event = createMockEvent({ interests: ['fitness', 'music'] });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });
  });
});
