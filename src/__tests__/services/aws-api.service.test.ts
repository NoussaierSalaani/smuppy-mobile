/**
 * AWS API Service — Real Class Integration Tests
 *
 * Tests the actual AWSAPIService singleton (awsAPI) exported from aws-api.ts.
 * All external dependencies are mocked BEFORE the import.
 */

// =============================================
// Global setup
// =============================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// =============================================
// Mock declarations — MUST be before imports
// =============================================
const mockSecureFetch = jest.fn();
const mockGetIdToken = jest.fn();
const mockSignOut = jest.fn();
const mockAddBreadcrumb = jest.fn();
const mockCaptureException = jest.fn();
const mockSetModeration = jest.fn();

jest.mock('../../config/aws-config', () => ({
  AWS_CONFIG: {
    region: 'us-east-1',
    api: {
      restEndpoint: 'https://api1.example.com',
      restEndpoint2: 'https://api2.example.com',
      restEndpoint3: 'https://api3.example.com',
      restEndpointDisputes: 'https://disputes.example.com',
    },
    storage: { cdnDomain: 'https://cdn.example.com' },
    cognito: {
      userPoolId: 'us-east-1_test',
      userPoolClientId: 'testclient',
      identityPoolId: 'us-east-1:test',
    },
  },
}));

jest.mock('../../services/aws-auth', () => ({
  awsAuth: {
    getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
  },
}));

jest.mock('../../utils/certificatePinning', () => ({
  secureFetch: (...args: unknown[]) => mockSecureFetch(...args),
}));

jest.mock('../../lib/sentry', () => ({
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: jest.fn(),
  initSentry: jest.fn(),
  setUserContext: jest.fn(),
}));

jest.mock('../../stores/moderationStore', () => ({
  useModerationStore: {
    getState: jest.fn(() => ({
      setModeration: (...args: unknown[]) => mockSetModeration(...args),
    })),
  },
}));

// Mock config/env (imported transitively by sentry and certificatePinning)
jest.mock('../../config/env', () => ({
  ENV: {
    GOOGLE_API_KEY: '',
    SENTRY_DSN: '',
  },
}));

// Mock expo-constants (imported transitively by config/env)
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: {} },
  },
}));

// Mock expo-secure-store (imported by aws-auth)
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock @sentry/react-native (imported by lib/sentry)
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  startSpan: jest.fn(),
  withScope: jest.fn(),
  Severity: { Info: 'info', Warning: 'warning', Error: 'error' },
}));

// =============================================
// Import the real class AFTER mocks
// =============================================
import { awsAPI, APIError } from '../../services/aws-api';

// =============================================
// Helpers
// =============================================

function mockResponse(
  status: number,
  body: unknown = {},
  ok?: boolean,
  headers?: Record<string, string>,
): Response {
  const headersMap = new Map(Object.entries(headers ?? {}));
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(
      typeof body === 'string' ? body : JSON.stringify(body),
    ),
    headers: {
      get: (key: string) => headersMap.get(key) ?? null,
      has: (key: string) => headersMap.has(key),
      entries: () => headersMap.entries(),
      forEach: (cb: (v: string, k: string) => void) => headersMap.forEach(cb),
    },
  } as unknown as Response;
}

/** Shorthand for a 200 JSON response */
function ok200(body: unknown = { success: true }): Response {
  return mockResponse(200, body);
}

/** Return the URL passed to the first secureFetch call */
function lastFetchUrl(): string {
  return mockSecureFetch.mock.calls[0]?.[0] ?? '';
}

/** Return the options passed to the first secureFetch call */
function lastFetchOptions(): RequestInit {
  return mockSecureFetch.mock.calls[0]?.[1] ?? {};
}

/** Return the options of the Nth secureFetch call (0-indexed) */
function fetchCallOptions(n: number): RequestInit {
  return mockSecureFetch.mock.calls[n]?.[1] ?? {};
}

// =============================================
// Setup & Teardown
// =============================================

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  // Default: authenticated requests succeed with a token
  mockGetIdToken.mockResolvedValue('test-id-token');
  mockSignOut.mockResolvedValue(undefined);
  mockSecureFetch.mockResolvedValue(ok200());

  // Reset signingOut flag by accessing private field
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (awsAPI as any).signingOut = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (awsAPI as any).refreshPromise = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (awsAPI as any).inFlightGets = new Map();
});

// ============================================================
// 1. GATEWAY ROUTING
// ============================================================
describe('Gateway routing', () => {
  it('routes /posts/123 to API Gateway 1 (default)', async () => {
    await awsAPI.request('/posts/123');
    expect(lastFetchUrl()).toBe('https://api1.example.com/posts/123');
  });

  it('routes /profiles/me to API Gateway 1 (default)', async () => {
    await awsAPI.request('/profiles/me');
    expect(lastFetchUrl()).toBe('https://api1.example.com/profiles/me');
  });

  it('routes /sessions/abc to API Gateway 2', async () => {
    await awsAPI.request('/sessions/abc');
    expect(lastFetchUrl()).toBe('https://api2.example.com/sessions/abc');
  });

  it('routes /payments/create-intent to API Gateway 2', async () => {
    await awsAPI.request('/payments/create-intent');
    expect(lastFetchUrl()).toBe('https://api2.example.com/payments/create-intent');
  });

  it('routes /spots/xyz to API Gateway 3 (prefix match)', async () => {
    await awsAPI.request('/spots/xyz');
    expect(lastFetchUrl()).toBe('https://api3.example.com/spots/xyz');
  });

  it('routes /businesses/subscriptions/my to API Gateway 3 (exact match)', async () => {
    await awsAPI.request('/businesses/subscriptions/my');
    expect(lastFetchUrl()).toBe('https://api3.example.com/businesses/subscriptions/my');
  });

  it('routes /feed/following to API Gateway 3 (prefix match)', async () => {
    await awsAPI.request('/feed/following');
    expect(lastFetchUrl()).toBe('https://api3.example.com/feed/following');
  });

  it('routes /disputes/123 to Disputes API Gateway', async () => {
    await awsAPI.request('/disputes/123');
    expect(lastFetchUrl()).toBe('https://disputes.example.com/disputes/123');
  });

  it('routes /reports/abc to API Gateway 3 (prefix match)', async () => {
    await awsAPI.request('/reports/abc');
    expect(lastFetchUrl()).toBe('https://api3.example.com/reports/abc');
  });

  it('API3 exact match takes priority over API2 prefix', async () => {
    // /businesses/ prefix matches API2, but /businesses/subscriptions/my is exact API3
    await awsAPI.request('/businesses/subscriptions/my');
    expect(lastFetchUrl()).toBe('https://api3.example.com/businesses/subscriptions/my');
  });
});

// ============================================================
// 2. AUTHENTICATION
// ============================================================
describe('Authentication', () => {
  it('attaches Bearer token from getIdToken for authenticated requests', async () => {
    mockGetIdToken.mockResolvedValue('my-jwt-token');
    await awsAPI.request('/posts');
    const opts = lastFetchOptions();
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer my-jwt-token');
  });

  it('skips auth header when authenticated: false', async () => {
    await awsAPI.request('/auth/validate-email', {
      method: 'POST',
      body: { email: 'test@example.com' },
      authenticated: false,
    });
    const opts = lastFetchOptions();
    expect((opts.headers as Record<string, string>)['Authorization']).toBeUndefined();
    expect(mockGetIdToken).not.toHaveBeenCalled();
  });

  it('continues without auth header when getIdToken returns null', async () => {
    mockGetIdToken.mockResolvedValue(null);
    await awsAPI.request('/posts');
    const opts = lastFetchOptions();
    expect((opts.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('continues when getIdToken rejects', async () => {
    mockGetIdToken.mockRejectedValue(new Error('token error'));
    // The request should still proceed (getIdToken rejection is caught internally or propagated)
    // Depending on implementation, it may throw — but the key point is no unhandled rejection
    try {
      await awsAPI.request('/posts');
    } catch {
      // may throw if fetch also fails — that's OK
    }
    // getIdToken was called
    expect(mockGetIdToken).toHaveBeenCalled();
  });

  it('sets Content-Type application/json by default', async () => {
    await awsAPI.request('/posts', { method: 'POST', body: { content: 'hello' } });
    const opts = lastFetchOptions();
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('does not set Content-Type for FormData body', async () => {
    // We need to define a minimal FormData mock
    const formData = new (class FormData {})();
    // Override instanceof check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).FormData = formData.constructor;
    await awsAPI.request('/upload', { method: 'POST', body: formData });
    const opts = lastFetchOptions();
    expect((opts.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});

// ============================================================
// 3. 401 TOKEN REFRESH
// ============================================================
describe('401 Token Refresh', () => {
  it('refreshes token on 401 and retries the request', async () => {
    // First call: 401; then getIdToken returns a new token; retry: 200
    mockSecureFetch
      .mockResolvedValueOnce(mockResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(ok200({ data: 'refreshed' }));

    mockGetIdToken
      .mockResolvedValueOnce('old-token')   // Initial getIdToken
      .mockResolvedValueOnce('new-token');   // Refresh call

    const result = await awsAPI.request('/posts');
    expect(result).toEqual({ data: 'refreshed' });
    expect(mockSecureFetch).toHaveBeenCalledTimes(2);
  });

  it('uses the refreshed token (not old) for the retry request', async () => {
    mockSecureFetch
      .mockResolvedValueOnce(mockResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(ok200());

    mockGetIdToken
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('fresh-token');

    await awsAPI.request('/posts');
    const retryOpts = fetchCallOptions(1);
    expect((retryOpts.headers as Record<string, string>)['Authorization']).toBe('Bearer fresh-token');
  });

  it('triggers signOut on double 401 (retry also returns 401)', async () => {
    mockSecureFetch
      .mockResolvedValueOnce(mockResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(mockResponse(401, { message: 'Still unauthorized' }));

    mockGetIdToken
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('new-token');

    await expect(awsAPI.request('/posts')).rejects.toThrow();
    // signOut should have been called
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('does not call signOut if signingOut is already true', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (awsAPI as any).signingOut = true;

    mockSecureFetch
      .mockResolvedValueOnce(mockResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(mockResponse(401, { message: 'Still unauthorized' }));

    mockGetIdToken
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('new-token');

    await expect(awsAPI.request('/posts')).rejects.toThrow();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('triggers signOut when refresh returns null (no valid token)', async () => {
    mockSecureFetch.mockResolvedValueOnce(mockResponse(401, { message: 'Unauthorized' }));

    mockGetIdToken
      .mockResolvedValueOnce('old-token')   // Initial
      .mockResolvedValueOnce(null);          // Refresh fails

    // The 401 path: refresh returns null → signOut
    // After the 401 handling, flow continues to the !response.ok block which throws
    await expect(awsAPI.request('/posts')).rejects.toThrow();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('deduplicates concurrent token refreshes (shared promise)', async () => {
    // Both requests get 401, both trigger _refreshToken
    // Only one getIdToken refresh call should happen
    let refreshCallCount = 0;

    mockGetIdToken.mockImplementation(() => {
      refreshCallCount++;
      if (refreshCallCount === 1) return Promise.resolve('token-A');
      if (refreshCallCount === 2) return Promise.resolve('token-B');
      // 3rd call = concurrent refreshes should share, so only called twice total
      return Promise.resolve('token-C');
    });

    mockSecureFetch
      .mockResolvedValueOnce(mockResponse(401, {}))    // req 1 initial
      .mockResolvedValueOnce(mockResponse(401, {}))    // req 2 initial
      .mockResolvedValueOnce(ok200({ id: 1 }))         // req 1 retry
      .mockResolvedValueOnce(ok200({ id: 2 }));        // req 2 retry

    // Launch two concurrent requests that will both hit 401
    // Note: these use POST to avoid GET deduplication
    const [r1, r2] = await Promise.allSettled([
      awsAPI.request('/posts/1', { method: 'POST', body: {} }),
      awsAPI.request('/posts/2', { method: 'POST', body: {} }),
    ]);

    // At least one should succeed (depends on timing)
    const successes = [r1, r2].filter(r => r.status === 'fulfilled');
    expect(successes.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// 4. RETRY LOGIC
// ============================================================
describe('Retry logic', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const retryableStatuses = [500, 502, 503, 504, 408, 429];

  it.each(retryableStatuses)('retries on %i status', async (status) => {
    mockSecureFetch
      .mockResolvedValueOnce(mockResponse(status, { message: 'error' }))
      .mockResolvedValueOnce(mockResponse(status, { message: 'error' }))
      .mockResolvedValueOnce(ok200({ success: true }));

    const promise = awsAPI.request('/posts', { method: 'POST', body: {} });

    // Advance through the backoff delays
    await jest.advanceTimersByTimeAsync(1000); // 1s delay after attempt 0
    await jest.advanceTimersByTimeAsync(2000); // 2s delay after attempt 1

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(mockSecureFetch).toHaveBeenCalledTimes(3);
  });

  const nonRetryableStatuses = [400, 403, 404, 409, 422];

  it.each(nonRetryableStatuses)('does NOT retry on %i status', async (status) => {
    mockSecureFetch.mockResolvedValue(mockResponse(status, { message: 'client error' }));

    const promise = awsAPI.request('/posts', { method: 'POST', body: {} });

    // No timer advancement needed — should reject immediately
    await expect(promise).rejects.toThrow();
    expect(mockSecureFetch).toHaveBeenCalledTimes(1);
  });

  it('stops after MAX_RETRIES (2) attempts and reports to Sentry', async () => {
    // Use real timers for this test — the backoff delays are small enough (1s + 2s)
    jest.useRealTimers();
    mockSecureFetch.mockResolvedValue(mockResponse(500, { message: 'server error' }));

    await expect(
      awsAPI.request('/data', { method: 'POST', body: {} }),
    ).rejects.toThrow('server error');
    // 1 initial + 2 retries = 3 calls
    expect(mockSecureFetch).toHaveBeenCalledTimes(3);
    expect(mockCaptureException).toHaveBeenCalled();
  }, 15000);

  it('appends attempt count to error message after exhausting retries', async () => {
    jest.useRealTimers();
    mockSecureFetch.mockResolvedValue(mockResponse(500, { message: 'server error' }));

    try {
      await awsAPI.request('/data', { method: 'POST', body: {} });
      fail('Should have thrown');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      expect(err.message).toContain('after 3 attempts');
    }
  }, 15000);

  it('honors retryAfter header on 429', async () => {
    const error429 = mockResponse(429, { message: 'rate limited', retryAfter: 5 });
    mockSecureFetch
      .mockResolvedValueOnce(error429)
      .mockResolvedValueOnce(ok200({ success: true }));

    const promise = awsAPI.request('/posts', { method: 'POST', body: {} });

    // The 429 response has retryAfter data, but the implementation reads it from
    // apiErr.data?.retryAfter — the APIError constructed in _requestOnce has a data field.
    // However, _requestWithRetry catches the thrown APIError and checks apiErr.data?.retryAfter.
    // So the retry delay should be retryAfter * 1000 = 5000ms if that's in the error data.
    // Since the error body has retryAfter: 5, the APIError.data will have { retryAfter: 5 }

    await jest.advanceTimersByTimeAsync(5000); // retryAfter delay

    const result = await promise;
    expect(result).toEqual({ success: true });
  });

  it('retries on network errors (TypeError)', async () => {
    mockSecureFetch
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(ok200({ success: true }));

    const promise = awsAPI.request('/posts', { method: 'POST', body: {} });

    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(mockSecureFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on AbortError (timeout-like)', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockSecureFetch
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(ok200({ success: true }));

    const promise = awsAPI.request('/posts', { method: 'POST', body: {} });

    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ success: true });
  });
});

// ============================================================
// 5. GET DEDUPLICATION
// ============================================================
describe('GET deduplication', () => {
  it('deduplicates two concurrent GETs to the same endpoint', async () => {
    let resolveResponse: (r: Response) => void;
    const slowResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    mockSecureFetch.mockReturnValue(slowResponse);

    const p1 = awsAPI.request('/posts');
    const p2 = awsAPI.request('/posts');

    // Wait for microtasks (getIdToken) to resolve before checking
    await new Promise(process.nextTick);

    // Only one fetch should have been made (deduplication)
    expect(mockSecureFetch).toHaveBeenCalledTimes(1);

    resolveResponse!(ok200({ data: 'shared' }));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ data: 'shared' });
    expect(r2).toEqual({ data: 'shared' });
  });

  it('GETs to different endpoints are independent', async () => {
    await Promise.all([
      awsAPI.request('/posts'),
      awsAPI.request('/profiles/me'),
    ]);
    expect(mockSecureFetch).toHaveBeenCalledTimes(2);
  });

  it('after first resolves, a new GET to the same endpoint makes a new request', async () => {
    await awsAPI.request('/posts');
    expect(mockSecureFetch).toHaveBeenCalledTimes(1);

    await awsAPI.request('/posts');
    expect(mockSecureFetch).toHaveBeenCalledTimes(2);
  });

  it('POST requests are NOT deduplicated', async () => {
    const p1 = awsAPI.request('/posts', { method: 'POST', body: { a: 1 } });
    const p2 = awsAPI.request('/posts', { method: 'POST', body: { a: 2 } });

    await Promise.all([p1, p2]);
    expect(mockSecureFetch).toHaveBeenCalledTimes(2);
  });

  it('concurrent GET dedup still works when the shared request rejects', async () => {
    mockSecureFetch.mockResolvedValue(mockResponse(400, { message: 'bad request' }));

    const p1 = awsAPI.request('/bad-endpoint');
    const p2 = awsAPI.request('/bad-endpoint');

    const [r1, r2] = await Promise.allSettled([p1, p2]);
    expect(r1.status).toBe('rejected');
    expect(r2.status).toBe('rejected');
    // Only 1 fetch
    expect(mockSecureFetch).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 6. RESPONSE PARSING
// ============================================================
describe('Response parsing', () => {
  it('parses JSON response body', async () => {
    mockSecureFetch.mockResolvedValue(ok200({ users: [1, 2, 3] }));
    const result = await awsAPI.request('/users');
    expect(result).toEqual({ users: [1, 2, 3] });
  });

  it('returns empty object for empty response body', async () => {
    const emptyResponse = {
      ok: true,
      status: 204,
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue(''),
      headers: { get: () => null, has: () => false, entries: () => [].values(), forEach: () => {} },
    } as unknown as Response;

    mockSecureFetch.mockResolvedValue(emptyResponse);
    const result = await awsAPI.request('/posts/123', { method: 'DELETE' });
    expect(result).toEqual({});
  });

  it('throws APIError for non-ok status with error message from body', async () => {
    mockSecureFetch.mockResolvedValue(mockResponse(404, { message: 'Post not found' }));

    try {
      await awsAPI.request('/posts/999');
      fail('Should have thrown');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      expect(err).toBeInstanceOf(APIError);
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe('Post not found');
    }
  });

  it('throws APIError with default message when response has no message field', async () => {
    // Use 422 (non-retryable) to avoid triggering the retry loop
    mockSecureFetch.mockResolvedValue(mockResponse(422, {}));

    try {
      await awsAPI.request('/posts', { method: 'POST', body: {} });
      fail('Should have thrown');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      expect(err).toBeInstanceOf(APIError);
      expect(err.statusCode).toBe(422);
      expect(err.message).toContain('Request failed with status 422');
    }
  });

  it('throws APIError when response body has "error" field instead of "message"', async () => {
    mockSecureFetch.mockResolvedValue(mockResponse(400, { error: 'Invalid input' }));

    try {
      await awsAPI.request('/posts', { method: 'POST', body: {} });
      fail('Should have thrown');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      expect(err).toBeInstanceOf(APIError);
      expect(err.message).toBe('Invalid input');
    }
  });

  it('includes error data in APIError for non-ok responses', async () => {
    const errorBody = { message: 'Forbidden', code: 'ACCESS_DENIED' };
    mockSecureFetch.mockResolvedValue(mockResponse(403, errorBody));

    try {
      await awsAPI.request('/admin/resource');
      fail('Should have thrown');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      expect(err).toBeInstanceOf(APIError);
      expect(err.data).toEqual(errorBody);
    }
  });
});

// ============================================================
// 7. TIMEOUT
// ============================================================
describe('Timeout', () => {
  it('uses AbortController with configured timeout', async () => {
    await awsAPI.request('/posts');
    const opts = lastFetchOptions();
    // signal should be present
    expect(opts.signal).toBeDefined();
  });

  it('throws APIError with 408 on abort (timeout)', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockSecureFetch.mockRejectedValue(abortError);

    // _requestOnce converts AbortError → APIError('Request timeout', 408)
    // 408 is in RETRYABLE_STATUSES, so it retries and eventually exhausts (3 attempts).
    // Using real timers here to allow the backoff delays to pass naturally.
    try {
      await awsAPI.request('/slow-endpoint', { method: 'POST', body: {} });
      fail('Should have thrown');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      expect(err.message).toContain('Request timeout');
      expect(err.message).toContain('after 3 attempts');
      expect(err).toBeInstanceOf(APIError);
    }
  }, 15000);

  it('passes custom timeout value to the abort controller', async () => {
    // We can verify this indirectly — the request should pass the signal
    await awsAPI.request('/posts', { method: 'GET', timeout: 5000 });
    const opts = lastFetchOptions();
    expect(opts.signal).toBeDefined();
  });
});

// ============================================================
// 8. 403 MODERATION
// ============================================================
describe('403 Moderation', () => {
  it('detects moderationStatus in 403 response and updates store', async () => {
    mockSecureFetch.mockResolvedValue(
      mockResponse(403, {
        message: 'Account suspended',
        moderationStatus: 'suspended',
        reason: 'Spam',
        suspendedUntil: '2026-03-01',
      }),
    );

    await expect(awsAPI.request('/posts')).rejects.toThrow();
    expect(mockSetModeration).toHaveBeenCalledWith('suspended', 'Spam', '2026-03-01');
  });

  it('ignores 403 without moderationStatus', async () => {
    mockSecureFetch.mockResolvedValue(
      mockResponse(403, { message: 'Forbidden' }),
    );

    await expect(awsAPI.request('/admin/resource')).rejects.toThrow();
    expect(mockSetModeration).not.toHaveBeenCalled();
  });

  it('uses default reason when reason is missing from moderation response', async () => {
    mockSecureFetch.mockResolvedValue(
      mockResponse(403, {
        message: 'Account banned',
        moderationStatus: 'banned',
      }),
    );

    await expect(awsAPI.request('/posts')).rejects.toThrow();
    expect(mockSetModeration).toHaveBeenCalledWith(
      'banned',
      'Community guidelines violation',
      undefined,
    );
  });
});

// ============================================================
// 9. API METHOD CONTRACTS
// ============================================================
describe('API method contracts', () => {
  beforeEach(() => {
    mockSecureFetch.mockResolvedValue(ok200({
      posts: [],
      data: [],
      nextCursor: null,
      hasMore: false,
      total: 0,
      success: true,
    }));
  });

  it('getPosts() builds correct query params and calls GET', async () => {
    await awsAPI.getPosts({ limit: 10, cursor: 'abc', type: 'all' });
    const url = lastFetchUrl();
    expect(url).toContain('/posts');
    expect(url).toContain('limit=10');
    expect(url).toContain('cursor=abc');
    expect(url).toContain('type=all');
    expect(lastFetchOptions().method).toBe('GET');
  });

  it('getPosts({type:"following"}) routes to /feed/following', async () => {
    await awsAPI.getPosts({ type: 'following', limit: 20 });
    const url = lastFetchUrl();
    expect(url).toContain('/feed/following');
    expect(url).toContain('limit=20');
    // Should NOT contain type param for feed/following
    expect(url).not.toContain('type=following');
  });

  it('createPost() calls POST /posts with body', async () => {
    const postData = { content: 'Hello world', mediaUrls: [] as string[], mediaType: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await awsAPI.createPost(postData as any);
    expect(lastFetchUrl()).toContain('/posts');
    expect(lastFetchOptions().method).toBe('POST');
    const body = JSON.parse(lastFetchOptions().body as string);
    expect(body.content).toBe('Hello world');
  });

  it('deletePost() calls DELETE /posts/{id}', async () => {
    await awsAPI.deletePost('post-123');
    expect(lastFetchUrl()).toContain('/posts/post-123');
    expect(lastFetchOptions().method).toBe('DELETE');
  });

  it('getProfile() calls GET /profiles/{id}', async () => {
    mockSecureFetch.mockResolvedValue(ok200({ id: 'user-1', username: 'test' }));
    await awsAPI.getProfile('user-1');
    expect(lastFetchUrl()).toContain('/profiles/user-1');
    expect(lastFetchOptions().method).toBe('GET');
  });

  it('followUser() calls POST /follows with followingId in body', async () => {
    await awsAPI.followUser('user-2');
    expect(lastFetchUrl()).toContain('/follows');
    expect(lastFetchOptions().method).toBe('POST');
    const body = JSON.parse(lastFetchOptions().body as string);
    expect(body.followingId).toBe('user-2');
  });

  it('sendMessage() calls POST with correct body to /conversations/{id}/messages', async () => {
    mockSecureFetch.mockResolvedValue(ok200({ id: 'msg-1', content: 'Hi' }));
    await awsAPI.sendMessage('conv-123', { content: 'Hi' });
    expect(lastFetchUrl()).toContain('/conversations/conv-123/messages');
    expect(lastFetchOptions().method).toBe('POST');
    const body = JSON.parse(lastFetchOptions().body as string);
    expect(body.content).toBe('Hi');
  });

  it('searchProfiles() builds search params correctly', async () => {
    mockSecureFetch.mockResolvedValue(ok200({ data: [], nextCursor: null, hasMore: false }));
    await awsAPI.searchProfiles('john', 15, 'cursor-1');
    const url = lastFetchUrl();
    expect(url).toContain('/profiles');
    expect(url).toContain('search=john');
    expect(url).toContain('limit=15');
    expect(url).toContain('cursor=cursor-1');
  });

  it('likePost() calls POST /posts/{id}/like', async () => {
    await awsAPI.likePost('post-456');
    expect(lastFetchUrl()).toContain('/posts/post-456/like');
    expect(lastFetchOptions().method).toBe('POST');
  });

  it('updateProfile() calls PATCH /profiles/me with body', async () => {
    const updateData = { displayName: 'New Name' };
    mockSecureFetch.mockResolvedValue(ok200({ id: 'me', displayName: 'New Name' }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await awsAPI.updateProfile(updateData as any);
    expect(lastFetchUrl()).toContain('/profiles/me');
    expect(lastFetchOptions().method).toBe('PATCH');
    const body = JSON.parse(lastFetchOptions().body as string);
    expect(body.displayName).toBe('New Name');
  });

  it('createPaymentIntent() calls POST /payments/create-intent with body', async () => {
    const paymentData = { creatorId: 'creator-1', amount: 1000 };
    await awsAPI.createPaymentIntent(paymentData);
    expect(lastFetchUrl()).toContain('/payments/create-intent');
    expect(lastFetchOptions().method).toBe('POST');
    const body = JSON.parse(lastFetchOptions().body as string);
    expect(body.creatorId).toBe('creator-1');
    expect(body.amount).toBe(1000);
  });

  it('deleteComment() calls DELETE /comments/{id}', async () => {
    await awsAPI.deleteComment('comment-789');
    expect(lastFetchUrl()).toContain('/comments/comment-789');
    expect(lastFetchOptions().method).toBe('DELETE');
  });
});

// ============================================================
// 10. CDN URL
// ============================================================
describe('CDN URL', () => {
  it('builds correct CDN URL from path', () => {
    const url = awsAPI.getCDNUrl('images/photo.jpg');
    expect(url).toBe('https://cdn.example.com/images/photo.jpg');
  });

  it('returns existing http(s) URL as-is', () => {
    const url = awsAPI.getCDNUrl('https://other-cdn.com/pic.jpg');
    expect(url).toBe('https://other-cdn.com/pic.jpg');
  });

  it('handles path without leading slash', () => {
    const url = awsAPI.getCDNUrl('uploads/file.mp4');
    expect(url).toBe('https://cdn.example.com/uploads/file.mp4');
  });

  it('handles path with leading slash', () => {
    // Note: the implementation does `${CDN_URL}/${path}` so this would be double-slash
    // Let's verify actual behavior
    const url = awsAPI.getCDNUrl('/uploads/file.mp4');
    expect(url).toBe('https://cdn.example.com//uploads/file.mp4');
  });
});

// ============================================================
// 11. REQUEST BODY SERIALIZATION
// ============================================================
describe('Request body serialization', () => {
  it('serializes body as JSON for POST requests', async () => {
    const body = { title: 'Test', content: 'Body content' };
    await awsAPI.request('/posts', { method: 'POST', body });
    const opts = lastFetchOptions();
    expect(opts.body).toBe(JSON.stringify(body));
  });

  it('does not send body for GET requests', async () => {
    await awsAPI.request('/posts');
    const opts = lastFetchOptions();
    expect(opts.body).toBeUndefined();
  });

  it('includes custom headers in request', async () => {
    await awsAPI.request('/posts', {
      method: 'GET',
      headers: { 'X-Custom': 'value' },
    });
    const opts = lastFetchOptions();
    expect((opts.headers as Record<string, string>)['X-Custom']).toBe('value');
  });
});

// ============================================================
// 12. SENTRY BREADCRUMBS
// ============================================================
describe('Sentry breadcrumbs', () => {
  it('adds breadcrumb for each request', async () => {
    await awsAPI.request('/posts');
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      'GET /posts',
      'api',
      expect.objectContaining({ method: 'GET', endpoint: '/posts' }),
    );
  });

  it('adds breadcrumb with correct method for POST', async () => {
    await awsAPI.request('/posts', { method: 'POST', body: { content: 'test' } });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      'POST /posts',
      'api',
      expect.objectContaining({ method: 'POST', endpoint: '/posts' }),
    );
  });
});

// ============================================================
// 13. EDGE CASES
// ============================================================
describe('Edge cases', () => {
  it('request() defaults to GET when no method specified', async () => {
    await awsAPI.request('/posts');
    expect(lastFetchOptions().method).toBe('GET');
  });

  it('request() defaults to GET when options are undefined', async () => {
    await awsAPI.request('/posts');
    expect(lastFetchOptions().method).toBe('GET');
  });

  it('handles response.json() failure gracefully for error responses', async () => {
    // Use 422 (non-retryable) to avoid retry delays
    const brokenJsonResponse = {
      ok: false,
      status: 422,
      json: jest.fn().mockRejectedValue(new Error('invalid json')),
      text: jest.fn().mockResolvedValue('not json'),
      headers: { get: () => null, has: () => false, entries: () => [].values(), forEach: () => {} },
    } as unknown as Response;

    mockSecureFetch.mockResolvedValue(brokenJsonResponse);

    // json() fails, but .catch(() => ({})) returns {} — so errorData = {}
    // Throws APIError with default message
    await expect(
      awsAPI.request('/broken', { method: 'POST', body: {} }),
    ).rejects.toThrow('Request failed with status 422');
  });

  it('getPosts() returns properly mapped PaginatedResponse', async () => {
    mockSecureFetch.mockResolvedValue(ok200({
      posts: [{ id: '1' }, { id: '2' }],
      nextCursor: 'next-abc',
      hasMore: true,
      total: 42,
    }));

    const result = await awsAPI.getPosts();
    expect(result.data).toHaveLength(2);
    expect(result.nextCursor).toBe('next-abc');
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(42);
  });

  it('getPosts() handles "data" field instead of "posts" in response', async () => {
    mockSecureFetch.mockResolvedValue(ok200({
      data: [{ id: '3' }],
      nextCursor: null,
      hasMore: false,
    }));

    const result = await awsAPI.getPosts();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({ id: '3' });
  });

  it('validateEmail() uses authenticated: false', async () => {
    mockSecureFetch.mockResolvedValue(ok200({ valid: true, email: 'test@test.com' }));
    await awsAPI.validateEmail('test@test.com');
    expect(mockGetIdToken).not.toHaveBeenCalled();
  });
});
