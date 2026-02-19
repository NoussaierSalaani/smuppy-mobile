/**
 * Device Session Service
 * Tracks device sessions for security alerts and multi-device management
 */

import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { awsAPI } from './aws-api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = '@smuppy_device_id';

/**
 * Generate or retrieve a unique device ID
 * Stored persistently to identify returning devices
 */
async function getOrCreateDeviceId(): Promise<string> {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

    if (!deviceId) {
      // Generate new device ID using device-specific info
      const uniqueData = [
        Device.modelName,
        Device.deviceName,
        Platform.OS,
        Platform.Version,
        Constants.installationId,
        Date.now().toString(),
      ].filter(Boolean).join('-');

      // Create a hash-like ID
      deviceId = `${Platform.OS}-${hashCode(uniqueData)}-${Math.random().toString(36).substring(2, 10)}`; // NOSONAR
      try {
        await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
      } catch (writeError) {
        // Retry once on write failure
        if (__DEV__) console.warn('[DeviceSession] First write failed, retrying:', writeError);
        await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
      }
    }

    return deviceId;
  } catch (error) {
    if (__DEV__) console.warn('[DeviceSession] Error getting device ID:', error);
    // Fallback to a random ID
    return `fallback-${Math.random().toString(36).substring(2, 15)}`; // NOSONAR
  }
}

/**
 * Simple hash function for strings
 */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.codePointAt(i) ?? 0;
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}


/**
 * Register device session on login
 * Called after successful authentication
 *
 * STUB: Returns success without server call. The /devices backend endpoint
 * does not exist yet. When it is deployed, implement this by calling
 * awsAPI.registerDevice() with the device info and handling the isNewDevice response.
 */
export async function registerDeviceSession(): Promise<{
  success: boolean;
  isNewDevice: boolean;
  error?: string;
}> {
  return {
    success: true,
    isNewDevice: false,
  };
}


/**
 * Get list of user's active devices
 */
export async function getUserDevices(): Promise<Record<string, unknown>[]> {
  try {
    const devices = await awsAPI.getUserDevices();
    return (devices || []) as unknown as Record<string, unknown>[];
  } catch (error) {
    if (__DEV__) console.warn('[DeviceSession] Get devices error:', error);
    return [];
  }
}

/**
 * Revoke a device session (log out from that device)
 */
export async function revokeDeviceSession(sessionId: string): Promise<boolean> {
  try {
    const result = await awsAPI.revokeDeviceSession(sessionId);
    return result?.success || false;
  } catch (error) {
    if (__DEV__) console.warn('[DeviceSession] Revoke error:', error);
    return false;
  }
}

/**
 * Get current device ID
 */
export async function getCurrentDeviceId(): Promise<string> {
  return getOrCreateDeviceId();
}
