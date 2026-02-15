/**
 * List Expertise Lambda Handler
 * Returns all available expertise options for creator onboarding
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createCacheableHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('expertise-list');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createCacheableHeaders(event, 'public, max-age=86400');

  try {
    const db = await getPool();

    const result = await db.query(
      'SELECT id, name, icon, category FROM expertise ORDER BY category, name LIMIT 500'
    );

    const data = result.rows.map((row: { id: string; name: string; icon: string; category: string }) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      category: row.category,
    }));

    log.info('Listed expertise', { count: data.length });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data }),
    };
  } catch (error: unknown) {
    log.error('Error listing expertise', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
