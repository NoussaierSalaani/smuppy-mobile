/**
 * Cleanup Deleted Accounts Lambda Handler (Scheduled)
 *
 * Runs daily via EventBridge to hard-delete accounts past the 30-day grace period:
 * 1. Find profiles with is_deleted = TRUE AND deleted_at <= NOW() - 30 days
 * 2. Anonymize payment records (SET creator_id = NULL) to unblock RESTRICT FK
 * 3. Delete Stripe customer (remove PII from Stripe)
 * 4. Delete S3 media (avatars, posts, peaks, generic media)
 * 5. Hard-delete the profile (CASCADE handles posts, comments, likes, follows, etc.)
 * 6. Delete Cognito user permanently
 *
 * Required by: GDPR Art. 17 (Right to Erasure), Apple App Store 5.1.1(v)
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SNSClient, DeleteEndpointCommand } from '@aws-sdk/client-sns';
import { getPool } from '../../shared/db';
import { getStripeClient } from '../../shared/stripe-client';
import { createLogger } from '../utils/logger';

const log = createLogger('profiles-cleanup-deleted');

const s3Client = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
const cognitoClient = new CognitoIdentityProviderClient({});
const snsClient = new SNSClient({});

const MEDIA_BUCKET = process.env.MEDIA_BUCKET || '';
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const BATCH_SIZE = 20;
const GRACE_PERIOD_DAYS = 30;

export async function handler(): Promise<{ deleted: number; errors: number }> {
  let totalDeleted = 0;
  let totalErrors = 0;

  try {
    const db = await getPool();

    // Find accounts past the grace period
    const result = await db.query(
      `SELECT id, cognito_sub, stripe_customer_id
       FROM profiles
       WHERE is_deleted = TRUE
         AND deleted_at <= NOW() - make_interval(days => $1)
       LIMIT $2`,
      [GRACE_PERIOD_DAYS, BATCH_SIZE]
    );

    if (result.rows.length === 0) {
      log.info('No deleted accounts past grace period');
      return { deleted: 0, errors: 0 };
    }

    log.warn(`Found ${result.rows.length} accounts to hard-delete`);

    for (const profile of result.rows) {
      const profileId = profile.id;
      const cognitoSub = profile.cognito_sub;
      const maskedId = profileId.substring(0, 8) + '***';

      try {
        // Step 1: Anonymize payment records (unblock RESTRICT FK on payments.creator_id)
        try {
          await db.query(
            'UPDATE payments SET creator_id = NULL WHERE creator_id = $1',
            [profileId]
          );
        } catch (payErr: unknown) {
          log.error('Payment anonymization failed', payErr, { profileId: maskedId });
        }

        // Step 2: Delete Stripe customer (remove PII from Stripe)
        if (profile.stripe_customer_id) {
          try {
            const stripe = await getStripeClient();
            await stripe.customers.del(profile.stripe_customer_id);
          } catch (stripeErr: unknown) {
            // Customer may already be deleted — log and continue
            log.error('Stripe customer deletion failed', stripeErr, { profileId: maskedId });
          }
        }

        // Step 3: Clean up SNS endpoints (push notification ARNs)
        try {
          const snsResult = await db.query(
            'SELECT sns_endpoint_arn FROM push_tokens WHERE user_id = $1 AND sns_endpoint_arn IS NOT NULL',
            [profileId]
          );
          for (const row of snsResult.rows) {
            try {
              await snsClient.send(new DeleteEndpointCommand({
                EndpointArn: row.sns_endpoint_arn,
              }));
            } catch {
              // Endpoint may already be deleted — continue
            }
          }
        } catch (snsErr: unknown) {
          log.error('SNS cleanup failed', snsErr, { profileId: maskedId });
        }

        // Step 4: Delete S3 media (all files under user's prefix)
        if (MEDIA_BUCKET) {
          try {
            const prefixes = [
              `avatars/${profileId}/`,
              `posts/${profileId}/`,
              `peaks/${profileId}/`,
              `media/${profileId}/`,
            ];

            for (const prefix of prefixes) {
              const listResult = await s3Client.send(new ListObjectsV2Command({
                Bucket: MEDIA_BUCKET,
                Prefix: prefix,
                MaxKeys: 1000,
              }));

              if (listResult.Contents && listResult.Contents.length > 0) {
                const objects = listResult.Contents
                  .filter(obj => obj.Key)
                  .map(obj => ({ Key: obj.Key! }));

                if (objects.length > 0) {
                  await s3Client.send(new DeleteObjectsCommand({
                    Bucket: MEDIA_BUCKET,
                    Delete: { Objects: objects, Quiet: true },
                  }));
                }
              }
            }
          } catch (s3Err: unknown) {
            log.error('S3 cleanup failed for account', s3Err, { profileId: maskedId });
          }
        }

        // Step 5: Hard-delete profile (CASCADE handles related data)
        await db.query('DELETE FROM profiles WHERE id = $1', [profileId]);

        // Step 6: Permanently delete Cognito user
        if (USER_POOL_ID && cognitoSub) {
          try {
            await cognitoClient.send(new AdminDeleteUserCommand({
              UserPoolId: USER_POOL_ID,
              Username: cognitoSub,
            }));
          } catch (cognitoErr: unknown) {
            log.error('Cognito user deletion failed', cognitoErr, { profileId: maskedId });
          }
        }

        totalDeleted++;
        log.info('Account hard-deleted', { profileId: maskedId });
      } catch (accountErr: unknown) {
        totalErrors++;
        log.error('Failed to hard-delete account', accountErr, {
          profileId: maskedId,
        });
      }
    }

    log.warn('Account cleanup complete', { deleted: totalDeleted, errors: totalErrors });
    return { deleted: totalDeleted, errors: totalErrors };
  } catch (error: unknown) {
    log.error('Account cleanup failed', error);
    return { deleted: totalDeleted, errors: totalErrors + 1 };
  }
}
