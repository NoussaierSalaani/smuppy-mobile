/**
 * Trending Hashtags Lambda
 * Extracts and ranks hashtags from recent posts
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { headers as corsHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('hashtags-trending');

const MAX_LIMIT = 50;

function response(statusCode: number, body: Record<string, unknown>): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      'Cache-Control': statusCode === 200 ? 'public, max-age=300' : 'no-cache',
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { limit = '20' } = event.queryStringParameters || {};

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), MAX_LIMIT);

    const pool = await getReaderPool();

    const result = await pool.query(
      `SELECT tag, SUM(cnt)::int as count
       FROM (
         SELECT LOWER(unnest(regexp_matches(content, '#([a-zA-Z0-9_]+)', 'g'))) as tag, 1 as cnt
         FROM posts
         WHERE created_at > NOW() - INTERVAL '7 days'
         UNION ALL
         SELECT hashtag as tag, 1 as cnt
         FROM peak_hashtags
         WHERE created_at > NOW() - INTERVAL '7 days'
       ) tags
       GROUP BY tag
       ORDER BY count DESC
       LIMIT $1`,
      [parsedLimit]
    );

    const data = result.rows.map((row: { tag: string; count: string }) => ({
      tag: row.tag,
      count: parseInt(row.count) || 0,
    }));

    return response(200, {
      success: true,
      data,
    });
  } catch (error: unknown) {
    log.error('Error fetching trending hashtags', error);
    return response(500, { success: false, error: 'Internal server error' });
  }
};
