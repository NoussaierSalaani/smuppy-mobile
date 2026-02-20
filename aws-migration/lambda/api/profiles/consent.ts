/**
 * Update User Consent Lambda Handler
 * POST /api/profiles/consent
 *
 * Records user consent for GDPR/App Store compliance:
 * - terms_of_service: acceptance of ToS
 * - privacy_policy: acceptance of privacy policy
 * - marketing: opt-in for marketing communications
 *
 * Each consent is tracked with timestamp and version for auditability.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { resolveProfileId } from '../utils/auth';

const VALID_CONSENT_TYPES = ['terms_of_service', 'privacy_policy', 'marketing'] as const;
type ConsentType = typeof VALID_CONSENT_TYPES[number];

interface ConsentRequest {
  consents: Array<{
    type: ConsentType;
    accepted: boolean;
    version: string;
  }>;
}

export const handler = withErrorHandler('profiles-consent', async (event, { headers, log }) => {
  const cognitoSub = event.requestContext.authorizer?.claims?.sub;
  if (!cognitoSub) {
    return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
  }

  // Rate limit: 10 consent updates per minute
  const rateLimitResponse = await requireRateLimit({
    prefix: 'profile-consent',
    identifier: cognitoSub,
    windowSeconds: 60,
    maxRequests: 10,
  }, headers);
  if (rateLimitResponse) return rateLimitResponse;

  if (!event.body) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Request body is required' }) };
  }

  let body: ConsentRequest;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid JSON body' }) };
  }

  if (!Array.isArray(body.consents) || body.consents.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'consents array is required' }) };
  }

  // Validate consent entries
  for (const consent of body.consents) {
    if (!VALID_CONSENT_TYPES.includes(consent.type)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: `Invalid consent type: ${consent.type}. Valid: ${VALID_CONSENT_TYPES.join(', ')}` }),
      };
    }
    if (typeof consent.accepted !== 'boolean') {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'accepted must be a boolean' }) };
    }
    if (!consent.version || typeof consent.version !== 'string' || consent.version.length > 20) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'version is required (max 20 chars)' }) };
    }
  }

  const db = await getPool();

  // Get user profile
  const profileId = await resolveProfileId(db, cognitoSub);

  if (!profileId) {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
  }

  // Upsert each consent record
  for (const consent of body.consents) {
    await db.query(
      `INSERT INTO user_consents (user_id, consent_type, accepted, version, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        profileId,
        consent.type,
        consent.accepted,
        consent.version,
        event.requestContext.identity?.sourceIp || null,
        event.headers?.['User-Agent']?.substring(0, 500) || null,
      ]
    );
  }

  log.info('Consent recorded', {
    profileId: profileId.substring(0, 8) + '***',
    types: body.consents.map(c => `${c.type}:${c.accepted}`).join(','),
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, message: 'Consent recorded' }),
  };
});
