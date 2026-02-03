/**
 * Follow User Lambda Handler
 * Creates a follow relationship between users
 * Handles both public and private accounts
 * Enforces 7-day cooldown after 2+ unfollows (anti-spam)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { sendPushToUser } from '../services/push-notification';

const log = createLogger('follows-create');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;

    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const rateLimit = await checkRateLimit({
      prefix: 'follow-create',
      identifier: cognitoSub,
      windowSeconds: 60,
      maxRequests: 10,
    });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const followingId = body.followingId;

    // SECURITY: Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!followingId || !uuidRegex.test(followingId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Valid followingId is required' }),
      };
    }

    const db = await getPool();

    // Resolve the follower's profile ID from cognito_sub
    const followerResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );

    if (followerResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Your profile not found. Please complete onboarding.' }),
      };
    }

    const followerId = followerResult.rows[0].id;

    if (followerId === followingId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Cannot follow yourself' }),
      };
    }

    // Check if target user exists and if they're private
    // NOTE: FOR UPDATE lock is taken inside the transaction below to prevent
    // privacy race condition (user toggles private between check and insert)
    const targetResult = await db.query(
      `SELECT id, is_private FROM profiles WHERE id = $1`,
      [followingId]
    );

    if (targetResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User not found' }),
      };
    }

    const targetUser = targetResult.rows[0];

    // Check for anti-spam cooldown (7 days after 2+ unfollows)
    // Note: This is optional - if the table doesn't exist, skip cooldown check
    try {
      const cooldownResult = await db.query(
        `SELECT unfollow_count, cooldown_until FROM follow_cooldowns
         WHERE follower_id = $1 AND following_id = $2`,
        [followerId, followingId]
      );

      if (cooldownResult.rows.length > 0) {
        const cooldown = cooldownResult.rows[0];
        if (cooldown.cooldown_until && new Date(cooldown.cooldown_until) > new Date()) {
          const cooldownDate = new Date(cooldown.cooldown_until);
          const daysRemaining = Math.ceil((cooldownDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          return {
            statusCode: 429,
            headers,
            body: JSON.stringify({
              success: false,
              message: `You've changed your fan status too many times. Please wait ${daysRemaining} day${daysRemaining > 1 ? 's' : ''} before following this user again.`,
              cooldown: {
                blocked: true,
                until: cooldown.cooldown_until,
                daysRemaining,
              },
            }),
          };
        }
      }
    } catch (cooldownErr) {
      // Table might not exist yet - continue without cooldown check
      log.warn('Cooldown check failed (table may not exist)', cooldownErr);
    }

    // Check if already following, pending, or recently unfollowed (anti-spam)
    const existingResult = await db.query(
      `SELECT id, status, created_at FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [followerId, followingId]
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      if (existing.status === 'accepted') {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            type: 'already_following',
            message: 'Already following this user',
          }),
        };
      } else if (existing.status === 'pending') {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            type: 'already_requested',
            message: 'Follow request already pending',
          }),
        };
      }
      // For other statuses (e.g. rejected/canceled), check cooldown
      const createdAt = new Date(existing.created_at).getTime();
      const cooldownMs = 60 * 1000; // 1 minute cooldown
      if (Date.now() - createdAt < cooldownMs) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Please wait before sending another follow request.',
          }),
        };
      }
      // Remove stale record before creating new one
      await db.query('DELETE FROM follows WHERE id = $1', [existing.id]);
    }

    const followId = uuidv4();

    // Create follow + update counts in a single transaction
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Re-check privacy inside transaction with row lock to prevent TOCTOU race
      const lockedTarget = await client.query(
        `SELECT is_private FROM profiles WHERE id = $1 FOR UPDATE`,
        [followingId]
      );
      const status = lockedTarget.rows[0]?.is_private ? 'pending' : 'accepted';

      await client.query(
        `INSERT INTO follows (id, follower_id, following_id, status, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [followId, followerId, followingId, status]
      );

      // Note: fan_count and following_count are updated automatically by database triggers
      // (see migration-015-counter-triggers-indexes.sql)

      if (status === 'accepted') {
        await client.query(
          `INSERT INTO notifications (id, user_id, type, title, body, data, created_at)
           VALUES ($1, $2, 'new_follower', 'New Follower', 'Someone started following you', $3, NOW())`,
          [uuidv4(), followingId, JSON.stringify({ followerId })]
        );
      } else {
        await client.query(
          `INSERT INTO notifications (id, user_id, type, title, body, data, created_at)
           VALUES ($1, $2, 'follow_request', 'Follow Request', 'Someone wants to follow you', $3, NOW())`,
          [uuidv4(), followingId, JSON.stringify({ requesterId: followerId })]
        );
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Send push notification (non-blocking, best-effort)
    const followerProfile = await db.query(
      'SELECT username, full_name FROM profiles WHERE id = $1',
      [followerId]
    );
    const followerName = followerProfile.rows[0]?.full_name || followerProfile.rows[0]?.username || 'Someone';
    const isPrivate = targetUser.is_private;
    sendPushToUser(db, followingId, {
      title: isPrivate ? 'Follow Request' : 'New Fan!',
      body: isPrivate
        ? `${followerName} wants to follow you`
        : `${followerName} is now your fan`,
      data: {
        type: isPrivate ? 'follow_request' : 'new_follower',
        userId: followerId,
      },
    }).catch(err => log.error('Push notification failed', err));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        type: status === 'accepted' ? 'followed' : 'request_created',
        message: status === 'accepted' ? 'Successfully followed user' : 'Follow request sent',
      }),
    };
  } catch (error: unknown) {
    log.error('Error creating follow', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
