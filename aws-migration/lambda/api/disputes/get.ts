/**
 * Get Dispute Details Lambda Handler
 * GET /disputes/{id}
 *
 * Returns full dispute details including:
 * - Dispute info
 * - Evidence
 * - Verification logs
 * - Chat history
 * - Timeline of events
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../../lambda/shared/db';
import type { Pool, PoolClient } from 'pg';
import { createLogger } from '../../api/utils/logger';
import { getUserFromEvent } from '../../api/utils/auth';
import { createHeaders } from '../../api/utils/cors';
import { checkRateLimit } from '../../api/utils/rate-limit';

const log = createLogger('disputes/get');

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    };
  }

  const disputeId = event.pathParameters?.id;
  if (!disputeId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Dispute ID required' }),
    };
  }

  try {
    const user = await getUserFromEvent(event);
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit: 60 reads per minute
    const rateCheck = await checkRateLimit({
      prefix: 'dispute-read',
      identifier: user.id,
      maxRequests: 60,
      windowSeconds: 60,
    });

    if (!rateCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests' }),
      };
    }

    const db = await getPool();

    // Check if user is admin
    const adminCheck = await db.query(
      'SELECT account_type FROM profiles WHERE id = $1',
      [user.id]
    );
    const isAdmin = adminCheck.rows[0]?.account_type === 'admin';

    // Get dispute
    const disputeResult = await db.query(
      `SELECT
        d.id, d.dispute_number, d.type, d.status, d.priority,
        d.created_at, d.resolved_at, d.resolution, d.resolution_reason,
        d.evidence_deadline, d.amount_cents, d.refund_amount_cents, d.currency,
        d.complainant_id, d.respondent_id, d.session_id, d.payment_id,
        d.complainant_description, d.respondent_response, d.auto_verification,
        ps.scheduled_at as session_date,
        ps.duration_minutes as session_duration,
        ps.creator_notes,
        complainant.username as complainant_username,
        complainant.avatar_url as complainant_avatar,
        complainant.email as complainant_email,
        respondent.username as respondent_username,
        respondent.avatar_url as respondent_avatar,
        respondent.email as respondent_email,
        p.id as payment_id,
        p.stripe_payment_intent_id,
        p.status as payment_status
      FROM session_disputes d
      JOIN private_sessions ps ON d.session_id = ps.id
      JOIN profiles complainant ON d.complainant_id = complainant.id
      JOIN profiles respondent ON d.respondent_id = respondent.id
      LEFT JOIN payments p ON d.payment_id = p.id
      WHERE d.id = $1`,
      [disputeId]
    );

    if (disputeResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Dispute not found' }),
      };
    }

    const dispute = disputeResult.rows[0];

    // Authorization check
    if (!isAdmin && dispute.complainant_id !== user.id && dispute.respondent_id !== user.id) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Access denied' }),
      };
    }

    // Fetch related data in parallel
    const [evidenceResult, logsResult, messagesResult, timelineResult] = await Promise.all([
      // Evidence
      db.query(
        `SELECT id, type, url, filename, description, uploaded_by, uploaded_at
         FROM dispute_evidence
         WHERE dispute_id = $1
         ORDER BY uploaded_at DESC`,
        [disputeId]
      ),

      // Verification logs
      db.query(
        `SELECT event_type, metadata, recorded_at, source
         FROM session_verification_logs
         WHERE session_id = $1
         ORDER BY recorded_at DESC`,
        [dispute.session_id]
      ),

      // Session messages
      db.query(
        `SELECT id, sender_id, message, attachment_type, attachment_url, created_at
         FROM private_session_messages
         WHERE session_id = $1
         ORDER BY created_at ASC`,
        [dispute.session_id]
      ),

      // Timeline events
      db.query(
        `SELECT event_type, event_data, created_by, created_at
         FROM dispute_timeline
         WHERE dispute_id = $1
         ORDER BY created_at ASC`,
        [disputeId]
      ),
    ]);

    // Build response
    const response = {
      success: true,
      dispute: {
        id: dispute.id,
        disputeNumber: dispute.dispute_number,
        type: dispute.type,
        status: dispute.status,
        priority: dispute.priority,
        createdAt: dispute.created_at,
        resolvedAt: dispute.resolved_at,
        resolution: dispute.resolution,
        resolutionReason: dispute.resolution_reason,
        evidenceDeadline: dispute.evidence_deadline,

        // Amounts
        amount: dispute.amount_cents / 100,
        refundAmount: dispute.refund_amount_cents
          ? dispute.refund_amount_cents / 100
          : null,
        currency: dispute.currency,

        // Descriptions
        complainantDescription: dispute.complainant_description,
        respondentResponse: dispute.respondent_response,

        // Auto verification
        autoVerification: dispute.auto_verification,

        // Session info
        session: {
          id: dispute.session_id,
          scheduledAt: dispute.session_date,
          durationMinutes: dispute.session_duration,
          creatorNotes: dispute.creator_notes,
        },

        // Payment info
        payment: {
          id: dispute.payment_id,
          stripePaymentIntentId: dispute.stripe_payment_intent_id,
          status: dispute.payment_status,
        },

        // People
        complainant: {
          id: dispute.complainant_id,
          username: dispute.complainant_username,
          avatar: dispute.complainant_avatar,
          // Email only for admins or self
          email: isAdmin || dispute.complainant_id === user.id
            ? dispute.complainant_email
            : undefined,
        },
        respondent: {
          id: dispute.respondent_id,
          username: dispute.respondent_username,
          avatar: dispute.respondent_avatar,
          email: isAdmin || dispute.respondent_id === user.id
            ? dispute.respondent_email
            : undefined,
        },

        // Evidence
        evidence: evidenceResult.rows.map((e) => ({
          id: e.id,
          type: e.type,
          url: e.url,
          filename: e.filename,
          description: e.description,
          uploadedBy: e.uploaded_by,
          uploadedAt: e.uploaded_at,
        })),

        // Verification logs
        verificationLogs: logsResult.rows.map((l) => ({
          eventType: l.event_type,
          metadata: l.metadata,
          recordedAt: l.recorded_at,
          source: l.source,
        })),

        // Session messages
        sessionMessages: messagesResult.rows.map((m) => ({
          id: m.id,
          senderId: m.sender_id,
          message: m.message,
          attachmentType: m.attachment_type,
          attachmentUrl: m.attachment_url,
          createdAt: m.created_at,
        })),

        // Timeline
        timeline: timelineResult.rows.map((t) => ({
          eventType: t.event_type,
          eventData: t.event_data,
          createdBy: t.created_by,
          createdAt: t.created_at,
        })),

        // User's role in this dispute
        userRole: dispute.complainant_id === user.id
          ? 'complainant'
          : dispute.respondent_id === user.id
            ? 'respondent'
            : 'admin',
      },
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    log.error('Get dispute error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};
