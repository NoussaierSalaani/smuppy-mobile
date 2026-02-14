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
import { sendPushToUser } from '../../api/services/push-notification';
import { SYSTEM_MODERATOR_ID } from './constants';

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
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Count reports in the last hour
    const result = await client.query(
      `SELECT COUNT(*) as cnt FROM post_reports
       WHERE post_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [postId],
    );

    const count = parseInt(result.rows[0]?.cnt || '0', 10) || 0;

    if (count >= 3) {
      // Auto-hide the post (use 'hidden' — distinct from user 'private')
      // Idempotency: only hide if not already hidden/private
      const hideResult = await client.query(
        `UPDATE posts SET visibility = 'hidden' WHERE id = $1 AND visibility NOT IN ('private', 'hidden')
         RETURNING author_id`,
        [postId],
      );

      await client.query('COMMIT');

      log.info('Auto-hid post due to report threshold', { postId, reportCount: count });

      // Send push notification to the post author (non-blocking, fire-and-forget)
      if (hideResult.rows.length > 0) {
        const authorId = hideResult.rows[0].author_id;
        sendPushToUser(db, authorId, {
          title: 'Post Hidden',
          body: 'Your post has been hidden due to multiple reports. You can appeal this decision.',
          data: { type: 'post_hidden', postId },
        }).catch(err => log.error('Push notification failed for post hide', err));
      }

      return {
        action: 'hide_post',
        targetId: postId,
        reason: `Post auto-hidden: ${count} reports in 1 hour`,
      };
    }

    await client.query('COMMIT');
    return { action: 'none', targetId: postId, reason: '' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if a peak should be auto-hidden based on report volume.
 * Call this after inserting a new peak report.
 */
export async function checkPeakEscalation(
  db: Pool,
  peakId: string,
): Promise<EscalationResult> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Count reports in the last hour
    const result = await client.query(
      `SELECT COUNT(*) as cnt FROM peak_reports
       WHERE peak_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [peakId],
    );

    const count = parseInt(result.rows[0]?.cnt || '0', 10) || 0;

    if (count >= 3) {
      // Auto-hide the peak
      const hideResult = await client.query(
        `UPDATE peaks SET visibility = 'hidden' WHERE id = $1 AND visibility != 'hidden'
         RETURNING author_id`,
        [peakId],
      );

      await client.query('COMMIT');

      log.info('Auto-hid peak due to report threshold', { peakId, reportCount: count });

      if (hideResult.rows.length > 0) {
        const authorId = hideResult.rows[0].author_id;
        sendPushToUser(db, authorId, {
          title: 'Peak Hidden',
          body: 'Your peak has been hidden due to multiple reports. You can appeal this decision.',
          data: { type: 'peak_hidden', peakId },
        }).catch(err => log.error('Push notification failed for peak hide', err));
      }

      return {
        action: 'hide_post',
        targetId: peakId,
        reason: `Peak auto-hidden: ${count} reports in 1 hour`,
      };
    }

    await client.query('COMMIT');
    return { action: 'none', targetId: peakId, reason: '' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if a user should be auto-suspended based on report volume.
 * Call this after inserting any report against a user's content.
 */
export async function checkUserEscalation(
  db: Pool,
  targetUserId: string,
): Promise<EscalationResult> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Count unique reports against this user in the last 24h
    // (across all report tables)
    const result24h = await client.query(
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
           WHERE c.user_id = $1 AND cr.created_at > NOW() - INTERVAL '24 hours'
         UNION ALL
         SELECT reporter_id FROM peak_reports pkr
           JOIN peaks pk ON pk.id = pkr.peak_id
           WHERE pk.author_id = $1 AND pkr.created_at > NOW() - INTERVAL '24 hours'
       ) all_reports`,
      [targetUserId],
    );

    const count24h = parseInt(result24h.rows[0]?.cnt || '0', 10) || 0;

    // 5+ unique reporters in 24h → auto-suspend 24h
    if (count24h >= 5) {
      // Idempotency: only suspend if currently active (not already suspended/banned)
      const suspendResult = await client.query(
        `UPDATE profiles
         SET moderation_status = 'suspended',
             suspended_until = NOW() + INTERVAL '24 hours',
             ban_reason = 'Multiple reports received — automatic 24h suspension'
         WHERE id = $1 AND moderation_status = 'active'
         RETURNING id`,
        [targetUserId],
      );

      if (suspendResult.rows.length > 0) {
        // Log in moderation_log with system moderator ID
        await client.query(
          `INSERT INTO moderation_log (moderator_id, action_type, target_user_id, reason)
           VALUES ($1, 'suspend', $2, 'Auto-escalation: 5+ reports in 24h')`,
          [SYSTEM_MODERATOR_ID, targetUserId],
        );

        await client.query('COMMIT');

        log.info('Auto-suspended user due to report threshold', { targetUserId, reportCount: count24h });

        // Send push notification to suspended user (non-blocking, fire-and-forget)
        sendPushToUser(db, targetUserId, {
          title: 'Account Suspended',
          body: 'Your account has been suspended for 24 hours due to multiple reports.',
          data: { type: 'account_suspended' },
        }).catch(err => log.error('Push notification failed for user suspend', err));

        return {
          action: 'suspend_user',
          targetId: targetUserId,
          reason: `User auto-suspended: ${count24h} unique reporters in 24 hours`,
        };
      }
      // Already suspended/banned — fall through to 30d check
    }

    // Count confirmed (resolved) reports in last 30 days
    const result30d = await client.query(
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
           WHERE c.user_id = $1 AND cr.status = 'resolved' AND cr.created_at > NOW() - INTERVAL '30 days'
         UNION ALL
         SELECT id FROM peak_reports pkr
           JOIN peaks pk ON pk.id = pkr.peak_id
           WHERE pk.author_id = $1 AND pkr.status = 'resolved' AND pkr.created_at > NOW() - INTERVAL '30 days'
       ) confirmed_reports`,
      [targetUserId],
    );

    const count30d = parseInt(result30d.rows[0]?.cnt || '0', 10) || 0;

    // 10+ confirmed reports in 30 days → flag for ban
    if (count30d >= 10) {
      log.info('User flagged for ban review', { targetUserId, confirmedReportCount: count30d });

      // Insert moderation_log entry for flag_for_ban
      await client.query(
        `INSERT INTO moderation_log (moderator_id, action_type, target_user_id, reason)
         VALUES ($1, 'flag_for_ban', $2, $3)`,
        [SYSTEM_MODERATOR_ID, targetUserId, `Auto-escalation: ${count30d} confirmed reports in 30 days`],
      );

      await client.query('COMMIT');

      return {
        action: 'flag_for_ban',
        targetId: targetUserId,
        reason: `User flagged for ban: ${count30d} confirmed reports in 30 days`,
      };
    }

    await client.query('COMMIT');
    return { action: 'none', targetId: targetUserId, reason: '' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
