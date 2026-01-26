/**
 * Push Notification Service
 * Sends push notifications via SNS (iOS) and Firebase Admin SDK (Android)
 */

import {
  SNSClient,
  PublishCommand,
} from '@aws-sdk/client-sns';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as admin from 'firebase-admin';

const snsClient = new SNSClient({});
const secretsClient = new SecretsManagerClient({});

let firebaseInitialized = false;

/**
 * Initialize Firebase Admin SDK
 */
async function initializeFirebase(): Promise<void> {
  if (firebaseInitialized) return;

  try {
    const secretArn = process.env.FCM_SECRET_ARN || 'smuppy/staging/fcm-credentials';
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await secretsClient.send(command);
    const serviceAccount = JSON.parse(response.SecretString || '{}');

    if (serviceAccount.project_id) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      console.log('[Push] Firebase Admin SDK initialized');
    }
  } catch (error) {
    console.error('[Push] Failed to initialize Firebase:', error);
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

/**
 * Send push notification to iOS via SNS
 */
async function sendToiOS(
  endpointArn: string,
  payload: PushNotificationPayload
): Promise<boolean> {
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
    console.log('[Push] iOS notification sent successfully');
    return true;
  } catch (error: any) {
    console.error('[Push] Failed to send iOS notification:', error);
    return false;
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
      console.error('[Push] Firebase not initialized');
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
          channelId: 'smuppy_notifications',
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log('[Push] Android notification sent:', response);
    return true;
  } catch (error: any) {
    console.error('[Push] Failed to send Android notification:', error);
    return false;
  }
}

/**
 * Send push notification to a single device
 */
export async function sendPushNotification(
  target: PushTarget,
  payload: PushNotificationPayload
): Promise<boolean> {
  if (target.platform === 'ios' && target.snsEndpointArn) {
    return sendToiOS(target.snsEndpointArn, payload);
  } else if (target.platform === 'android') {
    return sendToAndroid(target.token, payload);
  }

  console.warn('[Push] Unsupported platform or missing endpoint:', target.platform);
  return false;
}

/**
 * Send push notification to multiple devices
 */
export async function sendPushNotificationBatch(
  targets: PushTarget[],
  payload: PushNotificationPayload
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  // Group by platform for efficiency
  const iosTargets = targets.filter(t => t.platform === 'ios' && t.snsEndpointArn);
  const androidTargets = targets.filter(t => t.platform === 'android');

  // Send to iOS devices
  for (const target of iosTargets) {
    const result = await sendToiOS(target.snsEndpointArn!, payload);
    result ? success++ : failed++;
  }

  // Send to Android devices (can use batch API)
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
              channelId: 'smuppy_notifications',
            },
          },
        }));

        const response = await admin.messaging().sendEach(messages);
        success += response.successCount;
        failed += response.failureCount;
      } catch (error) {
        console.error('[Push] Batch Android send failed:', error);
        failed += androidTargets.length;
      }
    } else {
      failed += androidTargets.length;
    }
  }

  return { success, failed };
}

/**
 * Send push notification to a user (all their devices)
 */
export async function sendPushToUser(
  db: any,
  userId: string,
  payload: PushNotificationPayload
): Promise<{ success: number; failed: number }> {
  // Get all push tokens for the user
  const result = await db.query(
    `SELECT token, platform, sns_endpoint_arn
     FROM push_tokens
     WHERE user_id = $1 AND enabled = true`,
    [userId]
  );

  if (result.rows.length === 0) {
    console.log('[Push] No push tokens found for user:', userId);
    return { success: 0, failed: 0 };
  }

  const targets: PushTarget[] = result.rows.map((row: any) => ({
    platform: row.platform as 'ios' | 'android',
    token: row.token,
    snsEndpointArn: row.sns_endpoint_arn,
  }));

  return sendPushNotificationBatch(targets, payload);
}

export default {
  sendPushNotification,
  sendPushNotificationBatch,
  sendPushToUser,
};
