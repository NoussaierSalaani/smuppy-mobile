/**
 * Auth Utils Unit Tests
 *
 * Tests authentication extraction from API Gateway events:
 * - getUserFromEvent: extract Cognito claims
 * - requireUser: throw on missing auth
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getUserFromEvent, requireUser, resolveProfileId, checkPrivacyAccess } from '../../utils/auth';

// Helper to create a mock API Gateway event with optional auth claims
function createMockEvent(claims?: Record<string, string>): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/test',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test',
      authorizer: claims ? { claims } : null,
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {} as never,
      path: '/test',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/test',
    },
    resource: '/test',
  };
}

describe('Auth Utils', () => {
  describe('getUserFromEvent', () => {
    it('should return null when no authorizer is present', () => {
      const event = createMockEvent();
      const user = getUserFromEvent(event);

      expect(user).toBeNull();
    });

    it('should return null when claims have no sub', () => {
      const event = createMockEvent({ email: 'test@example.com' });
      const user = getUserFromEvent(event);

      expect(user).toBeNull();
    });

    it('should extract user from valid Cognito claims', () => {
      const event = createMockEvent({
        sub: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@example.com',
        'cognito:username': 'testuser',
      });

      const user = getUserFromEvent(event);

      expect(user).not.toBeNull();
      expect(user!.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(user!.sub).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(user!.email).toBe('user@example.com');
      expect(user!.username).toBe('testuser');
    });

    it('should fallback to username when cognito:username is missing', () => {
      const event = createMockEvent({
        sub: '550e8400-e29b-41d4-a716-446655440000',
        username: 'fallbackuser',
      });

      const user = getUserFromEvent(event);

      expect(user).not.toBeNull();
      expect(user!.username).toBe('fallbackuser');
    });

    it('should handle missing optional fields', () => {
      const event = createMockEvent({
        sub: '550e8400-e29b-41d4-a716-446655440000',
      });

      const user = getUserFromEvent(event);

      expect(user).not.toBeNull();
      expect(user!.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(user!.email).toBeUndefined();
      expect(user!.username).toBeUndefined();
    });
  });

  describe('requireUser', () => {
    it('should throw Error when no user is authenticated', () => {
      const event = createMockEvent();

      expect(() => requireUser(event)).toThrow('Unauthorized');
    });

    it('should throw Error when claims have no sub', () => {
      const event = createMockEvent({ email: 'noauth@example.com' });

      expect(() => requireUser(event)).toThrow('Unauthorized');
    });

    it('should return user when authenticated', () => {
      const event = createMockEvent({
        sub: '550e8400-e29b-41d4-a716-446655440000',
        email: 'valid@example.com',
        'cognito:username': 'validuser',
      });

      const user = requireUser(event);

      expect(user.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(user.email).toBe('valid@example.com');
    });
  });

  describe('resolveProfileId', () => {
    let mockDb: { query: jest.Mock };

    beforeEach(() => {
      mockDb = { query: jest.fn() };
    });

    it('should return profile ID when found', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ id: 'profile-uuid-123' }],
      });

      const result = await resolveProfileId(mockDb as never, 'cognito-sub-abc');

      expect(result).toBe('profile-uuid-123');
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        ['cognito-sub-abc'],
      );
    });

    it('should return null when profile not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await resolveProfileId(mockDb as never, 'nonexistent-sub');

      expect(result).toBeNull();
    });

    it('should propagate database errors', async () => {
      mockDb.query.mockRejectedValue(new Error('Connection refused'));

      await expect(resolveProfileId(mockDb as never, 'sub-123'))
        .rejects.toThrow('Connection refused');
    });
  });

  describe('checkPrivacyAccess', () => {
    let mockDb: { query: jest.Mock };

    beforeEach(() => {
      mockDb = { query: jest.fn() };
    });

    it('should return false when cognitoSub is undefined', async () => {
      const result = await checkPrivacyAccess(mockDb as never, 'profile-1', undefined);

      expect(result).toBe(false);
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should return false when requester profile not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await checkPrivacyAccess(mockDb as never, 'profile-1', 'unknown-sub');

      expect(result).toBe(false);
    });

    it('should return true when requester is the profile owner', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'profile-owner-id' }],
      });

      const result = await checkPrivacyAccess(mockDb as never, 'profile-owner-id', 'owner-sub');

      expect(result).toBe(true);
      // Should only call resolveProfileId, not the follow check
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('should return true when requester is an accepted follower', async () => {
      // First call: resolveProfileId
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'requester-id' }],
      });
      // Second call: follow check
      mockDb.query.mockResolvedValueOnce({
        rows: [{ is_follower: true }],
      });

      const result = await checkPrivacyAccess(mockDb as never, 'target-profile-id', 'requester-sub');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should return false when requester is not a follower', async () => {
      // First call: resolveProfileId
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'requester-id' }],
      });
      // Second call: follow check
      mockDb.query.mockResolvedValueOnce({
        rows: [{ is_follower: false }],
      });

      const result = await checkPrivacyAccess(mockDb as never, 'target-profile-id', 'requester-sub');

      expect(result).toBe(false);
    });
  });
});
