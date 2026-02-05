/**
 * Tips History Lambda Handler
 * Get sent/received tips history
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getReaderPool, SqlParam } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('tips-history');

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getReaderPool();
  const client = await pool.connect();

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    // Resolve cognito_sub to profile.id
    const profileResult = await client.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );
    if (profileResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      });
    }
    const profileId = profileResult.rows[0].id;

    const type = event.queryStringParameters?.type || 'received'; // 'sent' or 'received'
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
    const offset = parseInt(event.queryStringParameters?.offset || '0');
    const contextType = event.queryStringParameters?.contextType;

    let query: string;
    let params: SqlParam[];

    if (type === 'sent') {
      query = `
        SELECT
          t.id,
          t.amount,
          t.currency,
          t.context_type,
          t.context_id,
          t.message,
          t.payment_status,
          t.created_at,
          t.completed_at,
          p.id as receiver_id,
          p.username as receiver_username,
          p.display_name as receiver_display_name,
          p.avatar_url as receiver_avatar
        FROM tips t
        JOIN profiles p ON t.receiver_id = p.id
        WHERE t.sender_id = $1
        ${contextType ? 'AND t.context_type = $4' : ''}
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = contextType
        ? [profileId, limit, offset, contextType]
        : [profileId, limit, offset];
    } else {
      query = `
        SELECT
          t.id,
          t.amount,
          t.currency,
          t.creator_amount,
          t.context_type,
          t.context_id,
          t.message,
          t.is_anonymous,
          t.payment_status,
          t.created_at,
          t.completed_at,
          CASE WHEN t.is_anonymous THEN NULL ELSE p.id END as sender_id,
          CASE WHEN t.is_anonymous THEN 'Anonymous' ELSE p.username END as sender_username,
          CASE WHEN t.is_anonymous THEN 'Anonymous Fan' ELSE p.display_name END as sender_display_name,
          CASE WHEN t.is_anonymous THEN NULL ELSE p.avatar_url END as sender_avatar
        FROM tips t
        JOIN profiles p ON t.sender_id = p.id
        WHERE t.receiver_id = $1
        AND t.payment_status = 'completed'
        ${contextType ? 'AND t.context_type = $4' : ''}
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = contextType
        ? [profileId, limit, offset, contextType]
        : [profileId, limit, offset];
    }

    const result = await client.query(query, params);

    // Get totals
    const totalsResult = await client.query(
      `SELECT
        COUNT(*) FILTER (WHERE payment_status = 'completed') as total_count,
        COALESCE(SUM(${type === 'sent' ? 'amount' : 'creator_amount'}) FILTER (WHERE payment_status = 'completed'), 0) as total_amount,
        COALESCE(SUM(${type === 'sent' ? 'amount' : 'creator_amount'}) FILTER (
          WHERE payment_status = 'completed'
          AND created_at >= DATE_TRUNC('month', NOW())
        ), 0) as month_amount
      FROM tips
      WHERE ${type === 'sent' ? 'sender_id' : 'receiver_id'} = $1`,
      [profileId]
    );

    const tips = result.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      amount: parseFloat(row.amount as string),
      currency: row.currency,
      creatorAmount: row.creator_amount ? parseFloat(row.creator_amount as string) : undefined,
      contextType: row.context_type,
      contextId: row.context_id,
      message: row.message,
      isAnonymous: row.is_anonymous,
      status: row.payment_status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      ...(type === 'sent'
        ? {
            receiver: {
              id: row.receiver_id,
              username: row.receiver_username,
              displayName: row.receiver_display_name,
              avatarUrl: row.receiver_avatar,
            },
          }
        : {
            sender: {
              id: row.sender_id,
              username: row.sender_username,
              displayName: row.sender_display_name,
              avatarUrl: row.sender_avatar,
            },
          }),
    }));

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        type,
        tips,
        totals: {
          count: parseInt(totalsResult.rows[0].total_count),
          totalAmount: parseFloat(totalsResult.rows[0].total_amount),
          monthAmount: parseFloat(totalsResult.rows[0].month_amount),
        },
        pagination: {
          limit,
          offset,
          hasMore: result.rows.length === limit,
        },
      }),
    });
  } catch (error: unknown) {
    log.error('Tips history error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to fetch tips history',
      }),
    });
  } finally {
    client.release();
  }
};
