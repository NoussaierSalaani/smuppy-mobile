/**
 * Profile Delete Handler Unit Tests
 * Tests account soft-deletion flow: auth, happy path, security, edge cases
 */

// Set env vars before module import (handler captures USER_POOL_ID at load time)
process.env.USER_POOL_ID = 'us-east-1_TestPool';

import { APIGatewayProxyEvent } from 'aws-lambda';

// --- Mocks (must be before handler import) ---

const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn().mockResolvedValue({
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () =>
      mockConnect().then(() => ({
        query: (...args: unknown[]) => mockClientQuery(...args),
        release: () => mockClientRelease(),
      })),
  }),
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
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

const mockStripeCancelSubscription = jest.fn().mockResolvedValue({});
const mockStripeListSubscriptions = jest.fn().mockResolvedValue({ data: [] });

jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    subscriptions: {
      list: (...args: unknown[]) => mockStripeListSubscriptions(...args),
      cancel: (...args: unknown[]) => mockStripeCancelSubscription(...args),
    },
  }),
}));

const mockCognitoSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({
    send: (...args: unknown[]) => mockCognitoSend(...args),
  })),
  AdminDisableUserCommand: jest.fn((params: Record<string, unknown>) => ({ ...params, _type: 'AdminDisableUserCommand' })),
}));

import { handler } from '../../profiles/delete';
import { checkRateLimit } from '../../utils/rate-limit';

// --- Test Helpers ---

const TEST_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_COGNITO_SUB = 'cognito-sub-abc-123';

const createMockEvent = (cognitoSub?: string): APIGatewayProxyEvent =>
  ({
    body: null,
    headers: { origin: 'https://smuppy.com' },
    requestContext: {
      authorizer: cognitoSub
        ? { claims: { sub: cognitoSub } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  } as unknown as APIGatewayProxyEvent);

const createProfileRow = (overrides: Record<string, unknown> = {}) => ({
  id: TEST_UUID,
  username: 'testuser',
  stripe_customer_id: null,
  stripe_account_id: null,
  cognito_sub: TEST_COGNITO_SUB,
  is_deleted: false,
  ...overrides,
});

// --- Test Suite ---

describe('Profile Delete Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: connect resolves successfully
    mockConnect.mockResolvedValue(undefined);
    // Default: all transaction queries succeed
    mockClientQuery.mockResolvedValue({ rows: [] });
  });

  // -------------------------------------------------------
  // 1. Auth: reject unauthenticated requests (401)
  // -------------------------------------------------------
  describe('Authentication', () => {
    it('should return 401 when no authorizer is present', async () => {
      const event = createMockEvent(undefined);
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Unauthorized');
    });

    it('should return 401 when claims.sub is empty string', async () => {
      const event = createMockEvent('');
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------
  // 2. Happy path: successful account soft-delete (200)
  // -------------------------------------------------------
  describe('Happy Path - Successful Deletion', () => {
    it('should soft-delete a profile without Stripe or active subscriptions', async () => {
      const profile = createProfileRow();
      mockQuery.mockResolvedValueOnce({ rows: [profile] });

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('scheduled for deletion');

      // Should have started a transaction: BEGIN, updates/deletes, COMMIT
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      // Anonymize profile
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE profiles SET'),
        [TEST_UUID, `deleted_${TEST_UUID.substring(0, 8)}`]
      );
      // Delete push tokens
      expect(mockClientQuery).toHaveBeenCalledWith(
        'DELETE FROM push_tokens WHERE user_id = $1',
        [TEST_UUID]
      );
      // Delete websocket connections
      expect(mockClientQuery).toHaveBeenCalledWith(
        'DELETE FROM websocket_connections WHERE user_id = $1',
        [TEST_UUID]
      );
      // Cancel platform subscriptions in DB
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE platform_subscriptions'),
        [TEST_UUID]
      );
      // Cancel channel subscriptions in DB
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE channel_subscriptions'),
        [TEST_UUID]
      );
      // Client released after transaction
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should cancel Stripe subscriptions when stripe_customer_id exists', async () => {
      const profile = createProfileRow({ stripe_customer_id: 'cus_test123' });
      mockQuery.mockResolvedValueOnce({ rows: [profile] });
      mockStripeListSubscriptions.mockResolvedValueOnce({
        data: [
          { id: 'sub_abc' },
          { id: 'sub_def' },
        ],
      });

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockStripeListSubscriptions).toHaveBeenCalledWith({
        customer: 'cus_test123',
        status: 'active',
        limit: 100,
      });
      expect(mockStripeCancelSubscription).toHaveBeenCalledTimes(2);
      expect(mockStripeCancelSubscription).toHaveBeenCalledWith('sub_abc', { prorate: true });
      expect(mockStripeCancelSubscription).toHaveBeenCalledWith('sub_def', { prorate: true });
    });

    it('should not call Stripe when stripe_customer_id is null', async () => {
      const profile = createProfileRow({ stripe_customer_id: null });
      mockQuery.mockResolvedValueOnce({ rows: [profile] });

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockStripeListSubscriptions).not.toHaveBeenCalled();
      expect(mockStripeCancelSubscription).not.toHaveBeenCalled();
    });

    it('should disable the Cognito user after soft-delete', async () => {
      const profile = createProfileRow();
      mockQuery.mockResolvedValueOnce({ rows: [profile] });

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockCognitoSend).toHaveBeenCalledWith(
        expect.objectContaining({
          UserPoolId: 'us-east-1_TestPool',
          Username: TEST_COGNITO_SUB,
        })
      );
    });

    it('should still succeed if Stripe cancellation fails (best-effort)', async () => {
      const profile = createProfileRow({ stripe_customer_id: 'cus_test123' });
      mockQuery.mockResolvedValueOnce({ rows: [profile] });
      mockStripeListSubscriptions.mockRejectedValueOnce(new Error('Stripe API down'));

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      // Stripe failure is non-blocking
      expect(response.statusCode).toBe(200);
    });

    it('should still succeed if Cognito disable fails (best-effort)', async () => {
      const profile = createProfileRow();
      mockQuery.mockResolvedValueOnce({ rows: [profile] });
      mockCognitoSend.mockRejectedValueOnce(new Error('Cognito unavailable'));

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------
  // 3. Security: user can only delete their own profile
  // -------------------------------------------------------
  describe('Security - Ownership', () => {
    it('should only look up profiles by the authenticated cognito_sub from JWT', async () => {
      // Profile query returns nothing for this sub (simulates another user's sub)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = createMockEvent('some-other-cognito-sub');
      const response = await handler(event);

      // The handler queries by cognito_sub from the JWT, not from user input
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE cognito_sub = $1'),
        ['some-other-cognito-sub']
      );
      // No profile found for that sub -> 404 (no way to delete another user's profile)
      expect(response.statusCode).toBe(404);
    });

    it('should not accept user-provided profile IDs in the request body', async () => {
      // Even if a malicious user sends a body with another user's ID,
      // the handler ignores it and uses cognito_sub from JWT
      const profile = createProfileRow();
      mockQuery.mockResolvedValueOnce({ rows: [profile] });

      const event = createMockEvent(TEST_COGNITO_SUB);
      event.body = JSON.stringify({ profileId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' });

      const response = await handler(event);

      // Handler used JWT sub to find the profile, not the body's profileId
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE cognito_sub = $1'),
        [TEST_COGNITO_SUB]
      );
      expect(response.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------
  // 4. Profile not found -> 404
  // -------------------------------------------------------
  describe('Profile Not Found', () => {
    it('should return 404 when no profile matches the cognito_sub', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Profile not found');
    });
  });

  // -------------------------------------------------------
  // 5. Already deleted -> 409
  // -------------------------------------------------------
  describe('Already Deleted', () => {
    it('should return 409 when the profile is already marked as deleted', async () => {
      const profile = createProfileRow({ is_deleted: true });
      mockQuery.mockResolvedValueOnce({ rows: [profile] });

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Account is already scheduled for deletion');
    });
  });

  // -------------------------------------------------------
  // 6. Rate limiting -> 429
  // -------------------------------------------------------
  describe('Rate Limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      (checkRateLimit as jest.Mock).mockResolvedValueOnce({ allowed: false });

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Too many requests');
    });

    it('should call checkRateLimit with correct parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [createProfileRow()] });

      const event = createMockEvent(TEST_COGNITO_SUB);
      await handler(event);

      expect(checkRateLimit).toHaveBeenCalledWith({
        prefix: 'account-delete',
        identifier: TEST_COGNITO_SUB,
        windowSeconds: 3600,
        maxRequests: 2,
      });
    });
  });

  // -------------------------------------------------------
  // 7. Database errors -> 500
  // -------------------------------------------------------
  describe('Database Errors', () => {
    it('should return 500 when the profile query fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Internal server error');
    });

    it('should return 500 and ROLLBACK when a transaction query fails', async () => {
      const profile = createProfileRow();
      mockQuery.mockResolvedValueOnce({ rows: [profile] });

      // BEGIN succeeds, then the UPDATE fails
      mockClientQuery
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('Disk full')); // UPDATE profiles

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should release the DB client even when transaction fails (finally block)', async () => {
      const profile = createProfileRow();
      mockQuery.mockResolvedValueOnce({ rows: [profile] });

      mockClientQuery
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('Disk full')); // UPDATE profiles fails

      const event = createMockEvent(TEST_COGNITO_SUB);
      await handler(event);

      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it('should not leak internal error details in the response', async () => {
      mockQuery.mockRejectedValueOnce(new Error('FATAL: password authentication failed'));

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Internal server error');
      // Must not contain internal error details
      expect(response.body).not.toContain('password');
      expect(response.body).not.toContain('FATAL');
    });
  });

  // -------------------------------------------------------
  // 8. Cognito skip when cognito_sub is falsy on the profile
  // -------------------------------------------------------
  describe('Cognito Edge Cases', () => {
    it('should skip Cognito disable when profile has no cognito_sub', async () => {
      const profile = createProfileRow({ cognito_sub: null });
      mockQuery.mockResolvedValueOnce({ rows: [profile] });

      const event = createMockEvent(TEST_COGNITO_SUB);
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockCognitoSend).not.toHaveBeenCalled();
    });
  });
});
