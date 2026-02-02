/**
 * Start Live Stream Lambda Handler
 * Creates a live_streams record and notifies fans/members
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { sendPushToUser } from '../services/push-notification';

const log = createLogger('live-streams-start');

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

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

    // Parse optional title
    const body = event.body ? JSON.parse(event.body) : {};
    const title = body.title ? String(body.title).replace(/<[^>]*>/g, '').substring(0, 100) : 'Live';

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

async function notifyFans(
  db: import('pg').Pool,
  host: { id: string; username: string; display_name: string; avatar_url: string }
): Promise<void> {
  // Get all fans (people who follow this creator)
  const fansResult = await db.query(
    `SELECT f.follower_id
     FROM follows f
     WHERE f.following_id = $1 AND f.status = 'accepted'
     LIMIT 5000`,
    [host.id]
  );

  if (fansResult.rows.length === 0) return;

  const displayName = host.display_name || host.username;

  // Insert in-app notification for each fan
  const fanIds: string[] = fansResult.rows.map((r: { follower_id: string }) => r.follower_id);

  // Batch insert notifications (500 per batch)
  const BATCH_SIZE = 500;
  const notifMessage = `${displayName} is live now!`;
  const notifData = JSON.stringify({ type: 'live', channelName: `live_${host.id}` });

  for (let i = 0; i < fanIds.length; i += BATCH_SIZE) {
    const batch = fanIds.slice(i, i + BATCH_SIZE);
    const placeholders: string[] = [];
    const params: string[] = [];

    for (let j = 0; j < batch.length; j++) {
      const base = j * 5 + 1;
      placeholders.push(`($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      params.push(batch[j], host.id, 'live', notifMessage, notifData);
    }

    await db.query(
      `INSERT INTO notifications (recipient_id, sender_id, type, message, data)
       VALUES ${placeholders.join(', ')}`,
      params
    );
  }

  // Send push notifications (in parallel, max 50 at a time)
  const pushBatchSize = 50;
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
  }
}
