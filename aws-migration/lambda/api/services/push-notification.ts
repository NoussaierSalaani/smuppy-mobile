/**
 * Push Notification Service
 * Sends push notifications via:
 * 1. Expo Push API (primary — works for all Expo-managed tokens)
 * 2. SNS (iOS native APNs, when configured)
 * 3. Firebase Admin SDK (Android native FCM, when configured)
 */

import {
  SNSClient,
  PublishCommand,
} from '@aws-sdk/client-sns';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as admin from 'firebase-admin';
import type { Pool } from 'pg';
import { createLogger } from '../utils/logger';

const log = createLogger('push-notification');

const snsClient = new SNSClient({});
const secretsClient = new SecretsManagerClient({});

let firebaseInitialized = false;
let firebaseInitFailed = false;

/**
 * Initialize Firebase Admin SDK
 * Tracks failure state to avoid retrying indefinitely on persistent errors.
 */
/**
 * Initialize Firebase Admin SDK.
 * Only marks as permanently failed for credential issues (missing project_id,
 * missing FCM_SECRET_ARN). Temporary errors (network, Secrets Manager throttle)
 * allow retry on next invocation.
 */
async function initializeFirebase(): Promise<void> {
  if (firebaseInitialized) return;
  if (firebaseInitFailed) {
    log.warn('Firebase init permanently failed (missing credentials) — skipping retry');
    return;
  }

  const secretArn = process.env.FCM_SECRET_ARN;
  if (!secretArn) {
    firebaseInitFailed = true;
    log.warn('FCM_SECRET_ARN not configured — Android push permanently disabled');
    return;
  }

  try {
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await secretsClient.send(command);
    const serviceAccount = JSON.parse(response.SecretString || '{}');

    if (serviceAccount.project_id) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      log.info('Firebase Admin SDK initialized');
    } else {
      // Permanent failure: credentials exist but are incomplete
      firebaseInitFailed = true;
      log.warn('Firebase credentials missing project_id — Android push permanently disabled');
    }
  } catch (error) {
    // Temporary failure: do NOT set firebaseInitFailed so next invocation retries
    log.error('Failed to initialize Firebase — will retry on next invocation', error);
  }
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: string;
}

export interface PushTarget {
  platform: 'ios' | 'android';
  token: string;
  snsEndpointArn?: string | null;
}

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

const isExpoToken = (token: string): boolean =>
  token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');

/**
 * Send push notification to iOS via SNS
 */
async function sendToiOS(
  endpointArn: string,
  payload: PushNotificationPayload
): Promise<'success' | 'failed' | 'disabled'> {
  try {
    const apnsPayload = {
      aps: {
        alert: {
          title: payload.title,
          body: payload.body,
        },
        badge: payload.badge || 1,
        sound: payload.sound || 'default',
      },
      ...payload.data,
    };

    const message = {
      APNS_SANDBOX: JSON.stringify(apnsPayload),
      APNS: JSON.stringify(apnsPayload),
    };

    const command = new PublishCommand({
      TargetArn: endpointArn,
      Message: JSON.stringify(message),
      MessageStructure: 'json',
    });

    await snsClient.send(command);
    log.info('iOS notification sent successfully');
    return 'success';
  } catch (error: unknown) {
    // BUG-2026-02-14: Detect disabled/invalid SNS endpoints for cleanup
    const errName = error instanceof Error ? (error as Error & { name?: string }).name : '';
    const errMsg = error instanceof Error ? error.message : '';
    if (errName === 'EndpointDisabledException' || errName === 'NotFoundException' ||
        (errName === 'InvalidParameterException' && errMsg.includes('endpoint'))) {
      log.warn('SNS endpoint disabled/invalid — marking for cleanup', { endpointArn });
      return 'disabled';
    }
    log.error('Failed to send iOS notification', error);
    return 'failed';
  }
}

/**
 * Send push notification to Android via Firebase Admin SDK
 */
async function sendToAndroid(
  token: string,
  payload: PushNotificationPayload
): Promise<boolean> {
  try {
    await initializeFirebase();

    if (!firebaseInitialized) {
      log.warn('Firebase not available — Android push skipped', { token: token.substring(0, 20) });
      return false;
    }

    const message: admin.messaging.Message = {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
      android: {
        priority: 'high',
        notification: {
          sound: payload.sound || 'default',
          channelId: payload.data?.channelId || 'default',
        },
      },
    };

    const response = await admin.messaging().send(message);
    log.info('Android notification sent', { response });
    return true;
  } catch (error: unknown) {
    log.error('Failed to send Android notification', error);
    return false;
  }
}

/**
 * Send push notification via Expo Push API
 * Works for any ExponentPushToken — no SNS/APNs/FCM setup required
 */
async function sendViaExpo(
  tokens: string[],
  payload: PushNotificationPayload
): Promise<{ success: number; failed: number }> {
  if (tokens.length === 0) return { success: 0, failed: 0 };

  const messages = tokens.map((token) => ({
    to: token,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: payload.sound || 'default',
    badge: payload.badge || 1,
    channelId: 'default',
  }));

  try {
    const response = await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      log.error('Expo Push API error', { status: response.status });
      return { success: 0, failed: tokens.length };
    }

    const result = await response.json() as { data: Array<{ status: string }> };
    let success = 0;
    let failed = 0;
    for (const ticket of result.data) {
      ticket.status === 'ok' ? success++ : failed++;
    }
    if (success > 0) log.info('Expo push sent', { success, failed });
    return { success, failed };
  } catch (error) {
    log.error('Expo Push API request failed', error);
    return { success: 0, failed: tokens.length };
  }
}

/**
 * Send push notification to a single device
 * Prefers Expo Push API for Expo tokens, falls back to SNS/FCM for native tokens
 */
export async function sendPushNotification(
  target: PushTarget,
  payload: PushNotificationPayload
): Promise<boolean> {
  // Expo Push Token — use Expo API directly
  if (isExpoToken(target.token)) {
    const result = await sendViaExpo([target.token], payload);
    return result.success > 0;
  }

  if (target.platform === 'ios' && target.snsEndpointArn) {
    return (await sendToiOS(target.snsEndpointArn, payload)) === 'success';
  } else if (target.platform === 'android') {
    return sendToAndroid(target.token, payload);
  }

  log.warn('Unsupported platform or missing endpoint', { platform: target.platform });
  return false;
}

/**
 * Send push notification to multiple devices
 */
export async function sendPushNotificationBatch(
  targets: PushTarget[],
  payload: PushNotificationPayload
): Promise<{ success: number; failed: number; disabledArns: string[] }> {
  let success = 0;
  let failed = 0;
  const disabledArns: string[] = [];

  // Split targets: Expo tokens vs native tokens
  const expoTokens = targets.filter(t => isExpoToken(t.token)).map(t => t.token);
  const nativeTargets = targets.filter(t => !isExpoToken(t.token));

  // Send Expo tokens in a single batch (most efficient)
  if (expoTokens.length > 0) {
    const expoResult = await sendViaExpo(expoTokens, payload);
    success += expoResult.success;
    failed += expoResult.failed;
  }

  // Group native targets by platform
  const iosTargets = nativeTargets.filter(t => t.platform === 'ios' && t.snsEndpointArn);
  const androidTargets = nativeTargets.filter(t => t.platform === 'android');

  // Send to iOS devices via SNS (parallel for performance)
  if (iosTargets.length > 0) {
    const iosResults = await Promise.all(
      iosTargets.map(target => sendToiOS(target.snsEndpointArn!, payload))
    );
    for (let i = 0; i < iosResults.length; i++) {
      if (iosResults[i] === 'success') {
        success++;
      } else {
        failed++;
        // BUG-2026-02-14: Collect disabled endpoint ARNs for cleanup
        if (iosResults[i] === 'disabled') {
          disabledArns.push(iosTargets[i].snsEndpointArn!);
        }
      }
    }
  }

  // Send to Android devices via Firebase
  if (androidTargets.length > 0) {
    await initializeFirebase();

    if (firebaseInitialized) {
      try {
        const messages: admin.messaging.Message[] = androidTargets.map(target => ({
          token: target.token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data,
          android: {
            priority: 'high' as const,
            notification: {
              sound: payload.sound || 'default',
              channelId: payload.data?.channelId || 'default',
            },
          },
        }));

        const response = await admin.messaging().sendEach(messages);
        success += response.successCount;
        failed += response.failureCount;
      } catch (error) {
        log.error('Batch Android send failed', error);
        failed += androidTargets.length;
      }
    } else {
      failed += androidTargets.length;
    }
  }

  return { success, failed, disabledArns };
}

/**
 * Map notification type to preference column name.
 * Returns null for types that should always be sent.
 */
function getPreferenceColumn(notificationType: string | undefined): string | null {
  if (!notificationType) return null;

  switch (notificationType) {
    case 'like':
    case 'peak_like':
      return 'likes_enabled';
    case 'comment':
    case 'peak_comment':
    case 'peak_reply':
      return 'comments_enabled';
    case 'new_follower':
    case 'follow_request':
    case 'follow_accepted':
      return 'follows_enabled';
    case 'message':
      return 'messages_enabled';
    case 'post_tag':
      return 'mentions_enabled';
    case 'live':
      return 'live_enabled';
    default:
      // session, challenge, battle, event, etc. — always send
      return null;
  }
}

/**
 * Send push notification to a user (all their devices)
 */
export async function sendPushToUser(
  db: Pool,
  userId: string,
  payload: PushNotificationPayload
): Promise<{ success: number; failed: number }> {
  // Check user's notification preferences before sending push
  const notificationType = payload.data?.type;
  const prefColumn = getPreferenceColumn(notificationType);

  if (prefColumn) {
    const prefResult = await db.query(
      `SELECT ${prefColumn} FROM notification_preferences WHERE user_id = $1`,
      [userId]
    );

    // If a row exists and the preference is explicitly false, skip push
    if (prefResult.rows.length > 0 && prefResult.rows[0][prefColumn] === false) {
      log.info('Push skipped — user preference disabled', {
        userId,
        type: notificationType,
        preference: prefColumn,
      });
      return { success: 0, failed: 0 };
    }
  }

  // Get all push tokens for the user
  const result = await db.query(
    `SELECT token, platform, sns_endpoint_arn
     FROM push_tokens
     WHERE user_id = $1 AND enabled = true`,
    [userId]
  );

  if (result.rows.length === 0) {
    log.info('No push tokens found for user', { userId });
    return { success: 0, failed: 0 };
  }

  const targets: PushTarget[] = result.rows.map((row: Record<string, unknown>) => ({
    platform: row.platform as 'ios' | 'android',
    token: row.token as string,
    snsEndpointArn: row.sns_endpoint_arn as string | null,
  }));

  const batchResult = await sendPushNotificationBatch(targets, payload);

  if (batchResult.failed > 0) {
    log.warn('Push notification batch had failures', {
      userId,
      totalTokens: targets.length,
      successCount: batchResult.success,
      failedCount: batchResult.failed,
    });
  }

  // BUG-2026-02-14: Disable dead/invalid SNS endpoints to prevent wasted future calls
  if (batchResult.disabledArns.length > 0) {
    db.query(
      `UPDATE push_tokens SET enabled = false
       WHERE sns_endpoint_arn = ANY($1) AND user_id = $2`,
      [batchResult.disabledArns, userId]
    ).catch(err => log.error('Failed to disable dead push tokens', err));
  }

  return { success: batchResult.success, failed: batchResult.failed };
}

export default {
  sendPushNotification,
  sendPushNotificationBatch,
  sendPushToUser,
};
