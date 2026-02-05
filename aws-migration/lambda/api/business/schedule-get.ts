/**
 * Business Schedule Get (Public)
 * GET /businesses/{businessId}/schedule
 * Public — returns weekly schedule for a business
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('business/schedule-get');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const businessId = event.pathParameters?.businessId;

    if (!businessId || !isValidUUID(businessId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid businessId is required' }) };
    }

    const db = await getPool();

    const result = await db.query(
      `SELECT s.id, s.day_of_week, s.start_time, s.end_time, s.instructor, s.max_participants,
              a.id as activity_id, a.name as activity_name, a.category, a.duration_minutes, a.color
       FROM business_schedule_slots s
       JOIN business_activities a ON s.activity_id = a.id
       WHERE s.business_id = $1 AND s.is_active = true AND a.is_active = true
       ORDER BY s.day_of_week, s.start_time`,
      [businessId]
    );

    const activities = result.rows.map((s: Record<string, unknown>) => ({
      id: s.id,
      dayOfWeek: s.day_of_week,
      startTime: typeof s.start_time === 'string' ? s.start_time.substring(0, 5) : s.start_time,
      endTime: typeof s.end_time === 'string' ? s.end_time.substring(0, 5) : s.end_time,
      instructor: s.instructor,
      maxParticipants: s.max_participants,
      activityId: s.activity_id,
      activityName: s.activity_name,
      category: s.category,
      durationMinutes: s.duration_minutes,
      color: s.color,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, activities }),
    };
  } catch (error) {
    log.error('Failed to get schedule', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}
