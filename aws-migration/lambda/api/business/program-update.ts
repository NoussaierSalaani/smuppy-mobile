/**
 * Business Program Update
 * Multi-action handler for activities, schedule slots, and tags
 *
 * Routes:
 *   POST /businesses/my/activities — create activity
 *   PUT  /businesses/my/activities/{activityId} — update activity
 *   DELETE /businesses/my/activities/{activityId} — delete activity
 *   POST /businesses/my/schedule — create slot
 *   DELETE /businesses/my/schedule/{slotId} — delete slot
 *   POST /businesses/my/tags — add tag
 *   DELETE /businesses/my/tags/{tagId} — remove tag
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import type { Pool } from 'pg';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { getUserFromEvent } from '../utils/auth';
import { requireRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';

const log = createLogger('business/program-update');
const MAX_NAME_LENGTH = 255;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const user = getUserFromEvent(event);
    if (!user) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    // Rate limit write operations (POST, PUT, DELETE)
    if (['POST', 'PUT', 'DELETE'].includes(event.httpMethod)) {
      const rateLimitResponse = await requireRateLimit({ prefix: 'biz-program', identifier: user.id, maxRequests: 20 }, headers);
      if (rateLimitResponse) return rateLimitResponse;
    }

    const path = event.resource || event.path || '';
    const method = event.httpMethod;
    const db = await getPool();

    // ── Activities ──
    if (path.includes('/activities')) {
      const activityId = event.pathParameters?.activityId;

      if (method === 'POST' && !activityId) {
        return createActivity(db, user.id, event, headers);
      }
      if (method === 'PUT' && activityId) {
        return updateActivity(db, user.id, activityId, event, headers);
      }
      if (method === 'DELETE' && activityId) {
        return deleteActivity(db, user.id, activityId, headers);
      }
    }

    // ── Schedule Slots ──
    if (path.includes('/schedule')) {
      const slotId = event.pathParameters?.slotId;

      if (method === 'POST' && !slotId) {
        return createSlot(db, user.id, event, headers);
      }
      if (method === 'DELETE' && slotId) {
        return deleteSlot(db, user.id, slotId, headers);
      }
    }

    // ── Tags ──
    if (path.includes('/tags')) {
      const tagId = event.pathParameters?.tagId;

      if (method === 'POST' && !tagId) {
        return addTag(db, user.id, event, headers);
      }
      if (method === 'DELETE' && tagId) {
        return removeTag(db, user.id, tagId, headers);
      }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ success: false, message: 'Method not allowed' }) };
  } catch (error) {
    log.error('Program update error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}

async function createActivity(db: Pool, businessId: string, event: APIGatewayProxyEvent, headers: Record<string, string>) {
  const body = JSON.parse(event.body || '{}');
  const { name, description, category, duration_minutes, max_participants, instructor, color } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Name is required' }) };
  }

  const sanitizedName = name.trim().replaceAll(/<[^>]*>/g, '').substring(0, MAX_NAME_LENGTH); // NOSONAR

  const result = await db.query(
    `INSERT INTO business_activities (business_id, name, description, category, duration_minutes, max_participants, instructor, color)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, description, category, duration_minutes, max_participants, instructor, color, is_active, created_at`,
    [businessId, sanitizedName, description?.replaceAll(/<[^>]*>/g, '') || null, category || null, // NOSONAR
     duration_minutes || 60, max_participants || null, instructor?.replaceAll(/<[^>]*>/g, '') || null, color || '#0EBF8A'] // NOSONAR
  );

  return {
    statusCode: 201,
    headers,
    body: JSON.stringify({ success: true, activity: mapActivity(result.rows[0]) }),
  };
}

async function updateActivity(db: Pool, businessId: string, activityId: string, event: APIGatewayProxyEvent, headers: Record<string, string>) {
  if (!isValidUUID(activityId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid activityId' }) };
  }

  const body = JSON.parse(event.body || '{}');
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const fields: Record<string, unknown> = {
    name: body.name ? String(body.name).trim().replaceAll(/<[^>]*>/g, '').substring(0, MAX_NAME_LENGTH) : undefined, // NOSONAR
    description: body.description !== undefined ? (body.description?.replaceAll(/<[^>]*>/g, '') || null) : undefined, // NOSONAR
    category: body.category,
    duration_minutes: body.duration_minutes,
    max_participants: body.max_participants,
    instructor: body.instructor !== undefined ? (body.instructor?.replaceAll(/<[^>]*>/g, '') || null) : undefined, // NOSONAR
    color: body.color,
    is_active: body.is_active,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      setClauses.push(`${key} = $${idx++}`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'No fields to update' }) };
  }

  params.push(activityId, businessId);
  const result = await db.query( // NOSONAR
    `UPDATE business_activities SET ${setClauses.join(', ')}
     WHERE id = $${idx} AND business_id = $${idx + 1}
     RETURNING id, name, description, category, duration_minutes, max_participants, instructor, color, is_active, created_at`,
    params
  );

  if (result.rows.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Activity not found' }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, activity: mapActivity(result.rows[0]) }),
  };
}

async function deleteActivity(db: Pool, businessId: string, activityId: string, headers: Record<string, string>) {
  if (!isValidUUID(activityId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid activityId' }) };
  }

  // Soft delete
  const result = await db.query(
    `UPDATE business_activities SET is_active = false WHERE id = $1 AND business_id = $2 RETURNING id`,
    [activityId, businessId]
  );

  if (result.rows.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Activity not found' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
}

async function createSlot(db: Pool, businessId: string, event: APIGatewayProxyEvent, headers: Record<string, string>) {
  const body = JSON.parse(event.body || '{}');
  const { activity_id, day_of_week, start_time, end_time, instructor, max_participants } = body;

  if (!activity_id || !isValidUUID(activity_id)) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid activity_id is required' }) };
  }
  if (day_of_week === undefined || day_of_week < 0 || day_of_week > 6) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'day_of_week must be 0-6' }) };
  }
  if (!start_time || !end_time) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'start_time and end_time are required' }) };
  }

  // Verify activity belongs to this business
  const activityCheck = await db.query(
    'SELECT id FROM business_activities WHERE id = $1 AND business_id = $2',
    [activity_id, businessId]
  );
  if (activityCheck.rows.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Activity not found' }) };
  }

  const result = await db.query(
    `INSERT INTO business_schedule_slots (business_id, activity_id, day_of_week, start_time, end_time, instructor, max_participants)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, activity_id, day_of_week, start_time, end_time, instructor, max_participants, is_active`,
    [businessId, activity_id, day_of_week, start_time, end_time, instructor?.replaceAll(/<[^>]*>/g, '') || null, max_participants || null] // NOSONAR
  );

  const s = result.rows[0];
  return {
    statusCode: 201,
    headers,
    body: JSON.stringify({
      success: true,
      slot: {
        id: s.id,
        activityId: s.activity_id,
        dayOfWeek: s.day_of_week,
        startTime: s.start_time,
        endTime: s.end_time,
        instructor: s.instructor,
        maxParticipants: s.max_participants,
        isActive: s.is_active,
      },
    }),
  };
}

async function deleteSlot(db: Pool, businessId: string, slotId: string, headers: Record<string, string>) {
  if (!isValidUUID(slotId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid slotId' }) };
  }

  const result = await db.query(
    `UPDATE business_schedule_slots SET is_active = false WHERE id = $1 AND business_id = $2 RETURNING id`,
    [slotId, businessId]
  );

  if (result.rows.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Slot not found' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
}

async function addTag(db: Pool, businessId: string, event: APIGatewayProxyEvent, headers: Record<string, string>) {
  const body = JSON.parse(event.body || '{}');
  const { name, category } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Tag name is required' }) };
  }

  const sanitizedName = name.trim().replaceAll(/<[^>]*>/g, '').substring(0, 100); // NOSONAR

  const result = await db.query(
    `INSERT INTO business_tags (business_id, name, category)
     VALUES ($1, $2, $3)
     ON CONFLICT (business_id, name) DO NOTHING
     RETURNING id, name, category`,
    [businessId, sanitizedName, category?.replaceAll(/<[^>]*>/g, '') || null] // NOSONAR
  );

  if (result.rows.length === 0) {
    return { statusCode: 409, headers, body: JSON.stringify({ success: false, message: 'Tag already exists' }) };
  }

  return {
    statusCode: 201,
    headers,
    body: JSON.stringify({ success: true, tag: result.rows[0] }),
  };
}

async function removeTag(db: Pool, businessId: string, tagId: string, headers: Record<string, string>) {
  if (!isValidUUID(tagId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid tagId' }) };
  }

  const result = await db.query(
    `DELETE FROM business_tags WHERE id = $1 AND business_id = $2 RETURNING id`,
    [tagId, businessId]
  );

  if (result.rows.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Tag not found' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
}

function mapActivity(a: Record<string, unknown>) {
  return {
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
  };
}
