/**
 * List Interests Lambda Handler
 * Returns all available interests for user selection during onboarding
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('interests-list');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const db = await getReaderPool();

    const result = await db.query(
      'SELECT id, name, icon, category FROM interests ORDER BY category, name LIMIT 500'
    );

    const data = result.rows.map((row: { id: string; name: string; icon: string; category: string }) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      category: row.category,
    }));

    log.info('Listed interests', { count: data.length });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data }),
    };
  } catch (error: unknown) {
    log.error('Error listing interests', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
