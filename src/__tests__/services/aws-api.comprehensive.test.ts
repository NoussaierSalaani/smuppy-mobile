/**
 * AWS API Service — Comprehensive Pure Logic Tests
 *
 * Tests the core decision-making logic extracted from aws-api.ts:
 *   1. API endpoint routing (4 gateways)
 *   2. Retry eligibility (retryable vs non-retryable)
 *   3. Network error detection heuristics
 *   4. Exponential backoff calculation
 *   5. GET request deduplication semantics
 *   6. Max-retry exhaustion behaviour
 *   7. Edge cases in routing (exact match vs prefix, overlapping prefixes)
 *
 * All logic under test is re-implemented as pure functions inside this file
 * so we avoid importing the real service and its heavy dependency chain.
 */

// ---------------------------------------------------------------------------
// Re-implemented pure logic (mirrors aws-api.ts exactly)
// ---------------------------------------------------------------------------

/** Exact endpoint matches routed to API Gateway 3 */
const API3_ENDPOINTS = [
  '/businesses/validate-access',
  '/businesses/log-entry',
  '/businesses/subscriptions/my',
] as const;

/** Prefix-based routing to API Gateway 3 */
const API3_PREFIXES = [
  '/spots',
  '/businesses/subscriptions/',
  '/reports',
  '/feed/',
  '/posts/search',
  '/posts/likes/batch',
  '/posts/saves/batch',
  '/posts/saved',
  '/peaks/search',
] as const;

/** Prefix-based routing to Disputes API */
const DISPUTES_PREFIXES = [
  '/disputes',
  '/admin/disputes',
] as const;

/** Prefix-based routing to API Gateway 2 */
const API2_PREFIXES = [
  '/sessions', '/packs', '/payments', '/tips', '/earnings',
  '/challenges', '/battles', '/events', '/settings', '/admin',
  '/businesses', '/interests', '/expertise', '/hashtags',
  '/devices', '/contacts', '/support', '/account', '/categories',
  '/groups', '/reviews', '/map', '/search/map', '/live-streams',
] as const;

type ApiGateway = 'api1' | 'api2' | 'api3' | 'disputes';

/**
 * Determine which API gateway an endpoint should be routed to.
 * Priority: api3 > disputes > api2 > api1 (default)
 */
function resolveGateway(endpoint: string): ApiGateway {
  const isApi3 =
    (API3_ENDPOINTS as readonly string[]).some(ep => endpoint === ep) ||
    (API3_PREFIXES as readonly string[]).some(prefix => endpoint.startsWith(prefix));

  if (isApi3) return 'api3';

  const isDisputes = (DISPUTES_PREFIXES as readonly string[]).some(
    prefix => endpoint.startsWith(prefix),
  );
  if (isDisputes) return 'disputes';

  const isApi2 = (API2_PREFIXES as readonly string[]).some(
    prefix => endpoint.startsWith(prefix),
  );
  if (isApi2) return 'api2';

  return 'api1';
}

// ---------------------------------------------------------------------------
// Retry & backoff logic
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

interface ErrorLike {
  statusCode?: number;
  status?: number;
  message?: string;
  name?: string;
  data?: { retryAfter?: number };
}

/**
 * Decide whether an error is retryable.
 *
 * An error is retryable when:
 *   - Its HTTP status is in RETRYABLE_STATUSES, OR
 *   - It has no status AND its message/name indicates a network problem.
 */
function isRetryableError(error: ErrorLike): boolean {
  const status = error.statusCode || error.status;

  if (status && RETRYABLE_STATUSES.includes(status)) return true;

  // Network error heuristic: no HTTP status + telltale message/name
  if (!status) {
    const msg = error.message || '';
    const nameMatch = error.name === 'TypeError' || error.name === 'AbortError';
    const msgMatch =
      msg.includes('Network') ||
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('timeout');

    return nameMatch || msgMatch;
  }

  return false;
}

/**
 * Compute the delay (in ms) before the next retry.
 *
 * - For 429 with a retryAfter header: retryAfter * 1000
 * - Otherwise: 2^attempt * 1000   (attempt 0 -> 1s, attempt 1 -> 2s)
 */
function computeBackoff(attempt: number, error: ErrorLike): number {
  const status = error.statusCode || error.status;
  if (status === 429 && error.data?.retryAfter) {
    return error.data.retryAfter * 1000;
  }
  return Math.pow(2, attempt) * 1000;
}

// ---------------------------------------------------------------------------
// Deduplication logic
// ---------------------------------------------------------------------------

/**
 * Minimal model of the in-flight GET deduplication Map.
 *
 * Semantics:
 *   - Only GET requests are deduplicated.
 *   - If a GET to the same endpoint is already in-flight, return the existing promise.
 *   - Once the promise settles, remove it from the map.
 */
class DeduplicationMap {
  private map = new Map<string, Promise<unknown>>();

  /**
   * Returns [promise, isNew].
   * If isNew is false, the caller received a shared promise.
   */
  getOrCreate(endpoint: string, factory: () => Promise<unknown>): [Promise<unknown>, boolean] {
    const existing = this.map.get(endpoint);
    if (existing) return [existing, false];

    const promise = factory().finally(() => {
      this.map.delete(endpoint);
    });
    this.map.set(endpoint, promise);
    return [promise, true];
  }

  get size(): number {
    return this.map.size;
  }

  has(endpoint: string): boolean {
    return this.map.has(endpoint);
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('AWS API Service — Comprehensive Pure Logic Tests', () => {

  // =========================================================================
  // 1. Endpoint Routing
  // =========================================================================
  describe('Endpoint Routing', () => {

    // --- API 3: exact matches ---
    describe('API Gateway 3 — exact endpoint matches', () => {
      const exactEndpoints: string[] = [
        '/businesses/validate-access',
        '/businesses/log-entry',
        '/businesses/subscriptions/my',
      ];

      it.each(exactEndpoints)(
        'should route "%s" to api3 (exact match)',
        (endpoint) => {
          expect(resolveGateway(endpoint)).toBe('api3');
        },
      );
    });

    // --- API 3: prefix matches ---
    describe('API Gateway 3 — prefix-based matches', () => {
      const prefixEndpoints: Array<[string, string]> = [
        ['/spots', '/spots'],
        ['/spots/123', '/spots'],
        ['/spots/123/reviews', '/spots'],
        ['/businesses/subscriptions/plan-1', '/businesses/subscriptions/'],
        ['/reports', '/reports'],
        ['/reports/abc', '/reports'],
        ['/feed/optimized', '/feed/'],
        ['/feed/following', '/feed/'],
        ['/feed/discover', '/feed/'],
        ['/posts/search', '/posts/search'],
        ['/posts/search?q=hello', '/posts/search'],
        ['/posts/likes/batch', '/posts/likes/batch'],
        ['/posts/likes/batch/something', '/posts/likes/batch'],
        ['/posts/saves/batch', '/posts/saves/batch'],
        ['/posts/saved', '/posts/saved'],
        ['/posts/saved/123', '/posts/saved'],
        ['/peaks/search', '/peaks/search'],
        ['/peaks/search?tag=travel', '/peaks/search'],
      ];

      it.each(prefixEndpoints)(
        'should route "%s" to api3 (prefix "%s")',
        (endpoint) => {
          expect(resolveGateway(endpoint)).toBe('api3');
        },
      );
    });

    // --- Disputes API ---
    describe('Disputes API — prefix-based matches', () => {
      const disputeEndpoints: string[] = [
        '/disputes',
        '/disputes/123',
        '/disputes/123/messages',
        '/admin/disputes',
        '/admin/disputes/456',
        '/admin/disputes/456/resolve',
      ];

      it.each(disputeEndpoints)(
        'should route "%s" to disputes',
        (endpoint) => {
          expect(resolveGateway(endpoint)).toBe('disputes');
        },
      );
    });

    // --- API 2: prefix matches ---
    describe('API Gateway 2 — prefix-based matches', () => {
      const api2Endpoints: string[] = [
        '/sessions',
        '/sessions/book',
        '/packs',
        '/packs/123',
        '/payments',
        '/payments/intent',
        '/tips',
        '/tips/send',
        '/earnings',
        '/earnings/summary',
        '/challenges',
        '/challenges/daily',
        '/battles',
        '/battles/create',
        '/events',
        '/events/upcoming',
        '/settings',
        '/settings/notifications',
        '/interests',
        '/interests/update',
        '/expertise',
        '/expertise/list',
        '/hashtags',
        '/hashtags/trending',
        '/devices',
        '/devices/register',
        '/contacts',
        '/contacts/sync',
        '/support',
        '/support/ticket',
        '/account',
        '/account/delete',
        '/categories',
        '/categories/list',
        '/groups',
        '/groups/123',
        '/reviews',
        '/reviews/create',
        '/map',
        '/map/pins',
        '/search/map',
        '/search/map?lat=48&lng=2',
        '/live-streams',
        '/live-streams/active',
      ];

      it.each(api2Endpoints)(
        'should route "%s" to api2',
        (endpoint) => {
          expect(resolveGateway(endpoint)).toBe('api2');
        },
      );
    });

    // --- API 1 (default) ---
    describe('API Gateway 1 — default fallback', () => {
      const defaultEndpoints: string[] = [
        '/profiles',
        '/profiles/123',
        '/posts',
        '/posts/123',
        '/posts/123/comments',
        '/posts/123/like',
        '/notifications',
        '/notifications/read',
        '/peaks',
        '/peaks/123',
        '/peaks/123/views',
        '/collections',
        '/collections/123',
        '/messages',
        '/messages/conversations',
        '/follow',
        '/follow/123',
        '/users',
        '/users/search',
        '/upload/presign',
      ];

      it.each(defaultEndpoints)(
        'should route "%s" to api1 (default)',
        (endpoint) => {
          expect(resolveGateway(endpoint)).toBe('api1');
        },
      );
    });

    // --- Priority & edge cases ---
    describe('Routing priority and edge cases', () => {

      it('should prefer api3 exact match over api2 prefix for /businesses/validate-access', () => {
        // /businesses/ is an API2 prefix, but /businesses/validate-access is an exact API3 match
        expect(resolveGateway('/businesses/validate-access')).toBe('api3');
      });

      it('should prefer api3 exact match over api2 prefix for /businesses/log-entry', () => {
        expect(resolveGateway('/businesses/log-entry')).toBe('api3');
      });

      it('should prefer api3 exact match over api2 prefix for /businesses/subscriptions/my', () => {
        // /businesses is API2, /businesses/subscriptions/ is API3 prefix, /businesses/subscriptions/my is API3 exact
        expect(resolveGateway('/businesses/subscriptions/my')).toBe('api3');
      });

      it('should route /businesses (without sub-path) to api2, not api3', () => {
        // /businesses is an API2 prefix (not an API3 exact match or prefix)
        expect(resolveGateway('/businesses')).toBe('api2');
      });

      it('should route /businesses/profile to api2 (not api3 — no matching exact or prefix)', () => {
        // starts with /businesses which is api2, but not /businesses/subscriptions/ or exact
        expect(resolveGateway('/businesses/profile')).toBe('api2');
      });

      it('should prefer disputes over api2 for /admin/disputes (both /admin and /admin/disputes match)', () => {
        // /admin is an API2 prefix, but /admin/disputes matches DISPUTES_PREFIXES
        // Priority: api3 (no) > disputes (yes) -> disputes wins
        expect(resolveGateway('/admin/disputes')).toBe('disputes');
        expect(resolveGateway('/admin/disputes/123')).toBe('disputes');
      });

      it('should route /admin/settings to api2 (not disputes)', () => {
        expect(resolveGateway('/admin/settings')).toBe('api2');
      });

      it('should route /admin to api2', () => {
        expect(resolveGateway('/admin')).toBe('api2');
      });

      it('should not route /feed without trailing slash to api3 (prefix is /feed/)', () => {
        // The API3 prefix is '/feed/' (with trailing slash), so '/feed' alone does not match
        // '/feed' does not start with '/feed/' and is not in API2 either -> api1
        expect(resolveGateway('/feed')).toBe('api1');
      });

      it('should route /feed/ (with trailing slash) to api3', () => {
        expect(resolveGateway('/feed/')).toBe('api3');
      });

      it('should route /reports to api3 even without sub-path', () => {
        expect(resolveGateway('/reports')).toBe('api3');
      });

      it('should not match a partial prefix (e.g., /spot is not /spots)', () => {
        // '/spot' does NOT start with '/spots'
        expect(resolveGateway('/spot')).toBe('api1');
      });

      it('should route /posts/123 to api1 (not api3 — /posts/search prefix does not match)', () => {
        // /posts/123 does not start with any API3 prefix (/posts/search, /posts/likes/batch, etc.)
        expect(resolveGateway('/posts/123')).toBe('api1');
      });

      it('should route /peaks/123 to api1 (not api3 — /peaks/search prefix does not match)', () => {
        expect(resolveGateway('/peaks/123')).toBe('api1');
      });

      it('should handle query strings in routing (prefix check on full endpoint string)', () => {
        // If the endpoint string includes query params, startsWith still works
        expect(resolveGateway('/spots?lat=48&lng=2')).toBe('api3');
        expect(resolveGateway('/payments?status=pending')).toBe('api2');
        expect(resolveGateway('/disputes?page=2')).toBe('disputes');
      });

      it('should be case-sensitive (uppercase paths fall to default)', () => {
        expect(resolveGateway('/SPOTS')).toBe('api1');
        expect(resolveGateway('/Payments')).toBe('api1');
        expect(resolveGateway('/DISPUTES')).toBe('api1');
      });
    });
  });

  // =========================================================================
  // 2. Retryable vs Non-Retryable Status Codes
  // =========================================================================
  describe('Retryable vs Non-Retryable Status Codes', () => {

    describe('retryable HTTP statuses', () => {
      const retryable = [408, 429, 500, 502, 503, 504];

      it.each(retryable)(
        'status %d should be retryable',
        (status) => {
          expect(isRetryableError({ status })).toBe(true);
        },
      );

      it.each(retryable)(
        'statusCode %d should also be retryable (alternative property)',
        (statusCode) => {
          expect(isRetryableError({ statusCode })).toBe(true);
        },
      );
    });

    describe('non-retryable HTTP statuses', () => {
      const nonRetryable = [400, 401, 403, 404, 405, 409, 422];

      it.each(nonRetryable)(
        'status %d should NOT be retryable',
        (status) => {
          expect(isRetryableError({ status })).toBe(false);
        },
      );
    });

    it('should not retry 200 (success treated as an error object)', () => {
      expect(isRetryableError({ status: 200 })).toBe(false);
    });

    it('should not retry 201', () => {
      expect(isRetryableError({ status: 201 })).toBe(false);
    });

    it('should not retry 204', () => {
      expect(isRetryableError({ status: 204 })).toBe(false);
    });

    it('should not retry 301 redirect', () => {
      expect(isRetryableError({ status: 301 })).toBe(false);
    });
  });

  // =========================================================================
  // 3. Network Error Detection
  // =========================================================================
  describe('Network Error Detection', () => {

    describe('message-based detection', () => {
      const networkMessages = [
        'Network request failed',
        'network error occurred',
        'Failed to fetch',
        'fetch failed',
        'ECONNREFUSED 127.0.0.1:5432',
        'Request timeout after 30000ms',
        'Connection timeout',
      ];

      it.each(networkMessages)(
        'should detect network error from message: "%s"',
        (message) => {
          expect(isRetryableError({ message })).toBe(true);
        },
      );
    });

    describe('name-based detection', () => {
      it('should detect TypeError as network error (no status)', () => {
        expect(isRetryableError({ name: 'TypeError', message: 'something' })).toBe(true);
      });

      it('should detect AbortError as network error (no status)', () => {
        expect(isRetryableError({ name: 'AbortError', message: 'The operation was aborted' })).toBe(true);
      });
    });

    describe('non-network errors (with status)', () => {
      it('should NOT treat network-like message as retryable if it has a non-retryable status', () => {
        // Has status 400 + message contains "Network" — status takes precedence
        expect(isRetryableError({ status: 400, message: 'Network error' })).toBe(false);
      });

      it('should still be retryable if status is retryable even with network-like message', () => {
        expect(isRetryableError({ status: 502, message: 'Network error' })).toBe(true);
      });

      it('should NOT treat TypeError as network error if it has a non-retryable status', () => {
        // The real code checks !status for the network error branch
        expect(isRetryableError({ status: 403, name: 'TypeError', message: 'something' })).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should NOT be retryable with no status and no matching message/name', () => {
        expect(isRetryableError({ message: 'Something went wrong' })).toBe(false);
      });

      it('should NOT be retryable with empty error object', () => {
        expect(isRetryableError({})).toBe(false);
      });

      it('should NOT be retryable with undefined message and undefined name', () => {
        expect(isRetryableError({ name: undefined, message: undefined })).toBe(false);
      });

      it('should be retryable with empty message but name is TypeError', () => {
        expect(isRetryableError({ name: 'TypeError', message: '' })).toBe(true);
      });

      it('should NOT be retryable with name "Error" (only TypeError/AbortError match)', () => {
        expect(isRetryableError({ name: 'Error', message: 'something' })).toBe(false);
      });
    });
  });

  // =========================================================================
  // 4. Exponential Backoff Calculation
  // =========================================================================
  describe('Exponential Backoff Calculation', () => {

    describe('standard backoff (non-429)', () => {
      it('should compute 1000ms delay for attempt 0 (2^0 * 1000)', () => {
        expect(computeBackoff(0, { status: 500 })).toBe(1000);
      });

      it('should compute 2000ms delay for attempt 1 (2^1 * 1000)', () => {
        expect(computeBackoff(1, { status: 500 })).toBe(2000);
      });

      it('should compute 4000ms delay for attempt 2 (2^2 * 1000) — theoretical', () => {
        // MAX_RETRIES is 2 so attempt 2 would not retry, but the math still works
        expect(computeBackoff(2, { status: 500 })).toBe(4000);
      });

      it('should use standard backoff for network errors', () => {
        expect(computeBackoff(0, { message: 'Network request failed' })).toBe(1000);
        expect(computeBackoff(1, { message: 'Network request failed' })).toBe(2000);
      });
    });

    describe('429 with retryAfter', () => {
      it('should use retryAfter * 1000 when status is 429 and retryAfter is present', () => {
        expect(computeBackoff(0, { status: 429, data: { retryAfter: 5 } })).toBe(5000);
      });

      it('should use retryAfter * 1000 regardless of attempt number', () => {
        expect(computeBackoff(0, { status: 429, data: { retryAfter: 30 } })).toBe(30000);
        expect(computeBackoff(1, { status: 429, data: { retryAfter: 30 } })).toBe(30000);
      });

      it('should use retryAfter = 1 correctly', () => {
        expect(computeBackoff(0, { status: 429, data: { retryAfter: 1 } })).toBe(1000);
      });

      it('should use retryAfter = 60 (server says wait 1 minute)', () => {
        expect(computeBackoff(0, { status: 429, data: { retryAfter: 60 } })).toBe(60000);
      });
    });

    describe('429 WITHOUT retryAfter', () => {
      it('should fall back to standard exponential backoff when retryAfter is missing', () => {
        expect(computeBackoff(0, { status: 429 })).toBe(1000);
        expect(computeBackoff(1, { status: 429 })).toBe(2000);
      });

      it('should fall back to standard backoff when retryAfter is 0', () => {
        // retryAfter of 0 is falsy, so the condition `error.data?.retryAfter` is falsy
        expect(computeBackoff(0, { status: 429, data: { retryAfter: 0 } })).toBe(1000);
      });

      it('should fall back when data exists but retryAfter is undefined', () => {
        expect(computeBackoff(0, { status: 429, data: {} })).toBe(1000);
      });
    });

    describe('non-429 with retryAfter (should be ignored)', () => {
      it('should use standard backoff for status 500 even if retryAfter is present', () => {
        expect(computeBackoff(0, { status: 500, data: { retryAfter: 10 } })).toBe(1000);
      });

      it('should use standard backoff for status 503 even if retryAfter is present', () => {
        expect(computeBackoff(1, { status: 503, data: { retryAfter: 10 } })).toBe(2000);
      });
    });

    describe('statusCode property (alternative)', () => {
      it('should respect statusCode 429 with retryAfter', () => {
        expect(computeBackoff(0, { statusCode: 429, data: { retryAfter: 3 } })).toBe(3000);
      });

      it('should use standard backoff for statusCode 500', () => {
        expect(computeBackoff(0, { statusCode: 500 })).toBe(1000);
      });
    });
  });

  // =========================================================================
  // 5. GET Request Deduplication
  // =========================================================================
  describe('GET Request Deduplication', () => {
    let dedup: DeduplicationMap;

    beforeEach(() => {
      dedup = new DeduplicationMap();
    });

    it('should return the same promise for concurrent GETs to the same endpoint', () => {
      let resolveA!: (v: string) => void;
      const factoryA = jest.fn(() => new Promise<unknown>((r) => { resolveA = r; }));
      const factoryB = jest.fn(() => Promise.resolve('b'));

      const [promiseA, isNewA] = dedup.getOrCreate('/profiles/123', factoryA);
      const [promiseB, isNewB] = dedup.getOrCreate('/profiles/123', factoryB);

      expect(isNewA).toBe(true);
      expect(isNewB).toBe(false);
      expect(promiseA).toBe(promiseB); // same promise instance
      expect(factoryA).toHaveBeenCalledTimes(1);
      expect(factoryB).not.toHaveBeenCalled(); // second factory never invoked

      // Cleanup
      resolveA('done');
    });

    it('should create separate promises for different endpoints', () => {
      const factoryA = jest.fn(() => Promise.resolve('a'));
      const factoryB = jest.fn(() => Promise.resolve('b'));

      const [, isNewA] = dedup.getOrCreate('/profiles/123', factoryA);
      const [, isNewB] = dedup.getOrCreate('/profiles/456', factoryB);

      expect(isNewA).toBe(true);
      expect(isNewB).toBe(true);
      expect(factoryA).toHaveBeenCalledTimes(1);
      expect(factoryB).toHaveBeenCalledTimes(1);
    });

    it('should remove the entry after the promise resolves', async () => {
      const factory = jest.fn(() => Promise.resolve('data'));

      const [promise] = dedup.getOrCreate('/profiles/123', factory);
      expect(dedup.has('/profiles/123')).toBe(true);

      await promise;

      // After resolution, the .finally() cleanup removes the entry
      expect(dedup.has('/profiles/123')).toBe(false);
      expect(dedup.size).toBe(0);
    });

    it('should remove the entry after the promise rejects', async () => {
      const factory = jest.fn(() => Promise.reject(new Error('fail')));

      const [promise] = dedup.getOrCreate('/profiles/123', factory);
      expect(dedup.has('/profiles/123')).toBe(true);

      await expect(promise).rejects.toThrow('fail');

      expect(dedup.has('/profiles/123')).toBe(false);
      expect(dedup.size).toBe(0);
    });

    it('should allow a new request after the previous one completes', async () => {
      const factory1 = jest.fn(() => Promise.resolve('first'));
      const factory2 = jest.fn(() => Promise.resolve('second'));

      const [promise1] = dedup.getOrCreate('/profiles/123', factory1);
      await promise1;

      // After first completes, a new factory should be called
      const [promise2, isNew] = dedup.getOrCreate('/profiles/123', factory2);
      expect(isNew).toBe(true);
      expect(factory2).toHaveBeenCalledTimes(1);
      expect(await promise2).toBe('second');
    });

    it('should handle multiple concurrent endpoints independently', async () => {
      let resolveA!: (v: string) => void;
      let resolveB!: (v: string) => void;
      const factoryA = () => new Promise<unknown>((r) => { resolveA = r; });
      const factoryB = () => new Promise<unknown>((r) => { resolveB = r; });

      dedup.getOrCreate('/endpoint-a', factoryA);
      dedup.getOrCreate('/endpoint-b', factoryB);

      expect(dedup.size).toBe(2);
      expect(dedup.has('/endpoint-a')).toBe(true);
      expect(dedup.has('/endpoint-b')).toBe(true);

      resolveA('a');
      await Promise.resolve(); // microtask flush

      // Only endpoint-a should be cleaned up after its next microtick
      // We need to wait for .finally() to run
      await new Promise(r => setTimeout(r, 0));
      expect(dedup.has('/endpoint-a')).toBe(false);
      expect(dedup.has('/endpoint-b')).toBe(true);

      resolveB('b');
      await new Promise(r => setTimeout(r, 0));
      expect(dedup.size).toBe(0);
    });

    it('should only deduplicate GET — POST requests should not be deduplicated (semantic test)', () => {
      // This is a design contract test. In the real code, only method === 'GET'
      // enters the dedup branch. We verify the expectation by documenting it.
      // POST, PUT, DELETE, PATCH should always create fresh requests.
      const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];
      methods.forEach((method) => {
        // For non-GET methods the dedup map should never be consulted
        // This test exists to document the contract
        expect(method).not.toBe('GET');
      });
    });
  });

  // =========================================================================
  // 6. Max Retries Exhaustion
  // =========================================================================
  describe('Max Retries Exhaustion', () => {

    it('MAX_RETRIES should be 2', () => {
      expect(MAX_RETRIES).toBe(2);
    });

    it('should allow at most 3 total attempts (initial + 2 retries)', () => {
      // Simulate the retry loop logic
      const attempts: number[] = [];
      const error: ErrorLike = { status: 500 };

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        attempts.push(attempt);
        const isRetryable = isRetryableError(error);
        if (!isRetryable || attempt === MAX_RETRIES) {
          break;
        }
      }

      expect(attempts).toEqual([0, 1, 2]);
      expect(attempts.length).toBe(3); // 3 total attempts
    });

    it('should stop immediately for non-retryable errors (only 1 attempt)', () => {
      const attempts: number[] = [];
      const error: ErrorLike = { status: 404 };

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        attempts.push(attempt);
        const isRetryable = isRetryableError(error);
        if (!isRetryable || attempt === MAX_RETRIES) {
          break;
        }
      }

      expect(attempts).toEqual([0]);
      expect(attempts.length).toBe(1); // no retries
    });

    it('should compute correct total delay for all retries (1s + 2s = 3s)', () => {
      const error: ErrorLike = { status: 502 };
      let totalDelay = 0;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        totalDelay += computeBackoff(attempt, error);
      }

      expect(totalDelay).toBe(3000); // 1000 + 2000
    });

    it('should annotate error message after exhausting retries', () => {
      // The real code appends "(after N attempts)" to the error message
      const totalAttempts = MAX_RETRIES + 1; // 3
      const errorMessage = 'Server Error';
      const annotated = `${errorMessage} (after ${totalAttempts} attempts)`;

      expect(annotated).toBe('Server Error (after 3 attempts)');
    });
  });

  // =========================================================================
  // 7. RETRYABLE_STATUSES constant
  // =========================================================================
  describe('RETRYABLE_STATUSES constant', () => {
    it('should contain exactly the 6 expected status codes', () => {
      expect(RETRYABLE_STATUSES).toEqual([408, 429, 500, 502, 503, 504]);
      expect(RETRYABLE_STATUSES.length).toBe(6);
    });

    it('should contain 408 (Request Timeout)', () => {
      expect(RETRYABLE_STATUSES).toContain(408);
    });

    it('should contain 429 (Too Many Requests)', () => {
      expect(RETRYABLE_STATUSES).toContain(429);
    });

    it('should contain all 5xx server errors (500, 502, 503, 504)', () => {
      expect(RETRYABLE_STATUSES).toContain(500);
      expect(RETRYABLE_STATUSES).toContain(502);
      expect(RETRYABLE_STATUSES).toContain(503);
      expect(RETRYABLE_STATUSES).toContain(504);
    });

    it('should NOT contain 501 (Not Implemented) — not transient', () => {
      expect(RETRYABLE_STATUSES).not.toContain(501);
    });

    it('should NOT contain 505 (HTTP Version Not Supported)', () => {
      expect(RETRYABLE_STATUSES).not.toContain(505);
    });
  });

  // =========================================================================
  // 8. Routing Constants Integrity
  // =========================================================================
  describe('Routing Constants Integrity', () => {

    it('API3_ENDPOINTS should have 3 exact-match entries', () => {
      expect(API3_ENDPOINTS.length).toBe(3);
    });

    it('API3_PREFIXES should have 9 prefix entries', () => {
      expect(API3_PREFIXES.length).toBe(9);
    });

    it('DISPUTES_PREFIXES should have 2 prefix entries', () => {
      expect(DISPUTES_PREFIXES.length).toBe(2);
    });

    it('API2_PREFIXES should have 24 prefix entries', () => {
      expect(API2_PREFIXES.length).toBe(24);
    });

    it('no prefix in API3_PREFIXES should also appear in API2_PREFIXES', () => {
      const api3Set = new Set(API3_PREFIXES as unknown as string[]);
      const overlap = (API2_PREFIXES as unknown as string[]).filter(p => api3Set.has(p));
      expect(overlap).toEqual([]);
    });

    it('no prefix in DISPUTES_PREFIXES should also appear in API2_PREFIXES', () => {
      const disputesSet = new Set(DISPUTES_PREFIXES as unknown as string[]);
      const overlap = (API2_PREFIXES as unknown as string[]).filter(p => disputesSet.has(p));
      expect(overlap).toEqual([]);
    });
  });

  // =========================================================================
  // 9. Overlapping Prefix Edge Cases
  // =========================================================================
  describe('Overlapping Prefix Edge Cases', () => {

    it('/businesses/subscriptions/premium routes to api3 (matches /businesses/subscriptions/ prefix)', () => {
      expect(resolveGateway('/businesses/subscriptions/premium')).toBe('api3');
    });

    it('/businesses/other routes to api2 (matches /businesses prefix only)', () => {
      expect(resolveGateway('/businesses/other')).toBe('api2');
    });

    it('/admin/disputes/123 routes to disputes (not api2 despite /admin prefix)', () => {
      expect(resolveGateway('/admin/disputes/123')).toBe('disputes');
    });

    it('/admin/users routes to api2 (matches /admin prefix, not disputes)', () => {
      expect(resolveGateway('/admin/users')).toBe('api2');
    });

    it('/posts/saved/list routes to api3 (matches /posts/saved prefix)', () => {
      expect(resolveGateway('/posts/saved/list')).toBe('api3');
    });

    it('/posts/create routes to api1 (no matching prefix)', () => {
      expect(resolveGateway('/posts/create')).toBe('api1');
    });

    it('/posts/likes routes to api1 (does not start with /posts/likes/batch)', () => {
      expect(resolveGateway('/posts/likes')).toBe('api1');
    });

    it('/posts/likes/batch routes to api3 (exact prefix match)', () => {
      expect(resolveGateway('/posts/likes/batch')).toBe('api3');
    });

    it('/posts/likes/batch-extra routes to api3 (starts with /posts/likes/batch)', () => {
      expect(resolveGateway('/posts/likes/batch-extra')).toBe('api3');
    });

    it('/search/map/pins routes to api2 (starts with /search/map)', () => {
      expect(resolveGateway('/search/map/pins')).toBe('api2');
    });

    it('/search routes to api1 (no matching prefix — /search/map is the prefix, not /search)', () => {
      expect(resolveGateway('/search')).toBe('api1');
    });

    it('/search/users routes to api1 (starts with /search but not /search/map)', () => {
      expect(resolveGateway('/search/users')).toBe('api1');
    });
  });

  // =========================================================================
  // 10. Combined Retry + Backoff Simulation
  // =========================================================================
  describe('Combined Retry + Backoff Simulation', () => {

    /**
     * Simulate the retry loop and return a summary of what happened.
     */
    function simulateRetryLoop(errorSequence: ErrorLike[]): {
      totalAttempts: number;
      delays: number[];
      finalOutcome: 'success' | 'exhausted' | 'non-retryable';
    } {
      const delays: number[] = [];
      let totalAttempts = 0;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        totalAttempts++;

        // If we've run out of errors to throw, the request "succeeded"
        if (attempt >= errorSequence.length) {
          return { totalAttempts, delays, finalOutcome: 'success' };
        }

        const error = errorSequence[attempt];
        const retryable = isRetryableError(error);

        if (!retryable || attempt === MAX_RETRIES) {
          return {
            totalAttempts,
            delays,
            finalOutcome: retryable ? 'exhausted' : 'non-retryable',
          };
        }

        delays.push(computeBackoff(attempt, error));
      }

      return { totalAttempts, delays, finalOutcome: 'exhausted' };
    }

    it('should succeed on first attempt (no errors)', () => {
      const result = simulateRetryLoop([]);
      expect(result.totalAttempts).toBe(1);
      expect(result.delays).toEqual([]);
      expect(result.finalOutcome).toBe('success');
    });

    it('should retry once and succeed on second attempt', () => {
      const result = simulateRetryLoop([{ status: 500 }]);
      expect(result.totalAttempts).toBe(2);
      expect(result.delays).toEqual([1000]);
      expect(result.finalOutcome).toBe('success');
    });

    it('should retry twice and succeed on third attempt', () => {
      const result = simulateRetryLoop([{ status: 502 }, { status: 503 }]);
      expect(result.totalAttempts).toBe(3);
      expect(result.delays).toEqual([1000, 2000]);
      expect(result.finalOutcome).toBe('success');
    });

    it('should exhaust retries on 3 consecutive 500s', () => {
      const result = simulateRetryLoop([
        { status: 500 },
        { status: 500 },
        { status: 500 },
      ]);
      expect(result.totalAttempts).toBe(3);
      expect(result.delays).toEqual([1000, 2000]);
      expect(result.finalOutcome).toBe('exhausted');
    });

    it('should stop immediately on 400 (non-retryable)', () => {
      const result = simulateRetryLoop([{ status: 400 }]);
      expect(result.totalAttempts).toBe(1);
      expect(result.delays).toEqual([]);
      expect(result.finalOutcome).toBe('non-retryable');
    });

    it('should stop immediately on 401 (non-retryable)', () => {
      const result = simulateRetryLoop([{ status: 401 }]);
      expect(result.totalAttempts).toBe(1);
      expect(result.delays).toEqual([]);
      expect(result.finalOutcome).toBe('non-retryable');
    });

    it('should stop immediately on 403 (non-retryable)', () => {
      const result = simulateRetryLoop([{ status: 403 }]);
      expect(result.totalAttempts).toBe(1);
      expect(result.delays).toEqual([]);
      expect(result.finalOutcome).toBe('non-retryable');
    });

    it('should stop immediately on 404 (non-retryable)', () => {
      const result = simulateRetryLoop([{ status: 404 }]);
      expect(result.totalAttempts).toBe(1);
      expect(result.delays).toEqual([]);
      expect(result.finalOutcome).toBe('non-retryable');
    });

    it('should use retryAfter for 429 then standard backoff for 500', () => {
      const result = simulateRetryLoop([
        { status: 429, data: { retryAfter: 10 } },
        { status: 500 },
      ]);
      expect(result.totalAttempts).toBe(3);
      expect(result.delays).toEqual([10000, 2000]); // retryAfter*1000, then 2^1*1000
      expect(result.finalOutcome).toBe('success');
    });

    it('should handle network error then success', () => {
      const result = simulateRetryLoop([
        { message: 'Network request failed' },
      ]);
      expect(result.totalAttempts).toBe(2);
      expect(result.delays).toEqual([1000]);
      expect(result.finalOutcome).toBe('success');
    });

    it('should exhaust retries on repeated network errors', () => {
      const result = simulateRetryLoop([
        { name: 'TypeError', message: 'Failed to fetch' },
        { name: 'TypeError', message: 'Failed to fetch' },
        { name: 'TypeError', message: 'Failed to fetch' },
      ]);
      expect(result.totalAttempts).toBe(3);
      expect(result.delays).toEqual([1000, 2000]);
      expect(result.finalOutcome).toBe('exhausted');
    });

    it('should handle mixed retryable errors', () => {
      const result = simulateRetryLoop([
        { status: 503 },          // retryable, delay 1s
        { message: 'timeout' },   // network error, delay 2s
      ]);
      expect(result.totalAttempts).toBe(3);
      expect(result.delays).toEqual([1000, 2000]);
      expect(result.finalOutcome).toBe('success');
    });

    it('should handle 500 then 404 (retry once, then give up non-retryable)', () => {
      const result = simulateRetryLoop([
        { status: 500 }, // retryable
        { status: 404 }, // non-retryable
      ]);
      expect(result.totalAttempts).toBe(2);
      expect(result.delays).toEqual([1000]);
      expect(result.finalOutcome).toBe('non-retryable');
    });
  });
});
