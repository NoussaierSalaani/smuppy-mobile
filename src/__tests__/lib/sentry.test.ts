/**
 * Sentry Integration Tests
 *
 * Tests for initSentry, setUserContext, addBreadcrumb, captureException,
 * captureMessage, startTransaction, PII scrubbing, and pending buffer flushing.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = true;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSentryInit = jest.fn();
const mockSentrySetUser = jest.fn();
const mockSentryAddBreadcrumb = jest.fn();
const mockSentryCaptureException = jest.fn();
const mockSentryCaptureMessage = jest.fn();
const mockSentryWithErrorBoundary = jest.fn();
const mockReactNavigationIntegration = jest.fn().mockReturnValue({ name: 'ReactNavigation' });

jest.mock('@sentry/react-native', () => ({
  init: (...a: unknown[]) => mockSentryInit(...a),
  setUser: (...a: unknown[]) => mockSentrySetUser(...a),
  addBreadcrumb: (...a: unknown[]) => mockSentryAddBreadcrumb(...a),
  captureException: (...a: unknown[]) => mockSentryCaptureException(...a),
  captureMessage: (...a: unknown[]) => mockSentryCaptureMessage(...a),
  withErrorBoundary: mockSentryWithErrorBoundary,
  reactNavigationIntegration: (...a: unknown[]) => mockReactNavigationIntegration(...a),
}));

jest.mock('../../config/env', () => ({
  ENV: {
    SENTRY_DSN: '', // Default empty — tests will set it
    APP_ENV: 'development',
    APP_VERSION: '1.0.0',
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

// We need to isolate modules for each test that changes `initialized` state.
// The easiest approach: re-require the module in tests that need fresh state.

function loadSentryModule() {
  // Clear the module cache so we get a fresh instance
  jest.resetModules();

  // Re-mock everything after resetModules
  jest.doMock('@sentry/react-native', () => ({
    init: (...a: unknown[]) => mockSentryInit(...a),
    setUser: (...a: unknown[]) => mockSentrySetUser(...a),
    addBreadcrumb: (...a: unknown[]) => mockSentryAddBreadcrumb(...a),
    captureException: (...a: unknown[]) => mockSentryCaptureException(...a),
    captureMessage: (...a: unknown[]) => mockSentryCaptureMessage(...a),
    withErrorBoundary: mockSentryWithErrorBoundary,
    reactNavigationIntegration: (...a: unknown[]) => mockReactNavigationIntegration(...a),
  }));

  return require('../../lib/sentry') as typeof import('../../lib/sentry');
}

function loadSentryModuleWithDSN(dsn = 'https://test@sentry.io/123') {
  jest.resetModules();

  jest.doMock('@sentry/react-native', () => ({
    init: (...a: unknown[]) => mockSentryInit(...a),
    setUser: (...a: unknown[]) => mockSentrySetUser(...a),
    addBreadcrumb: (...a: unknown[]) => mockSentryAddBreadcrumb(...a),
    captureException: (...a: unknown[]) => mockSentryCaptureException(...a),
    captureMessage: (...a: unknown[]) => mockSentryCaptureMessage(...a),
    withErrorBoundary: mockSentryWithErrorBoundary,
    reactNavigationIntegration: (...a: unknown[]) => mockReactNavigationIntegration(...a),
  }));

  jest.doMock('../../config/env', () => ({
    ENV: {
      SENTRY_DSN: dsn,
      APP_ENV: 'development',
      APP_VERSION: '1.0.0',
    },
  }));

  return require('../../lib/sentry') as typeof import('../../lib/sentry');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lib/sentry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // initSentry
  // =========================================================================
  describe('initSentry', () => {
    it('skips init when DSN is empty', () => {
      const sentry = loadSentryModule();
      sentry.initSentry();

      expect(mockSentryInit).not.toHaveBeenCalled();
    });

    it('calls Sentry.init with correct config when DSN is set', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      expect(mockSentryInit).toHaveBeenCalledTimes(1);
      const config = mockSentryInit.mock.calls[0][0];
      expect(config.dsn).toBe('https://test@sentry.io/123');
      expect(config.debug).toBe(true); // __DEV__ is true
      expect(config.sendDefaultPii).toBe(false);
      expect(config.environment).toBe('development');
      expect(config.release).toBe('com.nou09.Smuppy@1.0.0');
      expect(config.tracesSampleRate).toBe(1.0); // DEV rate
      expect(config.profilesSampleRate).toBe(1.0); // DEV rate
      expect(typeof config.beforeSend).toBe('function');
    });

    it('does not init twice', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();
      sentry.initSentry();

      expect(mockSentryInit).toHaveBeenCalledTimes(1);
    });

    it('includes navigation integration if available', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      const config = mockSentryInit.mock.calls[0][0];
      expect(config.integrations.length).toBeGreaterThanOrEqual(1);
    });

    it('flushes pending exceptions after init', () => {
      const sentry = loadSentryModuleWithDSN();

      // Capture before init — should be buffered
      sentry.captureException(new Error('pre-init error'), { key: 'val' });
      expect(mockSentryCaptureException).not.toHaveBeenCalled();

      // Init — should flush
      sentry.initSentry();
      expect(mockSentryCaptureException).toHaveBeenCalledTimes(1);
      expect(mockSentryCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ extra: { key: 'val' } }),
      );
    });

    it('flushes pending messages after init', () => {
      const sentry = loadSentryModuleWithDSN();

      sentry.captureMessage('pre-init msg', 'warning', { ctx: 'test' });
      expect(mockSentryCaptureMessage).not.toHaveBeenCalled();

      sentry.initSentry();
      expect(mockSentryCaptureMessage).toHaveBeenCalledTimes(1);
      expect(mockSentryCaptureMessage).toHaveBeenCalledWith(
        'pre-init msg',
        expect.objectContaining({
          level: 'warning',
          extra: { ctx: 'test' },
        }),
      );
    });
  });

  // =========================================================================
  // setUserContext
  // =========================================================================
  describe('setUserContext', () => {
    it('sets user ID only (no PII)', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      sentry.setUserContext({ id: 'u1', email: 'test@email.com', username: 'test' });
      expect(mockSentrySetUser).toHaveBeenCalledWith({ id: 'u1' });
    });

    it('clears user when null is passed', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      sentry.setUserContext(null);
      expect(mockSentrySetUser).toHaveBeenCalledWith(null);
    });

    it('clears user when non-object is passed', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      sentry.setUserContext('invalid');
      expect(mockSentrySetUser).toHaveBeenCalledWith(null);
    });

    it('clears user when id is not a string', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      sentry.setUserContext({ id: 123 });
      expect(mockSentrySetUser).toHaveBeenCalledWith(null);
    });

    it('does nothing when not initialized', () => {
      const sentry = loadSentryModule();
      sentry.setUserContext({ id: 'u1' });
      expect(mockSentrySetUser).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // addBreadcrumb
  // =========================================================================
  describe('addBreadcrumb', () => {
    it('adds breadcrumb with message and category', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      sentry.addBreadcrumb('User clicked button', 'ui');
      expect(mockSentryAddBreadcrumb).toHaveBeenCalledWith({
        message: 'User clicked button',
        category: 'ui',
        data: undefined,
      });
    });

    it('uses default category "app" when not specified', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      sentry.addBreadcrumb('Something happened');
      expect(mockSentryAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'app' }),
      );
    });

    it('scrubs PII from breadcrumb message', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      sentry.addBreadcrumb('User john@example.com logged in');
      const call = mockSentryAddBreadcrumb.mock.calls[0][0];
      expect(call.message).not.toContain('john@example.com');
      expect(call.message).toContain('jo***@example.com');
    });

    it('scrubs sensitive keys from breadcrumb data', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      sentry.addBreadcrumb('Auth', 'auth', { token: 'secret123', userId: 'u1' });
      const call = mockSentryAddBreadcrumb.mock.calls[0][0];
      expect(call.data.token).toBe('[REDACTED]');
      expect(call.data.userId).toBe('u1');
    });

    it('does nothing when not initialized', () => {
      const sentry = loadSentryModule();
      sentry.addBreadcrumb('test');
      expect(mockSentryAddBreadcrumb).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // captureException
  // =========================================================================
  describe('captureException', () => {
    it('sends exception with context after init', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      const error = new Error('Test error');
      sentry.captureException(error, { screen: 'Home' });
      expect(mockSentryCaptureException).toHaveBeenCalledWith(error, {
        extra: { screen: 'Home' },
      });
    });

    it('sends exception without context', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      const error = new Error('No context');
      sentry.captureException(error);
      expect(mockSentryCaptureException).toHaveBeenCalledWith(error, {
        extra: undefined,
      });
    });

    it('buffers exceptions before init', () => {
      const sentry = loadSentryModuleWithDSN();

      sentry.captureException(new Error('buffered'));
      expect(mockSentryCaptureException).not.toHaveBeenCalled();

      sentry.initSentry();
      expect(mockSentryCaptureException).toHaveBeenCalledTimes(1);
    });

    it('scrubs sensitive keys in context', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      sentry.captureException(new Error('err'), { password: '12345', page: 'login' });
      const call = mockSentryCaptureException.mock.calls[0];
      expect(call[1].extra.password).toBe('[REDACTED]');
      expect(call[1].extra.page).toBe('login');
    });
  });

  // =========================================================================
  // captureMessage
  // =========================================================================
  describe('captureMessage', () => {
    it('sends message with level and context after init', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      sentry.captureMessage('Something happened', 'warning', { detail: 'x' });
      expect(mockSentryCaptureMessage).toHaveBeenCalledWith('Something happened', {
        level: 'warning',
        extra: { detail: 'x' },
      });
    });

    it('defaults to info level', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      sentry.captureMessage('info msg');
      expect(mockSentryCaptureMessage).toHaveBeenCalledWith('info msg', {
        level: 'info',
        extra: undefined,
      });
    });

    it('scrubs emails from message text', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      sentry.captureMessage('Login failed for user@test.com');
      const msg = mockSentryCaptureMessage.mock.calls[0][0];
      expect(msg).not.toContain('user@test.com');
      expect(msg).toContain('us***@test.com');
    });

    it('buffers messages before init', () => {
      const sentry = loadSentryModuleWithDSN();

      sentry.captureMessage('buffered msg', 'error');
      expect(mockSentryCaptureMessage).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // startTransaction
  // =========================================================================
  describe('startTransaction', () => {
    it('returns null (deprecated in Sentry v7+)', () => {
      const sentry = loadSentryModule();
      const result = sentry.startTransaction('test', 'navigation');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // withErrorBoundary
  // =========================================================================
  describe('withErrorBoundary', () => {
    it('exports Sentry.withErrorBoundary', () => {
      const sentry = loadSentryModule();
      expect(sentry.withErrorBoundary).toBe(mockSentryWithErrorBoundary);
    });
  });

  // =========================================================================
  // sentryNavigationIntegration
  // =========================================================================
  describe('sentryNavigationIntegration', () => {
    it('creates navigation integration with enableTimeToInitialDisplay', () => {
      const sentry = loadSentryModule();
      expect(sentry.sentryNavigationIntegration).toEqual({ name: 'ReactNavigation' });
      expect(mockReactNavigationIntegration).toHaveBeenCalledWith({
        enableTimeToInitialDisplay: true,
      });
    });
  });

  // =========================================================================
  // PII Scrubbing (via beforeSend)
  // =========================================================================
  describe('PII scrubbing via beforeSend', () => {
    it('masks emails in exception values', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      const beforeSend = mockSentryInit.mock.calls[0][0].beforeSend;
      const event = {
        exception: {
          values: [
            { value: 'Error for user john.doe@example.com' },
          ],
        },
      };

      const scrubbed = beforeSend(event);
      expect(scrubbed.exception.values[0].value).not.toContain('john.doe@example.com');
      expect(scrubbed.exception.values[0].value).toContain('jo***@example.com');
    });

    it('masks emails in breadcrumb messages', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      const beforeSend = mockSentryInit.mock.calls[0][0].beforeSend;
      const event = {
        breadcrumbs: [
          { message: 'Login as alice@test.com', data: { email: 'alice@test.com' } },
        ],
      };

      const scrubbed = beforeSend(event);
      expect(scrubbed.breadcrumbs[0].message).toContain('al***@test.com');
      expect(scrubbed.breadcrumbs[0].data.email).toBe('[REDACTED]');
    });

    it('redacts sensitive keys in extra', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      const beforeSend = mockSentryInit.mock.calls[0][0].beforeSend;
      const event = {
        extra: {
          authorization: 'Bearer xxx',
          screen: 'Profile',
          password: 'secret',
          session: 'abc123',
        },
      };

      const scrubbed = beforeSend(event);
      expect(scrubbed.extra.authorization).toBe('[REDACTED]');
      expect(scrubbed.extra.password).toBe('[REDACTED]');
      expect(scrubbed.extra.session).toBe('[REDACTED]');
      expect(scrubbed.extra.screen).toBe('Profile');
    });

    it('handles events without exception/breadcrumbs/extra', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      const beforeSend = mockSentryInit.mock.calls[0][0].beforeSend;
      const event = {};

      const scrubbed = beforeSend(event);
      expect(scrubbed).toEqual({});
    });

    it('scrubs nested objects in extra', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      const beforeSend = mockSentryInit.mock.calls[0][0].beforeSend;
      const event = {
        extra: {
          user: {
            token: 'abc',
            name: 'John',
          },
        },
      };

      const scrubbed = beforeSend(event);
      expect(scrubbed.extra.user.token).toBe('[REDACTED]');
      expect(scrubbed.extra.user.name).toBe('John');
    });

    it('masks emails in string values of extra', () => {
      const sentry = loadSentryModuleWithDSN();
      sentry.initSentry();

      const beforeSend = mockSentryInit.mock.calls[0][0].beforeSend;
      const event = {
        extra: {
          log: 'Failed login for admin@corp.com at 10:00',
        },
      };

      const scrubbed = beforeSend(event);
      expect(scrubbed.extra.log).toContain('ad***@corp.com');
      expect(scrubbed.extra.log).not.toContain('admin@corp.com');
    });
  });

  // =========================================================================
  // Default export
  // =========================================================================
  describe('default export', () => {
    it('exports null as default', () => {
      const sentry = loadSentryModule();
      expect(sentry.default).toBeNull();
    });
  });
});
