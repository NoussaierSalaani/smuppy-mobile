/**
 * Submit Evidence Lambda Handler
 * POST /disputes/{id}/evidence
 *
 * Allows users to submit evidence for a dispute:
 * - Screenshots
 * - Session logs
 * - Screen recordings
 * - Other documents
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../../lambda/shared/db';
import type { PoolClient } from 'pg';
import { createLogger } from '../../api/utils/logger';
import { getUserFromEvent } from '../../api/utils/auth';
import { createHeaders } from '../../api/utils/cors';
import { checkRateLimit } from '../../api/utils/rate-limit';

const log = createLogger('disputes/submit-evidence');

interface SubmitEvidenceBody {
  type: 'screenshot' | 'recording' | 'document' | 'text';
  url?: string;
  filename?: string;
  description: string;
  textContent?: string;
}

const _ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'application/pdf',
  'text/plain',
];

const _MAX_FILE_SIZE_MB = 50;

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = createHeaders(event);

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

  const disputeId = event.pathParameters?.id;
  if (!disputeId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Dispute ID required' }),
    };
  }

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

    // Rate limit: 5 evidence submissions per hour
    const rateCheck = await checkRateLimit({
      prefix: 'dispute-evidence',
      identifier: user.id,
      maxRequests: 5,
      windowSeconds: 3600,
    });

    if (!rateCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Evidence submission rate limit reached. Try again later.',
        }),
      };
    }

    const body: SubmitEvidenceBody = JSON.parse(event.body || '{}');
    const { type, url, filename, description, textContent } = body;

    // Validation
    if (!type || !description) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Type and description are required',
        }),
      };
    }

    if (description.length < 10 || description.length > 1000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Description must be between 10 and 1000 characters',
        }),
      };
    }

    // For file types, URL is required
    if (type !== 'text' && !url) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'File URL is required for non-text evidence',
        }),
      };
    }

    // For text type, content is required
    if (type === 'text' && !textContent) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Text content is required for text evidence',
        }),
      };
    }

    const db = await getPool();
    client = await db.connect();

    // Get dispute and check authorization
    const disputeResult = await client.query(
      `SELECT 
        d.id, d.status, d.evidence_deadline, 
        d.complainant_id, d.respondent_id,
        complainant.username as complainant_username,
        respondent.username as respondent_username
      FROM session_disputes d
      JOIN profiles complainant ON d.complainant_id = complainant.id
      JOIN profiles respondent ON d.respondent_id = respondent.id
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

    // Check if user can submit evidence
    if (dispute.complainant_id !== user.id && dispute.respondent_id !== user.id) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Only dispute parties can submit evidence',
        }),
      };
    }

    // Check if dispute is still open for evidence
    if (dispute.status === 'resolved' || dispute.status === 'closed') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'This dispute has been resolved and is closed for new evidence',
        }),
      };
    }

    // Check evidence deadline
    const deadline = new Date(dispute.evidence_deadline);
    if (deadline < new Date()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Evidence submission deadline has passed',
        }),
      };
    }

    // Count existing evidence to enforce limit
    const evidenceCount = await client.query(
      'SELECT COUNT(*) as count FROM dispute_evidence WHERE dispute_id = $1 AND uploaded_by = $2',
      [disputeId, user.id]
    );

    if (parseInt(evidenceCount.rows[0].count) >= 10) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Maximum 10 evidence items per user allowed',
        }),
      };
    }

    await client.query('BEGIN');

    // Create evidence record
    const evidenceResult = await client.query(
      `INSERT INTO dispute_evidence 
       (dispute_id, type, url, filename, description, text_content, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, uploaded_at`,
      [disputeId, type, url || null, filename || null, description, textContent || null, user.id]
    );

    const evidence = evidenceResult.rows[0];

    // Add to timeline
    await client.query(
      `INSERT INTO dispute_timeline (dispute_id, event_type, event_data, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        disputeId,
        'evidence_submitted',
        JSON.stringify({
          evidenceId: evidence.id,
          evidenceType: type,
          submittedBy: user.id,
        }),
        user.id,
        evidence.uploaded_at,
      ]
    );

    // Notify the other party
    const otherPartyId = dispute.complainant_id === user.id
      ? dispute.respondent_id
      : dispute.complainant_id;

    const submitterName = dispute.complainant_id === user.id
      ? dispute.complainant_username
      : dispute.respondent_username;

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        otherPartyId,
        'dispute_evidence',
        'New Evidence Submitted',
        `${submitterName} has submitted new evidence for dispute ${dispute.dispute_number || disputeId.slice(0, 8)}`,
        JSON.stringify({ disputeId, evidenceId: evidence.id }),
      ]
    );

    // Update dispute status if needed
    if (dispute.status === 'open') {
      await client.query(
        'UPDATE session_disputes SET status = $1 WHERE id = $2',
        ['evidence_requested', disputeId]
      );
    }

    await client.query('COMMIT');

    log.info('Evidence submitted', {
      evidenceId: evidence.id,
      disputeId,
      userId: user.id,
      type,
    });

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        evidence: {
          id: evidence.id,
          type,
          description,
          uploadedAt: evidence.uploaded_at,
        },
        message: 'Evidence submitted successfully',
      }),
    };
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    log.error('Submit evidence error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  } finally {
    if (client) client.release();
  }
};
