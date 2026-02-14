/**
 * Push Notifications Service
 * Handles registration, permissions, and notification management
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { v4 as uuidv4 } from 'uuid';
import { awsAPI } from './aws-api';
import { captureException } from '../lib/sentry';

// Helper: read env var, rejecting Expo's `__MISSING_<NAME>__` placeholders
const safeEnv = (key: string): string | undefined => {
  try {
    const value = typeof process !== 'undefined' ? process.env?.[key] : undefined;
    if (typeof value === 'string' && value.startsWith('__MISSING_')) return undefined;
    return value;
  } catch {
    return undefined;
  }
};

// ============================================
// TYPES
// ============================================

export interface NotificationData {
  type:
    | 'like' | 'comment' | 'message'
    | 'follow_request' | 'new_follower' | 'follow_accepted'
    | 'peak_like' | 'peak_comment' | 'peak_reply'
    | 'new_peak' | 'peak_tag'
    | 'post_tag'
    | 'live';
  postId?: string;
  peakId?: string;
  userId?: string;
  conversationId?: string;
  channelName?: string;
  title?: string;
  body?: string;
}

export interface PushToken {
  token: string;
  platform: 'ios' | 'android';
  deviceId: string;
}

// ============================================
// CONFIGURATION
// ============================================

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ============================================
// PERMISSION & REGISTRATION
// ============================================

/**
 * Request notification permissions
 * @returns Permission status
 */
export const requestPermissions = async (): Promise<boolean> => {
  if (!Device.isDevice) {
    if (__DEV__) console.log('Push notifications only work on physical devices');
    return false;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (__DEV__) console.log('Notification permission denied');
      return false;
    }

    return true;
  } catch (error) {
    captureException(error as Error, { context: 'requestNotificationPermissions' });
    return false;
  }
};

/**
 * Get the Expo push token for this device
 * @returns Push token or null
 */
// Persistent device identifier (per install)
const DEVICE_ID_KEY = 'smuppy_device_id';
export const getDeviceId = async (): Promise<string> => {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = uuidv4();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return uuidv4();
  }
};

/**
 * Get native push token (APNs/FCM) for production apps.
 * Falls back to Expo token in dev if native token unavailable.
 */
export const getNativePushToken = async (): Promise<{ token: string; platform: 'ios' | 'android' } | null> => {
  if (!Device.isDevice) {
    if (__DEV__) console.log('Must use physical device for Push Notifications');
    return null;
  }

  const hasPermission = await requestPermissions();
  if (!hasPermission) return null;

  try {
    const native = await Notifications.getDevicePushTokenAsync();
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const token = typeof native.data === 'string'
      ? native.data
      : (native as Record<string, unknown>)?.data as string || '';

    if (token) return { token, platform };
  } catch (error) {
    captureException(error as Error, { context: 'getDevicePushToken' });
  }

  // Dev fallback to Expo token to keep push working in Expo Go
  try {
    const expoToken = await Notifications.getExpoPushTokenAsync({
      projectId: safeEnv('EXPO_PUBLIC_PROJECT_ID') || Constants.expoConfig?.extra?.eas?.projectId || undefined,
    });
    if (expoToken?.data) {
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      return { token: expoToken.data, platform };
    }
  } catch (err) {
    captureException(err as Error, { context: 'getExpoPushToken-fallback' });
  }

  return null;
};

// Backwards-compatible helper (used only in default export to avoid runtime errors)
export const getExpoPushToken = async (): Promise<string | null> => {
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: safeEnv('EXPO_PUBLIC_PROJECT_ID') || Constants.expoConfig?.extra?.eas?.projectId || undefined,
    });
    return tokenData?.data || null;
  } catch (error) {
    captureException(error as Error, { context: 'getExpoPushToken-compat' });
    return null;
  }
};

/**
 * Register push token with backend.
 * Caches the token fingerprint in SecureStore to avoid redundant API calls
 * and prevent hitting the backend's rate limit (5 req / 60s).
 * @param userId User ID to associate token with
 */
const LAST_TOKEN_KEY = 'smuppy_last_push_token';

export const registerPushToken = async (_userId: string): Promise<boolean> => {
  try {
    const native = await getNativePushToken();
    if (!native) {
      if (__DEV__) console.warn('[Push] No push token available (permissions denied or not a device)');
      return false;
    }

    if (__DEV__) console.log(`[Push] Got token (${native.platform}): ${native.token.substring(0, 20)}...`);

    const deviceId = await getDeviceId();
    const tokenFingerprint = `${native.token}:${deviceId}`;

    // Skip API call if same token+device already registered
    try {
      const lastToken = await SecureStore.getItemAsync(LAST_TOKEN_KEY);
      if (lastToken === tokenFingerprint) {
        if (__DEV__) console.log('[Push] Token already registered, skipping');
        return true;
      }
    } catch { /* SecureStore read failed — continue with registration */ }

    await awsAPI.registerPushToken({
      token: native.token,
      platform: native.platform,
      deviceId,
    });

    // Cache on success so subsequent calls skip the API
    try {
      await SecureStore.setItemAsync(LAST_TOKEN_KEY, tokenFingerprint);
    } catch { /* non-critical */ }

    if (__DEV__) console.log('[Push] Token registered with backend successfully');
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[Push] Failed to register token:', error);
    captureException(error as Error, { context: 'registerPushToken' });
    return false;
  }
};

/**
 * Unregister push token (on logout)
 * @param userId User ID
 */
export const unregisterPushToken = async (_userId: string): Promise<void> => {
  try {
    const deviceId = await getDeviceId();
    await awsAPI.unregisterPushToken(deviceId);
    // Clear cached token so re-registration after login works
    try { await SecureStore.deleteItemAsync(LAST_TOKEN_KEY); } catch { /* non-critical */ }
    if (__DEV__) console.log('Push token unregistered');
  } catch (error) {
    captureException(error as Error, { context: 'unregisterPushToken' });
  }
};

// ============================================
// NOTIFICATION HANDLING
// ============================================

/**
 * Handle notification received while app is in foreground
 */
export const addNotificationReceivedListener = (
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription => {
  return Notifications.addNotificationReceivedListener(callback);
};

/**
 * Handle notification tap (user interaction)
 */
export const addNotificationResponseListener = (
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription => {
  return Notifications.addNotificationResponseReceivedListener(callback);
};

/**
 * Get the notification that launched the app (if any)
 */
export const getLastNotificationResponse = async (): Promise<Notifications.NotificationResponse | null> => {
  return await Notifications.getLastNotificationResponseAsync();
};

/**
 * Parse notification data from response
 */
export const parseNotificationData = (
  response: Notifications.NotificationResponse
): NotificationData | null => {
  try {
    const data = response.notification.request.content.data as unknown as NotificationData;
    return data;
  } catch {
    return null;
  }
};

// ============================================
// LOCAL NOTIFICATIONS
// ============================================

/**
 * Schedule a local notification
 */
export const scheduleLocalNotification = async (
  title: string,
  body: string,
  data?: NotificationData,
  trigger?: Notifications.NotificationTriggerInput
): Promise<string> => {
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data as unknown as Record<string, unknown>,
      sound: true,
    },
    trigger: trigger || null, // null = immediate
  });

  return id;
};

/**
 * Cancel a scheduled notification
 */
export const cancelNotification = async (notificationId: string): Promise<void> => {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
};

/**
 * Cancel all scheduled notifications
 */
export const cancelAllNotifications = async (): Promise<void> => {
  await Notifications.cancelAllScheduledNotificationsAsync();
};

// ============================================
// BADGE MANAGEMENT
// ============================================

/**
 * Set app badge count
 */
export const setBadgeCount = async (count: number): Promise<void> => {
  await Notifications.setBadgeCountAsync(count);
};

/**
 * Get current badge count
 */
export const getBadgeCount = async (): Promise<number> => {
  return await Notifications.getBadgeCountAsync();
};

/**
 * Clear badge
 */
export const clearBadge = async (): Promise<void> => {
  await Notifications.setBadgeCountAsync(0);
};

// ============================================
// ANDROID CHANNEL SETUP
// ============================================

/**
 * Setup Android notification channels
 * Must be called on app startup for Android
 */
export const setupAndroidChannels = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;

  // Default channel for general notifications
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#11E3A3',
    sound: 'default',
  });

  // Messages channel (high priority)
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    description: 'Direct message notifications',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#11E3A3',
    sound: 'default',
  });

  // Social channel (likes, comments, follows)
  await Notifications.setNotificationChannelAsync('social', {
    name: 'Social',
    description: 'Likes, comments, and follows',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 100],
    lightColor: '#11E3A3',
  });
};

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize notification system
 * Call this on app startup
 */
export const initializeNotifications = async (): Promise<void> => {
  try {
    // Setup Android channels
    await setupAndroidChannels();

    // Check if launched from notification
    const lastResponse = await getLastNotificationResponse();
    if (lastResponse) {
      if (__DEV__) console.log('App launched from notification:', lastResponse);
    }

    if (__DEV__) console.log('Notification system initialized');
  } catch (error) {
    captureException(error as Error, { context: 'initializeNotifications' });
  }
};

export default {
  requestPermissions,
  getExpoPushToken,
  registerPushToken,
  unregisterPushToken,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  getLastNotificationResponse,
  parseNotificationData,
  scheduleLocalNotification,
  cancelNotification,
  cancelAllNotifications,
  setBadgeCount,
  getBadgeCount,
  clearBadge,
  setupAndroidChannels,
  initializeNotifications,
};
