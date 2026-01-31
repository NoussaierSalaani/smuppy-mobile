/**
 * Analytics Service
 * Centralized analytics tracking for user behavior and events
 *
 * Currently uses a simple implementation that can be easily swapped
 * for Mixpanel, Amplitude, or any other analytics provider
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

// ============================================
// TYPES
// ============================================

interface UserProperties {
  userId?: string;
  email?: string;
  username?: string;
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
  createdAt?: string;
  [key: string]: string | number | boolean | undefined;
}

interface EventProperties {
  [key: string]: string | number | boolean | undefined | null;
}

interface AnalyticsConfig {
  enabled: boolean;
  debugMode: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const ANALYTICS_USER_ID_KEY = '@smuppy_analytics_user_id';
const ANALYTICS_QUEUE_KEY = '@smuppy_analytics_queue';
const MAX_QUEUE_SIZE = 100;

// Event names - standardized for consistency
export const EVENTS = {
  // Auth Events
  SIGN_UP: 'sign_up',
  SIGN_IN: 'sign_in',
  SIGN_OUT: 'sign_out',
  PASSWORD_RESET: 'password_reset',

  // Onboarding
  ONBOARDING_START: 'onboarding_start',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  ONBOARDING_SKIP: 'onboarding_skip',

  // Content
  POST_CREATE: 'post_create',
  POST_VIEW: 'post_view',
  POST_LIKE: 'post_like',
  POST_UNLIKE: 'post_unlike',
  POST_COMMENT: 'post_comment',
  POST_SHARE: 'post_share',
  POST_SAVE: 'post_save',
  POST_UNSAVE: 'post_unsave',

  // Peaks (Stories)
  PEAK_CREATE: 'peak_create',
  PEAK_VIEW: 'peak_view',
  PEAK_REACT: 'peak_react',

  // Social
  FOLLOW: 'follow',
  UNFOLLOW: 'unfollow',
  PROFILE_VIEW: 'profile_view',

  // Messages
  CONVERSATION_START: 'conversation_start',
  MESSAGE_SEND: 'message_send',

  // Business
  BUSINESS_VIEW: 'business_view',
  BOOKING_START: 'booking_start',
  BOOKING_COMPLETE: 'booking_complete',
  SUBSCRIPTION_START: 'subscription_start',
  SUBSCRIPTION_COMPLETE: 'subscription_complete',

  // Pro Creator
  SESSION_BOOK: 'session_book',
  SESSION_COMPLETE: 'session_complete',
  CHANNEL_SUBSCRIBE: 'channel_subscribe',
  TIP_SEND: 'tip_send',

  // Live
  LIVE_START: 'live_start',
  LIVE_JOIN: 'live_join',
  LIVE_END: 'live_end',

  // Events & Challenges
  EVENT_JOIN: 'event_join',
  CHALLENGE_JOIN: 'challenge_join',
  CHALLENGE_SUBMIT: 'challenge_submit',

  // Navigation
  SCREEN_VIEW: 'screen_view',
  TAB_SWITCH: 'tab_switch',

  // Errors
  ERROR: 'error',
  API_ERROR: 'api_error',
} as const;

// ============================================
// STATE
// ============================================

let config: AnalyticsConfig = {
  enabled: true,
  debugMode: __DEV__,
};

let userId: string | undefined;
let userProperties: UserProperties = {};
let eventQueue: Array<{ name: string; properties: EventProperties; timestamp: number }> = [];

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize analytics with configuration
 */
export const initAnalytics = async (options?: Partial<AnalyticsConfig>): Promise<void> => {
  config = { ...config, ...options };

  // Load persisted user ID
  try {
    const storedUserId = await AsyncStorage.getItem(ANALYTICS_USER_ID_KEY);
    if (storedUserId) {
      userId = storedUserId;
    }

    // Load queued events (for offline support)
    const queuedEvents = await AsyncStorage.getItem(ANALYTICS_QUEUE_KEY);
    if (queuedEvents) {
      eventQueue = JSON.parse(queuedEvents);
    }
  } catch (error) {
    if (__DEV__) console.warn('Failed to initialize analytics:', error);
  }

  // Set device properties
  setUserProperties({
    platform: Platform.OS,
    deviceModel: Device.modelName || 'unknown',
    osVersion: Platform.Version?.toString() || 'unknown',
  });

  if (config.debugMode) {
    console.log('[Analytics] Initialized with config:', config);
  }
};

// ============================================
// USER IDENTIFICATION
// ============================================

/**
 * Identify the current user
 */
export const identify = async (id: string, properties?: UserProperties): Promise<void> => {
  userId = id;
  userProperties = { ...userProperties, ...properties, userId: id };

  // Persist user ID
  try {
    await AsyncStorage.setItem(ANALYTICS_USER_ID_KEY, id);
  } catch (error) {
    if (__DEV__) console.warn('Failed to persist analytics user ID:', error);
  }

  if (config.debugMode) {
    console.log('[Analytics] Identified user:', id.substring(0, 2) + '***');
  }
};

/**
 * Set user properties without identifying
 */
export const setUserProperties = (properties: UserProperties): void => {
  userProperties = { ...userProperties, ...properties };

  if (config.debugMode) {
    console.log('[Analytics] Set user properties:', properties);
  }
};

/**
 * Reset user identity (on logout)
 */
export const reset = async (): Promise<void> => {
  userId = undefined;
  userProperties = {};

  try {
    await AsyncStorage.removeItem(ANALYTICS_USER_ID_KEY);
  } catch (error) {
    if (__DEV__) console.warn('Failed to reset analytics:', error);
  }

  if (config.debugMode) {
    console.log('[Analytics] Reset user identity');
  }
};

// ============================================
// EVENT TRACKING
// ============================================

/**
 * Track an event
 */
export const track = async (
  eventName: string,
  properties?: EventProperties
): Promise<void> => {
  if (!config.enabled) return;

  const event = {
    name: eventName,
    properties: {
      ...properties,
      userId,
      timestamp: Date.now(),
      platform: Platform.OS,
    },
    timestamp: Date.now(),
  };

  if (config.debugMode) {
    console.log('[Analytics] Track:', eventName, properties);
  }

  // Queue event for batch sending
  eventQueue.push(event);

  // Trim queue if too large
  if (eventQueue.length > MAX_QUEUE_SIZE) {
    eventQueue = eventQueue.slice(-MAX_QUEUE_SIZE);
  }

  // Persist queue
  try {
    await AsyncStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(eventQueue));
  } catch (error) {
    if (__DEV__) console.warn('Failed to persist analytics queue:', error);
  }

  // In production, you would send to your analytics provider here
  // Example: await sendToProvider(event);
};

/**
 * Track a screen view
 */
export const trackScreen = (screenName: string, properties?: EventProperties): void => {
  track(EVENTS.SCREEN_VIEW, {
    screen_name: screenName,
    ...properties,
  });
};

// ============================================
// CONVENIENCE METHODS
// ============================================

/**
 * Track sign up
 */
export const trackSignUp = (method: 'email' | 'google' | 'apple'): void => {
  track(EVENTS.SIGN_UP, { method });
};

/**
 * Track sign in
 */
export const trackSignIn = (method: 'email' | 'google' | 'apple'): void => {
  track(EVENTS.SIGN_IN, { method });
};

/**
 * Track post creation
 */
export const trackPostCreate = (postType: 'text' | 'image' | 'video'): void => {
  track(EVENTS.POST_CREATE, { post_type: postType });
};

/**
 * Track post interaction
 */
export const trackPostInteraction = (
  action: 'like' | 'unlike' | 'comment' | 'share' | 'save' | 'unsave',
  postId: string
): void => {
  const eventMap = {
    like: EVENTS.POST_LIKE,
    unlike: EVENTS.POST_UNLIKE,
    comment: EVENTS.POST_COMMENT,
    share: EVENTS.POST_SHARE,
    save: EVENTS.POST_SAVE,
    unsave: EVENTS.POST_UNSAVE,
  };
  track(eventMap[action], { post_id: postId });
};

/**
 * Track follow/unfollow
 */
export const trackFollow = (targetUserId: string, isFollow: boolean): void => {
  track(isFollow ? EVENTS.FOLLOW : EVENTS.UNFOLLOW, {
    target_user_id: targetUserId,
  });
};

/**
 * Track error
 */
export const trackError = (
  errorName: string,
  errorMessage: string,
  context?: string
): void => {
  track(EVENTS.ERROR, {
    error_name: errorName,
    error_message: errorMessage,
    context,
  });
};

// ============================================
// FLUSH & EXPORT
// ============================================

/**
 * Flush pending events (send to provider)
 */
export const flush = async (): Promise<void> => {
  if (eventQueue.length === 0) return;

  if (config.debugMode) {
    console.log('[Analytics] Flushing', eventQueue.length, 'events');
  }

  // In production, send events to your analytics provider
  // Example:
  // await Promise.all(eventQueue.map(event => sendToProvider(event)));

  // Clear queue after successful send
  eventQueue = [];
  await AsyncStorage.removeItem(ANALYTICS_QUEUE_KEY);
};

/**
 * Get all queued events (for debugging)
 */
export const getQueuedEvents = (): typeof eventQueue => {
  return [...eventQueue];
};

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  init: initAnalytics,
  identify,
  setUserProperties,
  reset,
  track,
  trackScreen,
  trackSignUp,
  trackSignIn,
  trackPostCreate,
  trackPostInteraction,
  trackFollow,
  trackError,
  flush,
  EVENTS,
};
