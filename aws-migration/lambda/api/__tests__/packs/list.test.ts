/**
 * Tests for packs/list Lambda handler
 * Validates auth, query params (owned/creatorId), and error handling
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

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../packs/list';

// ── Test constants ──

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_CREATOR_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
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

describe('packs/list handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
  });

  describe('OPTIONS', () => {
    it('should return 200 for OPTIONS request', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
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

  describe('validation', () => {
    it('should return 400 when neither creatorId nor owned=true is specified', async () => {
      const event = makeEvent();
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Specify creatorId or owned=true');
    });
  });

  describe('owned packs', () => {
    it('should return 200 with owned packs', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{
          id: 'pack-instance-1',
          pack_id: 'pack-1',
          name: 'Yoga 5-Pack',
          description: 'Five yoga sessions',
          sessions_included: 5,
          sessions_remaining: 3,
          session_duration: 60,
          expires_at: '2026-03-20',
          creator_id: VALID_CREATOR_ID,
          creator_name: 'Yoga Master',
          creator_username: 'yogamaster',
          creator_avatar: 'https://example.com/avatar.jpg',
          created_at: '2026-02-20',
        }],
      });

      const event = makeEvent({
        queryStringParameters: { owned: 'true' },
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.packs).toHaveLength(1);
      expect(body.packs[0].name).toBe('Yoga 5-Pack');
      expect(body.packs[0].sessionsRemaining).toBe(3);
    });
  });

  describe('creator packs', () => {
    it('should return 200 with packs for a given creator', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{
          id: 'pack-1',
          name: '10-Session Pack',
          description: 'Ten sessions',
          sessions_included: 10,
          session_duration: 60,
          validity_days: 90,
          price: '99.00',
          savings_percent: 10,
          creator_id: VALID_CREATOR_ID,
          creator_name: 'Creator Name',
          creator_username: 'creator1',
          creator_avatar: 'https://example.com/avatar.jpg',
          creator_verified: true,
        }],
      });

      const event = makeEvent({
        queryStringParameters: { creatorId: VALID_CREATOR_ID },
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.packs).toHaveLength(1);
      expect(body.packs[0].price).toBe(99);
      expect(body.packs[0].creator.verified).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return 500 when database throws', async () => {
      mockDb.query.mockRejectedValue(new Error('Connection refused'));

      const event = makeEvent({
        queryStringParameters: { owned: 'true' },
      });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(500);
      expect(JSON.parse(result!.body).message).toBe('Failed to list packs');
    });
  });
});
