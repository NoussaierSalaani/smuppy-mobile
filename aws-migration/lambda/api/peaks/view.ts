/**
 * Record Peak View Lambda Handler
 * Tracks unique views per user per peak and increments views_count.
 * Uses peak_views dedup table (migration-015) with ON CONFLICT DO NOTHING.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';

const log = createLogger('peaks-view');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = requireAuth(event, headers);
    if (isErrorResponse(cognitoSub)) return cognitoSub;

    const peakId = validateUUIDParam(event, headers, 'id', 'Peak');
    if (isErrorResponse(peakId)) return peakId;

    const db = await getPool();

    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Profile not found' }),
      };
    }

    const viewerId = userResult.rows[0].id;

    const peakExists = await db.query(
      'SELECT EXISTS(SELECT 1 FROM peaks WHERE id = $1) AS exists',
      [peakId]
    );

    if (!peakExists.rows[0]?.exists) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Peak not found' }),
      };
    }

    const client = await db.connect();
    let viewsCount = 0;

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO peak_views (peak_id, user_id) VALUES ($1, $2)
         ON CONFLICT (peak_id, user_id) DO NOTHING`,
        [peakId, viewerId]
      );

      if (result.rowCount && result.rowCount > 0) {
        const updated = await client.query(
          'UPDATE peaks SET views_count = views_count + 1 WHERE id = $1 RETURNING views_count',
          [peakId]
        );
        viewsCount = updated.rows[0]?.views_count || 0;
      } else {
        const current = await client.query(
          'SELECT views_count FROM peaks WHERE id = $1',
          [peakId]
        );
        viewsCount = current.rows[0]?.views_count || 0;
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        viewsCount,
      }),
    };
  } catch (error: unknown) {
    log.error('Error recording peak view', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
