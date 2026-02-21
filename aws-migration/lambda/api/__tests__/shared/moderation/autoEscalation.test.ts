/**
 * Tests for shared/moderation/autoEscalation module
 * Tests exported functions: checkPostEscalation, checkPeakEscalation, checkUserEscalation
 * All three use transactions (BEGIN/COMMIT/ROLLBACK) with client.release() in finally.
 *
 * Rules:
 * - 3 reports in 1h on a post/peak -> auto-hide
 * - 5 unique reporters in 24h on a user -> suspend 24h
 * - 10 confirmed reports in 30d on a user -> flag for ban
 */

// ── Mocks (must be before handler import -- Jest hoists jest.mock calls) ──

jest.mock('../../../../api/services/push-notification', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../../shared/moderation/constants', () => ({
  SYSTEM_MODERATOR_ID: 'system-moderator-uuid',
}));

jest.mock('../../../../api/utils/logger', () => ({
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

// ── Import AFTER all mocks are declared ──

import { Pool } from 'pg';
import {
  checkPostEscalation,
  checkPeakEscalation,
  checkUserEscalation,
} from '../../../../shared/moderation/autoEscalation';
import { sendPushToUser } from '../../../../api/services/push-notification';

// ── Test helpers ──

const mockSendPushToUser = sendPushToUser as jest.MockedFunction<typeof sendPushToUser>;

function createMockClient() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
}

function createMockDb(client: ReturnType<typeof createMockClient>) {
  return {
    connect: jest.fn().mockResolvedValue(client),
  } as unknown as Pool;
}

// ── Test constants ──

const POST_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PEAK_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const USER_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Test suite ──

describe('autoEscalation', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let mockDb: Pool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockClient();
    mockDb = createMockDb(mockClient);
  });

  // ── checkPostEscalation ──

  describe('checkPostEscalation', () => {
    it('returns "none" when report count < 3', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('COUNT(*)') && sql.includes('post_reports')) {
          return { rows: [{ cnt: '2' }] };
        }
        return { rows: [] };
      });

      const result = await checkPostEscalation(mockDb, POST_ID);

      expect(result.action).toBe('none');
      expect(result.targetId).toBe(POST_ID);
      expect(result.reason).toBe('');
    });

    it('returns "hide_post" when report count >= 3 and post is not already hidden', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('COUNT(*)') && sql.includes('post_reports')) {
          return { rows: [{ cnt: '5' }] };
        }
        if (sql.includes('UPDATE posts')) {
          return { rows: [{ author_id: 'author-123' }] };
        }
        return { rows: [] };
      });

      const result = await checkPostEscalation(mockDb, POST_ID);

      expect(result.action).toBe('hide_post');
      expect(result.targetId).toBe(POST_ID);
      expect(result.reason).toContain('5 reports in 1 hour');
    });

    it('sends push notification when post is hidden', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('COUNT(*)') && sql.includes('post_reports')) {
          return { rows: [{ cnt: '3' }] };
        }
        if (sql.includes('UPDATE posts')) {
          return { rows: [{ author_id: 'author-456' }] };
        }
        return { rows: [] };
      });

      await checkPostEscalation(mockDb, POST_ID);

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        mockDb,
        'author-456',
        expect.objectContaining({
          title: 'Post Hidden',
          body: expect.stringContaining('hidden due to multiple reports'),
          data: expect.objectContaining({ type: 'post_hidden', postId: POST_ID }),
        }),
      );
    });

    it('skips push when post was already hidden (RETURNING returns 0 rows)', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('COUNT(*)') && sql.includes('post_reports')) {
          return { rows: [{ cnt: '4' }] };
        }
        if (sql.includes('UPDATE posts')) {
          // Post was already hidden, so RETURNING gives 0 rows
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await checkPostEscalation(mockDb, POST_ID);

      expect(result.action).toBe('hide_post');
      expect(mockSendPushToUser).not.toHaveBeenCalled();
    });

    it('rolls back transaction on error and re-throws', async () => {
      const dbError = new Error('DB connection lost');

      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
        if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
        if (sql.includes('COUNT(*)')) throw dbError;
        return Promise.resolve({ rows: [] });
      });

      await expect(checkPostEscalation(mockDb, POST_ID)).rejects.toThrow('DB connection lost');

      // Verify ROLLBACK was called
      const rollbackCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) => call[0] === 'ROLLBACK',
      );
      expect(rollbackCalls).toHaveLength(1);

      // Verify client was released in finally
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ── checkPeakEscalation ──

  describe('checkPeakEscalation', () => {
    it('returns "none" when report count < 3', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('COUNT(*)') && sql.includes('peak_reports')) {
          return { rows: [{ cnt: '1' }] };
        }
        return { rows: [] };
      });

      const result = await checkPeakEscalation(mockDb, PEAK_ID);

      expect(result.action).toBe('none');
      expect(result.targetId).toBe(PEAK_ID);
      expect(result.reason).toBe('');
    });

    it('returns "hide_post" when report count >= 3', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('COUNT(*)') && sql.includes('peak_reports')) {
          return { rows: [{ cnt: '6' }] };
        }
        if (sql.includes('UPDATE peaks')) {
          return { rows: [{ author_id: 'peak-author-789' }] };
        }
        return { rows: [] };
      });

      const result = await checkPeakEscalation(mockDb, PEAK_ID);

      expect(result.action).toBe('hide_post');
      expect(result.targetId).toBe(PEAK_ID);
      expect(result.reason).toContain('6 reports in 1 hour');
    });
  });

  // ── checkUserEscalation ──

  describe('checkUserEscalation', () => {
    it('returns "none" when report counts below thresholds', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        // 24h unique reporters count
        if (sql.includes('COUNT(DISTINCT reporter_id)')) {
          return { rows: [{ cnt: '2' }] };
        }
        // 30d confirmed reports count
        if (sql.includes('COUNT(*)') && sql.includes('resolved')) {
          return { rows: [{ cnt: '3' }] };
        }
        return { rows: [] };
      });

      const result = await checkUserEscalation(mockDb, USER_ID);

      expect(result.action).toBe('none');
      expect(result.targetId).toBe(USER_ID);
      expect(result.reason).toBe('');
    });

    it('returns "suspend_user" when 5+ unique reporters in 24h', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        // 24h unique reporters count
        if (sql.includes('COUNT(DISTINCT reporter_id)')) {
          return { rows: [{ cnt: '7' }] };
        }
        // UPDATE profiles to suspend
        if (sql.includes('UPDATE profiles')) {
          return { rows: [{ id: USER_ID }] };
        }
        // INSERT moderation_log
        if (sql.includes('INSERT INTO moderation_log')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await checkUserEscalation(mockDb, USER_ID);

      expect(result.action).toBe('suspend_user');
      expect(result.targetId).toBe(USER_ID);
      expect(result.reason).toContain('7 unique reporters in 24 hours');
    });

    it('logs moderation action when suspending user', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('COUNT(DISTINCT reporter_id)')) {
          return { rows: [{ cnt: '5' }] };
        }
        if (sql.includes('UPDATE profiles')) {
          return { rows: [{ id: USER_ID }] };
        }
        if (sql.includes('INSERT INTO moderation_log')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await checkUserEscalation(mockDb, USER_ID);

      // Verify moderation_log INSERT was called with system moderator ID and target user
      const moderationLogCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO moderation_log'),
      );
      expect(moderationLogCalls).toHaveLength(1);
      expect(moderationLogCalls[0][1]).toEqual(['system-moderator-uuid', USER_ID]);
    });

    it('returns "flag_for_ban" when 10+ confirmed reports in 30 days', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        // 24h count: below 5 to skip suspension path
        if (sql.includes('COUNT(DISTINCT reporter_id)')) {
          return { rows: [{ cnt: '3' }] };
        }
        // 30d confirmed reports count: at threshold
        if (sql.includes('COUNT(*)') && sql.includes('resolved')) {
          return { rows: [{ cnt: '12' }] };
        }
        // INSERT moderation_log for flag_for_ban
        if (sql.includes('INSERT INTO moderation_log')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await checkUserEscalation(mockDb, USER_ID);

      expect(result.action).toBe('flag_for_ban');
      expect(result.targetId).toBe(USER_ID);
      expect(result.reason).toContain('12 confirmed reports in 30 days');
    });

    it('always releases client in finally block (even on error)', async () => {
      const dbError = new Error('Unexpected DB failure');

      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
        if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
        if (sql.includes('COUNT(DISTINCT reporter_id)')) throw dbError;
        return Promise.resolve({ rows: [] });
      });

      await expect(checkUserEscalation(mockDb, USER_ID)).rejects.toThrow(
        'Unexpected DB failure',
      );

      // Verify client.release() is always called, even after error
      expect(mockClient.release).toHaveBeenCalledTimes(1);

      // Verify ROLLBACK was attempted
      const rollbackCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) => call[0] === 'ROLLBACK',
      );
      expect(rollbackCalls).toHaveLength(1);
    });
  });
});
