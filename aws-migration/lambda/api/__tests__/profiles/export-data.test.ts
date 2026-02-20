/**
 * Export Data Handler Unit Tests
 * GDPR data export — tests auth, rate limiting, profile not found,
 * parallel data fetch, response mapping, Content-Disposition header, and errors
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// --- Mocks (MUST be before handler import) ---

const mockQuery = jest.fn();

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn().mockResolvedValue({ query: mockQuery }),
  getReaderPool: jest.fn().mockResolvedValue({ query: mockQuery }),
}));

jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

import { handler } from '../../profiles/export-data';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';

// --- Test data ---

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PROFILE_ROW = {
  id: TEST_PROFILE_ID,
  username: 'testuser',
  full_name: 'Test User',
  display_name: 'Testy',
  email: 'test@example.com',
  bio: 'Bio text',
  avatar_url: 'https://cdn.smuppy.com/avatar.jpg',
  account_type: 'personal',
  is_verified: false,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-06-01T00:00:00Z',
  business_name: null,
  business_category: null,
  location: null,
  website: null,
  phone_number: null,
};

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub !== null
        ? { claims: { sub: overrides.sub ?? TEST_SUB } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

/** Mock all 19 parallel queries to return empty results */
function mockEmptyDataQueries() {
  // Profile query first
  mockQuery.mockResolvedValueOnce({ rows: [PROFILE_ROW] });
  // 19 parallel data queries
  for (let i = 0; i < 19; i++) {
    mockQuery.mockResolvedValueOnce({ rows: [] });
  }
}

// --- Tests ---

describe('Export Data Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  describe('Authentication', () => {
    it('should return 401 when no cognito sub is present', async () => {
      const event = makeEvent({ sub: null });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Unauthorized');
    });
  });

  describe('Rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      const rateLimitResponse = {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Too many requests' }),
      };
      (requireRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse);

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
    });
  });

  describe('Profile not found', () => {
    it('should return 404 when profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).message).toBe('Profile not found');
    });
  });

  describe('Happy path', () => {
    it('should return 200 with exported data', async () => {
      mockEmptyDataQueries();

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });

    it('should include Content-Disposition header for file download', async () => {
      mockEmptyDataQueries();

      const event = makeEvent();
      const response = await handler(event);

      expect(response.headers?.['Content-Disposition']).toMatch(
        /^attachment; filename="smuppy-data-export-\d{4}-\d{2}-\d{2}\.json"$/
      );
    });

    it('should include GDPR notice in export', async () => {
      mockEmptyDataQueries();

      const event = makeEvent();
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.data.gdprNotice).toBeDefined();
      expect(body.data.gdprNotice).toContain('GDPR');
    });

    it('should include exportedAt timestamp', async () => {
      mockEmptyDataQueries();

      const event = makeEvent();
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.data.exportedAt).toBeDefined();
    });

    it('should include profile data with camelCase mapping', async () => {
      mockEmptyDataQueries();

      const event = makeEvent();
      const response = await handler(event);

      const body = JSON.parse(response.body);
      const profile = body.data.profile;
      expect(profile.username).toBe('testuser');
      expect(profile.fullName).toBe('Test User');
      expect(profile.displayName).toBe('Testy');
      expect(profile.email).toBe('test@example.com');
      expect(profile.accountType).toBe('personal');
    });

    it('should include all data categories as arrays', async () => {
      mockEmptyDataQueries();

      const event = makeEvent();
      const response = await handler(event);

      const body = JSON.parse(response.body);
      const data = body.data;
      expect(Array.isArray(data.posts)).toBe(true);
      expect(Array.isArray(data.comments)).toBe(true);
      expect(Array.isArray(data.likes)).toBe(true);
      expect(Array.isArray(data.savedPosts)).toBe(true);
      expect(Array.isArray(data.followers)).toBe(true);
      expect(Array.isArray(data.following)).toBe(true);
      expect(Array.isArray(data.blockedUsers)).toBe(true);
      expect(Array.isArray(data.mutedUsers)).toBe(true);
      expect(Array.isArray(data.conversations)).toBe(true);
      expect(Array.isArray(data.messagesSent)).toBe(true);
      expect(Array.isArray(data.peaks)).toBe(true);
      expect(Array.isArray(data.notifications)).toBe(true);
      expect(Array.isArray(data.tipsReceived)).toBe(true);
      expect(Array.isArray(data.tipsSent)).toBe(true);
      expect(Array.isArray(data.payments)).toBe(true);
      expect(Array.isArray(data.eventsCreated)).toBe(true);
      expect(Array.isArray(data.eventsParticipated)).toBe(true);
      expect(Array.isArray(data.consentHistory)).toBe(true);
      expect(Array.isArray(data.businessSubscriptions)).toBe(true);
    });

    it('should map post data correctly', async () => {
      // Profile query
      mockQuery.mockResolvedValueOnce({ rows: [PROFILE_ROW] });
      // Posts query (first of the 19 parallel)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'post-1',
          content: 'Hello world',
          media_urls: ['https://cdn.smuppy.com/media.jpg'],
          media_type: 'image',
          tags: ['fitness'],
          likes_count: 5,
          comments_count: 2,
          visibility: 'public',
          created_at: '2025-06-01T00:00:00Z',
        }],
      });
      // Remaining 18 queries return empty
      for (let i = 0; i < 18; i++) {
        mockQuery.mockResolvedValueOnce({ rows: [] });
      }

      const event = makeEvent();
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.data.posts).toHaveLength(1);
      expect(body.data.posts[0].id).toBe('post-1');
      expect(body.data.posts[0].content).toBe('Hello world');
      expect(body.data.posts[0].mediaUrls).toEqual(['https://cdn.smuppy.com/media.jpg']);
      expect(body.data.posts[0].likesCount).toBe(5);
    });
  });

  describe('Error handling', () => {
    it('should return 500 on unexpected error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      // withErrorHandler returns { message: 'Internal server error' } without success field
      expect(body.message).toBe('Internal server error');
    });

    it('should return 500 when parallel queries fail', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PROFILE_ROW] }); // profile found
      // One of the parallel queries fails
      mockQuery.mockRejectedValueOnce(new Error('Query timeout'));

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
    });
  });
});
