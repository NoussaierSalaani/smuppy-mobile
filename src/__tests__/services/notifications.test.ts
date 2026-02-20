/**
 * Notifications Service Tests
 *
 * Tests push notification registration, permissions, badge management,
 * and local notification scheduling. All native modules are mocked.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockGetDevicePushTokenAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();
const mockCancelAllScheduledNotificationsAsync = jest.fn();
const mockSetBadgeCountAsync = jest.fn();
const mockGetBadgeCountAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockAddNotificationReceivedListener = jest.fn();
const mockAddNotificationResponseReceivedListener = jest.fn();
const mockGetLastNotificationResponseAsync = jest.fn();
const mockSetNotificationHandler = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: mockGetPermissionsAsync,
  requestPermissionsAsync: mockRequestPermissionsAsync,
  getDevicePushTokenAsync: mockGetDevicePushTokenAsync,
  getExpoPushTokenAsync: mockGetExpoPushTokenAsync,
  scheduleNotificationAsync: mockScheduleNotificationAsync,
  cancelScheduledNotificationAsync: mockCancelScheduledNotificationAsync,
  cancelAllScheduledNotificationsAsync: mockCancelAllScheduledNotificationsAsync,
  setBadgeCountAsync: mockSetBadgeCountAsync,
  getBadgeCountAsync: mockGetBadgeCountAsync,
  setNotificationChannelAsync: mockSetNotificationChannelAsync,
  addNotificationReceivedListener: mockAddNotificationReceivedListener,
  addNotificationResponseReceivedListener: mockAddNotificationResponseReceivedListener,
  getLastNotificationResponseAsync: mockGetLastNotificationResponseAsync,
  setNotificationHandler: mockSetNotificationHandler,
  AndroidImportance: { HIGH: 4, MAX: 5, DEFAULT: 3 },
}));

jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { eas: { projectId: 'test-project-id' } } } },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const mockSecureGetItemAsync = jest.fn();
const mockSecureSetItemAsync = jest.fn();
const mockSecureDeleteItemAsync = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: mockSecureGetItemAsync,
  setItemAsync: mockSecureSetItemAsync,
  deleteItemAsync: mockSecureDeleteItemAsync,
}));

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-1234' }));

const mockRegisterPushTokenAPI = jest.fn();
const mockUnregisterPushTokenAPI = jest.fn();

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    registerPushToken: mockRegisterPushTokenAPI,
    unregisterPushToken: mockUnregisterPushTokenAPI,
  },
}));

jest.mock('../../lib/sentry', () => ({
  captureException: jest.fn(),
}));

(global as Record<string, unknown>).__DEV__ = false;

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  requestPermissions,
  getDeviceId,
  getNativePushToken,
  getExpoPushToken,
  registerPushToken,
  unregisterPushToken,
  parseNotificationData,
  scheduleLocalNotification,
  cancelNotification,
  cancelAllNotifications,
  setBadgeCount,
  getBadgeCount,
  clearBadge,
  setupAndroidChannels,
  initializeNotifications,
} from '../../services/notifications';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // requestPermissions
  // =========================================================================

  describe('requestPermissions', () => {
    it('should return true when already granted', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
      const result = await requestPermissions();
      expect(result).toBe(true);
      expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('should request and return true when newly granted', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
      const result = await requestPermissions();
      expect(result).toBe(true);
    });

    it('should return false when denied', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });
      const result = await requestPermissions();
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockGetPermissionsAsync.mockRejectedValue(new Error('Permission error'));
      const result = await requestPermissions();
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // getDeviceId
  // =========================================================================

  describe('getDeviceId', () => {
    it('should return existing device ID from SecureStore', async () => {
      mockSecureGetItemAsync.mockResolvedValue('existing-device-id');
      const id = await getDeviceId();
      expect(id).toBe('existing-device-id');
    });

    it('should create and store new device ID when none exists', async () => {
      mockSecureGetItemAsync.mockResolvedValue(null);
      mockSecureSetItemAsync.mockResolvedValue(undefined);
      const id = await getDeviceId();
      expect(id).toBe('mock-uuid-1234');
      expect(mockSecureSetItemAsync).toHaveBeenCalledWith('smuppy_device_id', 'mock-uuid-1234');
    });

    it('should return new UUID on SecureStore error', async () => {
      mockSecureGetItemAsync.mockRejectedValue(new Error('SecureStore error'));
      const id = await getDeviceId();
      expect(id).toBe('mock-uuid-1234');
    });
  });

  // =========================================================================
  // getNativePushToken
  // =========================================================================

  describe('getNativePushToken', () => {
    it('should return native token for iOS', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockGetDevicePushTokenAsync.mockResolvedValue({ data: 'native-token-123' });

      const result = await getNativePushToken();
      expect(result).toEqual({ token: 'native-token-123', platform: 'ios' });
    });

    it('should fall back to Expo token when native fails', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockGetDevicePushTokenAsync.mockRejectedValue(new Error('No native token'));
      mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[xxx]' });

      const result = await getNativePushToken();
      expect(result).toEqual({ token: 'ExponentPushToken[xxx]', platform: 'ios' });
    });

    it('should return null when permissions denied', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });

      const result = await getNativePushToken();
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // getExpoPushToken
  // =========================================================================

  describe('getExpoPushToken', () => {
    it('should return Expo push token', async () => {
      mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[yyy]' });
      const result = await getExpoPushToken();
      expect(result).toBe('ExponentPushToken[yyy]');
    });

    it('should return null on error', async () => {
      mockGetExpoPushTokenAsync.mockRejectedValue(new Error('Failed'));
      const result = await getExpoPushToken();
      expect(result).toBeNull();
    });

    it('should return null when data is empty', async () => {
      mockGetExpoPushTokenAsync.mockResolvedValue({ data: '' });
      const result = await getExpoPushToken();
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // registerPushToken
  // =========================================================================

  describe('registerPushToken', () => {
    it('should register token with backend', async () => {
      mockSecureGetItemAsync.mockResolvedValueOnce('device-id').mockResolvedValueOnce(null);
      mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockGetDevicePushTokenAsync.mockResolvedValue({ data: 'push-token' });
      mockRegisterPushTokenAPI.mockResolvedValue(undefined);
      mockSecureSetItemAsync.mockResolvedValue(undefined);

      const result = await registerPushToken('user1');
      expect(result).toBe(true);
      expect(mockRegisterPushTokenAPI).toHaveBeenCalledWith({
        token: 'push-token',
        platform: 'ios',
        deviceId: 'device-id',
      });
    });

    it('should skip API call when token already registered', async () => {
      mockSecureGetItemAsync
        .mockResolvedValueOnce('device-id')
        .mockResolvedValueOnce('push-token:device-id');
      mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockGetDevicePushTokenAsync.mockResolvedValue({ data: 'push-token' });

      const result = await registerPushToken('user1');
      expect(result).toBe(true);
      expect(mockRegisterPushTokenAPI).not.toHaveBeenCalled();
    });

    it('should return false when no push token available', async () => {
      mockSecureGetItemAsync.mockResolvedValueOnce('device-id').mockResolvedValueOnce(null);
      mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });

      const result = await registerPushToken('user1');
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockSecureGetItemAsync.mockRejectedValue(new Error('Storage error'));

      const result = await registerPushToken('user1');
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // unregisterPushToken
  // =========================================================================

  describe('unregisterPushToken', () => {
    it('should unregister token and clear cache', async () => {
      mockSecureGetItemAsync.mockResolvedValue('device-id');
      mockUnregisterPushTokenAPI.mockResolvedValue(undefined);
      mockSecureDeleteItemAsync.mockResolvedValue(undefined);

      await unregisterPushToken('user1');
      expect(mockUnregisterPushTokenAPI).toHaveBeenCalledWith('device-id');
      expect(mockSecureDeleteItemAsync).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // parseNotificationData
  // =========================================================================

  describe('parseNotificationData', () => {
    it('should parse notification data from response', () => {
      const response = {
        notification: {
          request: {
            content: {
              data: { type: 'like', postId: 'p1' },
            },
          },
        },
      } as never;

      const result = parseNotificationData(response);
      expect(result).toEqual({ type: 'like', postId: 'p1' });
    });

    it('should return null on invalid structure', () => {
      const result = parseNotificationData({} as never);
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Local Notifications
  // =========================================================================

  describe('scheduleLocalNotification', () => {
    it('should schedule notification and return ID', async () => {
      mockScheduleNotificationAsync.mockResolvedValue('notif-id-1');

      const id = await scheduleLocalNotification('Title', 'Body');
      expect(id).toBe('notif-id-1');
      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Title',
          body: 'Body',
          data: undefined,
          sound: true,
        },
        trigger: null,
      });
    });

    it('should schedule with custom data', async () => {
      mockScheduleNotificationAsync.mockResolvedValue('notif-id-2');
      const data = { type: 'like' as const, postId: 'p1' };

      await scheduleLocalNotification('Title', 'Body', data);
      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({ data }),
        })
      );
    });
  });

  describe('cancelNotification', () => {
    it('should cancel a specific notification', async () => {
      mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
      await cancelNotification('notif-id-1');
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-id-1');
    });
  });

  describe('cancelAllNotifications', () => {
    it('should cancel all notifications', async () => {
      mockCancelAllScheduledNotificationsAsync.mockResolvedValue(undefined);
      await cancelAllNotifications();
      expect(mockCancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Badge Management
  // =========================================================================

  describe('setBadgeCount', () => {
    it('should set badge count', async () => {
      mockSetBadgeCountAsync.mockResolvedValue(undefined);
      await setBadgeCount(5);
      expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(5);
    });
  });

  describe('getBadgeCount', () => {
    it('should return badge count', async () => {
      mockGetBadgeCountAsync.mockResolvedValue(3);
      const count = await getBadgeCount();
      expect(count).toBe(3);
    });
  });

  describe('clearBadge', () => {
    it('should set badge to zero', async () => {
      mockSetBadgeCountAsync.mockResolvedValue(undefined);
      await clearBadge();
      expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(0);
    });
  });

  // =========================================================================
  // Android Channels
  // =========================================================================

  describe('setupAndroidChannels', () => {
    it('should be a no-op on iOS', async () => {
      await setupAndroidChannels();
      expect(mockSetNotificationChannelAsync).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // initializeNotifications
  // =========================================================================

  describe('initializeNotifications', () => {
    it('should setup channels and check for launch notification', async () => {
      mockGetLastNotificationResponseAsync.mockResolvedValue(null);
      await initializeNotifications();
      expect(mockGetLastNotificationResponseAsync).toHaveBeenCalled();
    });

    it('should not throw on error', async () => {
      mockGetLastNotificationResponseAsync.mockRejectedValue(new Error('Init error'));
      await expect(initializeNotifications()).resolves.toBeUndefined();
    });
  });
});
