/**
 * Tests for utils/block-filter
 * Covers: isBidirectionallyBlocked, blockExclusionSQL, muteExclusionSQL
 */

// ── Mocks ──

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

import { Pool, PoolClient } from 'pg';
import { isBidirectionallyBlocked, blockExclusionSQL, muteExclusionSQL } from '../../utils/block-filter';

// ── Constants ──

const USER_A = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const USER_B = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

// ── Test Suite ──

describe('utils/block-filter', () => {
  // ── 1. isBidirectionallyBlocked ──

  describe('isBidirectionallyBlocked', () => {
    it('should return true when user A has blocked user B', async () => {
      const mockDb = {
        query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      };

      const result = await isBidirectionallyBlocked(mockDb as unknown as Pool, USER_A, USER_B);

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('should return true when user B has blocked user A', async () => {
      const mockDb = {
        query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      };

      const result = await isBidirectionallyBlocked(mockDb as unknown as Pool, USER_A, USER_B);

      expect(result).toBe(true);
    });

    it('should return false when no block exists between users', async () => {
      const mockDb = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };

      const result = await isBidirectionallyBlocked(mockDb as unknown as Pool, USER_A, USER_B);

      expect(result).toBe(false);
    });

    it('should pass both user IDs to the SQL query', async () => {
      const mockDb = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };

      await isBidirectionallyBlocked(mockDb as unknown as Pool, USER_A, USER_B);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('blocked_users'),
        [USER_A, USER_B],
      );
    });

    it('should use parameterized queries (not string interpolation)', async () => {
      const mockDb = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };

      await isBidirectionallyBlocked(mockDb as unknown as Pool, USER_A, USER_B);

      const sql = mockDb.query.mock.calls[0][0] as string;
      expect(sql).toContain('$1');
      expect(sql).toContain('$2');
      expect(sql).not.toContain(USER_A);
      expect(sql).not.toContain(USER_B);
    });

    it('should include LIMIT 1 for performance', async () => {
      const mockDb = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };

      await isBidirectionallyBlocked(mockDb as unknown as Pool, USER_A, USER_B);

      const sql = mockDb.query.mock.calls[0][0] as string;
      expect(sql).toContain('LIMIT 1');
    });

    it('should check both directions (blocker_id/blocked_id)', async () => {
      const mockDb = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };

      await isBidirectionallyBlocked(mockDb as unknown as Pool, USER_A, USER_B);

      const sql = mockDb.query.mock.calls[0][0] as string;
      // Should check A->B and B->A
      expect(sql).toContain('blocker_id = $1 AND blocked_id = $2');
      expect(sql).toContain('blocker_id = $2 AND blocked_id = $1');
    });

    it('should propagate database errors', async () => {
      const mockDb = {
        query: jest.fn().mockRejectedValue(new Error('Connection refused')),
      };

      await expect(
        isBidirectionallyBlocked(mockDb as unknown as Pool, USER_A, USER_B),
      ).rejects.toThrow('Connection refused');
    });

    it('should work with a PoolClient as well as a Pool', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      };

      const result = await isBidirectionallyBlocked(mockClient as unknown as PoolClient, USER_A, USER_B);

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledTimes(1);
    });
  });

  // ── 2. blockExclusionSQL ──

  describe('blockExclusionSQL', () => {
    it('should return a NOT EXISTS clause with correct parameter index', () => {
      const sql = blockExclusionSQL(2, 'p.author_id');

      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('blocked_users');
      expect(sql).toContain('$2');
      expect(sql).toContain('p.author_id');
    });

    it('should check both directions (blocker/blocked)', () => {
      const sql = blockExclusionSQL(1, 'c.user_id');

      expect(sql).toContain('bu.blocker_id = $1 AND bu.blocked_id = c.user_id');
      expect(sql).toContain('bu.blocker_id = c.user_id AND bu.blocked_id = $1');
    });

    it('should start with AND for appending to WHERE clauses', () => {
      const sql = blockExclusionSQL(3, 'x.id');

      expect(sql.trim()).toMatch(/^AND/);
    });

    it('should use the correct parameter index for different values', () => {
      const sql1 = blockExclusionSQL(1, 'a.id');
      const sql5 = blockExclusionSQL(5, 'b.id');

      expect(sql1).toContain('$1');
      expect(sql1).not.toContain('$5');
      expect(sql5).toContain('$5');
      expect(sql5).not.toContain('$1');
    });

    it('should use the table alias bu for blocked_users', () => {
      const sql = blockExclusionSQL(1, 'p.id');

      expect(sql).toContain('blocked_users bu');
      expect(sql).toContain('bu.blocker_id');
      expect(sql).toContain('bu.blocked_id');
    });
  });

  // ── 3. muteExclusionSQL ──

  describe('muteExclusionSQL', () => {
    it('should return a NOT EXISTS clause for muted_users', () => {
      const sql = muteExclusionSQL(2, 'p.author_id');

      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('muted_users');
      expect(sql).toContain('$2');
      expect(sql).toContain('p.author_id');
    });

    it('should check muter_id and muted_id correctly', () => {
      const sql = muteExclusionSQL(1, 'c.user_id');

      expect(sql).toContain('muter_id = $1');
      expect(sql).toContain('muted_id = c.user_id');
    });

    it('should start with AND for appending to WHERE clauses', () => {
      const sql = muteExclusionSQL(3, 'x.id');

      expect(sql.trim()).toMatch(/^AND/);
    });

    it('should only check one direction (muter -> muted, not reverse)', () => {
      const sql = muteExclusionSQL(1, 'p.id');

      // Mute is unidirectional — only muter_id = currentUser
      expect(sql).toContain('muter_id = $1');
      expect(sql).not.toContain('muter_id = p.id');
    });

    it('should use the correct parameter index', () => {
      const sql = muteExclusionSQL(4, 'n.sender_id');

      expect(sql).toContain('$4');
      expect(sql).toContain('n.sender_id');
    });
  });
});
