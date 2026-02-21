/**
 * Tests for admin/migrate-data Lambda handler
 * Validates admin key auth, input validation, posts/follows migration
 */

import { makeEvent, createMockDb } from '../helpers';
import type { MockDb } from '../helpers';

// Mock SecretsManager (migrate-data has its own inline getAdminKey)
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ SecretString: 'test-admin-key' }),
  })),
  GetSecretValueCommand: jest.fn(),
}));

// Set required env var before import
process.env.ADMIN_KEY_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:admin-key';

import { handler } from '../../admin/migrate-data';

describe('admin/migrate-data handler', () => {
  let mockDb: MockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
  });

  it('should return 401 when admin key is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({}),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  it('should return 401 when admin key is wrong', async () => {
    const event = makeEvent({
      body: JSON.stringify({ adminKey: 'wrong-key-value' }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('should accept admin key from x-admin-key header', async () => {
    const event = makeEvent({
      headers: { 'x-admin-key': 'test-admin-key' },
      body: JSON.stringify({
        data: {
          posts: [{ authorUsername: 'testuser', content: 'Hello' }],
        },
      }),
    });

    // Profile lookup for username
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] }) // getProfileIdByUsername
      .mockResolvedValueOnce({ rows: [] })                      // INSERT post
      .mockResolvedValueOnce({ rows: [] });                     // UPDATE post counts

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });

  it('should return 400 when no posts or follows provided', async () => {
    const event = makeEvent({
      body: JSON.stringify({ adminKey: 'test-admin-key', data: {} }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('provide data to migrate');
  });

  it('should return 400 when posts batch exceeds 1000', async () => {
    const posts = Array.from({ length: 1001 }, (_, i) => ({
      authorUsername: `user${i}`,
      content: 'Post',
    }));
    const event = makeEvent({
      body: JSON.stringify({ adminKey: 'test-admin-key', data: { posts } }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Maximum 1000 posts');
  });

  it('should return 400 when follows batch exceeds 5000', async () => {
    const follows = Array.from({ length: 5001 }, (_, i) => ({
      followerUsername: `user${i}`,
      followingUsername: `user${i + 1}`,
    }));
    const event = makeEvent({
      body: JSON.stringify({ adminKey: 'test-admin-key', data: { follows } }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Maximum 5000 follows');
  });

  it('should migrate posts successfully and report summary', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'author-1' }] }) // lookup user1
      .mockResolvedValueOnce({ rows: [] })                     // INSERT post 1
      .mockResolvedValueOnce({ rows: [{ id: 'author-2' }] }) // lookup user2
      .mockResolvedValueOnce({ rows: [] })                     // INSERT post 2
      .mockResolvedValueOnce({ rows: [] });                    // UPDATE post counts

    const event = makeEvent({
      body: JSON.stringify({
        adminKey: 'test-admin-key',
        data: {
          posts: [
            { authorUsername: 'user1', content: 'Hello world' },
            { authorUsername: 'user2', content: 'Second post', mediaType: 'image' },
          ],
        },
      }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.summary.posts.imported).toBe(2);
    expect(body.summary.posts.failed).toBe(0);
  });

  it('should report failed posts when author not found', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })  // lookup user not found
      .mockResolvedValueOnce({ rows: [] }); // UPDATE post counts

    const event = makeEvent({
      body: JSON.stringify({
        adminKey: 'test-admin-key',
        data: {
          posts: [{ authorUsername: 'nonexistent', content: 'Hello' }],
        },
      }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.summary.posts.imported).toBe(0);
    expect(body.summary.posts.failed).toBe(1);
    expect(body.errors.posts.length).toBeGreaterThan(0);
  });

  it('should migrate follows and report summary', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'follower-1' }] })  // lookup follower
      .mockResolvedValueOnce({ rows: [{ id: 'following-1' }] }) // lookup following
      .mockResolvedValueOnce({ rows: [] })                       // INSERT follow
      .mockResolvedValueOnce({ rows: [] });                      // UPDATE counts

    const event = makeEvent({
      body: JSON.stringify({
        adminKey: 'test-admin-key',
        data: {
          follows: [
            { followerUsername: 'user1', followingUsername: 'user2', status: 'accepted' },
          ],
        },
      }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.summary.follows.imported).toBe(1);
    expect(body.summary.follows.failed).toBe(0);
  });

  it('should return 500 on unexpected error', async () => {
    // Force JSON.parse to throw by sending invalid body
    const event = makeEvent({
      body: '{{invalid json',
      headers: { 'x-admin-key': 'test-admin-key' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
