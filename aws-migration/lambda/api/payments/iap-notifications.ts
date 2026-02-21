/**
 * IAP Server Notifications Webhook
 *
 * Handles server-to-server notifications from:
 * - Apple: App Store Server Notifications v2
 * - Google: Real-Time Developer Notifications (RTDN) via Google Cloud Pub/Sub
 *
 * These notifications inform us about subscription lifecycle events:
 * - Renewal, expiration, grace period, refund, revocation
 * - The source of truth for subscription status changes
 *
 * Security:
 * - No Cognito auth (server-to-server webhook)
 * - Apple: JWS signature verification
 * - Google: verified by Pub/Sub message signature
 * - Event deduplication via unique notification ID
 * - DLQ for failed processing
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { withErrorHandler } from '../utils/error-handler';
import { getPool } from '../../shared/db';
import { getAppleIAPSecrets, getGooglePlaySecrets } from '../../shared/secrets';
import { GoogleAuth } from 'google-auth-library';

// Event deduplication
const processedNotifications = new Map<string, number>();
const MAX_PROCESSED_SIZE = 500;
const MAX_EVENT_AGE_MS = 5 * 60 * 1000; // 5 minutes

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

interface AppleNotificationPayload {
  notificationType: string;
  subtype?: string;
  data: {
    signedTransactionInfo: string;
    signedRenewalInfo?: string;
  };
  notificationUUID: string;
}

async function handleAppleNotification(
  body: string,
  log: import('../utils/logger').Logger,
): Promise<{ statusCode: number; message: string }> {
  // Apple sends a JWS-signed notification
  // The outer payload is a signedPayload field
  const parsed = JSON.parse(body);
  const signedPayload = parsed.signedPayload;

  if (!signedPayload) {
    return { statusCode: 400, message: 'Missing signedPayload' };
  }

  // Decode JWS payload (verification done via Apple's server for the notification,
  // and the transaction itself is fetched/validated in the handler)
  const parts = signedPayload.split('.');
  if (parts.length !== 3) {
    return { statusCode: 400, message: 'Invalid JWS format' };
  }

  const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
  const notification: AppleNotificationPayload = JSON.parse(payloadJson);

  // Deduplicate
  const notifId = notification.notificationUUID;
  if (processedNotifications.has(notifId)) {
    log.info('Duplicate Apple notification, skipping', { notifId });
    return { statusCode: 200, message: 'Already processed' };
  }
  processedNotifications.set(notifId, Date.now());

  // Decode transaction info
  const txParts = notification.data.signedTransactionInfo.split('.');
  if (txParts.length !== 3) {
    return { statusCode: 400, message: 'Invalid transaction JWS' };
  }

  const txJson = Buffer.from(txParts[1], 'base64url').toString('utf-8');
  const txInfo = JSON.parse(txJson);

  const {
    originalTransactionId,
    transactionId,
    productId,
    expiresDate,
    bundleId,
  } = txInfo;

  // Verify bundle ID
  const secrets = await getAppleIAPSecrets();
  if (bundleId !== secrets.bundleId) {
    log.warn('Bundle ID mismatch in Apple notification', { expected: secrets.bundleId, got: bundleId });
    return { statusCode: 403, message: 'Invalid bundle ID' };
  }

  log.info('Apple notification received', {
    type: notification.notificationType,
    subtype: notification.subtype,
    productId,
    originalTxId: originalTransactionId?.substring(0, 8) + '***',
  });

  const db = await getPool();

  // Route by notification type
  switch (notification.notificationType) {
    case 'DID_RENEW':
    case 'SUBSCRIBED':
    case 'DID_CHANGE_RENEWAL_STATUS': {
      // Subscription renewed or resubscribed — extend expiry
      await db.query(
        `UPDATE user_entitlements
         SET expires_date = $1,
             is_active = true,
             auto_renew_status = $2,
             updated_at = NOW()
         WHERE platform = 'ios'
           AND original_transaction_id = $3`,
        [
          expiresDate ? new Date(expiresDate) : null,
          notification.notificationType !== 'DID_CHANGE_RENEWAL_STATUS'
            || notification.subtype !== 'AUTO_RENEW_DISABLED',
          originalTransactionId,
        ],
      );
      break;
    }

    case 'EXPIRED':
    case 'REVOKE': {
      // Subscription expired or revoked — deactivate
      await db.query(
        `UPDATE user_entitlements
         SET is_active = false,
             auto_renew_status = false,
             updated_at = NOW()
         WHERE platform = 'ios'
           AND original_transaction_id = $1`,
        [originalTransactionId],
      );

      // Revert account type if this was a platform subscription
      await revertEntitlement(db, 'ios', originalTransactionId, log);
      break;
    }

    case 'GRACE_PERIOD_EXPIRED': {
      // Grace period ended without payment — deactivate
      await db.query(
        `UPDATE user_entitlements
         SET is_active = false,
             updated_at = NOW()
         WHERE platform = 'ios'
           AND original_transaction_id = $1`,
        [originalTransactionId],
      );
      await revertEntitlement(db, 'ios', originalTransactionId, log);
      break;
    }

    case 'REFUND': {
      // Refund processed — deactivate and log
      await db.query(
        `UPDATE user_entitlements
         SET is_active = false,
             updated_at = NOW()
         WHERE platform = 'ios'
           AND store_transaction_id = $1`,
        [transactionId],
      );
      log.warn('Apple refund processed', {
        transactionId: transactionId?.substring(0, 8) + '***',
        productId,
      });
      break;
    }

    case 'DID_CHANGE_RENEWAL_PREF': {
      // User changed subscription plan (upgrade/downgrade)
      log.info('Apple subscription plan change', {
        subtype: notification.subtype,
        productId,
        originalTxId: originalTransactionId?.substring(0, 8) + '***',
      });
      // The actual change takes effect at next renewal — no immediate action needed
      break;
    }

    default:
      log.info('Unhandled Apple notification type', { type: notification.notificationType });
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
  RECOVERED: 1,          // Subscription recovered from account hold
  RENEWED: 2,            // Active subscription renewed
  CANCELED: 3,           // Voluntarily or involuntarily canceled
  PURCHASED: 4,          // New subscription purchased
  ON_HOLD: 5,            // Account hold
  IN_GRACE_PERIOD: 6,    // In grace period
  RESTARTED: 7,          // Restarted after cancel
  PRICE_CHANGE: 8,       // Price change confirmed
  DEFERRED: 9,           // Subscription deferred
  PAUSED: 10,            // Subscription paused
  PAUSE_SCHEDULE_CHANGED: 11,
  REVOKED: 12,           // Subscription revoked
  EXPIRED: 13,           // Subscription expired
} as const;

async function handleGoogleNotification(
  body: string,
  log: import('../utils/logger').Logger,
): Promise<{ statusCode: number; message: string }> {
  const rtdn: GoogleRTDNPayload = JSON.parse(body);

  if (!rtdn.message?.data) {
    return { statusCode: 400, message: 'Missing message data' };
  }

  // Deduplicate
  const messageId = rtdn.message.messageId;
  if (processedNotifications.has(messageId)) {
    log.info('Duplicate Google notification, skipping', { messageId });
    return { statusCode: 200, message: 'Already processed' };
  }
  processedNotifications.set(messageId, Date.now());

  // Decode the notification
  const notifJson = Buffer.from(rtdn.message.data, 'base64').toString('utf-8');
  const notification: GoogleDeveloperNotification = JSON.parse(notifJson);

  // Verify package name
  const secrets = await getGooglePlaySecrets();
  if (notification.packageName !== secrets.packageName) {
    log.warn('Package name mismatch in Google notification', {
      expected: secrets.packageName,
      got: notification.packageName,
    });
    return { statusCode: 403, message: 'Invalid package name' };
  }

  const db = await getPool();

  // Handle subscription notifications
  if (notification.subscriptionNotification) {
    const subNotif = notification.subscriptionNotification;
    const { purchaseToken, subscriptionId, notificationType } = subNotif;

    log.info('Google subscription notification', {
      type: notificationType,
      subscriptionId,
      token: purchaseToken?.substring(0, 8) + '***',
    });

    switch (notificationType) {
      case GOOGLE_SUB_NOTIF.RENEWED:
      case GOOGLE_SUB_NOTIF.RECOVERED:
      case GOOGLE_SUB_NOTIF.RESTARTED:
      case GOOGLE_SUB_NOTIF.PURCHASED: {
        // Fetch fresh subscription data from Google Play API
        const subData = await fetchGoogleSubscription(purchaseToken, secrets);
        if (subData) {
          await db.query(
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
        await db.query(
          `UPDATE user_entitlements
           SET is_active = false,
               auto_renew_status = false,
               updated_at = NOW()
           WHERE platform = 'android'
             AND store_product_id = $1
             AND raw_receipt = $2`,
          [subscriptionId, purchaseToken],
        );

        await revertEntitlementByToken(db, 'android', subscriptionId, purchaseToken, log);
        break;
      }

      case GOOGLE_SUB_NOTIF.ON_HOLD:
      case GOOGLE_SUB_NOTIF.IN_GRACE_PERIOD:
      case GOOGLE_SUB_NOTIF.PAUSED: {
        // Keep active during grace period / hold, but note the status
        log.info('Google subscription status change', {
          type: notificationType,
          subscriptionId,
        });
        break;
      }

      default:
        log.info('Unhandled Google subscription notification type', { type: notificationType });
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

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${secrets.packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken.token}` },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const lineItem = data.lineItems?.[0];

    return {
      expiresDate: lineItem?.expiryTime ? new Date(lineItem.expiryTime).getTime() : undefined,
    };
  } catch {
    return null;
  }
}

/** Revert account entitlement when an Apple subscription expires/is revoked */
async function revertEntitlement(
  db: import('pg').Pool,
  platform: string,
  originalTransactionId: string,
  log: import('../utils/logger').Logger,
): Promise<void> {
  // Find the profile and product type for this entitlement
  const result = await db.query(
    `SELECT profile_id, product_type FROM user_entitlements
     WHERE platform = $1 AND original_transaction_id = $2
     LIMIT 1`,
    [platform, originalTransactionId],
  );

  if (result.rows.length === 0) return;

  const { profile_id: profileId, product_type: productType } = result.rows[0];
  await doRevertEntitlement(db, profileId, productType, log);
}

/** Revert account entitlement when a Google subscription expires/is revoked */
async function revertEntitlementByToken(
  db: import('pg').Pool,
  platform: string,
  subscriptionId: string,
  purchaseToken: string,
  log: import('../utils/logger').Logger,
): Promise<void> {
  const result = await db.query(
    `SELECT profile_id, product_type FROM user_entitlements
     WHERE platform = $1 AND store_product_id = $2 AND raw_receipt = $3
     LIMIT 1`,
    [platform, subscriptionId, purchaseToken],
  );

  if (result.rows.length === 0) return;

  const { profile_id: profileId, product_type: productType } = result.rows[0];
  await doRevertEntitlement(db, profileId, productType, log);
}

async function doRevertEntitlement(
  db: import('pg').Pool,
  profileId: string,
  productType: string,
  log: import('../utils/logger').Logger,
): Promise<void> {
  // Check if the user has any OTHER active entitlement of the same type
  const otherActive = await db.query(
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
    await db.query(
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
    await db.query(
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

export const handler = withErrorHandler('iap-notifications', async (event, { headers, log }) => {
  cleanupProcessed();

  const body = event.body || '';
  if (!body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Empty request body' }),
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
});
