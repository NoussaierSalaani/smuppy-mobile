/**
 * Tests for packs/manage Lambda handler
 * Validates auth, rate limit, profile checks, CRUD operations, and validation
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
  corsHeaders: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  },
}));

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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('b2c3d4e5-f6a7-8901-bcde-f12345678901'),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../packs/manage';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ──

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const _VALID_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PACK_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({
      name: 'Yoga Pack',
      sessionsIncluded: 5,
      sessionDuration: 60,
      validityDays: 30,
      price: 49.99,
    }),
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: { sub: VALID_USER_ID },
      },
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('packs/manage handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);

    // Default: user is pro_creator
    mockDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('account_type FROM profiles')) {
        return Promise.resolve({ rows: [{ account_type: 'pro_creator' }] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  describe('authentication', () => {
    it('should return 401 when no authorizer claims present', async () => {
      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(401);
      expect(JSON.parse(result!.body).message).toBe('Unauthorized');
    });
  });

  describe('rate limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const event = makeEvent();
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(429);
    });
  });

  describe('profile checks', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent();
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(404);
      expect(JSON.parse(result!.body).message).toBe('Profile not found');
    });

    it('should return 403 when user is not pro_creator', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('account_type FROM profiles')) {
          return Promise.resolve({ rows: [{ account_type: 'personal' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(403);
      expect(JSON.parse(result!.body).message).toBe('Only pro creators can manage packs');
    });
  });

  describe('validation', () => {
    it('should return 400 for invalid pack ID format', async () => {
      const event = makeEvent({
        pathParameters: { id: 'not-a-uuid' },
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Invalid ID format');
    });

    it('should return 400 when required fields are missing on POST', async () => {
      const event = makeEvent({
        body: JSON.stringify({ name: 'Pack' }),
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Missing required fields');
    });

    it('should return 400 when name is too long', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          name: 'A'.repeat(101),
          sessionsIncluded: 5,
          sessionDuration: 60,
          validityDays: 30,
          price: 49.99,
        }),
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Name too long (max 100)');
    });

    it('should return 400 when sessions out of range', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          name: 'Pack',
          sessionsIncluded: 0,
          sessionDuration: 60,
          validityDays: 30,
          price: 49.99,
        }),
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(400);
    });

    it('should return 400 when price is invalid', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          name: 'Pack',
          sessionsIncluded: 5,
          sessionDuration: 60,
          validityDays: 30,
          price: -10,
        }),
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(400);
    });
  });

  describe('CREATE (POST)', () => {
    it('should return 201 with created pack on success', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('account_type FROM profiles')) {
          return Promise.resolve({ rows: [{ account_type: 'pro_creator' }] });
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO session_packs')) {
          return Promise.resolve({
            rows: [{
              id: VALID_PACK_ID,
              name: 'Yoga Pack',
              description: null,
              sessions_included: 5,
              session_duration: 60,
              validity_days: 30,
              price: '49.99',
              savings_percent: 0,
              is_active: true,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(201);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.pack.name).toBe('Yoga Pack');
      expect(body.pack.price).toBe(49.99);
    });
  });

  describe('UPDATE (PUT)', () => {
    it('should return 404 when pack not owned by user', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('account_type FROM profiles')) {
          return Promise.resolve({ rows: [{ account_type: 'pro_creator' }] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM session_packs')) {
          return Promise.resolve({ rows: [] }); // not found
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        httpMethod: 'PUT',
        pathParameters: { id: VALID_PACK_ID },
        body: JSON.stringify({ name: 'Updated Pack' }),
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(404);
      expect(JSON.parse(result!.body).message).toBe('Pack not found');
    });

    it('should return 400 when no updates provided', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('account_type FROM profiles')) {
          return Promise.resolve({ rows: [{ account_type: 'pro_creator' }] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM session_packs')) {
          return Promise.resolve({ rows: [{ id: VALID_PACK_ID }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        httpMethod: 'PUT',
        pathParameters: { id: VALID_PACK_ID },
        body: JSON.stringify({}),
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('No updates provided');
    });
  });

  describe('DELETE', () => {
    it('should return 200 on successful soft delete (has purchases)', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('account_type FROM profiles')) {
          return Promise.resolve({ rows: [{ account_type: 'pro_creator' }] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM session_packs')) {
          return Promise.resolve({ rows: [{ id: VALID_PACK_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM user_session_packs')) {
          return Promise.resolve({ rows: [{ id: 'purchase-1' }] }); // has purchases
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { id: VALID_PACK_ID },
        body: null,
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(200);
      expect(JSON.parse(result!.body).message).toBe('Pack deleted');
    });
  });

  describe('method not allowed', () => {
    it('should return 405 for unsupported HTTP methods', async () => {
      const event = makeEvent({ httpMethod: 'PATCH' });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(405);
    });
  });

  describe('error handling', () => {
    it('should return 500 when database throws', async () => {
      (resolveProfileId as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(500);
      expect(JSON.parse(result!.body).message).toBe('Failed to manage pack');
    });
  });
});
