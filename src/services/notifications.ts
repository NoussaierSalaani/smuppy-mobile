/**
 * Push Notifications Service
 * Handles registration, permissions, and notification management
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { awsAPI } from './aws-api';
import { captureException } from '../lib/sentry';

// ============================================
// TYPES
// ============================================

export interface NotificationData {
  type: 'like' | 'comment' | 'follow' | 'message' | 'mention' | 'post';
  postId?: string;
  userId?: string;
  conversationId?: string;
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
export const getExpoPushToken = async (): Promise<string | null> => {
  if (!Device.isDevice) {
    if (__DEV__) console.log('Must use physical device for Push Notifications');
    return null;
  }

  try {
    // Request permissions first
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      return null;
    }

    // Get the token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID || Constants.expoConfig?.extra?.eas?.projectId || undefined,
    });

    return tokenData.data;
  } catch (error) {
    captureException(error as Error, { context: 'getExpoPushToken' });
    return null;
  }
};

/**
 * Register push token with backend
 * @param userId User ID to associate token with
 */
export const registerPushToken = async (_userId: string): Promise<boolean> => {
  try {
    const token = await getExpoPushToken();
    if (!token) {
      return false;
    }

    const deviceId = Device.deviceName || 'unknown';
    const platform = Platform.OS as 'ios' | 'android';

    // Save to AWS
    await awsAPI.registerPushToken({
      token,
      platform,
      deviceId,
    });

    if (__DEV__) console.log('Push token registered successfully');
    return true;
  } catch (error) {
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
    const deviceId = Device.deviceName || 'unknown';
    await awsAPI.unregisterPushToken(deviceId);
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
