/**
 * Get Creator Availability Handler
 * GET /sessions/availability/{creatorId} - Get creator's available time slots
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, corsHeaders } from '../../shared/db';
import { createLogger } from '../utils/logger';

const log = createLogger('sessions-availability');

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  const creatorId = event.pathParameters?.creatorId;
  if (!creatorId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Creator ID required' }),
    };
  }

  // SECURITY: Validate UUID format
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(creatorId)) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Invalid creator ID format' }),
    };
  }

  // Get date from query params or default to next 7 days
  const startDate = event.queryStringParameters?.startDate || new Date().toISOString().split('T')[0];
  const daysAhead = parseInt(event.queryStringParameters?.days || '7');

  try {
    const pool = await getPool();

    // Get creator's session settings
    const creatorResult = await pool.query(
      `SELECT
        id, full_name, username, avatar_url,
        sessions_enabled, session_price, session_duration,
        session_availability, timezone
       FROM profiles WHERE id = $1`,
      [creatorId]
    );

    if (creatorResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Creator not found' }),
      };
    }

    const creator = creatorResult.rows[0];

    if (!creator.sessions_enabled) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Creator does not accept sessions' }),
      };
    }

    // Get booked sessions in the date range
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysAhead);

    const bookedResult = await pool.query(
      `SELECT scheduled_at, duration FROM private_sessions
       WHERE creator_id = $1
       AND status IN ('pending', 'confirmed')
       AND scheduled_at >= $2 AND scheduled_at < $3`,
      [creatorId, startDate, endDate.toISOString()]
    );

    const bookedSlots = bookedResult.rows.map((row: Record<string, unknown>) => ({
      start: new Date(row.scheduled_at as string),
      end: new Date(new Date(row.scheduled_at as string).getTime() + (row.duration as number) * 60000),
    }));

    // Parse availability settings (stored as JSON)
    // Format: { monday: [{start: "09:00", end: "17:00"}], ... }
    const availability = creator.session_availability || {
      monday: [{ start: '09:00', end: '18:00' }],
      tuesday: [{ start: '09:00', end: '18:00' }],
      wednesday: [{ start: '09:00', end: '18:00' }],
      thursday: [{ start: '09:00', end: '18:00' }],
      friday: [{ start: '09:00', end: '18:00' }],
      saturday: [],
      sunday: [],
    };

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const sessionDuration = creator.session_duration || 30;
    const availableSlots: { date: string; time: string; datetime: string }[] = [];

    // Generate available slots for each day
    for (let i = 0; i < daysAhead; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dayName = dayNames[date.getDay()];
      const dayAvailability = availability[dayName] || [];

      for (const slot of dayAvailability) {
        const [startHour, startMin] = slot.start.split(':').map(Number);
        const [endHour, endMin] = slot.end.split(':').map(Number);

        const slotStart = new Date(date);
        slotStart.setHours(startHour, startMin, 0, 0);

        const slotEnd = new Date(date);
        slotEnd.setHours(endHour, endMin, 0, 0);

        // Generate time slots within the available window
        let current = new Date(slotStart);
        while (current.getTime() + sessionDuration * 60000 <= slotEnd.getTime()) {
          const slotDateTime = current.toISOString();
          const slotEndTime = new Date(current.getTime() + sessionDuration * 60000);

          // Check if slot is in the future (at least 2 hours from now)
          const minBookingTime = new Date();
          minBookingTime.setHours(minBookingTime.getHours() + 2);

          if (current > minBookingTime) {
            // Check if slot conflicts with any booked session
            const isBooked = bookedSlots.some(
              (booked: { start: Date; end: Date }) => current < booked.end && slotEndTime > booked.start
            );

            if (!isBooked) {
              availableSlots.push({
                date: date.toISOString().split('T')[0],
                time: `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`,
                datetime: slotDateTime,
              });
            }
          }

          // Move to next slot (30 min intervals)
          current.setMinutes(current.getMinutes() + 30);
        }
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        creator: {
          id: creator.id,
          name: creator.full_name,
          username: creator.username,
          avatar: creator.avatar_url,
          sessionPrice: parseFloat(creator.session_price || 0),
          sessionDuration: creator.session_duration || 30,
          timezone: creator.timezone || 'Europe/Paris',
        },
        availableSlots,
      }),
    };
  } catch (error) {
    log.error('Get availability error', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Failed to get availability' }),
    };
  }
};
