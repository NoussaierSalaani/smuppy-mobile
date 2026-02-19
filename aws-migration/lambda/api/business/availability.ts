/**
 * Business Availability
 * GET /businesses/{businessId}/availability?serviceId=...&date=YYYY-MM-DD
 * Public — returns available time slots for a given service and date
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('business/availability');
const DEFAULT_MAX_PARTICIPANTS = 30;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const businessId = event.pathParameters?.businessId;
    const serviceId = event.queryStringParameters?.serviceId;
    const date = event.queryStringParameters?.date;

    if (!businessId || !isValidUUID(businessId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid businessId is required' }) };
    }
    if (!serviceId || !isValidUUID(serviceId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid serviceId is required' }) };
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Date must be in YYYY-MM-DD format' }) };
    }

    const db = await getPool();

    // Get day of week for the requested date (0=Sunday)
    const requestedDate = new Date(date + 'T00:00:00Z');
    const dayOfWeek = requestedDate.getUTCDay();

    // Get schedule slots for that day
    const slotsResult = await db.query(
      `SELECT s.id, s.start_time, s.end_time, s.instructor, s.max_participants,
              a.name as activity_name, a.duration_minutes, a.color
       FROM business_schedule_slots s
       JOIN business_activities a ON s.activity_id = a.id
       WHERE s.business_id = $1 AND s.day_of_week = $2 AND s.is_active = true AND a.is_active = true
       ORDER BY s.start_time`,
      [businessId, dayOfWeek]
    );

    // Get existing booking counts for each slot on this date
    const bookingCounts = await db.query(
      `SELECT slot_time, COUNT(*) as booked
       FROM business_bookings
       WHERE business_id = $1 AND booking_date = $2 AND status != 'cancelled'
       GROUP BY slot_time`,
      [businessId, date]
    );

    const bookingMap = new Map<string, number>();
    for (const row of bookingCounts.rows) {
      bookingMap.set(row.slot_time, Number.parseInt(row.booked));
    }

    const slots = slotsResult.rows.map((s: Record<string, unknown>) => {
      const startStr = typeof s.start_time === 'string' ? s.start_time.substring(0, 5) : String(s.start_time);
      const booked = bookingMap.get(startStr) || 0;
      const maxParticipants = (s.max_participants as number) || DEFAULT_MAX_PARTICIPANTS;
      const spotsLeft = Math.max(0, maxParticipants - booked);

      return {
        id: s.id,
        startTime: startStr,
        endTime: typeof s.end_time === 'string' ? s.end_time.substring(0, 5) : s.end_time,
        instructor: s.instructor,
        activityName: s.activity_name,
        durationMinutes: s.duration_minutes,
        color: s.color,
        maxParticipants,
        booked,
        spotsLeft,
        available: spotsLeft > 0,
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, slots, date, dayOfWeek }),
    };
  } catch (error) {
    log.error('Failed to get availability', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}
