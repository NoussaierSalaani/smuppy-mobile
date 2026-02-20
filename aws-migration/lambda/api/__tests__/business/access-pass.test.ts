/**
 * Tests for business/access-pass Lambda handler
 * GET /businesses/subscriptions/{subscriptionId}/access-pass
 * Returns member QR code access pass for a subscription.
 *
 * Strategy: mock ALL of subscription-utils and error-handler so we test
 * only the handler's orchestration logic (delegation to helpers).
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

const mockWithErrorHandler = jest.fn((name: string, fn: Function) => {
  return async (event: any) => {
    const headers = { 'Content-Type': 'application/json' };
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    try {
      return await fn(event, { headers, log });
    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
    }
  };
});
jest.mock('../../utils/error-handler', () => ({ withErrorHandler: mockWithErrorHandler }));

jest.mock('../../business/subscription-utils', () => ({
  authenticateAndResolveProfile: jest.fn(),
  isErrorResponse: jest.fn(),
  validateSubscriptionId: jest.fn(),
  getAccessPass: jest.fn(),
}));

import { handler } from '../../business/access-pass';
import {
  authenticateAndResolveProfile,
  isErrorResponse,
  validateSubscriptionId,
  getAccessPass,
} from '../../business/subscription-utils';

// ── Helpers ──

const TEST_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_SUB_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const HEADERS = { 'Content-Type': 'application/json' };

const mockDb = { query: jest.fn() };

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { subscriptionId: TEST_SUB_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: `/businesses/subscriptions/${TEST_SUB_ID}/access-pass`,
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-req',
      authorizer: { claims: { sub: 'cognito-sub-test' } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Tests ──

describe('business/access-pass handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. Auth failure ──

  describe('authentication failure', () => {
    it('returns the error response when authenticateAndResolveProfile returns an error', async () => {
      const authError = {
        statusCode: 401,
        headers: HEADERS,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
      (authenticateAndResolveProfile as jest.Mock).mockResolvedValue(authError);
      (isErrorResponse as jest.Mock).mockReturnValue(true);

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
      expect(authenticateAndResolveProfile).toHaveBeenCalledTimes(1);
      expect(validateSubscriptionId).not.toHaveBeenCalled();
      expect(getAccessPass).not.toHaveBeenCalled();
    });

    it('returns 404 when profile is not found', async () => {
      const authError = {
        statusCode: 404,
        headers: HEADERS,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      };
      (authenticateAndResolveProfile as jest.Mock).mockResolvedValue(authError);
      (isErrorResponse as jest.Mock).mockReturnValue(true);

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
      expect(getAccessPass).not.toHaveBeenCalled();
    });
  });

  // ── 2. Invalid subscription ID ──

  describe('subscription ID validation failure', () => {
    it('returns error when validateSubscriptionId returns an error object (missing ID)', async () => {
      const authContext = { profileId: TEST_PROFILE_ID, db: mockDb, userSub: 'sub-123', headers: HEADERS };
      (authenticateAndResolveProfile as jest.Mock).mockResolvedValue(authContext);
      (isErrorResponse as jest.Mock).mockReturnValue(false);

      const validationError = {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ success: false, message: 'Missing subscription ID' }),
      };
      (validateSubscriptionId as jest.Mock).mockReturnValue(validationError);

      const result = await handler(makeEvent({ pathParameters: {} }));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Missing subscription ID');
      expect(getAccessPass).not.toHaveBeenCalled();
    });

    it('returns error when validateSubscriptionId returns an error object (invalid UUID)', async () => {
      const authContext = { profileId: TEST_PROFILE_ID, db: mockDb, userSub: 'sub-123', headers: HEADERS };
      (authenticateAndResolveProfile as jest.Mock).mockResolvedValue(authContext);
      (isErrorResponse as jest.Mock).mockReturnValue(false);

      const validationError = {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ success: false, message: 'Invalid subscription ID format' }),
      };
      (validateSubscriptionId as jest.Mock).mockReturnValue(validationError);

      const result = await handler(makeEvent({ pathParameters: { subscriptionId: 'not-a-uuid' } }));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid subscription ID format');
      expect(getAccessPass).not.toHaveBeenCalled();
    });
  });

  // ── 3. Happy path ──

  describe('happy path', () => {
    it('returns 200 with access pass data when all steps succeed', async () => {
      const authContext = { profileId: TEST_PROFILE_ID, db: mockDb, userSub: 'sub-123', headers: HEADERS };
      (authenticateAndResolveProfile as jest.Mock).mockResolvedValue(authContext);
      (isErrorResponse as jest.Mock).mockReturnValue(false);
      (validateSubscriptionId as jest.Mock).mockReturnValue(TEST_SUB_ID);

      const accessPassResponse = {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          success: true,
          accessPass: {
            id: TEST_SUB_ID,
            qrCode: '{"type":"smuppy_access"}',
            memberName: 'Alice',
            membershipType: 'Premium',
            validUntil: '2026-12-31',
            status: 'active',
            remainingSessions: 15,
            businessName: 'Gym A',
            businessLogo: null,
          },
        }),
      };
      (getAccessPass as jest.Mock).mockResolvedValue(accessPassResponse);

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.accessPass).toBeDefined();
      expect(body.accessPass.memberName).toBe('Alice');
      expect(body.accessPass.remainingSessions).toBe(15);
      expect(body.accessPass.businessName).toBe('Gym A');
    });
  });

  // ── 4. Verify getAccessPass called with correct params ──

  describe('parameter forwarding', () => {
    it('calls getAccessPass with (db, subscriptionId, profileId, headers)', async () => {
      const authContext = { profileId: TEST_PROFILE_ID, db: mockDb, userSub: 'sub-123', headers: HEADERS };
      (authenticateAndResolveProfile as jest.Mock).mockResolvedValue(authContext);
      (isErrorResponse as jest.Mock).mockReturnValue(false);
      (validateSubscriptionId as jest.Mock).mockReturnValue(TEST_SUB_ID);
      (getAccessPass as jest.Mock).mockResolvedValue({
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ success: true, accessPass: {} }),
      });

      await handler(makeEvent());

      expect(getAccessPass).toHaveBeenCalledTimes(1);
      expect(getAccessPass).toHaveBeenCalledWith(
        mockDb,
        TEST_SUB_ID,
        TEST_PROFILE_ID,
        expect.objectContaining({ 'Content-Type': 'application/json' }),
      );
    });

    it('passes the event to authenticateAndResolveProfile', async () => {
      const authContext = { profileId: TEST_PROFILE_ID, db: mockDb, userSub: 'sub-123', headers: HEADERS };
      (authenticateAndResolveProfile as jest.Mock).mockResolvedValue(authContext);
      (isErrorResponse as jest.Mock).mockReturnValue(false);
      (validateSubscriptionId as jest.Mock).mockReturnValue(TEST_SUB_ID);
      (getAccessPass as jest.Mock).mockResolvedValue({
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ success: true, accessPass: {} }),
      });

      const event = makeEvent();
      await handler(event);

      expect(authenticateAndResolveProfile).toHaveBeenCalledWith(event);
    });

    it('passes event and headers to validateSubscriptionId', async () => {
      const authContext = { profileId: TEST_PROFILE_ID, db: mockDb, userSub: 'sub-123', headers: HEADERS };
      (authenticateAndResolveProfile as jest.Mock).mockResolvedValue(authContext);
      (isErrorResponse as jest.Mock).mockReturnValue(false);
      (validateSubscriptionId as jest.Mock).mockReturnValue(TEST_SUB_ID);
      (getAccessPass as jest.Mock).mockResolvedValue({
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ success: true, accessPass: {} }),
      });

      const event = makeEvent();
      await handler(event);

      expect(validateSubscriptionId).toHaveBeenCalledTimes(1);
      expect(validateSubscriptionId).toHaveBeenCalledWith(
        event,
        expect.objectContaining({ 'Content-Type': 'application/json' }),
      );
    });
  });

  // ── 5. getAccessPass failure propagates ──

  describe('getAccessPass failure propagation', () => {
    it('returns 404 when getAccessPass returns a 404 error', async () => {
      const authContext = { profileId: TEST_PROFILE_ID, db: mockDb, userSub: 'sub-123', headers: HEADERS };
      (authenticateAndResolveProfile as jest.Mock).mockResolvedValue(authContext);
      (isErrorResponse as jest.Mock).mockReturnValue(false);
      (validateSubscriptionId as jest.Mock).mockReturnValue(TEST_SUB_ID);

      const notFoundResponse = {
        statusCode: 404,
        headers: HEADERS,
        body: JSON.stringify({ success: false, message: 'Subscription not found or not owned by you' }),
      };
      (getAccessPass as jest.Mock).mockResolvedValue(notFoundResponse);

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Subscription not found or not owned by you');
    });

    it('returns 500 when getAccessPass throws an error', async () => {
      const authContext = { profileId: TEST_PROFILE_ID, db: mockDb, userSub: 'sub-123', headers: HEADERS };
      (authenticateAndResolveProfile as jest.Mock).mockResolvedValue(authContext);
      (isErrorResponse as jest.Mock).mockReturnValue(false);
      (validateSubscriptionId as jest.Mock).mockReturnValue(TEST_SUB_ID);

      (getAccessPass as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('returns 500 when authenticateAndResolveProfile throws an error', async () => {
      (authenticateAndResolveProfile as jest.Mock).mockRejectedValue(new Error('Unexpected auth error'));

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });

  // ── withErrorHandler registration ──

  describe('withErrorHandler registration', () => {
    it('exports handler as a function created by withErrorHandler', () => {
      // withErrorHandler is called at module load time to wrap the inner handler.
      // The exported handler is the function returned by mockWithErrorHandler.
      expect(typeof handler).toBe('function');
    });

    it('withErrorHandler was invoked with "business-access-pass" name', () => {
      // Re-import to capture the registration call on a fresh mock
      jest.resetModules();

      const freshMock = jest.fn((name: string, fn: Function) => {
        return async (event: any) => {
          const h = { 'Content-Type': 'application/json' };
          const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
          return await fn(event, { headers: h, log });
        };
      });
      jest.doMock('../../utils/error-handler', () => ({ withErrorHandler: freshMock }));
      jest.doMock('../../business/subscription-utils', () => ({
        authenticateAndResolveProfile: jest.fn(),
        isErrorResponse: jest.fn(),
        validateSubscriptionId: jest.fn(),
        getAccessPass: jest.fn(),
      }));

      require('../../business/access-pass');

      expect(freshMock).toHaveBeenCalledTimes(1);
      expect(freshMock).toHaveBeenCalledWith('business-access-pass', expect.any(Function));
    });
  });
});
