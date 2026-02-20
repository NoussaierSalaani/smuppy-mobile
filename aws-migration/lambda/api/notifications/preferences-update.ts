/**
 * Update Notification Preferences Lambda Handler
 * Persists user's push notification preferences
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { requireRateLimit } from '../utils/rate-limit';
import { withErrorHandler } from '../utils/error-handler';
import { resolveProfileId } from '../utils/auth';

const ALLOWED_KEYS = ['likes', 'comments', 'follows', 'messages', 'mentions', 'live'] as const;
type PrefKey = typeof ALLOWED_KEYS[number];

const KEY_TO_COLUMN: Record<PrefKey, string> = {
  likes: 'likes_enabled',
  comments: 'comments_enabled',
  follows: 'follows_enabled',
  messages: 'messages_enabled',
  mentions: 'mentions_enabled',
  live: 'live_enabled',
};

export const handler = withErrorHandler('notifications-preferences-update', async (event, { headers, log }) => {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const rateLimitResponse = await requireRateLimit({ prefix: 'notif-prefs', identifier: cognitoSub, maxRequests: 10 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid JSON body' }),
      };
    }

    // Validate: only allow known keys with boolean values
    const updates: Partial<Record<PrefKey, boolean>> = {};
    for (const key of ALLOWED_KEYS) {
      if (key in body) {
        if (typeof body[key] !== 'boolean') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: `Field "${key}" must be a boolean` }),
          };
        }
        updates[key] = body[key] as boolean;
      }
    }

    if (Object.keys(updates).length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'No valid preference fields provided' }),
      };
    }

    const db = await getPool();

    const profileId = await resolveProfileId(db, cognitoSub);
    if (!profileId) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    // Build UPSERT query with only the provided fields
    const columns = Object.keys(updates) as PrefKey[];
    const dbColumns = columns.map(k => KEY_TO_COLUMN[k]);

    // INSERT columns: user_id + preference columns
    const insertCols = ['user_id', ...dbColumns];
    const insertPlaceholders = insertCols.map((_, i) => `$${i + 1}`);
    const insertValues = [profileId, ...columns.map(k => updates[k])];

    // ON CONFLICT SET clauses
    const updateSetClauses = dbColumns.map((col, i) => `${col} = $${i + 2}`);
    updateSetClauses.push('updated_at = NOW()');

    const query = `
      INSERT INTO notification_preferences (${insertCols.join(', ')})
      VALUES (${insertPlaceholders.join(', ')})
      ON CONFLICT (user_id) DO UPDATE SET ${updateSetClauses.join(', ')}
      RETURNING likes_enabled, comments_enabled, follows_enabled,
                messages_enabled, mentions_enabled, live_enabled
    `;

    const result = await db.query(query, insertValues);
    const row = result.rows[0];

    const preferences = {
      likes: row.likes_enabled ?? true,
      comments: row.comments_enabled ?? true,
      follows: row.follows_enabled ?? true,
      messages: row.messages_enabled ?? true,
      mentions: row.mentions_enabled ?? true,
      live: row.live_enabled ?? true,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, preferences }),
    };
});
