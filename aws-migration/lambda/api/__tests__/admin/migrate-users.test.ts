/**
 * Tests for admin/migrate-users Lambda handler
 * Validates admin key auth, input validation, Cognito+Aurora user migration
 */

import { makeEvent, createMockDb } from '../helpers';
import type { MockDb } from '../helpers';

// Mock SecretsManager (migrate-users has its own inline getAdminKey)
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ SecretString: 'test-admin-key' }),
  })),
  GetSecretValueCommand: jest.fn(),
}));

// Mock Cognito client
const mockCognitoSend = jest.fn();
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: mockCognitoSend,
  })),
  AdminCreateUserCommand: jest.fn(),
  AdminSetUserPasswordCommand: jest.fn(),
}));

// Set required env vars before import
process.env.ADMIN_KEY_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:admin-key';
process.env.USER_POOL_ID = 'us-east-1_testPool';

import { handler } from '../../admin/migrate-users';

describe('admin/migrate-users handler', () => {
  let mockDb: MockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();

    // Default: Cognito create user returns a sub, no password set needed
    mockCognitoSend.mockResolvedValue({
      User: {
        Attributes: [{ Name: 'sub', Value: 'cognito-sub-12345' }],
      },
    });
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
      body: JSON.stringify({ adminKey: 'wrong-key-longer' }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('should return 400 when users array is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ adminKey: 'test-admin-key' }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('array of users');
  });

  it('should return 400 when users is empty array', async () => {
    const event = makeEvent({
      body: JSON.stringify({ adminKey: 'test-admin-key', users: [] }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 when users batch exceeds 100', async () => {
    const users = Array.from({ length: 101 }, (_, i) => ({
      email: `user${i}@example.com`,
      username: `user${i}`,
    }));
    const event = makeEvent({
      body: JSON.stringify({ adminKey: 'test-admin-key', users }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Maximum 100 users');
  });

  it('should migrate a user successfully (Cognito + Aurora)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'profile-uuid-1' }] });

    const event = makeEvent({
      body: JSON.stringify({
        adminKey: 'test-admin-key',
        users: [
          { email: 'john@example.com', username: 'johndoe', fullName: 'John Doe' },
        ],
      }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.summary.total).toBe(1);
    expect(body.summary.successful).toBe(1);
    expect(body.summary.failed).toBe(0);
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].cognitoSub).toBe('cognito-sub-12345');
    expect(body.results[0].profileId).toBe('profile-uuid-1');
  });

  it('should set password when provided', async () => {
    // First call: AdminCreateUserCommand -> returns sub
    // Second call: AdminSetUserPasswordCommand -> succeeds
    mockCognitoSend
      .mockResolvedValueOnce({
        User: { Attributes: [{ Name: 'sub', Value: 'sub-with-pwd' }] },
      })
      .mockResolvedValueOnce({}); // set password response

    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'profile-uuid-2' }] });

    const event = makeEvent({
      body: JSON.stringify({
        adminKey: 'test-admin-key',
        users: [
          { email: 'jane@example.com', username: 'janedoe', password: 'Str0ngP@ss!' },
        ],
      }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(mockCognitoSend).toHaveBeenCalledTimes(2);
  });

  it('should report failure when Cognito creation fails', async () => {
    mockCognitoSend.mockRejectedValueOnce(new Error('UsernameExistsException'));

    const event = makeEvent({
      body: JSON.stringify({
        adminKey: 'test-admin-key',
        users: [
          { email: 'existing@example.com', username: 'existing_user' },
        ],
      }),
      headers: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.summary.successful).toBe(0);
    expect(body.summary.failed).toBe(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toBe('Migration failed for this user');
  });

  it('should accept admin key from x-admin-key header', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'profile-uuid-3' }] });

    const event = makeEvent({
      headers: { 'x-admin-key': 'test-admin-key' },
      body: JSON.stringify({
        users: [{ email: 'header@example.com', username: 'headeruser' }],
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });

  it('should return 500 on unexpected error', async () => {
    const event = makeEvent({
      body: '{{invalid json',
      headers: { 'x-admin-key': 'test-admin-key' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
