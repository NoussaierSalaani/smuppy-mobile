/**
 * Upload Quota Lambda Handler
 * Returns current daily quota status for the authenticated user.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { requireRateLimit } from '../utils/rate-limit';
import { withErrorHandler } from '../utils/error-handler';
import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { getQuotaLimits, getQuotaUsage, isPremiumAccount } from '../utils/upload-quota';

export const handler = withErrorHandler('media-upload-quota', async (event, { headers }) => {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    // Rate limit: 30 per minute
    const rateLimitResponse = await requireRateLimit({
      prefix: 'upload-quota',
      identifier: userId,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 30,
      failOpen: true,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Look up account type
    const db = await getPool();
    const profileResult = await db.query(
      'SELECT id, account_type FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }

    const profile = profileResult.rows[0];
    const accountType: string = profile.account_type || 'personal';
    const limits = getQuotaLimits(accountType);

    // For premium accounts, skip DynamoDB reads
    const usage = isPremiumAccount(accountType)
      ? { videoSecondsUsed: 0, photoCountUsed: 0, peakCountUsed: 0 }
      : await getQuotaUsage(profile.id);

    // Compute reset time: start of next UTC day
    const now = Math.floor(Date.now() / 1000);
    const dayNumber = Math.floor(now / 86400);
    const resetsAt = new Date((dayNumber + 1) * 86400 * 1000).toISOString();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        accountType,
        quotas: {
          videoSeconds: {
            limit: limits.dailyVideoSeconds,
            used: usage.videoSecondsUsed,
            remaining: limits.dailyVideoSeconds !== null
              ? Math.max(0, limits.dailyVideoSeconds - usage.videoSecondsUsed)
              : null,
          },
          photoCount: {
            limit: limits.dailyPhotoCount,
            used: usage.photoCountUsed,
            remaining: limits.dailyPhotoCount !== null
              ? Math.max(0, limits.dailyPhotoCount - usage.photoCountUsed)
              : null,
          },
          peakCount: {
            limit: limits.dailyPeakCount,
            used: usage.peakCountUsed,
            remaining: limits.dailyPeakCount !== null
              ? Math.max(0, limits.dailyPeakCount - usage.peakCountUsed)
              : null,
          },
          maxVideoSeconds: limits.maxVideoSeconds,
          maxVideoSizeBytes: limits.maxVideoSizeBytes,
          videoRenditions: limits.videoRenditions,
        },
        resetsAt,
      }),
    };
});
