/**
 * Device Session Service
 * Tracks device sessions for security alerts and multi-device management
 */

import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { awsAPI } from './aws-api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = '@smuppy_device_id';

interface DeviceInfo {
  device_id: string;
  device_name: string | null;
  device_type: string;
  platform: string;
  browser: string | null;
  os_version: string | null;
  app_version: string | null;
  ip_address?: string;
  country?: string;
  city?: string;
}

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
      deviceId = `${Platform.OS}-${hashCode(uniqueData)}-${Math.random().toString(36).substring(2, 10)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    return deviceId;
  } catch (error) {
    console.error('[DeviceSession] Error getting device ID:', error);
    // Fallback to a random ID
    return `fallback-${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * Simple hash function for strings
 */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get current device information
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _getDeviceInfo(): Promise<DeviceInfo> {
  const deviceId = await getOrCreateDeviceId();

  return {
    device_id: deviceId,
    device_name: Device.deviceName || Device.modelName || 'Unknown Device',
    device_type: Device.deviceType === Device.DeviceType.PHONE ? 'mobile' : 'tablet',
    platform: Platform.OS,
    browser: null, // Not applicable for mobile
    os_version: Platform.Version?.toString() || null,
    app_version: Application.nativeApplicationVersion || Constants.expoConfig?.version || null,
  };
}

/**
 * Fetch approximate location from IP
 * Uses a free IP geolocation API
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _getLocationFromIP(): Promise<{ ip?: string; country?: string; city?: string }> {
  try {
    const response = await fetch('https://ipapi.co/json/', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`IP lookup failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      ip: data.ip,
      country: data.country_name,
      city: data.city,
    };
  } catch (error) {
    console.error('[DeviceSession] IP lookup error:', error);
    return {};
  }
}

/**
 * Register device session on login
 * Called after successful authentication
 * NOTE: Disabled until /devices endpoint is deployed
 */
export async function registerDeviceSession(): Promise<{
  success: boolean;
  isNewDevice: boolean;
  error?: string;
}> {
  // TODO: Enable when /devices Lambda endpoint is deployed
  // For now, return success to avoid blocking login flow
  return {
    success: true,
    isNewDevice: false,
  };
}

/**
 * Send alert for new device login
 * TODO: Deploy send-new-device-alert Edge Function to enable this feature
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _sendNewDeviceAlert(
  _sessionId: string,
  _deviceInfo: DeviceInfo,
  _location: { ip?: string; country?: string; city?: string }
): Promise<void> {
  // Disabled until Edge Function is deployed
  // Silent no-op to avoid console errors
}

/**
 * Get list of user's active devices
 */
export async function getUserDevices(): Promise<any[]> {
  try {
    const devices = await awsAPI.getUserDevices();
    return devices || [];
  } catch (error) {
    console.error('[DeviceSession] Get devices error:', error);
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
    console.error('[DeviceSession] Revoke error:', error);
    return false;
  }
}

/**
 * Get current device ID
 */
export async function getCurrentDeviceId(): Promise<string> {
  return getOrCreateDeviceId();
}
