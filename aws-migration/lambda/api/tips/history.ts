/**
 * Tips History Lambda Handler
 * Get sent/received tips history
 */

import { SqlParam } from '../../shared/db';
import { withAuthHandler } from '../utils/with-auth-handler';

export const handler = withAuthHandler('tips-history', async (event, { headers, profileId, db }) => {
  const client = await db.connect();

  try {
    const type = event.queryStringParameters?.type || 'received'; // 'sent' or 'received'
    const limit = Math.min(Number.parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;
    const contextType = event.queryStringParameters?.contextType;

    // Build cursor condition
    let cursorCondition = '';
    const baseParams: SqlParam[] = [profileId];
    if (cursor) {
      const parsedDate = new Date(cursor);
      if (Number.isNaN(parsedDate.getTime())) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid cursor format' }) };
      }
      baseParams.push(parsedDate.toISOString());
      cursorCondition = `AND t.created_at < $${baseParams.length}::timestamptz`;
    }
    baseParams.push(limit + 1);
    const limitIdx = baseParams.length;

    let contextCondition = '';
    if (contextType) {
      baseParams.push(contextType);
      contextCondition = `AND t.context_type = $${baseParams.length}`;
    }

    let query: string;

    if (type === 'sent') {
      query = `
        SELECT
          t.id, t.amount, t.currency, t.context_type, t.context_id,
          t.message, t.payment_status, t.created_at, t.completed_at,
          p.id as receiver_id, p.username as receiver_username,
          p.display_name as receiver_display_name, p.avatar_url as receiver_avatar
        FROM tips t
        JOIN profiles p ON t.receiver_id = p.id
        WHERE t.sender_id = $1
        ${cursorCondition}
        ${contextCondition}
        ORDER BY t.created_at DESC
        LIMIT $${limitIdx}
      `;
    } else {
      query = `
        SELECT
          t.id, t.amount, t.currency, t.creator_amount, t.context_type, t.context_id,
          t.message, t.is_anonymous, t.payment_status, t.created_at, t.completed_at,
          CASE WHEN t.is_anonymous THEN NULL ELSE p.id END as sender_id,
          CASE WHEN t.is_anonymous THEN 'Anonymous' ELSE p.username END as sender_username,
          CASE WHEN t.is_anonymous THEN 'Anonymous Fan' ELSE p.display_name END as sender_display_name,
          CASE WHEN t.is_anonymous THEN NULL ELSE p.avatar_url END as sender_avatar
        FROM tips t
        JOIN profiles p ON t.sender_id = p.id
        WHERE t.receiver_id = $1
        AND t.payment_status = 'completed'
        ${cursorCondition}
        ${contextCondition}
        ORDER BY t.created_at DESC
        LIMIT $${limitIdx}
      `;
    }

    const result = await client.query(query, baseParams);

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);

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

    const tips = rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      amount: Number.parseFloat(row.amount as string),
      currency: row.currency,
      creatorAmount: row.creator_amount ? Number.parseFloat(row.creator_amount as string) : undefined,
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

    const nextCursor = hasMore && rows.length > 0
      ? new Date(rows[rows.length - 1].created_at as string).toISOString()
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        type,
        tips,
        totals: {
          count: Number.parseInt(totalsResult.rows[0].total_count),
          totalAmount: Number.parseFloat(totalsResult.rows[0].total_amount),
          monthAmount: Number.parseFloat(totalsResult.rows[0].month_amount),
        },
        nextCursor,
        hasMore,
      }),
    };
  } catch (error: unknown) {
    throw error;
  } finally {
    client.release();
  }
});
