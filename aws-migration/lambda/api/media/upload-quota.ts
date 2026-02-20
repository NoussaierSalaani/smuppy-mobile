/**
 * Upload Quota Lambda Handler
 * Returns current daily quota status for the authenticated user.
 */

import { requireRateLimit } from '../utils/rate-limit';
import { withAuthHandler } from '../utils/with-auth-handler';
import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { getQuotaLimits, getQuotaUsage, isPremiumAccount } from '../utils/upload-quota';

export const handler = withAuthHandler('media-upload-quota', async (event, { headers, cognitoSub, profileId, db }) => {
    // Rate limit: 30 per minute
    const rateLimitResponse = await requireRateLimit({
      prefix: 'upload-quota',
      identifier: cognitoSub,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 30,
      failOpen: true,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Look up account type
    const profileResult = await db.query(
      'SELECT account_type FROM profiles WHERE id = $1',
      [profileId]
    );
    const accountType: string = profileResult.rows[0]?.account_type || 'personal';
    const limits = getQuotaLimits(accountType);

    // For premium accounts, skip DynamoDB reads
    const usage = isPremiumAccount(accountType)
      ? { videoSecondsUsed: 0, photoCountUsed: 0, peakCountUsed: 0 }
      : await getQuotaUsage(profileId);

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
