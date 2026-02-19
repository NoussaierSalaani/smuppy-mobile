/**
 * Peak Save Decision Lambda Handler
 * POST /peaks/{id}/save-decision - Record user's decision for an expired peak
 * Actions: 'save_to_profile' (keep permanently) or 'dismiss' (mark as dismissed)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';
import { resolveProfileId } from '../utils/auth';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('peaks-save-decision');

const VALID_ACTIONS = ['save_to_profile', 'dismiss'] as const;
type SaveAction = typeof VALID_ACTIONS[number];

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const userId = requireAuth(event, headers);
    if (isErrorResponse(userId)) return userId;

    const { allowed, retryAfter } = await checkRateLimit({
      prefix: 'peak-save-decision',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 30,
    });
    if (!allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.', retryAfter }),
      };
    }

    const peakId = validateUUIDParam(event, headers, 'id', 'Peak');
    if (isErrorResponse(peakId)) return peakId;

    // Parse and validate body
    const body = event.body ? JSON.parse(event.body) : {};
    const { action } = body;

    if (!action || !VALID_ACTIONS.includes(action as SaveAction)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid action. Must be "save_to_profile" or "dismiss".' }),
      };
    }

    const db = await getPool();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Resolve cognito_sub to profile ID
      const profileId = await resolveProfileId(client, userId);

      if (!profileId) {
        await client.query('ROLLBACK');
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'User profile not found' }),
        };
      }

      // Check peak exists and verify ownership with row lock to prevent concurrent race
      const peakResult = await client.query(
        'SELECT id, author_id FROM peaks WHERE id = $1 FOR UPDATE',
        [peakId]
      );

      if (peakResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Peak not found' }),
        };
      }

      if (peakResult.rows[0].author_id !== profileId) {
        await client.query('ROLLBACK');
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Not authorized to modify this peak' }),
        };
      }

      // Update saved_to_profile flag
      const savedValue = action === 'save_to_profile';
      await client.query(
        'UPDATE peaks SET saved_to_profile = $1 WHERE id = $2',
        [savedValue, peakId]
      );

      await client.query('COMMIT');

      log.info('Peak save decision recorded', {
        peakId: peakId.substring(0, 8) + '***',
        userId: userId.substring(0, 8) + '***',
        action,
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: action === 'save_to_profile' ? 'Peak saved to profile' : 'Peak dismissed',
          savedToProfile: savedValue,
        }),
      };
    } catch (txError: unknown) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    log.error('Error processing peak save decision', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
