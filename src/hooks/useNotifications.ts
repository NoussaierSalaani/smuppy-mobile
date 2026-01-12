/**
 * useNotifications Hook
 * Provides easy access to push notification functionality
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import {
  registerPushToken,
  unregisterPushToken,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  parseNotificationData,
  clearBadge,
  setBadgeCount,
  scheduleLocalNotification,
  NotificationData,
} from '../services/notifications';
import { useUserStore } from '../stores';

// ============================================
// TYPES
// ============================================

interface UseNotificationsOptions {
  onNotificationReceived?: (notification: Notifications.Notification) => void;
  onNotificationTapped?: (data: NotificationData) => void;
}

interface UseNotificationsReturn {
  registerForPushNotifications: () => Promise<boolean>;
  unregisterFromPushNotifications: () => Promise<void>;
  sendLocalNotification: (title: string, body: string, data?: NotificationData) => Promise<string>;
  clearBadgeCount: () => Promise<void>;
  setBadgeNumber: (count: number) => Promise<void>;
  hasPermission: boolean;
}

// ============================================
// HOOK
// ============================================

export const useNotifications = (
  options: UseNotificationsOptions = {}
): UseNotificationsReturn => {
  const { onNotificationReceived, onNotificationTapped } = options;
  const navigation = useNavigation<any>();
  const user = useUserStore((state) => state.user);
  const [hasPermission, setHasPermission] = useState(false);

  // Refs for listeners
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  /**
   * Handle navigation based on notification data
   */
  const handleNotificationNavigation = useCallback(
    (data: NotificationData) => {
      if (!data) return;

      switch (data.type) {
        case 'like':
        case 'comment':
          if (data.postId) {
            navigation.navigate('PostDetailFanFeed', { postId: data.postId });
          }
          break;

        case 'follow':
          if (data.userId) {
            navigation.navigate('UserProfile', { userId: data.userId });
          }
          break;

        case 'message':
          if (data.conversationId) {
            // Navigate to chat - need to fetch conversation first
            navigation.navigate('Messages');
          }
          break;

        case 'mention':
          if (data.postId) {
            navigation.navigate('PostDetailFanFeed', { postId: data.postId });
          }
          break;

        case 'post':
          if (data.userId) {
            navigation.navigate('UserProfile', { userId: data.userId });
          }
          break;

        default:
          // Default to home
          navigation.navigate('Home');
      }
    },
    [navigation]
  );

  /**
   * Register for push notifications
   */
  const registerForPushNotifications = useCallback(async (): Promise<boolean> => {
    if (!user?.id) {
      console.log('Cannot register for push notifications: No user logged in');
      return false;
    }

    const success = await registerPushToken(user.id);
    setHasPermission(success);
    return success;
  }, [user?.id]);

  /**
   * Unregister from push notifications
   */
  const unregisterFromPushNotifications = useCallback(async (): Promise<void> => {
    if (!user?.id) return;
    await unregisterPushToken(user.id);
    setHasPermission(false);
  }, [user?.id]);

  /**
   * Send a local notification
   */
  const sendLocalNotification = useCallback(
    async (title: string, body: string, data?: NotificationData): Promise<string> => {
      return await scheduleLocalNotification(title, body, data);
    },
    []
  );

  /**
   * Clear badge count
   */
  const clearBadgeCount = useCallback(async (): Promise<void> => {
    await clearBadge();
  }, []);

  /**
   * Set badge number
   */
  const setBadgeNumber = useCallback(async (count: number): Promise<void> => {
    await setBadgeCount(count);
  }, []);

  // Setup notification listeners
  useEffect(() => {
    // Listener for notifications received while app is foregrounded
    notificationListener.current = addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
      onNotificationReceived?.(notification);
    });

    // Listener for notification taps
    responseListener.current = addNotificationResponseListener((response) => {
      console.log('Notification tapped:', response);
      const data = parseNotificationData(response);

      if (data) {
        // Call custom handler if provided
        if (onNotificationTapped) {
          onNotificationTapped(data);
        } else {
          // Default: navigate based on notification type
          handleNotificationNavigation(data);
        }
      }
    });

    // Cleanup listeners on unmount
    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [onNotificationReceived, onNotificationTapped, handleNotificationNavigation]);

  return {
    registerForPushNotifications,
    unregisterFromPushNotifications,
    sendLocalNotification,
    clearBadgeCount,
    setBadgeNumber,
    hasPermission,
  };
};

// ============================================
// AUTO-REGISTER HOOK
// ============================================

/**
 * Hook that automatically registers for push notifications when user logs in
 * Use this in your main app component or auth flow
 */
export const useAutoRegisterPushNotifications = (): void => {
  const user = useUserStore((state) => state.user);
  const hasRegistered = useRef(false);

  useEffect(() => {
    const register = async () => {
      if (user?.id && !hasRegistered.current) {
        const success = await registerPushToken(user.id);
        if (success) {
          hasRegistered.current = true;
          console.log('Auto-registered for push notifications');
        }
      }
    };

    register();
  }, [user?.id]);

  // Reset on logout
  useEffect(() => {
    if (!user?.id) {
      hasRegistered.current = false;
    }
  }, [user?.id]);
};

export default useNotifications;
