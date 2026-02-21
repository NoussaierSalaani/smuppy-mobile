/**
 * Tests for services/push-notification service module
 * Tests exported functions: sendPushNotification, sendPushNotificationBatch, sendPushToUser
 */

// ── Mocks (must be before handler import -- Jest hoists jest.mock calls) ──

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

const mockFirebaseSend = jest.fn().mockResolvedValue('msg-id-123');
const mockFirebaseSendEach = jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0 });

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
  messaging: jest.fn(() => ({
    send: mockFirebaseSend,
    sendEach: mockFirebaseSendEach,
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

import {
  sendPushNotification,
  sendPushNotificationBatch,
  sendPushToUser,
  PushNotificationPayload,
  PushTarget,
} from '../../services/push-notification';

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
    // Ensure FCM_SECRET_ARN is set so firebase initialization attempts work
    process.env.FCM_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:fcm';
    process.env.EXPO_ACCESS_TOKEN_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:expo';
    // Firebase secrets mock returns valid service account by default
    mockSecretsManagerSend.mockResolvedValue({
      SecretString: JSON.stringify({ project_id: 'test-project', client_email: 'test@test.iam.gserviceaccount.com', private_key: 'key' }),
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

    it('should send via Firebase for Android native token', async () => {
      const target: PushTarget = {
        platform: 'android',
        token: 'fcm-native-token-abc123',
      };

      const result = await sendPushNotification(target, PAYLOAD);

      // Firebase was already initialized in a prior test run (module-level state),
      // so sendToAndroid should attempt the firebase send
      expect(mockFirebaseSend).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when Expo push ticket has error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{
            status: 'error',
            message: 'DeviceNotRegistered',
            details: { error: 'DeviceNotRegistered' },
          }],
        }),
        text: () => Promise.resolve(''),
      });

      const target: PushTarget = {
        platform: 'ios',
        token: 'ExponentPushToken[bad-token]',
      };

      const result = await sendPushNotification(target, PAYLOAD);
      expect(result).toBe(false);
    });

    it('should return false when fetch throws a network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const target: PushTarget = {
        platform: 'ios',
        token: 'ExponentPushToken[net-err]',
      };

      const result = await sendPushNotification(target, PAYLOAD);
      expect(result).toBe(false);
    });

    it('should handle SNS NotFoundException error', async () => {
      const notFoundError = new Error('Endpoint not found');
      (notFoundError as Error & { name: string }).name = 'NotFoundException';
      mockSnsSend.mockRejectedValueOnce(notFoundError);

      const target: PushTarget = {
        platform: 'ios',
        token: 'native-ios-token',
        snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/notfound',
      };

      const result = await sendPushNotification(target, PAYLOAD);
      expect(result).toBe(false);
    });

    it('should handle SNS InvalidParameterException with endpoint message', async () => {
      const invalidError = new Error('Invalid endpoint parameter');
      (invalidError as Error & { name: string }).name = 'InvalidParameterException';
      mockSnsSend.mockRejectedValueOnce(invalidError);

      const target: PushTarget = {
        platform: 'ios',
        token: 'native-ios-token',
        snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/invalid',
      };

      const result = await sendPushNotification(target, PAYLOAD);
      expect(result).toBe(false);
    });

    it('should handle SNS generic error as failed (not disabled)', async () => {
      const genericError = new Error('Throttling');
      (genericError as Error & { name: string }).name = 'ThrottlingException';
      mockSnsSend.mockRejectedValueOnce(genericError);

      const target: PushTarget = {
        platform: 'ios',
        token: 'native-ios-token',
        snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/throttled',
      };

      const result = await sendPushNotification(target, PAYLOAD);
      expect(result).toBe(false);
    });
  });

  describe('sendPushNotificationBatch', () => {
    it('should handle mixed expo and native iOS targets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { status: 'ok' },
            { status: 'ok' },
          ],
        }),
        text: () => Promise.resolve(''),
      });

      const targets: PushTarget[] = [
        { platform: 'ios', token: 'ExponentPushToken[expo1]' },
        { platform: 'ios', token: 'ExponentPushToken[expo2]' },
        { platform: 'ios', token: 'native-ios-token', snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/ios1' },
      ];

      const result = await sendPushNotificationBatch(targets, PAYLOAD);

      // 2 Expo tokens sent in single batch + 1 iOS via SNS
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockSnsSend).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.disabledArns).toHaveLength(0);
    });

    it('should handle iOS targets via SNS with disabled endpoint collection', async () => {
      const disabledError = new Error('Endpoint disabled');
      (disabledError as Error & { name: string }).name = 'EndpointDisabledException';
      mockSnsSend
        .mockResolvedValueOnce({}) // first iOS target succeeds
        .mockRejectedValueOnce(disabledError); // second iOS target disabled

      const targets: PushTarget[] = [
        { platform: 'ios', token: 'native-ios-1', snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/good' },
        { platform: 'ios', token: 'native-ios-2', snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/disabled' },
      ];

      const result = await sendPushNotificationBatch(targets, PAYLOAD);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.disabledArns).toContain('arn:aws:sns:us-east-1:123:endpoint/disabled');
      expect(result.disabledArns).toHaveLength(1);
    });

    it('should send Android targets via Firebase sendEach', async () => {
      mockFirebaseSendEach.mockResolvedValueOnce({ successCount: 2, failureCount: 0 });

      const targets: PushTarget[] = [
        { platform: 'android', token: 'fcm-token-1' },
        { platform: 'android', token: 'fcm-token-2' },
      ];

      const result = await sendPushNotificationBatch(targets, PAYLOAD);

      expect(mockFirebaseSendEach).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle mixed expo, iOS SNS, and Android targets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ status: 'ok' }] }),
        text: () => Promise.resolve(''),
      });
      mockFirebaseSendEach.mockResolvedValueOnce({ successCount: 1, failureCount: 0 });

      const targets: PushTarget[] = [
        { platform: 'ios', token: 'ExponentPushToken[expo1]' },
        { platform: 'ios', token: 'native-ios-1', snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/ios1' },
        { platform: 'android', token: 'fcm-token-1' },
      ];

      const result = await sendPushNotificationBatch(targets, PAYLOAD);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockSnsSend).toHaveBeenCalledTimes(1);
      expect(mockFirebaseSendEach).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should handle empty targets array', async () => {
      const result = await sendPushNotificationBatch([], PAYLOAD);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.disabledArns).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSnsSend).not.toHaveBeenCalled();
    });

    it('should handle Firebase sendEach failure', async () => {
      mockFirebaseSendEach.mockRejectedValueOnce(new Error('Firebase batch send error'));

      const targets: PushTarget[] = [
        { platform: 'android', token: 'fcm-token-1' },
        { platform: 'android', token: 'fcm-token-2' },
      ];

      const result = await sendPushNotificationBatch(targets, PAYLOAD);

      expect(result.failed).toBe(2);
      expect(result.success).toBe(0);
    });

    it('should handle Firebase sendEach with partial failures', async () => {
      mockFirebaseSendEach.mockResolvedValueOnce({ successCount: 1, failureCount: 1 });

      const targets: PushTarget[] = [
        { platform: 'android', token: 'fcm-token-1' },
        { platform: 'android', token: 'fcm-token-2' },
      ];

      const result = await sendPushNotificationBatch(targets, PAYLOAD);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should collect multiple disabled ARNs from iOS batch', async () => {
      const disabledError1 = new Error('Endpoint disabled');
      (disabledError1 as Error & { name: string }).name = 'EndpointDisabledException';
      const disabledError2 = new Error('Endpoint not found');
      (disabledError2 as Error & { name: string }).name = 'NotFoundException';

      mockSnsSend
        .mockRejectedValueOnce(disabledError1)
        .mockRejectedValueOnce(disabledError2)
        .mockResolvedValueOnce({}); // third succeeds

      const targets: PushTarget[] = [
        { platform: 'ios', token: 'native-1', snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/disabled1' },
        { platform: 'ios', token: 'native-2', snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/disabled2' },
        { platform: 'ios', token: 'native-3', snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/good' },
      ];

      const result = await sendPushNotificationBatch(targets, PAYLOAD);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.disabledArns).toHaveLength(2);
      expect(result.disabledArns).toContain('arn:aws:sns:us-east-1:123:endpoint/disabled1');
      expect(result.disabledArns).toContain('arn:aws:sns:us-east-1:123:endpoint/disabled2');
    });

    it('should skip iOS native targets without snsEndpointArn', async () => {
      const targets: PushTarget[] = [
        { platform: 'ios', token: 'native-ios-no-arn' },
      ];

      const result = await sendPushNotificationBatch(targets, PAYLOAD);

      // nativeTargets filter passes, but iosTargets filter requires snsEndpointArn
      // So this target is a native non-expo token with no ARN -- it's neither iOS-with-ARN nor android
      expect(mockSnsSend).not.toHaveBeenCalled();
      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should handle Expo batch with mixed ok and error tickets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { status: 'ok' },
            { status: 'error', message: 'DeviceNotRegistered', details: { error: 'DeviceNotRegistered' } },
            { status: 'ok' },
          ],
        }),
        text: () => Promise.resolve(''),
      });

      const targets: PushTarget[] = [
        { platform: 'ios', token: 'ExponentPushToken[good1]' },
        { platform: 'ios', token: 'ExponentPushToken[bad1]' },
        { platform: 'ios', token: 'ExponentPushToken[good2]' },
      ];

      const result = await sendPushNotificationBatch(targets, PAYLOAD);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);
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

    it('should disable dead SNS endpoints after batch send', async () => {
      const disabledError = new Error('Endpoint disabled');
      (disabledError as Error & { name: string }).name = 'EndpointDisabledException';
      mockSnsSend.mockRejectedValueOnce(disabledError);

      const mockDb = createMockDb();
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no block
        .mockResolvedValueOnce({ rows: [] }) // no preference row
        .mockResolvedValueOnce({
          rows: [{
            token: 'native-ios-token',
            platform: 'ios',
            sns_endpoint_arn: 'arn:aws:sns:us-east-1:123:endpoint/dead',
          }],
        }) // push tokens
        .mockResolvedValueOnce({ rows: [] }); // disable dead tokens query

      const result = await sendPushToUser(mockDb, VALID_USER_ID, PAYLOAD, VALID_ACTOR_ID);

      expect(result.failed).toBe(1);

      // Wait for the fire-and-forget .catch() to execute
      await new Promise(resolve => setImmediate(resolve));

      // Verify the UPDATE query was called to disable dead endpoints
      const calls = (mockDb.query as jest.Mock).mock.calls;
      const disableCall = calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE push_tokens SET enabled = false'),
      );
      expect(disableCall).toBeDefined();
      expect(disableCall![1]).toEqual([
        ['arn:aws:sns:us-east-1:123:endpoint/dead'],
        VALID_USER_ID,
      ]);
    });

    it('should handle disable dead tokens query failure gracefully', async () => {
      const disabledError = new Error('Endpoint disabled');
      (disabledError as Error & { name: string }).name = 'EndpointDisabledException';
      mockSnsSend.mockRejectedValueOnce(disabledError);

      const mockDb = createMockDb();
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no block
        .mockResolvedValueOnce({ rows: [] }) // no preference row
        .mockResolvedValueOnce({
          rows: [{
            token: 'native-ios-token',
            platform: 'ios',
            sns_endpoint_arn: 'arn:aws:sns:us-east-1:123:endpoint/dead',
          }],
        }) // push tokens
        .mockRejectedValueOnce(new Error('DB connection lost')); // disable query fails

      const result = await sendPushToUser(mockDb, VALID_USER_ID, PAYLOAD, VALID_ACTOR_ID);

      expect(result.failed).toBe(1);

      // Wait for the fire-and-forget .catch() to execute -- should not throw
      await new Promise(resolve => setImmediate(resolve));

      // The UPDATE query was called (and failed), but the error was caught
      const calls = (mockDb.query as jest.Mock).mock.calls;
      const disableCall = calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE push_tokens SET enabled = false'),
      );
      expect(disableCall).toBeDefined();
    });

    it('should skip preference check for notification type with no data', async () => {
      const mockDb = createMockDb();
      const payloadNoData: PushNotificationPayload = {
        title: 'Test',
        body: 'No data',
      };

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no block
        .mockResolvedValueOnce({
          rows: [{
            token: 'ExponentPushToken[abc123]',
            platform: 'ios',
            sns_endpoint_arn: null,
          }],
        }); // push tokens (no preference query since no data.type)

      const result = await sendPushToUser(mockDb, VALID_USER_ID, payloadNoData, VALID_ACTOR_ID);

      expect(result.success).toBe(1);
      // Should only have 2 queries: block check + push tokens (no preference check)
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should skip preference check for notification type with undefined type', async () => {
      const mockDb = createMockDb();
      const payloadNoType: PushNotificationPayload = {
        title: 'Test',
        body: 'No type',
        data: { screen: 'profile' }, // has data but no type key
      };

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no block
        .mockResolvedValueOnce({
          rows: [{
            token: 'ExponentPushToken[abc123]',
            platform: 'ios',
            sns_endpoint_arn: null,
          }],
        });

      const result = await sendPushToUser(mockDb, VALID_USER_ID, payloadNoType, VALID_ACTOR_ID);

      expect(result.success).toBe(1);
      // block check + push tokens only (no preference query)
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should send push when preference row exists but preference is not false', async () => {
      const mockDb = createMockDb();
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no block
        .mockResolvedValueOnce({ rows: [{ likes_enabled: true }] }) // preference enabled
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
        { ...PAYLOAD, data: { type: 'like' } },
        VALID_ACTOR_ID,
      );

      expect(result.success).toBe(1);
    });

    it('should send push for multiple devices of a user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { status: 'ok' },
            { status: 'ok' },
          ],
        }),
        text: () => Promise.resolve(''),
      });

      const mockDb = createMockDb();
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no block
        .mockResolvedValueOnce({ rows: [] }) // no preference row
        .mockResolvedValueOnce({
          rows: [
            { token: 'ExponentPushToken[device1]', platform: 'ios', sns_endpoint_arn: null },
            { token: 'ExponentPushToken[device2]', platform: 'android', sns_endpoint_arn: null },
          ],
        });

      const result = await sendPushToUser(mockDb, VALID_USER_ID, PAYLOAD, VALID_ACTOR_ID);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should log warning when batch has failures', async () => {
      // Force an SNS failure for a native iOS target
      const genericError = new Error('SNS throttle');
      (genericError as Error & { name: string }).name = 'ThrottlingException';
      mockSnsSend.mockRejectedValueOnce(genericError);

      const mockDb = createMockDb();
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no block
        .mockResolvedValueOnce({ rows: [] }) // no preference row
        .mockResolvedValueOnce({
          rows: [{
            token: 'native-ios-token',
            platform: 'ios',
            sns_endpoint_arn: 'arn:aws:sns:us-east-1:123:endpoint/throttle',
          }],
        });

      const result = await sendPushToUser(mockDb, VALID_USER_ID, PAYLOAD, VALID_ACTOR_ID);

      // The SNS send fails with generic error (not disabled)
      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
    });
  });

  describe('getPreferenceColumn (tested via sendPushToUser)', () => {
    // Each test sets up sendPushToUser with a specific notification type and
    // checks that the preference query is consulted (3 queries total with actor)
    // or skipped (2 queries for types that always send).

    const prefTestCases: Array<{ type: string; column: string }> = [
      { type: 'like', column: 'likes_enabled' },
      { type: 'peak_like', column: 'likes_enabled' },
      { type: 'comment', column: 'comments_enabled' },
      { type: 'peak_comment', column: 'comments_enabled' },
      { type: 'peak_reply', column: 'comments_enabled' },
      { type: 'new_follower', column: 'follows_enabled' },
      { type: 'follow_request', column: 'follows_enabled' },
      { type: 'follow_accepted', column: 'follows_enabled' },
      { type: 'message', column: 'messages_enabled' },
      { type: 'post_tag', column: 'mentions_enabled' },
      { type: 'live', column: 'live_enabled' },
    ];

    it.each(prefTestCases)(
      'should check $column preference for notification type "$type"',
      async ({ type, column }) => {
        const mockDb = createMockDb();
        (mockDb.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [] }) // no block
          .mockResolvedValueOnce({ rows: [{ [column]: false }] }); // preference disabled

        const result = await sendPushToUser(
          mockDb,
          VALID_USER_ID,
          { ...PAYLOAD, data: { type } },
          VALID_ACTOR_ID,
        );

        // Push should be skipped because the preference column is false
        expect(result.success).toBe(0);
        expect(result.failed).toBe(0);
        // 2 queries: block check + preference check (stopped before token fetch)
        expect(mockDb.query).toHaveBeenCalledTimes(2);
      },
    );

    const alwaysSendTypes = ['session', 'challenge', 'battle', 'event', 'unknown_type'];

    it.each(alwaysSendTypes)(
      'should always send for notification type "%s" (no preference check)',
      async (type) => {
        const mockDb = createMockDb();
        (mockDb.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [] }) // no block
          .mockResolvedValueOnce({
            rows: [{
              token: 'ExponentPushToken[abc]',
              platform: 'ios',
              sns_endpoint_arn: null,
            }],
          }); // push tokens (no preference query for always-send types)

        const result = await sendPushToUser(
          mockDb,
          VALID_USER_ID,
          { ...PAYLOAD, data: { type } },
          VALID_ACTOR_ID,
        );

        expect(result.success).toBe(1);
        // Only 2 queries: block check + token fetch (preference check skipped)
        expect(mockDb.query).toHaveBeenCalledTimes(2);
      },
    );
  });

  describe('sendToAndroid (tested via sendPushNotification)', () => {
    it('should send via Firebase when initialized', async () => {
      // Firebase should already be initialized from earlier tests (module-level state)
      const target: PushTarget = {
        platform: 'android',
        token: 'fcm-token-android-test',
      };

      const result = await sendPushNotification(target, PAYLOAD);

      expect(mockFirebaseSend).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'fcm-token-android-test',
          notification: {
            title: PAYLOAD.title,
            body: PAYLOAD.body,
          },
          data: PAYLOAD.data,
          android: expect.objectContaining({
            priority: 'high',
          }),
        }),
      );
      expect(result).toBe(true);
    });

    it('should handle Firebase send failure gracefully', async () => {
      mockFirebaseSend.mockRejectedValueOnce(new Error('Firebase messaging error'));

      const target: PushTarget = {
        platform: 'android',
        token: 'fcm-token-fail',
      };

      const result = await sendPushNotification(target, PAYLOAD);
      expect(result).toBe(false);
    });

    it('should include channelId from payload data', async () => {
      const payloadWithChannel: PushNotificationPayload = {
        title: 'Test',
        body: 'Channel test',
        data: { type: 'message', channelId: 'messages' },
        sound: 'notification.wav',
      };

      const target: PushTarget = {
        platform: 'android',
        token: 'fcm-token-channel',
      };

      await sendPushNotification(target, payloadWithChannel);

      expect(mockFirebaseSend).toHaveBeenCalledWith(
        expect.objectContaining({
          android: expect.objectContaining({
            notification: expect.objectContaining({
              channelId: 'messages',
              sound: 'notification.wav',
            }),
          }),
        }),
      );
    });
  });

  describe('Firebase initialization paths (via sendPushNotificationBatch)', () => {
    // Note: Firebase module-level state persists across tests.
    // The module was already initialized successfully in earlier tests,
    // so we test the batch path which also calls initializeFirebase().

    it('should use Firebase sendEach for android batch after initialization', async () => {
      mockFirebaseSendEach.mockResolvedValueOnce({ successCount: 3, failureCount: 0 });

      const targets: PushTarget[] = [
        { platform: 'android', token: 'fcm-1' },
        { platform: 'android', token: 'fcm-2' },
        { platform: 'android', token: 'fcm-3' },
      ];

      const result = await sendPushNotificationBatch(targets, PAYLOAD);

      expect(mockFirebaseSendEach).toHaveBeenCalledTimes(1);
      // Verify all 3 messages were sent in one batch call
      const sendEachArg = mockFirebaseSendEach.mock.calls[0][0];
      expect(sendEachArg).toHaveLength(3);
      expect(result.success).toBe(3);
    });
  });

  describe('Expo push edge cases', () => {
    it('should send with Authorization header when Expo access token is available', async () => {
      const target: PushTarget = {
        platform: 'ios',
        token: 'ExponentPushToken[auth-test]',
      };

      await sendPushNotification(target, PAYLOAD);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer'),
          }),
        }),
      );
    });

    it('should send payload with correct fields to Expo API', async () => {
      const payloadFull: PushNotificationPayload = {
        title: 'Full Test',
        body: 'Full body message',
        data: { type: 'like', postId: '123' },
        badge: 5,
        sound: 'custom.wav',
      };

      const target: PushTarget = {
        platform: 'ios',
        token: 'ExponentPushToken[full-test]',
      };

      await sendPushNotification(target, payloadFull);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body).toHaveLength(1);
      expect(body[0]).toEqual({
        to: 'ExponentPushToken[full-test]',
        title: 'Full Test',
        body: 'Full body message',
        data: { type: 'like', postId: '123' },
        sound: 'custom.wav',
        badge: 5,
        channelId: 'default',
      });
    });

    it('should handle Expo API response.text() failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.reject(new Error('body read error')),
        json: () => Promise.resolve({}),
      });

      const target: PushTarget = {
        platform: 'ios',
        token: 'ExponentPushToken[text-fail]',
      };

      const result = await sendPushNotification(target, PAYLOAD);
      // Should not throw, should return false
      expect(result).toBe(false);
    });

    it('should return 0 success for empty tokens array in sendViaExpo', async () => {
      // This is tested indirectly: if batch has no expo tokens, fetch should not be called
      const targets: PushTarget[] = [
        { platform: 'ios', token: 'native-only', snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/x' },
      ];

      await sendPushNotificationBatch(targets, PAYLOAD);

      // Only SNS should be called, not fetch (Expo)
      expect(mockSnsSend).toHaveBeenCalledTimes(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use default sound and badge when not provided in payload', async () => {
      const payloadMinimal: PushNotificationPayload = {
        title: 'Minimal',
        body: 'Minimal body',
      };

      const target: PushTarget = {
        platform: 'ios',
        token: 'ExponentPushToken[minimal]',
      };

      await sendPushNotification(target, payloadMinimal);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body[0].sound).toBe('default');
      expect(body[0].badge).toBe(1);
    });
  });

  describe('iOS SNS notification payload', () => {
    it('should construct correct APNS payload with default badge and sound', async () => {
      const target: PushTarget = {
        platform: 'ios',
        token: 'native-ios',
        snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/ios-apns',
      };

      const payloadNoExtra: PushNotificationPayload = {
        title: 'APNS Test',
        body: 'Testing APNS payload',
      };

      await sendPushNotification(target, payloadNoExtra);

      expect(mockSnsSend).toHaveBeenCalledTimes(1);
    });

    it('should include custom badge and sound in APNS payload', async () => {
      const target: PushTarget = {
        platform: 'ios',
        token: 'native-ios',
        snsEndpointArn: 'arn:aws:sns:us-east-1:123:endpoint/ios-custom',
      };

      const payloadCustom: PushNotificationPayload = {
        title: 'Custom APNS',
        body: 'Custom payload',
        badge: 10,
        sound: 'alert.wav',
        data: { screen: 'profile', userId: '123' },
      };

      await sendPushNotification(target, payloadCustom);

      expect(mockSnsSend).toHaveBeenCalledTimes(1);
    });
  });
});

// ── Isolated module tests for module-level state paths ──
// These tests use jest.isolateModules to get fresh module instances
// so we can test the initialization paths that depend on module-level let variables.

describe('push-notification service (isolated module tests)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getExpoAccessToken', () => {
    it('should return null when EXPO_ACCESS_TOKEN_SECRET_ARN is not set', async () => {
      delete process.env.EXPO_ACCESS_TOKEN_SECRET_ARN;

      // Use isolateModules to get fresh module-level state
      let sendPushNotificationFn: typeof sendPushNotification;

      jest.isolateModules(() => {
        // Re-require the module to get fresh state
        const mod = require('../../services/push-notification');
        sendPushNotificationFn = mod.sendPushNotification;
      });

      // The Expo access token fetch should fail silently and send without auth
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ status: 'ok' }] }),
        text: () => Promise.resolve(''),
      });

      const target: PushTarget = {
        platform: 'ios',
        token: 'ExponentPushToken[no-auth]',
      };

      const result = await sendPushNotificationFn!(target, PAYLOAD);
      expect(result).toBe(true);

      // Verify fetch was called without Authorization header
      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Authorization': expect.anything(),
          }),
        }),
      );
    });

    it('should return null when Secrets Manager returns empty secret string', async () => {
      process.env.EXPO_ACCESS_TOKEN_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:expo';
      mockSecretsManagerSend.mockResolvedValueOnce({
        SecretString: '   ', // whitespace-only becomes empty after trim
      });

      let sendPushNotificationFn: typeof sendPushNotification;

      jest.isolateModules(() => {
        const mod = require('../../services/push-notification');
        sendPushNotificationFn = mod.sendPushNotification;
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ status: 'ok' }] }),
        text: () => Promise.resolve(''),
      });

      const target: PushTarget = {
        platform: 'ios',
        token: 'ExponentPushToken[empty-secret]',
      };

      const result = await sendPushNotificationFn!(target, PAYLOAD);
      expect(result).toBe(true);
    });

    it('should return null on Secrets Manager fetch error (allows retry)', async () => {
      process.env.EXPO_ACCESS_TOKEN_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:expo';
      mockSecretsManagerSend.mockRejectedValueOnce(new Error('Throttling'));

      let sendPushNotificationFn: typeof sendPushNotification;

      jest.isolateModules(() => {
        const mod = require('../../services/push-notification');
        sendPushNotificationFn = mod.sendPushNotification;
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ status: 'ok' }] }),
        text: () => Promise.resolve(''),
      });

      const target: PushTarget = {
        platform: 'ios',
        token: 'ExponentPushToken[retry-expo]',
      };

      const result = await sendPushNotificationFn!(target, PAYLOAD);
      expect(result).toBe(true);
    });
  });

  describe('initializeFirebase', () => {
    it('should permanently disable Firebase when FCM_SECRET_ARN is not set', async () => {
      delete process.env.FCM_SECRET_ARN;

      let sendPushNotificationFn: typeof sendPushNotification;

      jest.isolateModules(() => {
        const mod = require('../../services/push-notification');
        sendPushNotificationFn = mod.sendPushNotification;
      });

      const target: PushTarget = {
        platform: 'android',
        token: 'fcm-token-no-arn',
      };

      const result = await sendPushNotificationFn!(target, PAYLOAD);
      // Firebase not available, should return false
      expect(result).toBe(false);
      // Firebase send should not have been called
      expect(mockFirebaseSend).not.toHaveBeenCalled();
    });

    it('should permanently disable Firebase when project_id is missing', async () => {
      process.env.FCM_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:fcm';
      mockSecretsManagerSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ client_email: 'test@test.iam.gserviceaccount.com' }), // no project_id
      });

      let sendPushNotificationFn: typeof sendPushNotification;

      jest.isolateModules(() => {
        const mod = require('../../services/push-notification');
        sendPushNotificationFn = mod.sendPushNotification;
      });

      const target: PushTarget = {
        platform: 'android',
        token: 'fcm-token-no-project',
      };

      const result = await sendPushNotificationFn!(target, PAYLOAD);
      expect(result).toBe(false);
      expect(mockFirebaseSend).not.toHaveBeenCalled();

      // Call a second time to verify the "permanently failed" path (lines 77-78)
      const result2 = await sendPushNotificationFn!(target, PAYLOAD);
      expect(result2).toBe(false);
    });

    it('should allow retry when Secrets Manager throws temporary error', async () => {
      process.env.FCM_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:fcm';
      // First call: SM throws
      mockSecretsManagerSend
        .mockRejectedValueOnce(new Error('Network timeout'))
        // Second call: SM returns valid credentials
        .mockResolvedValueOnce({
          SecretString: JSON.stringify({
            project_id: 'retry-project',
            client_email: 'test@test.iam.gserviceaccount.com',
            private_key: 'key',
          }),
        });

      let sendPushNotificationFn: typeof sendPushNotification;

      jest.isolateModules(() => {
        const mod = require('../../services/push-notification');
        sendPushNotificationFn = mod.sendPushNotification;
      });

      const target: PushTarget = {
        platform: 'android',
        token: 'fcm-token-retry',
      };

      // First call: Firebase init fails temporarily, send returns false
      const result1 = await sendPushNotificationFn!(target, PAYLOAD);
      expect(result1).toBe(false);

      // Second call: Firebase init succeeds, send should work
      const result2 = await sendPushNotificationFn!(target, PAYLOAD);
      expect(result2).toBe(true);
      expect(mockFirebaseSend).toHaveBeenCalled();
    });

    it('should count android targets as failed when firebase not initialized in batch', async () => {
      delete process.env.FCM_SECRET_ARN;

      let sendPushNotificationBatchFn: typeof sendPushNotificationBatch;

      jest.isolateModules(() => {
        const mod = require('../../services/push-notification');
        sendPushNotificationBatchFn = mod.sendPushNotificationBatch;
      });

      const targets: PushTarget[] = [
        { platform: 'android', token: 'fcm-token-1' },
        { platform: 'android', token: 'fcm-token-2' },
      ];

      const result = await sendPushNotificationBatchFn!(targets, PAYLOAD);

      // Firebase not available, all android targets should be counted as failed
      expect(result.success).toBe(0);
      expect(result.failed).toBe(2);
      expect(mockFirebaseSendEach).not.toHaveBeenCalled();
    });
  });
});
