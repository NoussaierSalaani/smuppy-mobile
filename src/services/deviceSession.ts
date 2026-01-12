/**
 * Device Session Service
 * Tracks device sessions for security alerts and multi-device management
 */

import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';
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
async function getDeviceInfo(): Promise<DeviceInfo> {
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
async function getLocationFromIP(): Promise<{ ip?: string; country?: string; city?: string }> {
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
 */
export async function registerDeviceSession(): Promise<{
  success: boolean;
  isNewDevice: boolean;
  error?: string;
}> {
  try {
    // Get device info
    const deviceInfo = await getDeviceInfo();

    // Get location info (non-blocking, with timeout)
    const locationPromise = Promise.race([
      getLocationFromIP(),
      new Promise<{}>((resolve) => setTimeout(() => resolve({}), 3000)),
    ]);

    const location = await locationPromise;

    // Call the database function to register device
    const { data, error } = await supabase.rpc('register_device_session', {
      p_device_id: deviceInfo.device_id,
      p_device_name: deviceInfo.device_name,
      p_device_type: deviceInfo.device_type,
      p_platform: deviceInfo.platform,
      p_browser: deviceInfo.browser,
      p_os_version: deviceInfo.os_version,
      p_app_version: deviceInfo.app_version,
      p_ip_address: (location as any).ip || null,
      p_country: (location as any).country || null,
      p_city: (location as any).city || null,
    });

    if (error) {
      console.error('[DeviceSession] Registration error:', error);
      return { success: false, isNewDevice: false, error: error.message };
    }

    const result = data as { success: boolean; is_new_device: boolean; session_id: string };

    // If this is a new device, send an alert
    if (result.is_new_device) {
      await sendNewDeviceAlert(result.session_id, deviceInfo, location as any);
    }

    console.log('[DeviceSession] Registered:', {
      deviceId: deviceInfo.device_id,
      isNew: result.is_new_device,
    });

    return {
      success: true,
      isNewDevice: result.is_new_device,
    };
  } catch (error) {
    console.error('[DeviceSession] Error:', error);
    return {
      success: false,
      isNewDevice: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send alert for new device login
 */
async function sendNewDeviceAlert(
  sessionId: string,
  deviceInfo: DeviceInfo,
  location: { ip?: string; country?: string; city?: string }
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wbgfaeytioxnkdsuvvlx.supabase.co'}/functions/v1/send-new-device-alert`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          device_session_id: sessionId,
          device_info: {
            ...deviceInfo,
            ip_address: location.ip,
            country: location.country,
            city: location.city,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error('[DeviceSession] Alert send failed:', await response.text());
    }
  } catch (error) {
    // Don't throw - alert failure shouldn't block login
    console.error('[DeviceSession] Alert error:', error);
  }
}

/**
 * Get list of user's active devices
 */
export async function getUserDevices(): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('get_user_devices');

    if (error) {
      console.error('[DeviceSession] Get devices error:', error);
      return [];
    }

    return (data as any)?.devices || [];
  } catch (error) {
    console.error('[DeviceSession] Error:', error);
    return [];
  }
}

/**
 * Revoke a device session (log out from that device)
 */
export async function revokeDeviceSession(sessionId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('revoke_device_session', {
      p_device_session_id: sessionId,
    });

    if (error) {
      console.error('[DeviceSession] Revoke error:', error);
      return false;
    }

    return (data as any)?.success || false;
  } catch (error) {
    console.error('[DeviceSession] Error:', error);
    return false;
  }
}

/**
 * Get current device ID
 */
export async function getCurrentDeviceId(): Promise<string> {
  return getOrCreateDeviceId();
}
