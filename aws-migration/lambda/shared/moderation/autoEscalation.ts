/**
 * Auto-escalation module for content moderation.
 * Checks report thresholds and applies automatic actions.
 *
 * Rules:
 * - 3 reports in 1h on a post → auto-hide the post
 * - 5 reports in 24h on a user → suspend 24h
 * - 10 confirmed reports in 30d on a user → flag for permanent ban review
 *
 * @module shared/moderation/autoEscalation
 */

import { Pool } from 'pg';
import { createLogger } from '../../api/utils/logger';

const log = createLogger('auto-escalation');

export interface EscalationResult {
  [key: string]: unknown;
  action: 'none' | 'hide_post' | 'suspend_user' | 'flag_for_ban';
  targetId: string;
  reason: string;
}

/**
 * Check if a post should be auto-hidden based on report volume.
 * Call this after inserting a new post report.
 */
export async function checkPostEscalation(
  db: Pool,
  postId: string,
): Promise<EscalationResult> {
  // Count reports in the last hour
  const result = await db.query(
    `SELECT COUNT(*) as cnt FROM post_reports
     WHERE post_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [postId],
  );

  const count = parseInt(result.rows[0].cnt, 10);

  if (count >= 3) {
    // Auto-hide the post
    await db.query(
      `UPDATE posts SET visibility = 'private' WHERE id = $1 AND visibility != 'private'`,
      [postId],
    );

    log.info('Auto-hid post due to report threshold', { postId, reportCount: count });

    return {
      action: 'hide_post',
      targetId: postId,
      reason: `Post auto-hidden: ${count} reports in 1 hour`,
    };
  }

  return { action: 'none', targetId: postId, reason: '' };
}

/**
 * Check if a user should be auto-suspended based on report volume.
 * Call this after inserting any report against a user's content.
 */
export async function checkUserEscalation(
  db: Pool,
  targetUserId: string,
): Promise<EscalationResult> {
  // Count unique reports against this user in the last 24h
  // (across all report tables)
  const result24h = await db.query(
    `SELECT COUNT(DISTINCT reporter_id) as cnt FROM (
       SELECT reporter_id FROM post_reports pr
         JOIN posts p ON p.id = pr.post_id
         WHERE p.author_id = $1 AND pr.created_at > NOW() - INTERVAL '24 hours'
       UNION ALL
       SELECT reporter_id FROM user_reports
         WHERE reported_user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
       UNION ALL
       SELECT reporter_id FROM comment_reports cr
         JOIN comments c ON c.id = cr.comment_id
         WHERE c.author_id = $1 AND cr.created_at > NOW() - INTERVAL '24 hours'
     ) all_reports`,
    [targetUserId],
  );

  const count24h = parseInt(result24h.rows[0].cnt, 10);

  // 5+ unique reporters in 24h → auto-suspend 24h
  if (count24h >= 5) {
    // Check if already suspended
    const profileResult = await db.query(
      `SELECT moderation_status FROM profiles WHERE id = $1`,
      [targetUserId],
    );
    const currentStatus = profileResult.rows[0]?.moderation_status;

    if (currentStatus === 'active') {
      await db.query(
        `UPDATE profiles
         SET moderation_status = 'suspended',
             suspended_until = NOW() + INTERVAL '24 hours',
             ban_reason = 'Multiple reports received — automatic 24h suspension'
         WHERE id = $1`,
        [targetUserId],
      );

      // Log in moderation_log (use system moderator ID placeholder)
      await db.query(
        `INSERT INTO moderation_log (moderator_id, action_type, target_user_id, reason)
         VALUES ($1, 'suspend', $1, 'Auto-escalation: 5+ reports in 24h')`,
        [targetUserId],
      );

      log.info('Auto-suspended user due to report threshold', { targetUserId, reportCount: count24h });

      return {
        action: 'suspend_user',
        targetId: targetUserId,
        reason: `User auto-suspended: ${count24h} unique reporters in 24 hours`,
      };
    }
  }

  // Count confirmed (resolved) reports in last 30 days
  const result30d = await db.query(
    `SELECT COUNT(*) as cnt FROM (
       SELECT id FROM post_reports pr
         JOIN posts p ON p.id = pr.post_id
         WHERE p.author_id = $1 AND pr.status = 'resolved' AND pr.created_at > NOW() - INTERVAL '30 days'
       UNION ALL
       SELECT id FROM user_reports
         WHERE reported_user_id = $1 AND status = 'resolved' AND created_at > NOW() - INTERVAL '30 days'
       UNION ALL
       SELECT id FROM comment_reports cr
         JOIN comments c ON c.id = cr.comment_id
         WHERE c.author_id = $1 AND cr.status = 'resolved' AND cr.created_at > NOW() - INTERVAL '30 days'
     ) confirmed_reports`,
    [targetUserId],
  );

  const count30d = parseInt(result30d.rows[0].cnt, 10);

  // 10+ confirmed reports in 30 days → flag for ban
  if (count30d >= 10) {
    log.info('User flagged for ban review', { targetUserId, confirmedReportCount: count30d });

    return {
      action: 'flag_for_ban',
      targetId: targetUserId,
      reason: `User flagged for ban: ${count30d} confirmed reports in 30 days`,
    };
  }

  return { action: 'none', targetId: targetUserId, reason: '' };
}
