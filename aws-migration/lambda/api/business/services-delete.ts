/**
 * Business Services Delete (Soft Delete)
 * DELETE /businesses/my/services/{serviceId}
 * Owner only — sets is_active = false
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { getUserFromEvent } from '../utils/auth';

const log = createLogger('business/services-delete');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const user = getUserFromEvent(event);
    if (!user) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    const serviceId = event.pathParameters?.serviceId;
    if (!serviceId || !UUID_REGEX.test(serviceId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid serviceId is required' }) };
    }

    const db = await getPool();

    // Soft delete — set is_active = false (verify ownership)
    const result = await db.query(
      `UPDATE business_services SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND business_id = $2
       RETURNING id`,
      [serviceId, user.id]
    );

    if (result.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Service not found' }) };
    }

    log.info('Business service deactivated', { serviceId });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    log.error('Failed to delete business service', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}
