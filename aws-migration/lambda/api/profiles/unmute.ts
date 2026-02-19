/**
 * Unmute User Lambda Handler
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('profiles-unmute');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const targetUserId = event.pathParameters?.id;
    if (!targetUserId || !isValidUUID(targetUserId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid user ID format' }) };
    }

    const rateLimitResponse = await requireRateLimit({
      prefix: 'unmute-user',
      identifier: cognitoSub,
      windowSeconds: 60,
      maxRequests: 20,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const db = await getPool();

    const muterId = await resolveProfileId(db, cognitoSub);
    if (!muterId) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }

    await db.query(
      'DELETE FROM muted_users WHERE muter_id = $1 AND muted_id = $2',
      [muterId, targetUserId]
    );

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (error: unknown) {
    log.error('Error unmuting user', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}
