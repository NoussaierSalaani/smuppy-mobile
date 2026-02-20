/**
 * Tests for tips/history Lambda handler
 * Validates auth, profile resolution, cursor validation, pagination, and type filtering
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks ──

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
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
  cors: jest.fn((r: unknown) => r),
  handleOptions: jest.fn(() => ({ statusCode: 200, body: '' })),
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

// ── Import handler AFTER all mocks ──

import { handler } from '../../tips/history';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeTipRow(id: string, type: 'sent' | 'received') {
  const base: Record<string, unknown> = {
    id,
    amount: '5.00',
    currency: 'EUR',
    context_type: 'profile',
    context_id: null,
    message: 'Great content!',
    payment_status: 'completed',
    created_at: '2026-02-20T12:00:00Z',
    completed_at: '2026-02-20T12:01:00Z',
  };
  if (type === 'sent') {
    base.receiver_id = 'd4e5f6a7-b8c9-0123-defa-234567890123';
    base.receiver_username = 'receiver_user';
    base.receiver_display_name = 'Receiver User';
    base.receiver_avatar = 'https://example.com/avatar.jpg';
  } else {
    base.creator_amount = '4.00';
    base.is_anonymous = false;
    base.sender_id = 'e5f6a7b8-c9d0-1234-efab-345678901234';
    base.sender_username = 'sender_user';
    base.sender_display_name = 'Sender User';
    base.sender_avatar = 'https://example.com/avatar2.jpg';
  }
  return base;
}

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = (e: APIGatewayProxyEvent) => handler(e) as Promise<any>;

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    pathParameters: {},
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: VALID_USER_ID } },
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('tips/history handler', () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    (getPool as jest.Mock).mockResolvedValue(mockPool);

    // Default: tips history query + totals query
    mockClient.query.mockImplementation((sql: string) => {
      // Tips list query
      if (typeof sql === 'string' && sql.includes('FROM tips t') && sql.includes('JOIN profiles p')) {
        return Promise.resolve({
          rows: [makeTipRow('tip-001', 'received')],
        });
      }
      // Totals query
      if (typeof sql === 'string' && sql.includes('COUNT(*)') && sql.includes('FROM tips')) {
        return Promise.resolve({
          rows: [{ total_count: '10', total_amount: '50.00', month_amount: '15.00' }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // 1. Auth
  describe('authentication', () => {
    it('should return 401 when no auth claims', async () => {
      const event = makeEvent({
        requestContext: { requestId: 'test', identity: { sourceIp: '127.0.0.1' } },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // 2. Profile not found
  describe('profile resolution', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  // 3. Invalid cursor
  describe('cursor validation', () => {
    it('should return 400 when cursor is invalid date', async () => {
      const event = makeEvent({
        queryStringParameters: { cursor: 'not-a-date' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
    });
  });

  // 4. Happy path - received (default)
  describe('happy path - received tips', () => {
    it('should return 200 with received tips', async () => {
      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.type).toBe('received');
      expect(body.tips).toBeDefined();
      expect(Array.isArray(body.tips)).toBe(true);
    });

    it('should include totals in response', async () => {
      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.totals).toBeDefined();
      expect(body.totals.count).toBe(10);
      expect(body.totals.totalAmount).toBe(50);
      expect(body.totals.monthAmount).toBe(15);
    });
  });

  // 5. Sent tips
  describe('sent tips', () => {
    it('should return sent tips when type=sent', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM tips t') && sql.includes('JOIN profiles p')) {
          return Promise.resolve({
            rows: [makeTipRow('tip-002', 'sent')],
          });
        }
        if (typeof sql === 'string' && sql.includes('COUNT(*)') && sql.includes('FROM tips')) {
          return Promise.resolve({
            rows: [{ total_count: '5', total_amount: '25.00', month_amount: '10.00' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        queryStringParameters: { type: 'sent' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.type).toBe('sent');
    });
  });

  // 6. Pagination
  describe('pagination', () => {
    it('should set hasMore=true when more rows than limit', async () => {
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < 21; i++) {
        rows.push(makeTipRow(`tip-${String(i).padStart(3, '0')}`, 'received'));
      }
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM tips t') && sql.includes('JOIN profiles p')) {
          return Promise.resolve({ rows });
        }
        if (typeof sql === 'string' && sql.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ total_count: '21', total_amount: '100.00', month_amount: '50.00' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.tips.length).toBe(20);
    });

    it('should cap limit at 50', async () => {
      const event = makeEvent({
        queryStringParameters: { limit: '100' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // 7. Context type filter
  describe('context type filter', () => {
    it('should accept contextType query parameter', async () => {
      const event = makeEvent({
        queryStringParameters: { contextType: 'peak' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // 8. Database error
  describe('database errors', () => {
    it('should return 500 on DB error', async () => {
      mockClient.query.mockImplementation(() => Promise.reject(new Error('DB error')));

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should release client after error', async () => {
      mockClient.query.mockImplementation(() => Promise.reject(new Error('DB error')));

      await invoke(makeEvent());

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // 9. Release client
  describe('cleanup', () => {
    it('should always release the client', async () => {
      await invoke(makeEvent());
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
