/**
 * Cognito Helpers Unit Tests
 *
 * Tests shared Cognito utilities:
 * - generateUsername: email to username conversion
 * - getUsernameByEmail: Cognito lookup
 * - resolveUsername: fallback chain
 * - checkUserByEmail: user existence check
 */

// Set required env vars BEFORE importing the module (module-level validation)
process.env.CLIENT_ID = 'test-client-id';
process.env.USER_POOL_ID = 'test-user-pool-id';

// Mock Cognito SDK
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({ send: mockSend })),
  ListUsersCommand: jest.fn((input: unknown) => ({ input })),
}));

import {
  generateUsername,
  getUsernameByEmail,
  resolveUsername,
  checkUserByEmail,
  CLIENT_ID,
  USER_POOL_ID,
} from '../../utils/cognito-helpers';

beforeEach(() => {
  mockSend.mockReset();
});

describe('Cognito Helpers', () => {
  describe('module-level exports', () => {
    it('should export CLIENT_ID from environment', () => {
      expect(CLIENT_ID).toBe('test-client-id');
    });

    it('should export USER_POOL_ID from environment', () => {
      expect(USER_POOL_ID).toBe('test-user-pool-id');
    });
  });

  describe('generateUsername', () => {
    it('should convert email to alphanumeric lowercase username', () => {
      expect(generateUsername('John@Gmail.com')).toBe('johngmailcom');
    });

    it('should strip all special characters', () => {
      expect(generateUsername('user.name+tag@example.co.uk')).toBe('usernametagexamplecouk');
    });

    it('should handle already clean email', () => {
      expect(generateUsername('simple@test.com')).toBe('simpletestcom');
    });

    it('should handle email with numbers', () => {
      expect(generateUsername('user123@test456.com')).toBe('user123test456com');
    });
  });

  describe('getUsernameByEmail', () => {
    it('should return username when user is found', async () => {
      mockSend.mockResolvedValue({
        Users: [{ Username: 'found-user' }],
      });

      const result = await getUsernameByEmail('user@example.com');

      expect(result).toBe('found-user');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return null when no users found', async () => {
      mockSend.mockResolvedValue({ Users: [] });

      const result = await getUsernameByEmail('unknown@example.com');

      expect(result).toBeNull();
    });

    it('should return null when Users array is undefined', async () => {
      mockSend.mockResolvedValue({});

      const result = await getUsernameByEmail('unknown@example.com');

      expect(result).toBeNull();
    });

    it('should return null on Cognito error', async () => {
      mockSend.mockRejectedValue(new Error('Cognito unavailable'));

      const result = await getUsernameByEmail('user@example.com');

      expect(result).toBeNull();
    });

    it('should return null when Username is undefined', async () => {
      mockSend.mockResolvedValue({
        Users: [{ Username: undefined }],
      });

      const result = await getUsernameByEmail('user@example.com');

      expect(result).toBeNull();
    });
  });

  describe('resolveUsername', () => {
    it('should return Cognito lookup result when found', async () => {
      mockSend.mockResolvedValue({
        Users: [{ Username: 'cognito-user' }],
      });

      const result = await resolveUsername('user@example.com', 'client-fallback');

      expect(result).toBe('cognito-user');
    });

    it('should fall back to client username when Cognito lookup fails', async () => {
      mockSend.mockResolvedValue({ Users: [] });

      const result = await resolveUsername('user@example.com', 'client-provided');

      expect(result).toBe('client-provided');
    });

    it('should fall back to generated username when no client username', async () => {
      mockSend.mockResolvedValue({ Users: [] });

      const result = await resolveUsername('user@example.com');

      expect(result).toBe('userexamplecom');
    });

    it('should fall back to generated username when client username is undefined', async () => {
      mockSend.mockResolvedValue({ Users: [] });

      const result = await resolveUsername('test@test.com', undefined);

      expect(result).toBe('testtestcom');
    });
  });

  describe('checkUserByEmail', () => {
    it('should return exists and confirmed for CONFIRMED user', async () => {
      mockSend.mockResolvedValue({
        Users: [{
          Username: 'confirmed-user',
          UserStatus: 'CONFIRMED',
        }],
      });

      const result = await checkUserByEmail('user@example.com');

      expect(result.exists).toBe(true);
      expect(result.confirmed).toBe(true);
      expect(result.username).toBe('confirmed-user');
    });

    it('should return exists but not confirmed for UNCONFIRMED user', async () => {
      mockSend.mockResolvedValue({
        Users: [{
          Username: 'unconfirmed-user',
          UserStatus: 'UNCONFIRMED',
        }],
      });

      const result = await checkUserByEmail('user@example.com');

      expect(result.exists).toBe(true);
      expect(result.confirmed).toBe(false);
      expect(result.username).toBe('unconfirmed-user');
    });

    it('should return exists but not confirmed for FORCE_CHANGE_PASSWORD user', async () => {
      mockSend.mockResolvedValue({
        Users: [{
          Username: 'force-change-user',
          UserStatus: 'FORCE_CHANGE_PASSWORD',
        }],
      });

      const result = await checkUserByEmail('user@example.com');

      expect(result.exists).toBe(true);
      expect(result.confirmed).toBe(false);
    });

    it('should return not exists when no users found', async () => {
      mockSend.mockResolvedValue({ Users: [] });

      const result = await checkUserByEmail('new@example.com');

      expect(result.exists).toBe(false);
      expect(result.confirmed).toBe(false);
      expect(result.username).toBeUndefined();
    });

    it('should return not exists on Cognito error', async () => {
      mockSend.mockRejectedValue(new Error('Service unavailable'));

      const result = await checkUserByEmail('user@example.com');

      expect(result.exists).toBe(false);
      expect(result.confirmed).toBe(false);
    });

    it('should return not exists when Users array is undefined', async () => {
      mockSend.mockResolvedValue({});

      const result = await checkUserByEmail('user@example.com');

      expect(result.exists).toBe(false);
      expect(result.confirmed).toBe(false);
    });
  });
});
