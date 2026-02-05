/**
 * Business Program Get
 * GET /businesses/my/program
 * Owner only — returns activities, schedule slots, and tags
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { getUserFromEvent } from '../utils/auth';

const log = createLogger('business/program-get');

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

    const db = await getPool();

    const [activitiesResult, slotsResult, tagsResult] = await Promise.all([
      db.query(
        `SELECT id, name, description, category, duration_minutes, max_participants,
                instructor, color, is_active, created_at
         FROM business_activities
         WHERE business_id = $1
         ORDER BY name`,
        [user.id]
      ),
      db.query(
        `SELECT s.id, s.activity_id, s.day_of_week, s.start_time, s.end_time,
                s.instructor, s.max_participants, s.is_active,
                a.name as activity_name, a.color as activity_color
         FROM business_schedule_slots s
         JOIN business_activities a ON s.activity_id = a.id
         WHERE s.business_id = $1
         ORDER BY s.day_of_week, s.start_time`,
        [user.id]
      ),
      db.query(
        `SELECT id, name, category, created_at
         FROM business_tags
         WHERE business_id = $1
         ORDER BY category, name`,
        [user.id]
      ),
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        activities: activitiesResult.rows.map((a: Record<string, unknown>) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          category: a.category,
          durationMinutes: a.duration_minutes,
          maxParticipants: a.max_participants,
          instructor: a.instructor,
          color: a.color,
          isActive: a.is_active,
          createdAt: a.created_at,
        })),
        schedule: slotsResult.rows.map((s: Record<string, unknown>) => ({
          id: s.id,
          activityId: s.activity_id,
          activityName: s.activity_name,
          activityColor: s.activity_color,
          dayOfWeek: s.day_of_week,
          startTime: s.start_time,
          endTime: s.end_time,
          instructor: s.instructor,
          maxParticipants: s.max_participants,
          isActive: s.is_active,
        })),
        tags: tagsResult.rows.map((t: Record<string, unknown>) => ({
          id: t.id,
          name: t.name,
          category: t.category,
        })),
      }),
    };
  } catch (error) {
    log.error('Failed to load program', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}
