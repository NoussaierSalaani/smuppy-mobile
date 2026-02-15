/**
 * Business Dashboard
 * GET /businesses/my/dashboard
 * Owner only — returns stats, recent activity
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { getUserFromEvent } from '../utils/auth';

const log = createLogger('business/dashboard');

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

    // Run all stats queries in parallel
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const [bookingsToday, activeMembers, monthlyRevenue, todayCheckIns, upcomingClasses, recentActivityResult] = await Promise.all([
      // Today's bookings
      db.query(
        `SELECT COUNT(*) as count FROM business_bookings
         WHERE business_id = $1 AND booking_date = $2 AND status != 'cancelled'`,
        [user.id, today]
      ),
      // Active members (active subscriptions)
      db.query(
        `SELECT COUNT(*) as count FROM business_subscriptions
         WHERE business_id = $1 AND status = 'active'`,
        [user.id]
      ),
      // Monthly revenue (bookings + passes + subscriptions)
      db.query(
        `SELECT COALESCE(SUM(amount_cents - platform_fee_cents), 0) as total
         FROM (
           SELECT amount_cents, platform_fee_cents FROM business_bookings
           WHERE business_id = $1 AND created_at >= $2 AND status = 'confirmed'
           UNION ALL
           SELECT amount_cents, platform_fee_cents FROM business_passes
           WHERE business_id = $1 AND created_at >= $2 AND status = 'active'
           UNION ALL
           SELECT amount_cents, platform_fee_cents FROM business_subscriptions
           WHERE business_id = $1 AND created_at >= $2 AND status = 'active'
         ) combined`,
        [user.id, monthStart]
      ),
      // Today's check-ins
      db.query(
        `SELECT COUNT(*) as count FROM business_bookings
         WHERE business_id = $1 AND scanned_at::date = $2::date`,
        [user.id, today]
      ),
      // Upcoming classes today
      db.query(
        `SELECT COUNT(*) as count FROM business_schedule_slots
         WHERE business_id = $1 AND day_of_week = $2 AND is_active = true`,
        [user.id, new Date().getDay()]
      ),
      // Recent activity (last 10 events)
      db.query(
        `(
          SELECT bb.id, 'booking' as type, p.full_name as member_name,
                 bs.name as service_name, bb.created_at
          FROM business_bookings bb
          JOIN profiles p ON bb.user_id = p.id
          LEFT JOIN business_services bs ON bb.service_id = bs.id
          WHERE bb.business_id = $1
          ORDER BY bb.created_at DESC LIMIT 5
        )
        UNION ALL
        (
          SELECT bsub.id, 'subscription' as type, p.full_name as member_name,
                 bs.name as service_name, bsub.created_at
          FROM business_subscriptions bsub
          JOIN profiles p ON bsub.user_id = p.id
          LEFT JOIN business_services bs ON bsub.service_id = bs.id
          WHERE bsub.business_id = $1
          ORDER BY bsub.created_at DESC LIMIT 5
        )
        ORDER BY created_at DESC LIMIT 10`,
        [user.id]
      ),
    ]);

    const stats = {
      todayBookings: parseInt(bookingsToday.rows[0]?.count || '0'),
      activeMembers: parseInt(activeMembers.rows[0]?.count || '0'),
      monthlyRevenue: parseInt(monthlyRevenue.rows[0]?.total || '0'),
      pendingRequests: 0,
      todayCheckIns: parseInt(todayCheckIns.rows[0]?.count || '0'),
      upcomingClasses: parseInt(upcomingClasses.rows[0]?.count || '0'),
    };

    const now = new Date();
    const recentActivity = recentActivityResult.rows.map((r: Record<string, unknown>) => {
      const diffMs = now.getTime() - new Date(r.created_at as string).getTime();
      const diffMin = Math.floor(diffMs / 60000);
      let time: string;
      if (diffMin < 1) time = 'just now';
      else if (diffMin < 60) time = `${diffMin} min ago`;
      else if (diffMin < 1440) time = `${Math.floor(diffMin / 60)}h ago`;
      else time = `${Math.floor(diffMin / 1440)}d ago`;

      return {
        id: r.id,
        type: r.type,
        memberName: r.member_name || 'Unknown',
        serviceName: r.service_name,
        time,
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, stats, recentActivity }),
    };
  } catch (error) {
    log.error('Failed to load dashboard', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}
