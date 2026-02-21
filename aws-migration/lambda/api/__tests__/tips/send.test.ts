/**
 * Tests for tips/send Lambda handler
 * Validates auth, rate limit, validation, Stripe integration, and tip creation
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks ──

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

jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({
    accountType: 'personal',
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  sanitizeInput: jest.fn((text: string, _max: number) => text),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  MAX_TIP_AMOUNT_CENTS: 50000,
  PLATFORM_FEE_PERCENT: 20,
  MIN_PAYMENT_CENTS: 100,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true, violations: [], severity: 'none' }),
}));

jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({
    action: 'pass',
    maxScore: 0,
    topCategory: null,
    categories: [],
  }),
}));

jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
    },
    accounts: {
      retrieve: jest.fn().mockResolvedValue({ id: 'acct_test123' }),
    },
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test123',
        client_secret: 'pi_test123_secret',
      }),
    },
  }),
}));

jest.mock('../../../shared/stripe-resilience', () => ({
  safeStripeCall: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({}));
});

// ── Import handler AFTER all mocks ──

import { handler } from '../../tips/send';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const RECEIVER_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = (e: APIGatewayProxyEvent) => handler(e) as Promise<any>;

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({
      receiverId: RECEIVER_ID,
      amount: 500,
      currency: 'EUR',
      contextType: 'profile',
    }),
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

describe('tips/send handler', () => {
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

    // Default: sender + receiver found, tip created
    mockClient.query.mockImplementation((sql: string, params?: unknown[]) => {
      // Sender lookup
      if (typeof sql === 'string' && sql.includes('SELECT id, username, display_name, stripe_customer_id') && params?.[0] === VALID_PROFILE_ID) {
        return Promise.resolve({
          rows: [{
            id: VALID_PROFILE_ID,
            username: 'sender_user',
            display_name: 'Sender User',
            stripe_customer_id: 'cus_existing123',
          }],
        });
      }
      // Receiver lookup
      if (typeof sql === 'string' && sql.includes('SELECT p.id, p.username, p.display_name, p.stripe_account_id') && params?.[0] === RECEIVER_ID) {
        return Promise.resolve({
          rows: [{
            id: RECEIVER_ID,
            username: 'creator_user',
            display_name: 'Creator User',
            stripe_account_id: 'acct_creator123',
            account_type: 'pro_creator',
            is_verified: true,
          }],
        });
      }
      // Tip insert
      if (typeof sql === 'string' && sql.includes('INSERT INTO tips')) {
        return Promise.resolve({
          rows: [{ id: 'd4e5f6a7-b8c9-0123-defa-234567890123' }],
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

  // 3. Account status
  describe('account status', () => {
    it('should return error for suspended account', async () => {
      (isAccountError as unknown as jest.Mock).mockReturnValueOnce(true);
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        statusCode: 403,
        body: JSON.stringify({ success: false, message: 'Account suspended' }),
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(403);
    });
  });

  // 4. Rate limit
  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        body: JSON.stringify({ success: false, message: 'Too many requests.' }),
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(429);
    });
  });

  // 5. Validation
  describe('input validation', () => {
    it('should return 400 when amount is below minimum', async () => {
      const event = makeEvent({
        body: JSON.stringify({ receiverId: RECEIVER_ID, amount: 50, contextType: 'profile' }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid tip amount');
    });

    it('should return 400 when amount exceeds maximum', async () => {
      const event = makeEvent({
        body: JSON.stringify({ receiverId: RECEIVER_ID, amount: 60000, contextType: 'profile' }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when receiverId is missing', async () => {
      const event = makeEvent({
        body: JSON.stringify({ amount: 500, contextType: 'profile' }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
    });

    it('should return 400 for invalid UUID format', async () => {
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid ID format');
    });

    it('should return 400 for invalid context type', async () => {
      const event = makeEvent({
        body: JSON.stringify({ receiverId: RECEIVER_ID, amount: 500, contextType: 'invalid' }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid context type');
    });

    it('should return 400 for invalid currency', async () => {
      const event = makeEvent({
        body: JSON.stringify({ receiverId: RECEIVER_ID, amount: 500, contextType: 'profile', currency: 'GBP' }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid currency');
    });

    it('should return 400 when tipping yourself', async () => {
      const event = makeEvent({
        body: JSON.stringify({ receiverId: VALID_PROFILE_ID, amount: 500, contextType: 'profile' }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('You cannot tip yourself');
    });
  });

  // 6. Receiver validation
  describe('receiver validation', () => {
    it('should return 400 when receiver cannot receive tips (not pro_creator)', async () => {
      mockClient.query.mockImplementation((sql: string, params?: unknown[]) => {
        if (typeof sql === 'string' && sql.includes('stripe_customer_id') && params?.[0] === VALID_PROFILE_ID) {
          return Promise.resolve({
            rows: [{ id: VALID_PROFILE_ID, username: 'sender', display_name: 'Sender', stripe_customer_id: null }],
          });
        }
        if (typeof sql === 'string' && sql.includes('stripe_account_id') && params?.[0] === RECEIVER_ID) {
          return Promise.resolve({
            rows: [{ id: RECEIVER_ID, username: 'receiver', display_name: 'Receiver', stripe_account_id: null, account_type: 'personal', is_verified: false }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('This user cannot receive tips');
    });
  });

  // 7. Happy path
  describe('happy path', () => {
    it('should return 200 with tip data on success', async () => {
      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.tipId).toBeDefined();
      expect(body.clientSecret).toBeDefined();
      expect(body.paymentIntentId).toBeDefined();
      expect(body.receiver).toBeDefined();
    });

    it('should use a transaction (BEGIN/COMMIT)', async () => {
      await invoke(makeEvent());

      const calls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('BEGIN');
      expect(calls).toContain('COMMIT');
    });
  });

  // 8. Database error
  describe('database errors', () => {
    it('should return 500 on DB error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && (sql === 'ROLLBACK' || sql === 'BEGIN')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.reject(new Error('DB error'));
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Failed to process tip');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // 9. Invalid JSON body
  describe('invalid JSON body', () => {
    it('should return 400 for malformed JSON', async () => {
      const event = makeEvent({ body: 'not-json{' });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid JSON body');
    });
  });

});
