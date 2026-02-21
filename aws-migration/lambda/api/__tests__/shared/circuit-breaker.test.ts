/**
 * Tests for shared/circuit-breaker module
 * Tests CircuitBreaker class: canExecute, recordSuccess, recordFailure, getState
 * State machine: CLOSED -> OPEN -> HALF_OPEN -> CLOSED
 * Fail-open design: returns true/CLOSED when Redis is unavailable
 */

// ── Mocks (must be before handler import -- Jest hoists jest.mock calls) ──

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();
const mockRedisIncr = jest.fn();
const mockRedisExpire = jest.fn();
const mockPipelineSet = jest.fn();
const mockPipelineDel = jest.fn();
const mockPipelineExec = jest.fn().mockResolvedValue([]);

const mockRedisMulti = jest.fn(() => ({
  set: mockPipelineSet.mockReturnThis(),
  del: mockPipelineDel.mockReturnThis(),
  exec: mockPipelineExec,
}));

const mockRedis = {
  get: mockRedisGet,
  set: mockRedisSet,
  del: mockRedisDel,
  incr: mockRedisIncr,
  expire: mockRedisExpire,
  multi: mockRedisMulti,
};

jest.mock('../../../shared/redis', () => ({
  getRedis: jest.fn(),
}));

// ── Import AFTER all mocks are declared ──

import { CircuitBreaker, CircuitOpenError, CircuitState } from '../../../shared/circuit-breaker';
import { getRedis } from '../../../shared/redis';

const mockGetRedis = getRedis as jest.MockedFunction<typeof getRedis>;

// ── Test constants ──

const SERVICE_NAME = 'test-service';
const KEY_PREFIX = `{smuppy:cb:${SERVICE_NAME}}`;

// ── Test suite ──

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    jest.clearAllMocks();
    cb = new CircuitBreaker({ service: SERVICE_NAME });
    // Default: Redis is available
    mockGetRedis.mockResolvedValue(mockRedis as never);
    // Default: pipeline returns fresh mock chain each call
    mockRedisMulti.mockImplementation(() => ({
      set: mockPipelineSet.mockReturnThis(),
      del: mockPipelineDel.mockReturnThis(),
      exec: mockPipelineExec,
    }));
  });

  describe('CircuitOpenError', () => {
    it('should have correct name and service', () => {
      const err = new CircuitOpenError('my-service');
      expect(err.name).toBe('CircuitOpenError');
      expect(err.service).toBe('my-service');
      expect(err.message).toContain('my-service');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('canExecute', () => {
    it('should return true when Redis is unavailable (null)', async () => {
      mockGetRedis.mockResolvedValue(null as never);

      const result = await cb.canExecute();

      expect(result).toBe(true);
      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('should return true in CLOSED state', async () => {
      mockRedisGet.mockResolvedValueOnce('CLOSED').mockResolvedValueOnce(null);

      const result = await cb.canExecute();

      expect(result).toBe(true);
    });

    it('should return true when no state key exists', async () => {
      mockRedisGet.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const result = await cb.canExecute();

      expect(result).toBe(true);
    });

    it('should return false when OPEN and cooldown not expired', async () => {
      const recentTimestamp = String(Date.now());
      mockRedisGet.mockResolvedValueOnce('OPEN').mockResolvedValueOnce(recentTimestamp);

      const result = await cb.canExecute();

      expect(result).toBe(false);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('should transition OPEN to HALF_OPEN when cooldown expired', async () => {
      const expiredTimestamp = String(Date.now() - 60_000); // well past default 30s cooldown
      mockRedisGet.mockResolvedValueOnce('OPEN').mockResolvedValueOnce(expiredTimestamp);

      const result = await cb.canExecute();

      expect(result).toBe(true);
      expect(mockRedisSet).toHaveBeenCalledWith(`${KEY_PREFIX}:state`, 'HALF_OPEN');
      expect(mockRedisDel).toHaveBeenCalledWith(`${KEY_PREFIX}:success_count`);
    });

    it('should return true in HALF_OPEN state', async () => {
      mockRedisGet.mockResolvedValueOnce('HALF_OPEN').mockResolvedValueOnce(null);

      const result = await cb.canExecute();

      expect(result).toBe(true);
    });

    it('should return true when Redis throws', async () => {
      mockGetRedis.mockRejectedValue(new Error('Redis connection refused'));

      const result = await cb.canExecute();

      expect(result).toBe(true);
    });
  });

  describe('recordSuccess', () => {
    it('should increment success counter in HALF_OPEN and transition to CLOSED at threshold', async () => {
      // Use custom threshold of 2 for simpler testing
      const cbCustom = new CircuitBreaker({ service: SERVICE_NAME, successThreshold: 2 });
      mockRedisGet.mockResolvedValue('HALF_OPEN');
      mockRedisIncr.mockResolvedValue(2); // meets threshold

      await cbCustom.recordSuccess();

      expect(mockRedisIncr).toHaveBeenCalledWith(`${KEY_PREFIX}:success_count`);
      // Should execute pipeline to transition to CLOSED
      expect(mockRedisMulti).toHaveBeenCalled();
      expect(mockPipelineSet).toHaveBeenCalledWith(`${KEY_PREFIX}:state`, 'CLOSED');
      expect(mockPipelineDel).toHaveBeenCalledWith(`${KEY_PREFIX}:failure_count`);
      expect(mockPipelineDel).toHaveBeenCalledWith(`${KEY_PREFIX}:success_count`);
      expect(mockPipelineDel).toHaveBeenCalledWith(`${KEY_PREFIX}:last_failure`);
      expect(mockPipelineExec).toHaveBeenCalled();
    });

    it('should reset failure counter in CLOSED state', async () => {
      mockRedisGet.mockResolvedValue('CLOSED');

      await cb.recordSuccess();

      expect(mockRedisDel).toHaveBeenCalledWith(`${KEY_PREFIX}:failure_count`);
      expect(mockRedisIncr).not.toHaveBeenCalled();
    });

    it('should do nothing when Redis is unavailable', async () => {
      mockGetRedis.mockResolvedValue(null as never);

      await cb.recordSuccess();

      expect(mockRedisGet).not.toHaveBeenCalled();
      expect(mockRedisDel).not.toHaveBeenCalled();
      expect(mockRedisIncr).not.toHaveBeenCalled();
    });
  });

  describe('recordFailure', () => {
    it('should immediately transition to OPEN in HALF_OPEN state', async () => {
      mockRedisGet.mockResolvedValue('HALF_OPEN');

      await cb.recordFailure();

      expect(mockRedisMulti).toHaveBeenCalled();
      expect(mockPipelineSet).toHaveBeenCalledWith(`${KEY_PREFIX}:state`, 'OPEN');
      expect(mockPipelineSet).toHaveBeenCalledWith(
        `${KEY_PREFIX}:last_failure`,
        expect.any(String),
      );
      expect(mockPipelineDel).toHaveBeenCalledWith(`${KEY_PREFIX}:success_count`);
      expect(mockPipelineExec).toHaveBeenCalled();
      // Should NOT increment failure counter (returns early)
      expect(mockRedisIncr).not.toHaveBeenCalled();
    });

    it('should increment failure counter with TTL on first failure in CLOSED state', async () => {
      mockRedisGet.mockResolvedValue(null); // no state = CLOSED
      mockRedisIncr.mockResolvedValue(1); // first failure

      await cb.recordFailure();

      expect(mockRedisIncr).toHaveBeenCalledWith(`${KEY_PREFIX}:failure_count`);
      // First failure sets TTL (windowMs=60000 -> 60 seconds)
      expect(mockRedisExpire).toHaveBeenCalledWith(`${KEY_PREFIX}:failure_count`, 60);
      expect(mockRedisSet).toHaveBeenCalledWith(
        `${KEY_PREFIX}:last_failure`,
        expect.any(String),
      );
      // Below threshold, no pipeline transition
      expect(mockRedisMulti).not.toHaveBeenCalled();
    });

    it('should transition to OPEN when failure threshold is reached', async () => {
      const cbCustom = new CircuitBreaker({ service: SERVICE_NAME, failureThreshold: 3 });
      mockRedisGet.mockResolvedValue(null); // no state = CLOSED
      mockRedisIncr.mockResolvedValue(3); // meets threshold

      await cbCustom.recordFailure();

      expect(mockRedisIncr).toHaveBeenCalledWith(`${KEY_PREFIX}:failure_count`);
      // Should NOT set expire (count !== 1)
      expect(mockRedisExpire).not.toHaveBeenCalled();
      // Should execute pipeline to transition to OPEN
      expect(mockRedisMulti).toHaveBeenCalled();
      expect(mockPipelineSet).toHaveBeenCalledWith(`${KEY_PREFIX}:state`, 'OPEN');
      expect(mockPipelineDel).toHaveBeenCalledWith(`${KEY_PREFIX}:failure_count`);
      expect(mockPipelineDel).toHaveBeenCalledWith(`${KEY_PREFIX}:success_count`);
      expect(mockPipelineExec).toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('should return CLOSED when Redis is unavailable', async () => {
      mockGetRedis.mockResolvedValue(null as never);

      const state = await cb.getState();

      expect(state).toBe('CLOSED');
    });

    it('should return correct state from Redis', async () => {
      const testCases: Array<{ stored: string | null; expected: CircuitState }> = [
        { stored: 'OPEN', expected: 'OPEN' },
        { stored: 'HALF_OPEN', expected: 'HALF_OPEN' },
        { stored: 'CLOSED', expected: 'CLOSED' },
        { stored: null, expected: 'CLOSED' },
        { stored: 'INVALID', expected: 'CLOSED' },
      ];

      for (const { stored, expected } of testCases) {
        mockRedisGet.mockResolvedValueOnce(stored);
        const state = await cb.getState();
        expect(state).toBe(expected);
      }
    });
  });
});
