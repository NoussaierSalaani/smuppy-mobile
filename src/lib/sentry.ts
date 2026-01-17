/**
 * Sentry Error Tracking Configuration
 * For crash reporting and performance monitoring
 */

import { ENV } from '../config/env';
import Constants from 'expo-constants';

// Check if running in Expo Go (Sentry native module not available)
const isExpoGo = Constants.appOwnership === 'expo';

// Conditionally import Sentry (not available in Expo Go)
let Sentry: any = null;
if (!isExpoGo) {
  try {
    Sentry = require('@sentry/react-native');
  } catch (e) {
    console.log('Sentry not available in this environment');
  }
}

// Sentry DSN - Add your DSN in .env file
const SENTRY_DSN = ENV.SENTRY_DSN || '';

/**
 * Initialize Sentry
 * Call this in App.js before any other code
 */
export const initSentry = () => {
  if (isExpoGo) {
    console.log('Sentry disabled in Expo Go - use development build for error tracking');
    return;
  }

  if (!Sentry || !SENTRY_DSN) {
    console.log('Sentry DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment
    environment: ENV.APP_ENV || 'development',

    // Enable performance monitoring
    tracesSampleRate: ENV.APP_ENV === 'production' ? 0.2 : 1.0,

    // Enable profiling (iOS/Android only)
    profilesSampleRate: ENV.APP_ENV === 'production' ? 0.1 : 0.5,

    // Attach stack traces to messages
    attachStacktrace: true,

    // Auto session tracking
    enableAutoSessionTracking: true,

    // Session tracking interval
    sessionTrackingIntervalMillis: 30000,

    // Ignore common non-critical errors
    ignoreErrors: [
      'Network request failed',
      'Failed to fetch',
      'AbortError',
      'Request timeout',
      // React Native specific
      'Invariant Violation',
    ],

    // Before sending an error
    beforeSend(event, hint) {
      // Filter out development errors
      if (ENV.APP_ENV === 'development') {
        console.log('Sentry event (dev):', event);
        return null; // Don't send in development
      }

      // Remove sensitive data
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }

      return event;
    },

    // Before sending breadcrumbs
    beforeBreadcrumb(breadcrumb) {
      // Filter out noisy breadcrumbs
      if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
        return null;
      }
      return breadcrumb;
    },
  });

  console.log('Sentry initialized');
};

/**
 * Set user context for error tracking
 */
export const setUserContext = (user: any) => {
  if (!Sentry || !SENTRY_DSN || isExpoGo) return;

  if (user) {
    Sentry.setUser({
      id: user.id,
      username: user.username,
      // Don't include email for privacy
    });
  } else {
    Sentry.setUser(null);
  }
};

/**
 * Add breadcrumb for debugging
 */
export const addBreadcrumb = (message: string, category = 'app', data = {}) => {
  if (!Sentry || !SENTRY_DSN || isExpoGo) return;

  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
};

/**
 * Capture an exception
 */
export const captureException = (error: Error, context: Record<string, any> = {}) => {
  if (!Sentry || !SENTRY_DSN || isExpoGo) {
    console.error('Captured exception:', error);
    return;
  }

  Sentry.withScope((scope: any) => {
    // Add extra context
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });

    Sentry.captureException(error);
  });
};

/**
 * Capture a message
 */
export const captureMessage = (message: string, level = 'info', context: Record<string, any> = {}) => {
  if (!Sentry || !SENTRY_DSN || isExpoGo) {
    console.log('Captured message:', message);
    return;
  }

  Sentry.withScope((scope: any) => {
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });

    Sentry.captureMessage(message, level);
  });
};

/**
 * Start a performance transaction
 */
export const startTransaction = (name: string, op = 'navigation') => {
  if (!Sentry || !SENTRY_DSN || isExpoGo) return null;

  return Sentry.startTransaction({
    name,
    op,
  });
};

/**
 * Wrap a component with Sentry error boundary
 * Returns identity function in Expo Go
 */
export const withErrorBoundary = Sentry?.withErrorBoundary || ((component: any) => component);

/**
 * Create a Sentry-wrapped navigation container
 */
export const createNavigationContainerRef = Sentry?.createNavigationContainerRef || (() => null);

/**
 * Sentry navigation integration
 * Wrapped in try/catch to prevent module-level crash
 */
let sentryNavigationIntegration: any = null;
try {
  if (Sentry && typeof Sentry.ReactNavigationInstrumentation === 'function') {
    sentryNavigationIntegration = new Sentry.ReactNavigationInstrumentation();
  }
} catch (e) {
  console.warn('[Sentry] ReactNavigationInstrumentation not available');
}
export { sentryNavigationIntegration };

export default Sentry;
