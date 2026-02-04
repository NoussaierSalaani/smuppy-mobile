/**
 * Sentry Integration for Smuppy
 *
 * Real @sentry/react-native integration with PII scrubbing.
 * Gracefully degrades to no-ops when SENTRY_DSN is not configured.
 *
 * SAFETY: No module-level code here can throw — a crash at import time
 * kills the app before ErrorBoundary mounts.
 *
 * Preserved exports (same signatures as previous stubs):
 *   initSentry, setUserContext, addBreadcrumb, captureException,
 *   captureMessage, startTransaction, withErrorBoundary,
 *   sentryNavigationIntegration
 */

import * as Sentry from '@sentry/react-native';
import { ENV } from '../config/env';

// =============================================
// PII SCRUBBING
// =============================================

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const SENSITIVE_KEYS = /token|password|secret|authorization|cookie|session|phone|username|email/i;

const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!domain) return '[REDACTED]';
  return `${local.slice(0, 2)}***@${domain}`;
};

const scrubValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.replace(EMAIL_REGEX, (match) => maskEmail(match));
  }
  return value;
};

const scrubObject = (obj: Record<string, unknown>): Record<string, unknown> => {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.test(key)) {
      scrubbed[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      scrubbed[key] = scrubValue(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      scrubbed[key] = scrubObject(value as Record<string, unknown>);
    } else {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
};

// =============================================
// NAVIGATION INTEGRATION (created before init, registered after)
// =============================================

// Safe creation — never throw at module level
let _navigationIntegration: ReturnType<typeof Sentry.reactNavigationIntegration> | null = null;
try {
  _navigationIntegration = Sentry.reactNavigationIntegration({
    enableTimeToInitialDisplay: true,
  });
} catch {
  // Sentry version mismatch or native module issue — degrade gracefully
  if (__DEV__) console.warn('[Sentry] Failed to create navigation integration');
}

export const sentryNavigationIntegration = _navigationIntegration;

// =============================================
// INITIALIZATION
// =============================================

let initialized = false;

export const initSentry = (): void => {
  if (initialized) return;

  const dsn = ENV.SENTRY_DSN;
  if (!dsn) {
    if (__DEV__) console.log('[Sentry] No DSN configured, skipping init');
    return;
  }

  const isDev = __DEV__;

  // Build integrations list — include navigation if created successfully
  const integrations: ReturnType<typeof Sentry.reactNavigationIntegration>[] = [];
  if (_navigationIntegration) {
    integrations.push(_navigationIntegration);
  }

  Sentry.init({
    dsn,
    debug: isDev,
    sendDefaultPii: false,
    integrations,
    tracesSampleRate: isDev ? 1.0 : 0.2,
    profilesSampleRate: isDev ? 1.0 : 0.1,
    environment: ENV.APP_ENV,
    release: `com.nou09.Smuppy@${ENV.APP_VERSION}`,
    beforeSend(event) {
      // Scrub PII from exception messages
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) {
            ex.value = scrubValue(ex.value) as string;
          }
        }
      }

      // Scrub PII from breadcrumbs
      if (event.breadcrumbs) {
        for (const bc of event.breadcrumbs) {
          if (bc.message) {
            bc.message = scrubValue(bc.message) as string;
          }
          if (bc.data) {
            bc.data = scrubObject(bc.data as Record<string, unknown>);
          }
        }
      }

      // Scrub extra context
      if (event.extra) {
        event.extra = scrubObject(event.extra as Record<string, unknown>);
      }

      return event;
    },
  });

  initialized = true;
  if (isDev) console.log('[Sentry] Initialized');
};

// =============================================
// USER CONTEXT
// =============================================

export const setUserContext = (user: unknown): void => {
  if (!initialized) return;
  if (!user || typeof user !== 'object') {
    Sentry.setUser(null);
    return;
  }
  const u = user as Record<string, unknown>;
  // Only send user ID — never email, username, or other PII
  Sentry.setUser({ id: u.id as string });
};

// =============================================
// BREADCRUMBS & CAPTURE
// =============================================

export const addBreadcrumb = (
  message: string,
  category?: string,
  data?: Record<string, unknown>,
): void => {
  if (!initialized) return;
  Sentry.addBreadcrumb({
    message: scrubValue(message) as string,
    category: category || 'app',
    data: data ? scrubObject(data) : undefined,
  });
};

export const captureException = (
  error: Error,
  context?: Record<string, unknown>,
): void => {
  if (__DEV__) console.warn('[Error]', error?.message || error);
  if (!initialized) return;
  Sentry.captureException(error, {
    extra: context ? scrubObject(context) : undefined,
  });
};

export const captureMessage = (
  message: string,
  level?: string,
  context?: Record<string, unknown>,
): void => {
  if (!initialized) return;
  Sentry.captureMessage(scrubValue(message) as string, {
    level: (level as Sentry.SeverityLevel) || 'info',
    extra: context ? scrubObject(context) : undefined,
  });
};

// =============================================
// TRANSACTIONS
// =============================================

/**
 * startTransaction — returns null.
 * Sentry v7+ uses startSpan / navigation integration for automatic tracing.
 */
export const startTransaction = (_name: string, _op?: string): null => null;

// =============================================
// ERROR BOUNDARY
// =============================================

export const withErrorBoundary = Sentry.withErrorBoundary;

export default null;
