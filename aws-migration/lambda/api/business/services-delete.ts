/**
 * Business Services Delete (Soft Delete)
 * DELETE /businesses/my/services/{serviceId}
 * Owner only — sets is_active = false
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { getUserFromEvent } from '../utils/auth';
import { isValidUUID } from '../utils/security';

const log = createLogger('business/services-delete');

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

    const { allowed } = await checkRateLimit({ prefix: 'biz-svc-delete', identifier: user.id, maxRequests: 10 });
    if (!allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ success: false, message: 'Too many requests' }) };
    }

    const serviceId = event.pathParameters?.serviceId;
    if (!serviceId || !isValidUUID(serviceId)) {
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
