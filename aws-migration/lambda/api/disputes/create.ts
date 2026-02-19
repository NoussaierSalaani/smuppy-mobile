/**
 * Create Dispute Lambda Handler
 * POST /disputes
 *
 * Allows users to open a dispute for a session
 * - Validates dispute window (24h after session)
 * - Checks for existing disputes
 * - Runs auto-verification
 * - Creates dispute record and notifies creator
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../../lambda/shared/db';
import type { PoolClient } from 'pg';
import { createLogger } from '../../api/utils/logger';
import { getUserFromEvent } from '../../api/utils/auth';
import { createHeaders } from '../../api/utils/cors';
import { requireRateLimit } from '../../api/utils/rate-limit';
import { RATE_WINDOW_1_DAY } from '../../api/utils/constants';
import { requireActiveAccount, isAccountError } from '../../api/utils/account-status';
import { isValidUUID } from '../../api/utils/security';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';

const log = createLogger('disputes/create');

interface CreateDisputeBody {
  sessionId: string;
  type: 'no_show' | 'incomplete' | 'quality' | 'technical' | 'other';
  description: string;
  refundRequested: 'full' | 'partial' | 'none';
}

interface AutoVerificationResult {
  userPresent: boolean;
  creatorPresent: boolean;
  userDuration: number;
  creatorDuration: number;
  expectedDuration: number;
  overlapDuration: number;
  quality: 'good' | 'fair' | 'poor';
  recommendation: 'approve_refund' | 'investigate' | 'reject';
  evidence: {
    userJoined: boolean;
    creatorJoined: boolean;
    userLeftEarly: boolean;
    creatorLeftEarly: boolean;
    connectionIssues: boolean;
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    };
  }

  const db = await getPool();
  let client: PoolClient | null = null;

  try {
    const user = await getUserFromEvent(event);
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Account status check (suspended/banned users cannot create disputes)
    const accountCheck = await requireActiveAccount(user.sub, headers);
    if (isAccountError(accountCheck)) return accountCheck;

    // Rate limit: 3 disputes per day
    const rateLimitResponse = await requireRateLimit({
      prefix: 'dispute-create',
      identifier: user.id,
      maxRequests: 3,
      windowSeconds: RATE_WINDOW_1_DAY,
      failOpen: false,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Parse body
    const body: CreateDisputeBody = JSON.parse(event.body || '{}');
    const { sessionId, type, description, refundRequested } = body;

    // Validation
    if (!sessionId || !type || !description) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'sessionId, type, and description are required',
        }),
      };
    }

    if (!isValidUUID(sessionId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid sessionId format' }),
      };
    }

    const VALID_DISPUTE_TYPES = ['no_show', 'incomplete', 'quality', 'technical', 'other'];
    if (!VALID_DISPUTE_TYPES.includes(type)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid dispute type' }),
      };
    }

    if (description.length < 20 || description.length > 2000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Description must be between 20 and 2000 characters',
        }),
      };
    }

    // Sanitize description: strip HTML tags and control characters
    const sanitizedDescription = description
      .replaceAll(/<[^>]*>/g, '') // NOSONAR
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // NOSONAR — intentional control char sanitization
      .trim();

    // Moderation: check description for violations
    const filterResult = await filterText(sanitizedDescription);
    if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
      log.warn('Dispute description blocked by filter', { userId: user.id.substring(0, 8) + '***', severity: filterResult.severity });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Your description contains content that violates our community guidelines.' }),
      };
    }
    const toxicityResult = await analyzeTextToxicity(sanitizedDescription);
    if (toxicityResult.action === 'block') {
      log.warn('Dispute description blocked by toxicity', { userId: user.id.substring(0, 8) + '***', category: toxicityResult.topCategory });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Your description contains content that violates our community guidelines.' }),
      };
    }

    // Start transaction
    client = await db.connect();
    await client.query('BEGIN');

    // Get session details
    const sessionResult = await client.query(
      `SELECT 
        ps.*,
        p.id as payment_id,
        p.amount_cents,
        p.currency,
        p.status as payment_status,
        creator.id as creator_id,
        creator.username as creator_username
      FROM private_sessions ps
      JOIN payments p ON p.metadata->>'session_id' = ps.id::TEXT
      JOIN profiles creator ON ps.creator_id = creator.id
      WHERE ps.id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Session not found' }),
      };
    }

    const session = sessionResult.rows[0];

    // Verify user is the buyer
    if (session.buyer_id !== user.id) {
      await client.query('ROLLBACK');
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Only the session buyer can open a dispute',
        }),
      };
    }

    // Check dispute window (24 hours after scheduled time)
    const scheduledTime = new Date(session.scheduled_at);
    const now = new Date();
    const hoursSinceSession = (now.getTime() - scheduledTime.getTime()) / (1000 * 60 * 60);

    if (hoursSinceSession > 24) {
      await client.query('ROLLBACK');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Dispute window has closed (24 hours after session)',
        }),
      };
    }

    // Check for existing open dispute
    const existingDispute = await client.query(
      'SELECT id FROM session_disputes WHERE session_id = $1 AND status IN ($2, $3)',
      [sessionId, 'open', 'under_review']
    );

    if (existingDispute.rows.length > 0) {
      await client.query('ROLLBACK');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'A dispute already exists for this session',
          disputeId: existingDispute.rows[0].id,
        }),
      };
    }

    // Run auto-verification
    const verification = await runAutoVerification(client, sessionId, session);

    // Determine priority based on verification
    let priority = 'normal';
    if (verification.recommendation === 'approve_refund') {
      priority = 'high'; // Fast-track obvious cases
    }

    // Calculate refund amount
    let refundAmount = 0;
    if (refundRequested === 'full') {
      refundAmount = session.amount_cents;
    } else if (refundRequested === 'partial') {
      refundAmount = Math.floor(session.amount_cents * 0.5);
    }

    // Create dispute
    const disputeResult = await client.query(
      `INSERT INTO session_disputes (
        session_id, payment_id, complainant_id, respondent_id,
        type, status, priority, complainant_description,
        amount_cents, refund_amount_cents, currency,
        auto_verification, evidence_deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, dispute_number`,
      [
        sessionId,
        session.payment_id,
        user.id,
        session.creator_id,
        type,
        'open',
        priority,
        sanitizedDescription,
        session.amount_cents,
        refundAmount,
        session.currency,
        JSON.stringify(verification),
        new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h evidence deadline
      ]
    );

    const dispute = disputeResult.rows[0];

    // Log verification events
    await client.query(
      `INSERT INTO session_verification_logs (session_id, event_type, metadata, source)
       VALUES ($1, $2, $3, $4)`,
      [
        sessionId,
        'dispute_opened',
        JSON.stringify({
          disputeId: dispute.id,
          userId: user.id,
          type,
          verificationRecommendation: verification.recommendation,
        }),
        'app',
      ]
    );

    // Create notification for creator
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        session.creator_id,
        'dispute_opened',
        'Session Dispute Opened',
        `A dispute has been opened for your session. Case: ${dispute.dispute_number}`,
        JSON.stringify({ disputeId: dispute.id, disputeNumber: dispute.dispute_number }),
      ]
    );

    // Auto-approve if recommendation is clear
    if (verification.recommendation === 'approve_refund' && priority === 'high') {
      await autoApproveRefund(client, dispute.id, session);
    }

    await client.query('COMMIT');

    log.info('Dispute created', {
      disputeId: dispute.id,
      disputeNumber: dispute.dispute_number,
      sessionId,
      userId: user.id,
      verificationRecommendation: verification.recommendation,
    });

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        dispute: {
          id: dispute.id,
          disputeNumber: dispute.dispute_number,
          status: 'open',
          priority,
          autoVerification: verification,
          evidenceDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        },
        message: 'Dispute created successfully',
      }),
    };
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    log.error('Create dispute error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  } finally {
    if (client) client.release();
  }
};

/**
 * Run automatic verification using Agora logs and app events
 */
async function runAutoVerification(
  client: PoolClient,
  sessionId: string,
  session: Record<string, unknown>
): Promise<AutoVerificationResult> {
  try {
    // Get attendance records
    const attendanceResult = await client.query(
      `SELECT user_id, joined_at, left_at, duration_seconds, network_quality_avg, reconnect_count
       FROM session_attendance
       WHERE session_id = $1`,
      [sessionId]
    );

    const userAttendance = attendanceResult.rows.find(
      (r) => r.user_id === session.buyer_id
    );
    const creatorAttendance = attendanceResult.rows.find(
      (r) => r.user_id === session.creator_id
    );

    const expectedDuration = (session.duration_minutes as number) * 60; // seconds

    // Calculate durations
    const userDuration = userAttendance?.duration_seconds || 0;
    const creatorDuration = creatorAttendance?.duration_seconds || 0;

    // Calculate overlap
    let overlapDuration = 0;
    if (userAttendance && creatorAttendance) {
      const userStart = new Date(userAttendance.joined_at).getTime();
      const userEnd = userAttendance.left_at
        ? new Date(userAttendance.left_at).getTime()
        : Date.now();
      const creatorStart = new Date(creatorAttendance.joined_at).getTime();
      const creatorEnd = creatorAttendance.left_at
        ? new Date(creatorAttendance.left_at).getTime()
        : Date.now();

      overlapDuration = Math.max(
        0,
        Math.min(userEnd, creatorEnd) - Math.max(userStart, creatorStart)
      );
    }

    // Determine presence
    const userPresent = userDuration > 60; // > 1 minute
    const creatorPresent = creatorDuration > 60;

    // Determine quality
    let quality: 'good' | 'fair' | 'poor' = 'good';
    const avgQuality = userAttendance?.network_quality_avg;
    if (avgQuality !== null && avgQuality !== undefined) {
      if (avgQuality <= 2) quality = 'poor';
      else if (avgQuality <= 4) quality = 'fair';
    }

    // Build evidence
    const evidence = {
      userJoined: !!userAttendance?.joined_at,
      creatorJoined: !!creatorAttendance?.joined_at,
      userLeftEarly: userDuration < expectedDuration * 0.8,
      creatorLeftEarly: creatorDuration < expectedDuration * 0.8,
      connectionIssues: (userAttendance?.reconnect_count || 0) > 2,
    };

    // Determine recommendation
    let recommendation: 'approve_refund' | 'investigate' | 'reject' = 'investigate';

    if (!creatorPresent) {
      // Creator never showed up - clear case
      recommendation = 'approve_refund';
    } else if (!userPresent) {
      // User never showed up - reject
      recommendation = 'reject';
    } else if (overlapDuration < expectedDuration * 0.5) {
      // Less than 50% overlap - likely creator issue
      recommendation = 'approve_refund';
    } else if (overlapDuration < expectedDuration * 0.8) {
      // 50-80% overlap - needs investigation
      recommendation = 'investigate';
    } else {
      // > 80% overlap - probably fine
      recommendation = 'reject';
    }

    return {
      userPresent,
      creatorPresent,
      userDuration,
      creatorDuration,
      expectedDuration,
      overlapDuration,
      quality,
      recommendation,
      evidence,
    };
  } catch (error) {
    log.error('Auto verification failed', error);
    // Return conservative result on error
    return {
      userPresent: true,
      creatorPresent: true,
      userDuration: 0,
      creatorDuration: 0,
      expectedDuration: (session.duration_minutes as number) * 60,
      overlapDuration: 0,
      quality: 'fair',
      recommendation: 'investigate',
      evidence: {
        userJoined: false,
        creatorJoined: false,
        userLeftEarly: false,
        creatorLeftEarly: false,
        connectionIssues: false,
      },
    };
  }
}

/**
 * Auto-approve refund for clear-cut cases
 */
async function autoApproveRefund(
  client: PoolClient,
  disputeId: string,
  session: Record<string, unknown>
): Promise<void> {
  try {
    // Update dispute status
    await client.query(
      `UPDATE session_disputes
       SET status = $1, resolution = $2, resolved_at = NOW(), resolution_reason = $3
       WHERE id = $4`,
      [
        'resolved',
        'full_refund',
        'Auto-approved: Creator did not attend session (verified by system logs)',
        disputeId,
      ]
    );

    // Create refund record (actual Stripe refund happens via webhook or separate process)
    await client.query(
      `INSERT INTO refunds (payment_id, amount_cents, reason, status, requested_by, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        session.payment_id,
        session.amount_cents,
        'creator_unavailable',
        'pending',
        'system',
      ]
    );

    // Update session status
    await client.query(
      `UPDATE private_sessions SET status = $1 WHERE id = $2`,
      ['disputed_refunded', session.id]
    );

    log.info('Auto-approved refund for dispute', { disputeId });
  } catch (error) {
    log.error('Auto-approve refund failed', error);
    // Don't throw - let manual review handle it
  }
}
