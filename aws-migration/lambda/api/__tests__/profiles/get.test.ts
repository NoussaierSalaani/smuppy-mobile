/**
 * Get Profile Handler Unit Tests
 * Tests validation, happy path, error handling, privacy, and blocked users
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// --- Mocks (MUST be before handler import) ---

const mockQuery = jest.fn();

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn().mockResolvedValue({ query: mockQuery }),
  getReaderPool: jest.fn().mockResolvedValue({ query: mockQuery }),
}));

jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  requireRateLimit: jest.fn().mockResolvedValue(null),
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

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Cache-Control': 'private, max-age=60',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

import { handler } from '../../profiles/get';

// --- Test data ---

const VIEWER_COGNITO_SUB = 'cognito-sub-viewer';
const VIEWER_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TARGET_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TARGET_USERNAME = 'johndoe';

/** A full profile row as returned by the DB query */
function makeProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_PROFILE_ID,
    username: TARGET_USERNAME,
    full_name: 'John Doe',
    display_name: 'Johnny',
    avatar_url: 'https://cdn.smuppy.com/avatars/johndoe.jpg',
    cover_url: 'https://cdn.smuppy.com/covers/johndoe.jpg',
    bio: 'Fitness enthusiast',
    website: 'https://johndoe.com',
    is_verified: false,
    is_premium: false,
    is_private: false,
    account_type: 'personal',
    gender: 'male',
    date_of_birth: '1990-05-15',
    interests: ['fitness', 'yoga'],
    expertise: ['personal_training'],
    social_links: null,
    business_name: null,
    business_category: null,
    business_address: null,
    business_latitude: null,
    business_longitude: null,
    business_phone: null,
    locations_mode: 'single',
    onboarding_completed: true,
    moderation_status: 'active',
    fan_count: 42,
    following_count: 18,
    post_count: 7,
    peak_count: '3',
    ...overrides,
  };
}

// --- Helper ---

function createMockEvent(
  overrides: Partial<{
    pathId: string | undefined;
    pathUsername: string | undefined;
    cognitoSub: string | undefined;
  }> = {}
): APIGatewayProxyEvent {
  const { pathId, pathUsername, cognitoSub } = {
    pathId: undefined,
    pathUsername: undefined,
    cognitoSub: undefined,
    ...overrides,
  };

  return {
    body: null,
    headers: { origin: 'https://smuppy.com' },
    pathParameters: {
      ...(pathId !== undefined ? { id: pathId } : {}),
      ...(pathUsername !== undefined ? { username: pathUsername } : {}),
    },
    requestContext: {
      authorizer: cognitoSub
        ? { claims: { sub: cognitoSub } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  } as unknown as APIGatewayProxyEvent;
}

// --- Tests ---

describe('Get Profile Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // 1. Validation: reject missing / invalid identifiers
  // ----------------------------------------------------------------
  describe('Validation', () => {
    it('should return 400 when neither profileId nor username is provided', async () => {
      const event = createMockEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Profile ID or username is required');
    });

    it('should return 400 for an invalid UUID profileId', async () => {
      const event = createMockEvent({ pathId: 'not-a-valid-uuid' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Invalid profile ID format');
    });

    it('should return 400 for a malformed UUID (SQL injection attempt)', async () => {
      const event = createMockEvent({ pathId: "'; DROP TABLE profiles; --" });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });
  });

  // ----------------------------------------------------------------
  // 2. Profile not found (404)
  // ----------------------------------------------------------------
  describe('Profile not found', () => {
    it('should return 404 when profile is not found by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // profile query

      const event = createMockEvent({ pathId: TARGET_PROFILE_ID });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Profile not found');
    });

    it('should return 404 when profile is not found by username', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // profile query

      const event = createMockEvent({ pathUsername: 'nonexistent_user' });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Profile not found');
    });
  });

  // ----------------------------------------------------------------
  // 3. Happy path: public profile, unauthenticated viewer
  // ----------------------------------------------------------------
  describe('Happy path — public profile, no auth', () => {
    it('should return 200 with full profile data for a public profile', async () => {
      const profileRow = makeProfileRow();
      mockQuery.mockResolvedValueOnce({ rows: [profileRow] }); // profile query

      const event = createMockEvent({ pathId: TARGET_PROFILE_ID });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(TARGET_PROFILE_ID);
      expect(body.username).toBe(TARGET_USERNAME);
      expect(body.fullName).toBe('John Doe');
      expect(body.displayName).toBe('Johnny');
      expect(body.bio).toBe('Fitness enthusiast');
      expect(body.website).toBe('https://johndoe.com');
      expect(body.followersCount).toBe(42);
      expect(body.followingCount).toBe(18);
      expect(body.postsCount).toBe(7);
      expect(body.peaksCount).toBe(3);
      expect(body.isFollowing).toBe(false);
      expect(body.isFollowedBy).toBe(false);
      expect(body.isPrivate).toBe(false);
    });

    it('should return profile by username', async () => {
      const profileRow = makeProfileRow();
      mockQuery.mockResolvedValueOnce({ rows: [profileRow] }); // profile query

      const event = createMockEvent({ pathUsername: TARGET_USERNAME });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.username).toBe(TARGET_USERNAME);

      // Verify the DB was queried with username
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE username = $1'),
        [TARGET_USERNAME]
      );
    });
  });

  // ----------------------------------------------------------------
  // 4. Authenticated viewer — follow status
  // ----------------------------------------------------------------
  describe('Authenticated viewer — follow status', () => {
    it('should return isFollowing=true when viewer follows the target', async () => {
      const profileRow = makeProfileRow();
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })        // profile query
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] }) // resolve viewer
        .mockResolvedValueOnce({ rows: [] })                    // block check
        .mockResolvedValueOnce({                                // follow query
          rows: [
            {
              status: 'accepted',
              follower_id: VIEWER_PROFILE_ID,
              following_id: TARGET_PROFILE_ID,
            },
          ],
        });

      const event = createMockEvent({
        pathId: TARGET_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isFollowing).toBe(true);
      expect(body.isFollowedBy).toBe(false);
    });

    it('should return isFollowedBy=true when target follows the viewer', async () => {
      const profileRow = makeProfileRow();
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })        // profile query
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] }) // resolve viewer
        .mockResolvedValueOnce({ rows: [] })                    // block check
        .mockResolvedValueOnce({                                // follow query
          rows: [
            {
              status: 'accepted',
              follower_id: TARGET_PROFILE_ID,
              following_id: VIEWER_PROFILE_ID,
            },
          ],
        });

      const event = createMockEvent({
        pathId: TARGET_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isFollowing).toBe(false);
      expect(body.isFollowedBy).toBe(true);
    });

    it('should skip follow/block queries when viewing own profile', async () => {
      const profileRow = makeProfileRow({ id: VIEWER_PROFILE_ID });
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })              // profile query
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] }); // resolve viewer (isOwner=true)

      const event = createMockEvent({
        pathId: VIEWER_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      // Only 2 queries: profile + resolve viewer. No block check or follow check.
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should expose dateOfBirth only to the profile owner', async () => {
      const profileRow = makeProfileRow({ id: VIEWER_PROFILE_ID, date_of_birth: '1990-05-15' });
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] });

      const event = createMockEvent({
        pathId: VIEWER_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.dateOfBirth).toBe('1990-05-15');
    });

    it('should NOT expose dateOfBirth to other users', async () => {
      const profileRow = makeProfileRow({ date_of_birth: '1990-05-15' });
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] })
        .mockResolvedValueOnce({ rows: [] })   // block check
        .mockResolvedValueOnce({ rows: [] });  // follow query

      const event = createMockEvent({
        pathId: TARGET_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.dateOfBirth).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // 5. Privacy: private profiles
  // ----------------------------------------------------------------
  describe('Privacy — private profiles', () => {
    it('should return limited data for a private profile when viewer is NOT a follower', async () => {
      const profileRow = makeProfileRow({ is_private: true });
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })              // profile query
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] }) // resolve viewer
        .mockResolvedValueOnce({ rows: [] })                          // block check
        .mockResolvedValueOnce({ rows: [] });                         // follow query (not following)

      const event = createMockEvent({
        pathId: TARGET_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Limited fields present
      expect(body.id).toBe(TARGET_PROFILE_ID);
      expect(body.username).toBe(TARGET_USERNAME);
      expect(body.isPrivate).toBe(true);
      expect(body.followersCount).toBe(42);
      expect(body.followingCount).toBe(18);

      // Full fields hidden
      expect(body.bio).toBeUndefined();
      expect(body.coverUrl).toBeUndefined();
      expect(body.postsCount).toBeUndefined();
      expect(body.website).toBeUndefined();
    });

    it('should return full data for a private profile when viewer IS a follower', async () => {
      const profileRow = makeProfileRow({ is_private: true });
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })              // profile query
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] }) // resolve viewer
        .mockResolvedValueOnce({ rows: [] })                          // block check
        .mockResolvedValueOnce({                                      // follow query — viewer follows target
          rows: [
            {
              status: 'accepted',
              follower_id: VIEWER_PROFILE_ID,
              following_id: TARGET_PROFILE_ID,
            },
          ],
        });

      const event = createMockEvent({
        pathId: TARGET_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Full fields should be present
      expect(body.bio).toBe('Fitness enthusiast');
      expect(body.coverUrl).toBe('https://cdn.smuppy.com/covers/johndoe.jpg');
      expect(body.postsCount).toBe(7);
    });

    it('should return full data for a private profile when viewer is the owner', async () => {
      const profileRow = makeProfileRow({ id: VIEWER_PROFILE_ID, is_private: true });
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] });

      const event = createMockEvent({
        pathId: VIEWER_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.bio).toBe('Fitness enthusiast');
      expect(body.postsCount).toBe(7);
    });

    it('should return limited data for a private profile when viewer is unauthenticated', async () => {
      const profileRow = makeProfileRow({ is_private: true });
      mockQuery.mockResolvedValueOnce({ rows: [profileRow] });

      const event = createMockEvent({ pathId: TARGET_PROFILE_ID });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isPrivate).toBe(true);
      expect(body.bio).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // 6. Blocked users
  // ----------------------------------------------------------------
  describe('Privacy — blocked users', () => {
    it('should return 404 when viewer has blocked the target', async () => {
      const profileRow = makeProfileRow();
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })              // profile query
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] }) // resolve viewer
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });       // block check — blocked!

      const event = createMockEvent({
        pathId: TARGET_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Profile not found');
    });

    it('should return 404 when target has blocked the viewer', async () => {
      const profileRow = makeProfileRow();
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] })
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // block check — bidirectional

      const event = createMockEvent({
        pathId: TARGET_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
    });
  });

  // ----------------------------------------------------------------
  // 7. Moderation status
  // ----------------------------------------------------------------
  describe('Moderation status', () => {
    it('should return 404 for a banned profile', async () => {
      const profileRow = makeProfileRow({ moderation_status: 'banned' });
      mockQuery.mockResolvedValueOnce({ rows: [profileRow] });

      const event = createMockEvent({ pathId: TARGET_PROFILE_ID });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Profile not found');
    });

    it('should return 403 for a suspended profile', async () => {
      const profileRow = makeProfileRow({ moderation_status: 'suspended' });
      mockQuery.mockResolvedValueOnce({ rows: [profileRow] });

      const event = createMockEvent({ pathId: TARGET_PROFILE_ID });
      const response = await handler(event);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('This account has been suspended');
    });
  });

  // ----------------------------------------------------------------
  // 8. Database errors (500)
  // ----------------------------------------------------------------
  describe('Database errors', () => {
    it('should return 500 when the database query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const event = createMockEvent({ pathId: TARGET_PROFILE_ID });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Internal server error');
    });

    it('should return 500 when getPool rejects', async () => {
      const { getPool } = require('../../../shared/db');
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool exhausted'));

      const event = createMockEvent({ pathId: TARGET_PROFILE_ID });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Internal server error');
    });
  });

  // ----------------------------------------------------------------
  // 9. Business phone visibility
  // ----------------------------------------------------------------
  describe('Business phone visibility', () => {
    it('should expose businessPhone for pro_business accounts to any viewer', async () => {
      const profileRow = makeProfileRow({
        account_type: 'pro_business',
        business_phone: '+33612345678',
      });
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] })
        .mockResolvedValueOnce({ rows: [] }) // block check
        .mockResolvedValueOnce({ rows: [] }); // follow query

      const event = createMockEvent({
        pathId: TARGET_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.businessPhone).toBe('+33612345678');
    });

    it('should NOT expose businessPhone for personal accounts to non-owner viewers', async () => {
      const profileRow = makeProfileRow({
        account_type: 'personal',
        business_phone: '+33612345678',
      });
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const event = createMockEvent({
        pathId: TARGET_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.businessPhone).toBeUndefined();
    });

    it('should expose businessPhone to the profile owner regardless of account type', async () => {
      const profileRow = makeProfileRow({
        id: VIEWER_PROFILE_ID,
        account_type: 'personal',
        business_phone: '+33612345678',
      });
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] });

      const event = createMockEvent({
        pathId: VIEWER_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.businessPhone).toBe('+33612345678');
    });
  });

  // ----------------------------------------------------------------
  // 10. Additional edge cases
  // ----------------------------------------------------------------
  describe('Additional edge cases', () => {
    it('should return isFollowing=pending when follow request is pending', async () => {
      const profileRow = makeProfileRow();
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })
        .mockResolvedValueOnce({ rows: [{ id: VIEWER_PROFILE_ID }] })
        .mockResolvedValueOnce({ rows: [] })   // block check
        .mockResolvedValueOnce({               // follow query — pending request
          rows: [
            {
              status: 'pending',
              follower_id: VIEWER_PROFILE_ID,
              following_id: TARGET_PROFILE_ID,
            },
          ],
        });

      const event = createMockEvent({
        pathId: TARGET_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // Pending follows should still show isFollowing as false (not accepted yet)
      expect(body.isFollowing).toBe(false);
    });

    it('should handle viewer profile not found gracefully (treat as unauthenticated)', async () => {
      const profileRow = makeProfileRow();
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow] })  // profile query
        .mockResolvedValueOnce({ rows: [] });            // resolve viewer — not found

      const event = createMockEvent({
        pathId: TARGET_PROFILE_ID,
        cognitoSub: VIEWER_COGNITO_SUB,
      });
      const response = await handler(event);

      // Should still return 200 (treat as unauthenticated)
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isFollowing).toBe(false);
      expect(body.isFollowedBy).toBe(false);
    });

    it('should return null for interests and expertise when they are null', async () => {
      const profileRow = makeProfileRow({ interests: null, expertise: null });
      mockQuery.mockResolvedValueOnce({ rows: [profileRow] });

      const event = createMockEvent({ pathId: TARGET_PROFILE_ID });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // Handler passes through null values from DB directly
      expect(body.interests).toBeNull();
      expect(body.expertise).toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // 11. Business coordinates parsing
  // ----------------------------------------------------------------
  describe('Business coordinates', () => {
    it('should parse business latitude and longitude as floats', async () => {
      const profileRow = makeProfileRow({
        business_latitude: '48.8566',
        business_longitude: '2.3522',
      });
      mockQuery.mockResolvedValueOnce({ rows: [profileRow] });

      const event = createMockEvent({ pathId: TARGET_PROFILE_ID });
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.businessLatitude).toBe(48.8566);
      expect(body.businessLongitude).toBe(2.3522);
    });

    it('should return null for missing business coordinates', async () => {
      const profileRow = makeProfileRow();
      mockQuery.mockResolvedValueOnce({ rows: [profileRow] });

      const event = createMockEvent({ pathId: TARGET_PROFILE_ID });
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.businessLatitude).toBeNull();
      expect(body.businessLongitude).toBeNull();
    });
  });
});
