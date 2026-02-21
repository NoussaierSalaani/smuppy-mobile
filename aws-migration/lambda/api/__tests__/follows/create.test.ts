/**
 * Tests for follows/create Lambda handler
 * Covers: auth, validation, happy path, self-follow, duplicate, DB errors, UUID security
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
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
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../services/push-notification', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'generated-uuid-0000-0000-000000000000'),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

import { handler } from '../../follows/create';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ───────────────────────────────────────────────────────

const FOLLOWER_COGNITO_SUB = 'cognito-sub-follower-001';
const FOLLOWER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TARGET_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<{
  body: string | null;
  cognitoSub: string | null;
}>): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: overrides.body !== undefined ? overrides.body : JSON.stringify({ followingId: TARGET_ID }),
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.cognitoSub === null
        ? undefined
        : { claims: { sub: overrides.cognitoSub ?? FOLLOWER_COGNITO_SUB } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ───────────────────────────────────────────────────────────

describe('follows/create handler', () => {
  let mockDb: { query: jest.Mock; connect: jest.Mock };
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (resolveProfileId as jest.Mock).mockResolvedValue(FOLLOWER_ID);
  });

  // ── 1. Auth ────────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const event = makeEvent({ cognitoSub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should return 401 when authorizer has no sub', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ followingId: TARGET_ID }),
        requestContext: {
          requestId: 'test-request-id',
          authorizer: { claims: {} },
          identity: { sourceIp: '127.0.0.1' },
        },
      } as unknown as APIGatewayProxyEvent;

      const result = await handler(event);
      expect(result.statusCode).toBe(401);
    });
  });

  // ── 2. Validation ─────────────────────────────────────────────────────

  describe('validation', () => {
    it('should return 400 when followingId is missing', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Valid followingId is required');
    });

    it('should return 400 when body is invalid JSON', async () => {
      const event = makeEvent({ body: 'not-json' });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid JSON body');
    });

    it('should return 400 when followingId is null', async () => {
      const event = makeEvent({ body: JSON.stringify({ followingId: null }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Valid followingId is required');
    });
  });

  // ── 7. Security: UUID validation ──────────────────────────────────────

  describe('UUID security', () => {
    const invalidUUIDs = [
      'not-a-uuid',
      '12345',
      'a1b2c3d4-e5f6-7890-abcd',            // too short
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890'; DROP TABLE follows;--", // SQL injection
      '<script>alert(1)</script>',
      '',
    ];

    it.each(invalidUUIDs)('should return 400 for invalid UUID: %s', async (badId) => {
      const event = makeEvent({ body: JSON.stringify({ followingId: badId }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Valid followingId is required');
    });
  });

  // ── 3. Happy path: successful follow ──────────────────────────────────

  describe('happy path', () => {
    beforeEach(() => {
      // Query 1: resolve follower profile
      // Query 2: check target user exists
      // Query 3: block check
      // Query 4: cooldown check
      // Query 5: existing follow check
      // Query 6: follower profile for push notification (outside transaction)
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: FOLLOWER_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('FROM profiles WHERE id') && !sql.includes('FOR UPDATE')) {
          // Could be target or follower profile lookup
          if (sql.includes('is_private')) {
            return Promise.resolve({
              rows: [{ id: TARGET_ID, is_private: false, moderation_status: 'active' }],
            });
          }
          // Follower profile for push notification
          return Promise.resolve({
            rows: [{ username: 'testuser', full_name: 'Test User' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('follow_cooldowns')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('FROM follows WHERE')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      // Transaction queries (BEGIN, FOR UPDATE, INSERT follows, INSERT notification, COMMIT)
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FOR UPDATE')) {
          return Promise.resolve({ rows: [{ is_private: false }] });
        }
        if (typeof sql === 'string' && sql.includes('full_name')) {
          return Promise.resolve({ rows: [{ full_name: 'Test User', username: 'testuser' }] });
        }
        return Promise.resolve({ rows: [] });
      });
    });

    it('should return 201 and create a follow for a public account', async () => {
      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.type).toBe('followed');
      expect(body.message).toBe('Successfully followed user');
    });

    it('should return 201 with pending status for a private account', async () => {
      // Override target profile to be private
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: FOLLOWER_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('is_private')) {
          return Promise.resolve({
            rows: [{ id: TARGET_ID, is_private: true, moderation_status: 'active' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('follow_cooldowns')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('FROM follows WHERE')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [{ username: 'testuser', full_name: 'Test User' }] });
      });

      // Transaction: FOR UPDATE returns private
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FOR UPDATE')) {
          return Promise.resolve({ rows: [{ is_private: true }] });
        }
        if (typeof sql === 'string' && sql.includes('full_name')) {
          return Promise.resolve({ rows: [{ full_name: 'Test User', username: 'testuser' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.type).toBe('request_created');
      expect(body.message).toBe('Follow request sent');
    });

    it('should insert the follow record into the database', async () => {
      const event = makeEvent({});
      await handler(event);

      // Verify INSERT INTO follows was called in the transaction
      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO follows')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toEqual(expect.arrayContaining([FOLLOWER_ID, TARGET_ID]));
    });
  });

  // ── 4. Cannot follow yourself ─────────────────────────────────────────

  describe('self-follow prevention', () => {
    it('should return 400 when trying to follow yourself', async () => {
      // Follower resolves to the same ID as the target
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(TARGET_ID);

      const event = makeEvent({ body: JSON.stringify({ followingId: TARGET_ID }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Cannot follow yourself');
    });
  });

  // ── 5. Duplicate follow (idempotent) ──────────────────────────────────

  describe('duplicate follow handling', () => {
    beforeEach(() => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: FOLLOWER_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('is_private')) {
          return Promise.resolve({
            rows: [{ id: TARGET_ID, is_private: false, moderation_status: 'active' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('follow_cooldowns')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });
    });

    it('should return 200 with already_following when follow already accepted', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: FOLLOWER_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('is_private')) {
          return Promise.resolve({
            rows: [{ id: TARGET_ID, is_private: false, moderation_status: 'active' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('follow_cooldowns')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('FROM follows WHERE')) {
          return Promise.resolve({
            rows: [{ id: 'existing-follow-id', status: 'accepted', created_at: new Date().toISOString() }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.type).toBe('already_following');
    });

    it('should return 200 with already_requested when follow request is pending', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: FOLLOWER_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('is_private')) {
          return Promise.resolve({
            rows: [{ id: TARGET_ID, is_private: true, moderation_status: 'active' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('follow_cooldowns')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('FROM follows WHERE')) {
          return Promise.resolve({
            rows: [{ id: 'existing-follow-id', status: 'pending', created_at: new Date().toISOString() }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.type).toBe('already_requested');
    });
  });

  // ── 6. Database errors -> 500 ─────────────────────────────────────────

  describe('database errors', () => {
    it('should return 500 when getPool() throws', async () => {
      (getPool as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when follower profile query fails', async () => {
      mockDb.query.mockRejectedValue(new Error('Query timeout'));

      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 and ROLLBACK when transaction fails', async () => {
      // Set up successful queries up to the transaction
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: FOLLOWER_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('is_private')) {
          return Promise.resolve({
            rows: [{ id: TARGET_ID, is_private: false, moderation_status: 'active' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('follow_cooldowns')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('FROM follows WHERE')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      // Make the transaction INSERT fail
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO follows')) {
          throw new Error('Unique constraint violation');
        }
        if (typeof sql === 'string' && sql.includes('FOR UPDATE')) {
          return Promise.resolve({ rows: [{ is_private: false }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');

      // Verify ROLLBACK was called
      const rollbackCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => call[0] === 'ROLLBACK'
      );
      expect(rollbackCall).toBeDefined();

      // Verify client was released
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ── Additional edge cases ─────────────────────────────────────────────

  describe('edge cases', () => {
    it('should return 404 when follower profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });

    it('should return 404 when target user does not exist', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: FOLLOWER_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('is_private')) {
          return Promise.resolve({ rows: [] }); // target not found
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User not found');
    });

    it('should return 403 when target user is banned', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: FOLLOWER_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('is_private')) {
          return Promise.resolve({
            rows: [{ id: TARGET_ID, is_private: false, moderation_status: 'banned' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Cannot follow this user');
    });

    it('should return 403 when there is a block relationship', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: FOLLOWER_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('is_private')) {
          return Promise.resolve({
            rows: [{ id: TARGET_ID, is_private: false, moderation_status: 'active' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [{ 1: 1 }] }); // block exists
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Cannot follow this user');
    });

    it('should return 403 when target user is suspended', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: FOLLOWER_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('is_private')) {
          return Promise.resolve({
            rows: [{ id: TARGET_ID, is_private: false, moderation_status: 'suspended' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Cannot follow this user');
    });

    it('should return 400 when body is null', async () => {
      const event = makeEvent({ body: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('should return 429 when follow cooldown is active', async () => {
      // cooldown_until must be a future date to trigger the 429
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: FOLLOWER_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('is_private')) {
          return Promise.resolve({
            rows: [{ id: TARGET_ID, is_private: false, moderation_status: 'active' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('follow_cooldowns')) {
          return Promise.resolve({
            rows: [{ unfollow_count: 3, cooldown_until: futureDate }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });
});
