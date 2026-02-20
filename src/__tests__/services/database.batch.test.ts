import { awsAPI } from '../../services/aws-api';
import { awsAuth } from '../../services/aws-auth';
import { hasLikedPostsBatch, hasSavedPostsBatch } from '../../services/database';

jest.mock('../../services/aws-api', () => ({ awsAPI: { request: jest.fn() } }));
jest.mock('../../services/aws-auth', () => ({ awsAuth: { getCurrentUser: jest.fn() } }));

const mockedAwsAPI = awsAPI as unknown as { request: jest.Mock };
const mockedAwsAuth = awsAuth as unknown as { getCurrentUser: jest.Mock };

describe('database batch helpers', () => {
  const postIds = ['p1', 'p2'];

  beforeEach(() => {
    jest.resetAllMocks();
    mockedAwsAuth.getCurrentUser.mockResolvedValue({ id: 'u1' } as never);
  });

  describe('hasLikedPostsBatch', () => {
    it('returns all false when no user', async () => {
      mockedAwsAuth.getCurrentUser.mockResolvedValue(null as never);
      const result = await hasLikedPostsBatch(postIds);
      expect(result.get('p1')).toBe(false);
      expect(result.get('p2')).toBe(false);
    });

    it('returns empty map for empty postIds', async () => {
      const result = await hasLikedPostsBatch([]);
      expect(result.size).toBe(0);
    });

    it('uses API response and defaults missing to false', async () => {
      mockedAwsAPI.request.mockResolvedValue({ likes: { p1: true } } as never);
      const result = await hasLikedPostsBatch(postIds);
      expect(result.get('p1')).toBe(true);
      expect(result.get('p2')).toBe(false);
    });

    it('defaults to false on unexpected shape', async () => {
      mockedAwsAPI.request.mockResolvedValue({ other: true } as never);
      const result = await hasLikedPostsBatch(postIds);
      expect(result.get('p1')).toBe(false);
      expect(result.get('p2')).toBe(false);
    });

    it('defaults to false on error', async () => {
      mockedAwsAPI.request.mockRejectedValue(new Error('boom'));
      const result = await hasLikedPostsBatch(postIds);
      expect(result.get('p1')).toBe(false);
      expect(result.get('p2')).toBe(false);
    });
  });

  describe('hasSavedPostsBatch', () => {
    it('returns all false when no user', async () => {
      mockedAwsAuth.getCurrentUser.mockResolvedValue(null as never);
      const result = await hasSavedPostsBatch(postIds);
      expect(result.get('p1')).toBe(false);
      expect(result.get('p2')).toBe(false);
    });

    it('returns empty map for empty postIds', async () => {
      const result = await hasSavedPostsBatch([]);
      expect(result.size).toBe(0);
    });

    it('uses API response and defaults missing to false', async () => {
      mockedAwsAPI.request.mockResolvedValue({ saves: { p2: true } } as never);
      const result = await hasSavedPostsBatch(postIds);
      expect(result.get('p1')).toBe(false);
      expect(result.get('p2')).toBe(true);
    });

    it('defaults to false on unexpected shape', async () => {
      mockedAwsAPI.request.mockResolvedValue({ other: true } as never);
      const result = await hasSavedPostsBatch(postIds);
      expect(result.get('p1')).toBe(false);
      expect(result.get('p2')).toBe(false);
    });

    it('defaults to false on error', async () => {
      mockedAwsAPI.request.mockRejectedValue(new Error('boom'));
      const result = await hasSavedPostsBatch(postIds);
      expect(result.get('p1')).toBe(false);
      expect(result.get('p2')).toBe(false);
    });
  });
});
jest.mock('@sentry/react-native', () => ({}));
jest.mock('expo-constants', () => ({ default: { manifest: {} } }));
jest.mock('../../config/env', () => ({ ENV: { API_URL: '', STAGE: 'test' } }));
jest.mock('../../lib/sentry', () => ({}));
// Define __DEV__ for modules that rely on it
(global as unknown as { __DEV__: boolean }).__DEV__ = false;
