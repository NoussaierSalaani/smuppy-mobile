/**
 * Tests for services/push-notification service module
 * Tests exported functions: sendPushNotification, sendPushNotificationBatch, sendPushToUser
 */

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

const mockSnsSend = jest.fn().mockResolvedValue({});
const mockSecretsManagerSend = jest.fn().mockResolvedValue({
  SecretString: 'expo-test-token',
});

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({ send: mockSnsSend })),
  PublishCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: mockSecretsManagerSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
  messaging: jest.fn(() => ({
    send: jest.fn().mockResolvedValue('msg-id-123'),
    sendEach: jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
  })),
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

// Mock global fetch for Expo push API
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ data: [{ status: 'ok' }] }),
  text: () => Promise.resolve(''),
});

global.fetch = mockFetch;

// ── Import AFTER all mocks are declared ──

import { sendPushNotification, sendPushToUser, PushNotificationPayload, PushTarget } from '../../services/push-notification';

// ── Test constants ──

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_ACTOR_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const PAYLOAD: PushNotificationPayload = {
  title: 'Test Notification',
  body: 'This is a test',
  data: { type: 'like' },
};

// ── Helpers ──

function createMockDb() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  } as unknown as import('pg').Pool;
}

// ── Test suite ──

describe('push-notification service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ status: 'ok' }] }),
      text: () => Promise.resolve(''),
    });
  });

  describe('sendPushNotification', () => {
    it('should send via Expo API for ExponentPushToken', async () => {
      const target: PushTarget = {
        platform: 'ios',
        token: 'ExponentPushToken[abc123]',
      };

      const result = await sendPushNotification(target, PAYLOAD);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('should send via Expo API for ExpoPushToken', async () => {
      const target: PushTarget = {
        platform: 'ios',
        token: 'ExpoPushToken[def456]',
      };

      const result = await sendPushNotification(target, PAYLOAD);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should send via SNS for iOS native token with endpoint ARN', async () => {
      const target: PushTarget = {
        platform: 'ios',
        token: 'native-ios-token-123',
        snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/test',
      };

      const result = await sendPushNotification(target, PAYLOAD);

      expect(result).toBe(true);
      expect(mockSnsSend).toHaveBeenCalled();
    });

    it('should return false for unsupported platform without endpoint', async () => {
      const target: PushTarget = {
        platform: 'ios',
        token: 'native-ios-token-123',
        // no snsEndpointArn
      };

      const result = await sendPushNotification(target, PAYLOAD);
      expect(result).toBe(false);
    });

    it('should handle Expo API failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server Error'),
        json: () => Promise.resolve({}),
      });

      const target: PushTarget = {
        platform: 'ios',
        token: 'ExponentPushToken[abc123]',
      };

      const result = await sendPushNotification(target, PAYLOAD);
      expect(result).toBe(false);
    });

    it('should handle SNS endpoint disabled error', async () => {
      const disabledError = new Error('Endpoint disabled');
      (disabledError as Error & { name: string }).name = 'EndpointDisabledException';
      mockSnsSend.mockRejectedValueOnce(disabledError);

      const target: PushTarget = {
        platform: 'ios',
        token: 'native-ios-token',
        snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/disabled',
      };

      const result = await sendPushNotification(target, PAYLOAD);
      expect(result).toBe(false);
    });
  });

  describe('sendPushToUser', () => {
    it('should skip push when recipient has blocked the actor', async () => {
      const mockDb = createMockDb();
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }], // block found
      });

      const result = await sendPushToUser(mockDb, VALID_USER_ID, PAYLOAD, VALID_ACTOR_ID);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should skip push when user preference is disabled', async () => {
      const mockDb = createMockDb();
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no block
        .mockResolvedValueOnce({ rows: [{ likes_enabled: false }] }); // preference disabled

      const result = await sendPushToUser(
        mockDb,
        VALID_USER_ID,
        { ...PAYLOAD, data: { type: 'like' } },
        VALID_ACTOR_ID,
      );

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should return 0/0 when user has no push tokens', async () => {
      const mockDb = createMockDb();
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no block
        .mockResolvedValueOnce({ rows: [] }) // no preference row
        .mockResolvedValueOnce({ rows: [] }); // no push tokens

      const result = await sendPushToUser(mockDb, VALID_USER_ID, PAYLOAD, VALID_ACTOR_ID);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should send push to Expo tokens successfully', async () => {
      const mockDb = createMockDb();
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no block
        .mockResolvedValueOnce({ rows: [] }) // no preference row
        .mockResolvedValueOnce({
          rows: [{
            token: 'ExponentPushToken[abc123]',
            platform: 'ios',
            sns_endpoint_arn: null,
          }],
        }); // push tokens

      const result = await sendPushToUser(mockDb, VALID_USER_ID, PAYLOAD, VALID_ACTOR_ID);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should send push without actor check when actorId is not provided', async () => {
      const mockDb = createMockDb();
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no preference row (first query since no actor check)
        .mockResolvedValueOnce({
          rows: [{
            token: 'ExponentPushToken[abc123]',
            platform: 'ios',
            sns_endpoint_arn: null,
          }],
        });

      const result = await sendPushToUser(mockDb, VALID_USER_ID, PAYLOAD);

      expect(result.success).toBe(1);
    });

    it('should always send for notification types without preference column', async () => {
      const mockDb = createMockDb();
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no block
        .mockResolvedValueOnce({
          rows: [{
            token: 'ExponentPushToken[abc123]',
            platform: 'ios',
            sns_endpoint_arn: null,
          }],
        });

      const result = await sendPushToUser(
        mockDb,
        VALID_USER_ID,
        { ...PAYLOAD, data: { type: 'session' } },
        VALID_ACTOR_ID,
      );

      expect(result.success).toBe(1);
    });
  });
});
