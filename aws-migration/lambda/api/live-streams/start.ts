/**
 * Start Live Stream Lambda Handler
 * Creates a live_streams record and notifies fans/members
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { sendPushToUser } from '../services/push-notification';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';

const log = createLogger('live-streams-start');

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    // Account status check (suspended/banned users cannot go live)
    const accountCheck = await requireActiveAccount(cognitoSub, headers);
    if (isAccountError(accountCheck)) return accountCheck;

    const db = await getPool();

    // Get profile
    const profileResult = await db.query(
      'SELECT id, username, display_name, avatar_url, account_type FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );
    if (profileResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }

    const profile = profileResult.rows[0];

    // Only pro_creator can go live
    if (profile.account_type !== 'pro_creator') {
      return { statusCode: 403, headers, body: JSON.stringify({ message: 'Only creators can go live' }) };
    }

    // Check no active stream already
    const activeCheck = await db.query(
      "SELECT id FROM live_streams WHERE host_id = $1 AND status = 'live'",
      [profile.id]
    );
    if (activeCheck.rows.length > 0) {
      return { statusCode: 409, headers, body: JSON.stringify({ message: 'You already have an active live stream' }) };
    }

    // Parse optional title (sanitize: strip HTML + control chars)
    const body = event.body ? JSON.parse(event.body) : {};
    const title = body.title
      ? String(body.title).replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().substring(0, 100)
      : 'Live';

    // Moderation: check title for violations (skip default 'Live' title)
    if (title !== 'Live') {
      const filterResult = await filterText(title);
      if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
        log.warn('Live stream title blocked by filter', { userId: cognitoSub.substring(0, 8) + '***' });
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Your title contains content that violates our community guidelines.' }) };
      }
      const toxicityResult = await analyzeTextToxicity(title);
      if (toxicityResult.action === 'block') {
        log.warn('Live stream title blocked by toxicity', { userId: cognitoSub.substring(0, 8) + '***' });
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Your title contains content that violates our community guidelines.' }) };
      }
    }

    const channelName = `live_${profile.id}`;

    // Create live_streams record
    const insertResult = await db.query(
      `INSERT INTO live_streams (host_id, channel_name, title, status, started_at)
       VALUES ($1, $2, $3, 'live', NOW())
       RETURNING id, channel_name, title, started_at`,
      [profile.id, channelName, title]
    );

    const stream = insertResult.rows[0];

    // Notify fans (followers with status = 'accepted') — fire and forget
    notifyFans(db, profile).catch(err => log.error('Failed to notify fans', err));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          id: stream.id,
          channelName: stream.channel_name,
          title: stream.title,
          startedAt: stream.started_at,
        },
      }),
    };
  } catch (error) {
    log.error('Error starting live stream', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
};

/**
 * Helper to pause execution for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function notifyFans(
  db: import('pg').Pool,
  host: { id: string; username: string; display_name: string; avatar_url: string }
): Promise<void> {
  // Get all fans who follow this creator AND have live notifications enabled
  // Per CLAUDE.md: respect notification preferences
  const fansResult = await db.query(
    `SELECT f.follower_id
     FROM follows f
     LEFT JOIN notification_preferences np ON np.user_id = f.follower_id
     WHERE f.following_id = $1
       AND f.status = 'accepted'
       AND (np.live_enabled IS NULL OR np.live_enabled = true)
     LIMIT 5000`,
    [host.id]
  );

  if (fansResult.rows.length === 0) return;

  const displayName = host.display_name || 'Someone';

  // Insert in-app notification for each fan
  const fanIds: string[] = fansResult.rows.map((r: { follower_id: string }) => r.follower_id);

  // Batch insert notifications (500 per batch)
  const BATCH_SIZE = 500;
  const notifTitle = 'Live Stream';
  const notifBody = `${displayName} is live now!`;
  const notifData = JSON.stringify({ type: 'live', channelName: `live_${host.id}`, senderId: host.id });

  for (let i = 0; i < fanIds.length; i += BATCH_SIZE) {
    const batch = fanIds.slice(i, i + BATCH_SIZE);
    const placeholders: string[] = [];
    const params: string[] = [];

    for (let j = 0; j < batch.length; j++) {
      const base = j * 5 + 1;
      placeholders.push(`($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      params.push(batch[j], 'live', notifTitle, notifBody, notifData);
    }

    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ${placeholders.join(', ')}`,
      params
    );
  }

  // Send push notifications with rate limiting (max 50 at a time, 100ms delay between batches)
  // Per CLAUDE.md: rate limit operations that cost money (push notifications)
  const pushBatchSize = 50;
  const PUSH_BATCH_DELAY_MS = 100; // Rate limit: ~500 notifications/second max

  for (let i = 0; i < fanIds.length; i += pushBatchSize) {
    const batch = fanIds.slice(i, i + pushBatchSize);
    await Promise.all(
      batch.map(fanId =>
        sendPushToUser(db, fanId, {
          title: `${displayName} is live!`,
          body: 'Tap to join the live stream',
          data: {
            type: 'live',
            channelName: `live_${host.id}`,
            hostId: host.id,
          },
        }).catch(() => {})
      )
    );

    // Rate limit between batches to prevent notification service exhaustion
    if (i + pushBatchSize < fanIds.length) {
      await sleep(PUSH_BATCH_DELAY_MS);
    }
  }
}
