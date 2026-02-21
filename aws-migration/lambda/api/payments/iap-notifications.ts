/**
 * IAP Server Notifications Webhook
 *
 * Handles server-to-server notifications from:
 * - Apple: App Store Server Notifications v2 (JWS-signed)
 * - Google: Real-Time Developer Notifications (RTDN) via Google Cloud Pub/Sub
 *
 * These notifications inform us about subscription lifecycle events:
 * - Renewal, expiration, grace period, refund, revocation
 * - The source of truth for subscription status changes
 *
 * Security:
 * - No Cognito auth (server-to-server webhook)
 * - Apple: JWS signature verification via x5c certificate chain
 * - Google: package name verification + API callback validation
 * - Event age check (anti-replay)
 * - Event deduplication via unique notification ID
 * - DB operations wrapped in transactions
 * - Input length validation
 * - URL-safe encoding on external API calls
 * - Fetch timeouts on all outbound requests
 * - DLQ for failed processing
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { withErrorHandler } from '../utils/error-handler';
import { getPool } from '../../shared/db';
import { getAppleIAPSecrets, getGooglePlaySecrets } from '../../shared/secrets';
import { GoogleAuth } from 'google-auth-library';
import { verifyAppleJWS } from '../utils/apple-jws';

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

const MAX_BODY_LEN = 100_000;                    // 100 KB
const MAX_EVENT_AGE_MS = 5 * 60 * 1000;          // 5 minutes (Apple)
const GOOGLE_MAX_EVENT_AGE_MS = 60 * 60 * 1000;  // 1 hour (Pub/Sub retries)
const FETCH_TIMEOUT_MS = 10_000;                  // 10 seconds

// Event deduplication (in-memory, best-effort)
const processedNotifications = new Map<string, number>();
const MAX_PROCESSED_SIZE = 500;

function cleanupProcessed(): void {
  if (processedNotifications.size < MAX_PROCESSED_SIZE) return;
  const cutoff = Date.now() - MAX_EVENT_AGE_MS * 2;
  for (const [id, ts] of processedNotifications.entries()) {
    if (ts < cutoff) processedNotifications.delete(id);
  }
}

// ────────────────────────────────────────────
// Apple: App Store Server Notifications v2
// ────────────────────────────────────────────

async function handleAppleNotification(
  body: string,
  log: import('../utils/logger').Logger,
): Promise<{ statusCode: number; message: string }> {
  // 1. Parse body safely
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { statusCode: 400, message: 'Invalid JSON' };
  }

  const signedPayload = parsed.signedPayload;
  if (!signedPayload || typeof signedPayload !== 'string') {
    return { statusCode: 400, message: 'Missing signedPayload' };
  }

  // 2. Verify JWS signature on outer notification payload
  const notification = verifyAppleJWS(signedPayload);
  if (!notification) {
    log.warn('Apple notification JWS verification failed');
    return { statusCode: 403, message: 'JWS verification failed' };
  }

  // Extract typed fields from verified payload
  const notificationType = notification.notificationType as string | undefined;
  const subtype = notification.subtype as string | undefined;
  const data = notification.data as
    | { signedTransactionInfo?: string; signedRenewalInfo?: string }
    | undefined;
  const notifId = notification.notificationUUID as string | undefined;
  const signedDate = notification.signedDate as number | undefined;

  if (!notificationType || !data?.signedTransactionInfo || !notifId) {
    return { statusCode: 400, message: 'Incomplete notification payload' };
  }

  // 3. Event age check (anti-replay)
  if (signedDate) {
    const age = Date.now() - signedDate;
    if (age > MAX_EVENT_AGE_MS || age < -60_000) {
      log.warn('Apple notification expired or future-dated', { age, signedDate });
      return { statusCode: 400, message: 'Notification expired' };
    }
  }

  // 4. Deduplicate
  if (processedNotifications.has(notifId)) {
    log.info('Duplicate Apple notification, skipping', { notifId });
    return { statusCode: 200, message: 'Already processed' };
  }
  processedNotifications.set(notifId, Date.now());

  // 5. Verify JWS signature on transaction info
  const txInfo = verifyAppleJWS(data.signedTransactionInfo);
  if (!txInfo) {
    log.warn('Apple transaction JWS verification failed');
    return { statusCode: 400, message: 'Transaction JWS verification failed' };
  }

  const originalTransactionId = txInfo.originalTransactionId as string | undefined;
  const transactionId = txInfo.transactionId as string | undefined;
  const productId = txInfo.productId as string | undefined;
  const expiresDate = txInfo.expiresDate as number | undefined;
  const bundleId = txInfo.bundleId as string | undefined;

  // 6. Verify bundle ID matches our app
  const secrets = await getAppleIAPSecrets();
  if (bundleId !== secrets.bundleId) {
    log.warn('Bundle ID mismatch in Apple notification', {
      expected: secrets.bundleId,
      got: bundleId,
    });
    return { statusCode: 403, message: 'Invalid bundle ID' };
  }

  log.info('Apple notification received', {
    type: notificationType,
    subtype,
    productId,
    originalTxId: originalTransactionId
      ? originalTransactionId.substring(0, 8) + '***'
      : 'unknown',
  });

  // 7. DB operations in a transaction
  const db = await getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    switch (notificationType) {
      case 'DID_RENEW':
      case 'SUBSCRIBED':
      case 'DID_CHANGE_RENEWAL_STATUS': {
        await client.query(
          `UPDATE user_entitlements
           SET expires_date = $1,
               is_active = true,
               auto_renew_status = $2,
               updated_at = NOW()
           WHERE platform = 'ios'
             AND original_transaction_id = $3`,
          [
            expiresDate ? new Date(expiresDate) : null,
            notificationType !== 'DID_CHANGE_RENEWAL_STATUS'
              || subtype !== 'AUTO_RENEW_DISABLED',
            originalTransactionId,
          ],
        );
        break;
      }

      case 'EXPIRED':
      case 'REVOKE': {
        await client.query(
          `UPDATE user_entitlements
           SET is_active = false,
               auto_renew_status = false,
               updated_at = NOW()
           WHERE platform = 'ios'
             AND original_transaction_id = $1`,
          [originalTransactionId],
        );
        if (originalTransactionId) {
          await revertEntitlement(client, 'ios', originalTransactionId, log);
        }
        break;
      }

      case 'GRACE_PERIOD_EXPIRED': {
        await client.query(
          `UPDATE user_entitlements
           SET is_active = false,
               updated_at = NOW()
           WHERE platform = 'ios'
             AND original_transaction_id = $1`,
          [originalTransactionId],
        );
        if (originalTransactionId) {
          await revertEntitlement(client, 'ios', originalTransactionId, log);
        }
        break;
      }

      case 'REFUND': {
        await client.query(
          `UPDATE user_entitlements
           SET is_active = false,
               updated_at = NOW()
           WHERE platform = 'ios'
             AND store_transaction_id = $1`,
          [transactionId],
        );
        log.warn('Apple refund processed', {
          transactionId: transactionId
            ? transactionId.substring(0, 8) + '***'
            : 'unknown',
          productId,
        });
        break;
      }

      case 'DID_CHANGE_RENEWAL_PREF': {
        log.info('Apple subscription plan change', {
          subtype,
          productId,
          originalTxId: originalTransactionId
            ? originalTransactionId.substring(0, 8) + '***'
            : 'unknown',
        });
        break;
      }

      default:
        log.info('Unhandled Apple notification type', {
          type: notificationType,
        });
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { statusCode: 200, message: 'OK' };
}

// ────────────────────────────────────────────
// Google: Real-Time Developer Notifications
// ────────────────────────────────────────────

interface GoogleRTDNPayload {
  message: {
    data: string; // base64-encoded JSON
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

interface GoogleDeveloperNotification {
  version: string;
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification?: {
    version: string;
    notificationType: number;
    purchaseToken: string;
    subscriptionId: string;
  };
  oneTimeProductNotification?: {
    version: string;
    notificationType: number;
    purchaseToken: string;
    sku: string;
  };
}

// Google subscription notification types
const GOOGLE_SUB_NOTIF = {
  RECOVERED: 1,
  RENEWED: 2,
  CANCELED: 3,
  PURCHASED: 4,
  ON_HOLD: 5,
  IN_GRACE_PERIOD: 6,
  RESTARTED: 7,
  PRICE_CHANGE: 8,
  DEFERRED: 9,
  PAUSED: 10,
  PAUSE_SCHEDULE_CHANGED: 11,
  REVOKED: 12,
  EXPIRED: 13,
} as const;

async function handleGoogleNotification(
  body: string,
  log: import('../utils/logger').Logger,
): Promise<{ statusCode: number; message: string }> {
  // 1. Parse body safely
  let rtdn: GoogleRTDNPayload;
  try {
    rtdn = JSON.parse(body);
  } catch {
    return { statusCode: 400, message: 'Invalid JSON' };
  }

  if (!rtdn.message?.data) {
    return { statusCode: 400, message: 'Missing message data' };
  }

  // 2. Event age check (Pub/Sub retries up to 7 days — use 1h window)
  if (rtdn.message.publishTime) {
    const publishTime = new Date(rtdn.message.publishTime).getTime();
    if (!Number.isNaN(publishTime)) {
      const age = Date.now() - publishTime;
      if (age > GOOGLE_MAX_EVENT_AGE_MS || age < -60_000) {
        log.warn('Google notification expired', {
          age,
          publishTime: rtdn.message.publishTime,
        });
        // Return 200 to prevent Pub/Sub from retrying an expired message
        return { statusCode: 200, message: 'Notification expired, acknowledged' };
      }
    }
  }

  // 3. Deduplicate
  const messageId = rtdn.message.messageId;
  if (processedNotifications.has(messageId)) {
    log.info('Duplicate Google notification, skipping', { messageId });
    return { statusCode: 200, message: 'Already processed' };
  }
  processedNotifications.set(messageId, Date.now());

  // 4. Decode the notification data
  let notification: GoogleDeveloperNotification;
  try {
    const notifJson = Buffer.from(rtdn.message.data, 'base64').toString('utf-8');
    notification = JSON.parse(notifJson);
  } catch {
    return { statusCode: 400, message: 'Invalid notification data' };
  }

  // 5. Verify package name
  const secrets = await getGooglePlaySecrets();
  if (notification.packageName !== secrets.packageName) {
    log.warn('Package name mismatch in Google notification', {
      expected: secrets.packageName,
      got: notification.packageName,
    });
    return { statusCode: 403, message: 'Invalid package name' };
  }

  // 6. DB operations in a transaction
  const db = await getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Handle subscription notifications
    if (notification.subscriptionNotification) {
      const subNotif = notification.subscriptionNotification;
      const { purchaseToken, subscriptionId, notificationType } = subNotif;

      log.info('Google subscription notification', {
        type: notificationType,
        subscriptionId,
        token: purchaseToken ? purchaseToken.substring(0, 8) + '***' : 'unknown',
      });

      switch (notificationType) {
        case GOOGLE_SUB_NOTIF.RENEWED:
        case GOOGLE_SUB_NOTIF.RECOVERED:
        case GOOGLE_SUB_NOTIF.RESTARTED:
        case GOOGLE_SUB_NOTIF.PURCHASED: {
          const subData = await fetchGoogleSubscription(purchaseToken, secrets);
          if (subData) {
            await client.query(
              `UPDATE user_entitlements
               SET expires_date = $1,
                   is_active = true,
                   auto_renew_status = true,
                   updated_at = NOW()
               WHERE platform = 'android'
                 AND store_product_id = $2
                 AND raw_receipt = $3`,
              [
                subData.expiresDate ? new Date(subData.expiresDate) : null,
                subscriptionId,
                purchaseToken,
              ],
            );
          }
          break;
        }

        case GOOGLE_SUB_NOTIF.CANCELED:
        case GOOGLE_SUB_NOTIF.REVOKED:
        case GOOGLE_SUB_NOTIF.EXPIRED: {
          await client.query(
            `UPDATE user_entitlements
             SET is_active = false,
                 auto_renew_status = false,
                 updated_at = NOW()
             WHERE platform = 'android'
               AND store_product_id = $1
               AND raw_receipt = $2`,
            [subscriptionId, purchaseToken],
          );
          await revertEntitlementByToken(
            client,
            'android',
            subscriptionId,
            purchaseToken,
            log,
          );
          break;
        }

        case GOOGLE_SUB_NOTIF.ON_HOLD:
        case GOOGLE_SUB_NOTIF.IN_GRACE_PERIOD:
        case GOOGLE_SUB_NOTIF.PAUSED: {
          log.info('Google subscription status change', {
            type: notificationType,
            subscriptionId,
          });
          break;
        }

        default:
          log.info('Unhandled Google subscription notification type', {
            type: notificationType,
          });
      }
    }

    // Handle one-time product notifications (tips)
    if (notification.oneTimeProductNotification) {
      log.info('Google one-time product notification', {
        type: notification.oneTimeProductNotification.notificationType,
        sku: notification.oneTimeProductNotification.sku,
      });
      // One-time products don't need lifecycle management
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { statusCode: 200, message: 'OK' };
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

async function fetchGoogleSubscription(
  purchaseToken: string,
  secrets: import('../../shared/secrets').GooglePlaySecrets,
): Promise<{ expiresDate?: number } | null> {
  try {
    const auth = new GoogleAuth({
      credentials: secrets.serviceAccount,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();

    if (!accessToken.token) return null;

    // URL-encode user-supplied values to prevent path injection
    const encodedPackage = encodeURIComponent(secrets.packageName);
    const encodedToken = encodeURIComponent(purchaseToken);

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodedPackage}/purchases/subscriptionsv2/tokens/${encodedToken}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken.token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      lineItems?: Array<{ expiryTime?: string }>;
    };
    const lineItem = data.lineItems?.[0];

    return {
      expiresDate: lineItem?.expiryTime
        ? new Date(lineItem.expiryTime).getTime()
        : undefined,
    };
  } catch {
    return null;
  }
}

/** Revert account entitlement when an Apple subscription expires/is revoked */
async function revertEntitlement(
  client: import('pg').PoolClient,
  platform: string,
  originalTransactionId: string,
  log: import('../utils/logger').Logger,
): Promise<void> {
  const result = await client.query(
    `SELECT profile_id, product_type FROM user_entitlements
     WHERE platform = $1 AND original_transaction_id = $2
     LIMIT 1`,
    [platform, originalTransactionId],
  );

  if (result.rows.length === 0) return;

  const { profile_id: profileId, product_type: productType } = result.rows[0];
  await doRevertEntitlement(client, profileId, productType, log);
}

/** Revert account entitlement when a Google subscription expires/is revoked */
async function revertEntitlementByToken(
  client: import('pg').PoolClient,
  platform: string,
  subscriptionId: string,
  purchaseToken: string,
  log: import('../utils/logger').Logger,
): Promise<void> {
  const result = await client.query(
    `SELECT profile_id, product_type FROM user_entitlements
     WHERE platform = $1 AND store_product_id = $2 AND raw_receipt = $3
     LIMIT 1`,
    [platform, subscriptionId, purchaseToken],
  );

  if (result.rows.length === 0) return;

  const { profile_id: profileId, product_type: productType } = result.rows[0];
  await doRevertEntitlement(client, profileId, productType, log);
}

async function doRevertEntitlement(
  client: import('pg').PoolClient,
  profileId: string,
  productType: string,
  log: import('../utils/logger').Logger,
): Promise<void> {
  // Check if the user has any OTHER active entitlement of the same type
  const otherActive = await client.query(
    `SELECT id FROM user_entitlements
     WHERE profile_id = $1 AND product_type = $2 AND is_active = true
     LIMIT 1`,
    [profileId, productType],
  );

  if (otherActive.rows.length > 0) {
    // Still has another active entitlement — don't revert
    return;
  }

  if (productType === 'pro_creator' || productType === 'pro_business') {
    await client.query(
      `UPDATE profiles
       SET account_type = 'personal',
           subscription_source = NULL,
           updated_at = NOW()
       WHERE id = $1 AND subscription_source = 'iap'`,
      [profileId],
    );
    log.info('Reverted account type to personal', {
      profile: profileId.substring(0, 8) + '***',
      previousType: productType,
    });
  } else if (productType === 'verified') {
    await client.query(
      `UPDATE profiles
       SET is_verified = false,
           verification_source = NULL,
           updated_at = NOW()
       WHERE id = $1 AND verification_source = 'iap'`,
      [profileId],
    );
    log.info('Reverted verified status', {
      profile: profileId.substring(0, 8) + '***',
    });
  }
}

// ────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────

export const handler = withErrorHandler(
  'iap-notifications',
  async (event, { headers, log }) => {
    cleanupProcessed();

    const body = event.body || '';
    if (!body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Empty request body' }),
      };
    }

    // Input length validation
    if (body.length > MAX_BODY_LEN) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Request body too large' }),
      };
    }

    // Determine which platform sent this notification based on the path
    // /payments/iap/notifications/apple or /payments/iap/notifications/google
    const path = event.path || event.resource || '';
    const isApple = path.includes('apple');
    const isGoogle = path.includes('google');

    if (!isApple && !isGoogle) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Unknown notification source' }),
      };
    }

    let result: { statusCode: number; message: string };

    if (isApple) {
      result = await handleAppleNotification(body, log);
    } else {
      result = await handleGoogleNotification(body, log);
    }

    return {
      statusCode: result.statusCode,
      headers,
      body: JSON.stringify({ message: result.message }),
    };
  },
);
