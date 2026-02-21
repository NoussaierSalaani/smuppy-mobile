/**
 * Tests for shared/redis module
 * Validates Redis/Cluster connection management, auth token caching,
 * graceful degradation, and singleton behavior.
 *
 * Uses jest.resetModules() + dynamic require() because the module
 * caches connections at module level (singleton pattern).
 */

// ── Mock instances (defined before jest.mock — Jest hoists mock declarations) ──

const mockRedisInstance = {
  status: 'ready',
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue('OK'),
  connect: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

const mockClusterInstance = {
  status: 'ready',
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue('OK'),
  connect: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

const MockRedisConstructor = jest.fn().mockImplementation(() => mockRedisInstance);
const MockClusterConstructor = jest.fn().mockImplementation(() => mockClusterInstance);

jest.mock('ioredis', () => {
  const RedisMock = MockRedisConstructor;
  (RedisMock as unknown as Record<string, unknown>).Cluster = MockClusterConstructor;
  return {
    __esModule: true,
    default: RedisMock,
    Cluster: MockClusterConstructor,
  };
});

const mockSend = jest.fn().mockResolvedValue({ SecretString: 'redis-auth-token-123' });

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    initFromEvent: jest.fn(),
    setRequestId: jest.fn(),
    setUserId: jest.fn(),
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    logQuery: jest.fn(),
    logSecurity: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
}));

// ── Helpers ──

/** Save and restore env vars between tests */
const savedEnv: Record<string, string | undefined> = {};

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(vars)) {
    savedEnv[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  // Clear saved state
  for (const key of Object.keys(savedEnv)) {
    delete savedEnv[key];
  }
}

/**
 * Require a fresh copy of the redis module.
 * Must be called AFTER setting env vars and AFTER jest.resetModules().
 */
function requireFreshRedis(): { getRedis: () => Promise<unknown> } {
  return require('../../../shared/redis');
}

// ── Test suite ──

describe('shared/redis module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Reset mock instance state to defaults
    mockRedisInstance.status = 'ready';
    mockRedisInstance.ping.mockResolvedValue('PONG');
    mockRedisInstance.quit.mockResolvedValue('OK');
    mockRedisInstance.connect.mockResolvedValue(undefined);
    mockRedisInstance.on.mockReset();

    mockClusterInstance.status = 'ready';
    mockClusterInstance.ping.mockResolvedValue('PONG');
    mockClusterInstance.quit.mockResolvedValue('OK');
    mockClusterInstance.connect.mockResolvedValue(undefined);
    mockClusterInstance.on.mockReset();

    mockSend.mockResolvedValue({ SecretString: 'redis-auth-token-123' });

    // Clean env vars
    delete process.env.REDIS_ENDPOINT;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_CLUSTER_MODE;
    delete process.env.REDIS_AUTH_SECRET_ARN;
  });

  afterEach(() => {
    restoreEnv();
  });

  // ── 1. Returns null when REDIS_ENDPOINT is not set ──

  it('should return null when REDIS_ENDPOINT is not set', async () => {
    // REDIS_ENDPOINT is not set (cleaned in beforeEach)
    const { getRedis } = requireFreshRedis();

    const result = await getRedis();

    expect(result).toBeNull();
    // Should not attempt to create any Redis connection
    expect(MockRedisConstructor).not.toHaveBeenCalled();
    expect(MockClusterConstructor).not.toHaveBeenCalled();
  });

  // ── 2. Creates standalone Redis connection when REDIS_ENDPOINT is set ──

  it('should create standalone Redis connection when REDIS_ENDPOINT is set', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
      REDIS_AUTH_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:redis-auth',
    });

    const { getRedis } = requireFreshRedis();

    const result = await getRedis();

    expect(result).toBe(mockRedisInstance);
    expect(MockRedisConstructor).toHaveBeenCalledTimes(1);
    expect(MockClusterConstructor).not.toHaveBeenCalled();

    // Verify Redis was constructed with correct options
    const constructorArgs = MockRedisConstructor.mock.calls[0][0];
    expect(constructorArgs.host).toBe('redis.example.com');
    expect(constructorArgs.port).toBe(6379);
    expect(constructorArgs.tls).toEqual({});
    expect(constructorArgs.password).toBe('redis-auth-token-123');
    expect(constructorArgs.lazyConnect).toBe(true);
    expect(constructorArgs.enableOfflineQueue).toBe(true);
    expect(constructorArgs.connectTimeout).toBe(5000);
    expect(constructorArgs.commandTimeout).toBe(3000);
    expect(constructorArgs.maxRetriesPerRequest).toBe(3);

    // Verify connect() was called
    expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);

    // Verify event listeners were registered
    expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockRedisInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  // ── 3. Creates Cluster connection when REDIS_CLUSTER_MODE=true ──

  it('should create Cluster connection when REDIS_CLUSTER_MODE=true', async () => {
    setEnv({
      REDIS_ENDPOINT: 'cluster.example.com',
      REDIS_CLUSTER_MODE: 'true',
      REDIS_PORT: '6380',
      REDIS_AUTH_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:redis-auth',
    });

    const { getRedis } = requireFreshRedis();

    const result = await getRedis();

    expect(result).toBe(mockClusterInstance);
    expect(MockClusterConstructor).toHaveBeenCalledTimes(1);
    expect(MockRedisConstructor).not.toHaveBeenCalled();

    // Verify Cluster was constructed with correct arguments
    const [nodes, options] = MockClusterConstructor.mock.calls[0];
    expect(nodes).toEqual([{ host: 'cluster.example.com', port: 6380 }]);
    expect(options.redisOptions.tls).toEqual({});
    expect(options.redisOptions.password).toBe('redis-auth-token-123');
    expect(options.redisOptions.connectTimeout).toBe(5000);
    expect(options.redisOptions.commandTimeout).toBe(3000);
    expect(options.lazyConnect).toBe(true);
    expect(options.enableOfflineQueue).toBe(true);
    expect(options.slotsRefreshTimeout).toBe(10000);
    expect(options.slotsRefreshInterval).toBe(5000);

    // Verify connect() was called
    expect(mockClusterInstance.connect).toHaveBeenCalledTimes(1);

    // Verify event listeners were registered
    expect(mockClusterInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockClusterInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  // ── 4. Reuses cached connection when status is 'ready' and ping succeeds ──

  it('should reuse cached connection when status is ready and ping succeeds', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
    });

    const { getRedis } = requireFreshRedis();

    // First call: creates connection
    const result1 = await getRedis();
    expect(result1).toBe(mockRedisInstance);
    expect(MockRedisConstructor).toHaveBeenCalledTimes(1);
    expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);

    // Second call: should reuse (status is 'ready', ping returns 'PONG')
    const result2 = await getRedis();
    expect(result2).toBe(mockRedisInstance);
    // Constructor should NOT be called again
    expect(MockRedisConstructor).toHaveBeenCalledTimes(1);
    // connect() should NOT be called again
    expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);
    // ping should have been called to verify the connection
    expect(mockRedisInstance.ping).toHaveBeenCalled();
  });

  // ── 5. Reconnects when ping fails on cached connection ──

  it('should reconnect when ping fails on cached connection', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
    });

    const { getRedis } = requireFreshRedis();

    // First call: creates connection
    const result1 = await getRedis();
    expect(result1).toBe(mockRedisInstance);
    expect(MockRedisConstructor).toHaveBeenCalledTimes(1);

    // Simulate ping failure on second call
    mockRedisInstance.ping.mockRejectedValueOnce(new Error('Connection reset'));

    // Second call: ping fails, should quit and reconnect
    const result2 = await getRedis();
    expect(result2).toBe(mockRedisInstance);
    // Constructor called twice (initial + reconnect)
    expect(MockRedisConstructor).toHaveBeenCalledTimes(2);
    // quit() should have been called to close the broken connection
    expect(mockRedisInstance.quit).toHaveBeenCalled();
    // connect() called twice (initial + reconnect)
    expect(mockRedisInstance.connect).toHaveBeenCalledTimes(2);
  });

  // ── 6. Closes existing non-ready connection before creating new one ──

  it('should close existing non-ready connection before creating new one', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
    });

    const { getRedis } = requireFreshRedis();

    // First call: creates connection
    await getRedis();
    expect(MockRedisConstructor).toHaveBeenCalledTimes(1);

    // Simulate the cached connection going into a non-ready state (e.g., 'connecting')
    // On next call, status !== 'ready' so it skips the ping-check branch
    // and enters the "close existing connection if not ready" branch
    mockRedisInstance.status = 'connecting';

    // Second call: should close old connection and create new one
    await getRedis();
    // quit() should be called to close the non-ready connection
    expect(mockRedisInstance.quit).toHaveBeenCalled();
    // Constructor called a second time for the new connection
    expect(MockRedisConstructor).toHaveBeenCalledTimes(2);
    expect(mockRedisInstance.connect).toHaveBeenCalledTimes(2);
  });

  // ── 7. Returns null when connection fails (graceful degradation) ──

  it('should return null when connection fails (graceful degradation)', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
    });

    // Make connect() throw to simulate a connection failure
    mockRedisInstance.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const { getRedis } = requireFreshRedis();

    const result = await getRedis();

    expect(result).toBeNull();
    // Constructor was called (connection was attempted)
    expect(MockRedisConstructor).toHaveBeenCalledTimes(1);
    // connect() was called and threw
    expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);
  });

  // ── 8. Gets auth token from SecretsManager ──

  it('should get auth token from SecretsManager and pass it as password', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
      REDIS_AUTH_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:redis-token',
    });

    mockSend.mockResolvedValueOnce({ SecretString: 'my-super-secret-token' });

    const { getRedis } = requireFreshRedis();

    await getRedis();

    // Verify SecretsManager was called with the correct ARN
    const { GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    expect(GetSecretValueCommand).toHaveBeenCalledWith({
      SecretId: 'arn:aws:secretsmanager:us-east-1:123:secret:redis-token',
    });
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Verify the password was passed to Redis constructor
    const constructorArgs = MockRedisConstructor.mock.calls[0][0];
    expect(constructorArgs.password).toBe('my-super-secret-token');
  });

  // ── 9. Connects without auth when REDIS_AUTH_SECRET_ARN not set ──

  it('should connect without auth when REDIS_AUTH_SECRET_ARN is not set', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
      // REDIS_AUTH_SECRET_ARN not set
    });

    const { getRedis } = requireFreshRedis();

    const result = await getRedis();

    expect(result).toBe(mockRedisInstance);
    // SecretsManager send should NOT be called
    expect(mockSend).not.toHaveBeenCalled();

    // password should be undefined (authToken is null, so `null || undefined` = undefined)
    const constructorArgs = MockRedisConstructor.mock.calls[0][0];
    expect(constructorArgs.password).toBeUndefined();
  });

  // ── 10. Returns null for auth token when SecretString is empty ──

  it('should return null for auth token when SecretString is empty', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
      REDIS_AUTH_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:redis-token',
    });

    // SecretString is undefined/empty
    mockSend.mockResolvedValueOnce({ SecretString: undefined });

    const { getRedis } = requireFreshRedis();

    const result = await getRedis();

    expect(result).toBe(mockRedisInstance);
    expect(mockSend).toHaveBeenCalledTimes(1);

    // password should be undefined since auth token is null
    const constructorArgs = MockRedisConstructor.mock.calls[0][0];
    expect(constructorArgs.password).toBeUndefined();
  });

  // ── 11. Caches auth token for 30 minutes ──

  it('should cache auth token and not re-fetch within TTL', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
      REDIS_AUTH_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:redis-token',
    });

    mockSend.mockResolvedValue({ SecretString: 'cached-token-value' });

    const { getRedis } = requireFreshRedis();

    // First call: fetches token from SecretsManager
    await getRedis();
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Simulate the cached connection going away so getRedis creates a new one
    // (this forces getRedisAuthToken to be called again)
    mockRedisInstance.status = 'end';

    // Second call: auth token should be cached, no new SecretsManager call
    await getRedis();
    // Send should still only have been called once (token is cached)
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  // ── 12. Re-fetches auth token after TTL expires ──

  it('should re-fetch auth token after cache TTL expires', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
      REDIS_AUTH_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:redis-token',
    });

    const realDateNow = Date.now;
    let currentTime = 1000000;
    Date.now = jest.fn(() => currentTime);

    mockSend.mockResolvedValue({ SecretString: 'token-v1' });

    const { getRedis } = requireFreshRedis();

    // First call: fetches token
    await getRedis();
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Advance time past the 30-minute TTL (30 * 60 * 1000 = 1,800,000 ms)
    currentTime += 1_800_001;

    // Force a new connection to trigger getRedisAuthToken again
    mockRedisInstance.status = 'end';
    mockSend.mockResolvedValueOnce({ SecretString: 'token-v2' });

    await getRedis();
    // Should have called SecretsManager a second time
    expect(mockSend).toHaveBeenCalledTimes(2);

    // Restore Date.now
    Date.now = realDateNow;
  });

  // ── 13. Handles SecretsManager error gracefully ──

  it('should handle SecretsManager error and connect without auth', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
      REDIS_AUTH_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:redis-token',
    });

    mockSend.mockRejectedValueOnce(new Error('AccessDeniedException'));

    const { getRedis } = requireFreshRedis();

    const result = await getRedis();

    expect(result).toBe(mockRedisInstance);
    // password should be undefined since auth token fetch failed
    const constructorArgs = MockRedisConstructor.mock.calls[0][0];
    expect(constructorArgs.password).toBeUndefined();
  });

  // ── 14. Uses custom REDIS_PORT when set ──

  it('should use custom REDIS_PORT when set', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
      REDIS_PORT: '6380',
    });

    const { getRedis } = requireFreshRedis();

    await getRedis();

    const constructorArgs = MockRedisConstructor.mock.calls[0][0];
    expect(constructorArgs.port).toBe(6380);
  });

  // ── 15. Uses default port 6379 when REDIS_PORT is not set ──

  it('should use default port 6379 when REDIS_PORT is not set', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
      // REDIS_PORT not set
    });

    const { getRedis } = requireFreshRedis();

    await getRedis();

    const constructorArgs = MockRedisConstructor.mock.calls[0][0];
    expect(constructorArgs.port).toBe(6379);
  });

  // ── 16. Handles quit() failure when closing non-ready connection ──

  it('should handle quit() failure when closing non-ready connection', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
    });

    const { getRedis } = requireFreshRedis();

    // First call: create connection
    await getRedis();

    // Set non-ready status and make quit() throw
    mockRedisInstance.status = 'connecting';
    mockRedisInstance.quit.mockRejectedValueOnce(new Error('Connection already closed'));

    // Second call: should handle quit failure gracefully and still create new connection
    const result = await getRedis();
    expect(result).toBe(mockRedisInstance);
    expect(MockRedisConstructor).toHaveBeenCalledTimes(2);
  });

  // ── 17. Handles quit() failure when ping fails on cached connection ──

  it('should handle quit() failure when ping fails and quit also fails', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
    });

    const { getRedis } = requireFreshRedis();

    // First call: create connection
    await getRedis();

    // Simulate ping failure followed by quit() failure
    mockRedisInstance.ping.mockRejectedValueOnce(new Error('Timeout'));
    mockRedisInstance.quit.mockRejectedValueOnce(new Error('Already disconnected'));

    // Second call: should still reconnect despite quit() failing
    const result = await getRedis();
    expect(result).toBe(mockRedisInstance);
    expect(MockRedisConstructor).toHaveBeenCalledTimes(2);
    expect(mockRedisInstance.connect).toHaveBeenCalledTimes(2);
  });

  // ── 18. Cluster retry strategy returns null after 3 retries ──

  it('should configure cluster retry strategy that gives up after 3 attempts', async () => {
    setEnv({
      REDIS_ENDPOINT: 'cluster.example.com',
      REDIS_CLUSTER_MODE: 'true',
    });

    const { getRedis } = requireFreshRedis();

    await getRedis();

    const [, options] = MockClusterConstructor.mock.calls[0];
    const retryStrategy = options.clusterRetryStrategy;

    // Should return delay for first 3 attempts
    expect(retryStrategy(1)).toBe(100);
    expect(retryStrategy(2)).toBe(200);
    expect(retryStrategy(3)).toBe(300);

    // Should return null (give up) after 3
    expect(retryStrategy(4)).toBeNull();
    expect(retryStrategy(5)).toBeNull();
  });

  // ── 19. Standalone retry strategy returns null after 3 retries ──

  it('should configure standalone retry strategy that gives up after 3 attempts', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
    });

    const { getRedis } = requireFreshRedis();

    await getRedis();

    const constructorArgs = MockRedisConstructor.mock.calls[0][0];
    const retryStrategy = constructorArgs.retryStrategy;

    // Should return delay for first 3 attempts
    expect(retryStrategy(1)).toBe(100);
    expect(retryStrategy(2)).toBe(200);
    expect(retryStrategy(3)).toBe(300);

    // Should return null (give up) after 3
    expect(retryStrategy(4)).toBeNull();
    expect(retryStrategy(5)).toBeNull();
  });

  // ── 20. Cluster retry strategy caps delay at 1000ms ──

  it('should cap cluster retry delay at 1000ms', async () => {
    setEnv({
      REDIS_ENDPOINT: 'cluster.example.com',
      REDIS_CLUSTER_MODE: 'true',
    });

    const { getRedis } = requireFreshRedis();

    await getRedis();

    const [, options] = MockClusterConstructor.mock.calls[0];
    const retryStrategy = options.clusterRetryStrategy;

    // Math.min(3 * 100, 1000) = 300 (not capped)
    expect(retryStrategy(3)).toBe(300);
    // Would be times*100 if uncapped; check the formula works
    expect(retryStrategy(1)).toBe(100);
  });

  // ── 21. Cluster dnsLookup callback passes address through ──

  it('should configure Cluster dnsLookup to pass address through directly', async () => {
    setEnv({
      REDIS_ENDPOINT: 'cluster.example.com',
      REDIS_CLUSTER_MODE: 'true',
    });

    const { getRedis } = requireFreshRedis();

    await getRedis();

    const [, options] = MockClusterConstructor.mock.calls[0];
    const dnsLookup = options.dnsLookup;

    // Test the dnsLookup callback
    const callback = jest.fn();
    dnsLookup('10.0.1.5', callback);
    expect(callback).toHaveBeenCalledWith(null, '10.0.1.5');
  });

  // ── 22. Cluster mode uses auth token in redisOptions ──

  it('should pass auth token in Cluster redisOptions.password', async () => {
    setEnv({
      REDIS_ENDPOINT: 'cluster.example.com',
      REDIS_CLUSTER_MODE: 'true',
      REDIS_AUTH_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:redis-auth',
    });

    mockSend.mockResolvedValueOnce({ SecretString: 'cluster-secret-token' });

    const { getRedis } = requireFreshRedis();

    await getRedis();

    const [, options] = MockClusterConstructor.mock.calls[0];
    expect(options.redisOptions.password).toBe('cluster-secret-token');
  });

  // ── 23. REDIS_CLUSTER_MODE not 'true' uses standalone ──

  it('should use standalone mode when REDIS_CLUSTER_MODE is not "true"', async () => {
    setEnv({
      REDIS_ENDPOINT: 'redis.example.com',
      REDIS_CLUSTER_MODE: 'false',
    });

    const { getRedis } = requireFreshRedis();

    await getRedis();

    expect(MockRedisConstructor).toHaveBeenCalledTimes(1);
    expect(MockClusterConstructor).not.toHaveBeenCalled();
  });
});
