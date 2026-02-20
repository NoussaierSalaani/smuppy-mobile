/**
 * Peak Comments Lambda Handler
 * GET  /peaks/{id}/comments - List comments on a peak
 * POST /peaks/{id}/comments - Add a comment to a peak
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { sendPushToUser } from '../services/push-notification';
import { sanitizeText, isValidUUID, extractCognitoSub } from '../utils/security';
import { resolveProfileId } from '../utils/auth';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { blockExclusionSQL, isBidirectionallyBlocked } from '../utils/block-filter';
import { moderateText } from '../utils/text-moderation';
import { createLogger } from '../utils/logger';

type Logger = ReturnType<typeof createLogger>;

export const handler = withErrorHandler('peaks-comment', async (event, { headers, log }) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const peakId = event.pathParameters?.id;
  if (!peakId || !isValidUUID(peakId)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Valid Peak ID is required' }),
    };
  }

  if (event.httpMethod === 'GET') {
    return handleListComments(event, headers, peakId);
  }

  if (event.httpMethod === 'POST') {
    return handleCreateComment(event, headers, peakId, log);
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ message: 'Method not allowed' }),
  };
});

async function handleListComments(
  event: APIGatewayProxyEvent,
  headers: Record<string, string>,
  peakId: string
): Promise<APIGatewayProxyResult> {
  const limit = Math.min(Number.parseInt(event.queryStringParameters?.limit || '20'), 50);
  const cursor = event.queryStringParameters?.cursor;

  const pool = await getPool();

  // Resolve requester for shadow-ban self-view
  const cognitoSub = extractCognitoSub(event);
  let currentProfileId: string | null = null;
  if (cognitoSub) {
    currentProfileId = await resolveProfileId(pool, cognitoSub);
  }

  // Verify peak exists
  const peakCheck = await pool.query('SELECT id FROM peaks WHERE id = $1', [peakId]);
  if (peakCheck.rows.length === 0) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ message: 'Peak not found' }),
    };
  }

  let query: string;
  let params: (string | number | null)[];

  if (cursor) {
    if (!isValidUUID(cursor)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid cursor format' }),
      };
    }
    query = `
      SELECT pc.id, pc.text, pc.created_at,
             p.id as author_id, p.username, p.full_name, p.avatar_url, p.is_verified,
             p.account_type, p.business_name
      FROM peak_comments pc
      JOIN profiles p ON pc.user_id = p.id
      WHERE pc.peak_id = $1
        AND pc.created_at < (SELECT created_at FROM peak_comments WHERE id = $2)
        AND (p.moderation_status NOT IN ('banned', 'shadow_banned') OR pc.user_id = $4)
        ${blockExclusionSQL(4, 'pc.user_id')}
      ORDER BY pc.created_at DESC
      LIMIT $3
    `;
    params = [peakId, cursor, limit, currentProfileId];
  } else {
    query = `
      SELECT pc.id, pc.text, pc.created_at,
             p.id as author_id, p.username, p.full_name, p.avatar_url, p.is_verified,
             p.account_type, p.business_name
      FROM peak_comments pc
      JOIN profiles p ON pc.user_id = p.id
      WHERE pc.peak_id = $1
        AND (p.moderation_status NOT IN ('banned', 'shadow_banned') OR pc.user_id = $3)
        ${blockExclusionSQL(3, 'pc.user_id')}
      ORDER BY pc.created_at DESC
      LIMIT $2
    `;
    params = [peakId, limit, currentProfileId];
  }

  const result = await pool.query(query, params);

  const comments = result.rows.map((row: Record<string, unknown>) => ({
    id: row.id,
    text: row.text,
    createdAt: row.created_at,
    author: {
      id: row.author_id,
      username: row.username,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      isVerified: row.is_verified || false,
      accountType: row.account_type || 'personal',
      businessName: row.business_name || null,
    },
  }));

  const nextCursor = comments.length === limit ? comments[comments.length - 1].id : null;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      data: comments,
      nextCursor,
      hasMore: comments.length === limit,
    }),
  };
}

async function handleCreateComment(
  event: APIGatewayProxyEvent,
  headers: Record<string, string>,
  peakId: string,
  log: Logger
): Promise<APIGatewayProxyResult> {
  const userId = extractCognitoSub(event);
  if (!userId) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
  }

  // Account status check (suspended/banned users cannot comment)
  const accountCheck = await requireActiveAccount(userId, headers);
  if (isAccountError(accountCheck)) return accountCheck;

  // Rate limit: 20 comments per minute
  const rateLimitResponse = await requireRateLimit({
    prefix: 'peak-comment',
    identifier: userId,
    windowSeconds: RATE_WINDOW_1_MIN,
    maxRequests: 20,
  }, headers);
  if (rateLimitResponse) return rateLimitResponse;

  const body = event.body ? JSON.parse(event.body) : {};
  const { text } = body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Comment text is required' }),
    };
  }

  const sanitizedText = sanitizeText(text, 1000);
  if (sanitizedText.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Comment text cannot be empty' }),
    };
  }

  // Moderation: keyword filter + Comprehend toxicity
  const modResult = await moderateText(sanitizedText, headers, log, 'peak comment');
  if (modResult.blocked) return modResult.blockResponse!;

  const db = await getPool();

  const userResult = await db.query(
    'SELECT id, username, full_name, avatar_url, is_verified, account_type, business_name FROM profiles WHERE cognito_sub = $1',
    [userId]
  );
  if (userResult.rows.length === 0) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ message: 'User profile not found' }),
    };
  }
  const profile = userResult.rows[0];

  const peakResult = await db.query(
    'SELECT id, author_id FROM peaks WHERE id = $1',
    [peakId]
  );
  if (peakResult.rows.length === 0) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ message: 'Peak not found' }),
    };
  }
  const peak = peakResult.rows[0];

  // Bidirectional block check: prevent commenting on peaks from blocked/blocking users
  if (await isBidirectionallyBlocked(db, profile.id, peak.author_id)) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ message: 'Action not allowed' }),
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const commentResult = await client.query(
      `INSERT INTO peak_comments (user_id, peak_id, text)
       VALUES ($1, $2, $3)
       RETURNING id, text, created_at`,
      [profile.id, peakId, sanitizedText]
    );
    const comment = commentResult.rows[0];

    await client.query(
      'UPDATE peaks SET comments_count = comments_count + 1 WHERE id = $1',
      [peakId]
    );

    if (peak.author_id !== profile.id) {
      const idempotencyKey = `peak_comment:${profile.id}:${comment.id}`;
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data, idempotency_key)
         VALUES ($1, 'peak_comment', 'New Comment', $2, $3, $4)
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
        [
          peak.author_id,
          `${profile.full_name || 'Someone'} commented on your peak`,
          JSON.stringify({ peakId, commentId: comment.id, commenterId: profile.id }),
          idempotencyKey,
        ]
      );
    }

    await client.query('COMMIT');

    if (peak.author_id !== profile.id) {
      sendPushToUser(db, peak.author_id, {
        title: 'New Comment',
        body: `${profile.full_name || 'Someone'} commented on your peak`,
        data: { type: 'peak_comment', peakId },
      }, profile.id).catch(err => log.error('Push notification failed', err));
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        comment: {
          id: comment.id,
          text: comment.text,
          createdAt: comment.created_at,
          author: {
            id: profile.id,
            username: profile.username,
            fullName: profile.full_name,
            avatarUrl: profile.avatar_url,
            isVerified: profile.is_verified || false,
            accountType: profile.account_type || 'personal',
            businessName: profile.business_name || null,
          },
        },
      }),
    };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
