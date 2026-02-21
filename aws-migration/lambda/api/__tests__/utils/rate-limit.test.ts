/**
 * Rate Limit Utility Unit Tests
 */

jest.unmock('../../utils/rate-limit');

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  UpdateItemCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

import { checkRateLimit, requireRateLimit } from '../../utils/rate-limit';

beforeEach(() => {
  mockSend.mockReset();
});

describe('Rate Limit Utility', () => {
  describe('checkRateLimit', () => {
    it('should allow when count <= maxRequests', async () => {
      mockSend.mockResolvedValue({
        Attributes: { count: { N: '5' } },
      });

      const result = await checkRateLimit({
        prefix: 'test',
        identifier: 'user-123',
        maxRequests: 10,
      });

      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should block when count > maxRequests and return retryAfter', async () => {
      mockSend.mockResolvedValue({
        Attributes: { count: { N: '11' } },
      });

      const result = await checkRateLimit({
        prefix: 'test',
        identifier: 'user-123',
        maxRequests: 10,
      });

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(typeof result.retryAfter).toBe('number');
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(60);
    });

    it('should use default window (60s) and maxRequests (10)', async () => {
      mockSend.mockResolvedValue({
        Attributes: { count: { N: '10' } },
      });

      const result = await checkRateLimit({
        prefix: 'post-create',
        identifier: 'user-456',
      });

      // count=10 equals maxRequests=10, should be allowed (blocks only when count > maxRequests)
      expect(result.allowed).toBe(true);

      // Verify DynamoDB was called (default params used internally)
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should use custom windowSeconds and maxRequests', async () => {
      mockSend.mockResolvedValue({
        Attributes: { count: { N: '4' } },
      });

      const result = await checkRateLimit({
        prefix: 'upload',
        identifier: 'user-789',
        windowSeconds: 300,
        maxRequests: 3,
      });

      // count=4 > maxRequests=3, should be blocked
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(300);
    });

    it('should fail-closed (default) and block on DynamoDB error', async () => {
      mockSend.mockRejectedValue(new Error('DynamoDB unavailable'));

      const result = await checkRateLimit({
        prefix: 'payment',
        identifier: 'user-123',
      });

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(60);
    });

    it('should fail-open and allow on DynamoDB error when failOpen is true', async () => {
      mockSend.mockRejectedValue(new Error('DynamoDB unavailable'));

      const result = await checkRateLimit({
        prefix: 'feed',
        identifier: 'user-123',
        failOpen: true,
      });

      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should fall back to count=1 when Attributes is undefined', async () => {
      mockSend.mockResolvedValue({
        Attributes: undefined,
      });

      const result = await checkRateLimit({
        prefix: 'test',
        identifier: 'user-123',
        maxRequests: 10,
      });

      // Falls back to parseInt('1', 10) = 1 which is <= 10
      expect(result.allowed).toBe(true);
    });
  });

  describe('requireRateLimit', () => {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://smuppy.com',
    };

    it('should return null when allowed', async () => {
      mockSend.mockResolvedValue({
        Attributes: { count: { N: '1' } },
      });

      const result = await requireRateLimit(
        { prefix: 'test', identifier: 'user-123', maxRequests: 10 },
        headers,
      );

      expect(result).toBeNull();
    });

    it('should return 429 response when blocked', async () => {
      mockSend.mockResolvedValue({
        Attributes: { count: { N: '20' } },
      });

      const result = await requireRateLimit(
        { prefix: 'test', identifier: 'user-123', maxRequests: 10 },
        headers,
      );

      expect(result).not.toBeNull();
      expect(result!.statusCode).toBe(429);
      expect(result!.headers).toEqual(headers);
    });

    it('should include correct error message in body', async () => {
      mockSend.mockResolvedValue({
        Attributes: { count: { N: '20' } },
      });

      const result = await requireRateLimit(
        { prefix: 'test', identifier: 'user-123', maxRequests: 10 },
        headers,
      );

      expect(result).not.toBeNull();
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Too many requests. Please try again later.');
    });
  });
});
