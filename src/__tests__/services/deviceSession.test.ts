/**
 * Device Session Service Tests
 *
 * Tests device session tracking, ID generation, and device management.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

jest.mock('expo-device', () => ({
  modelName: 'iPhone15',
  deviceName: 'Test iPhone',
}));

jest.mock('expo-constants', () => ({
  default: { installationId: 'install-123' },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '17.0' },
}));

const mockGetUserDevices = jest.fn();
const mockRevokeDeviceSession = jest.fn();

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    getUserDevices: mockGetUserDevices,
    revokeDeviceSession: mockRevokeDeviceSession,
  },
}));

(global as Record<string, unknown>).__DEV__ = false;

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  registerDeviceSession,
  getUserDevices,
  revokeDeviceSession,
  getCurrentDeviceId,
} from '../../services/deviceSession';

import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deviceSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockReset();
  });

  // =========================================================================
  // registerDeviceSession
  // =========================================================================

  describe('registerDeviceSession', () => {
    it('should return success stub', async () => {
      const result = await registerDeviceSession();
      expect(result).toEqual({
        success: true,
        isNewDevice: false,
      });
    });
  });

  // =========================================================================
  // getCurrentDeviceId
  // =========================================================================

  describe('getCurrentDeviceId', () => {
    it('should return existing device ID from AsyncStorage', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('existing-device-id');

      const id = await getCurrentDeviceId();
      expect(id).toBe('existing-device-id');
    });

    it('should create new device ID when none exists', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const id = await getCurrentDeviceId();

      expect(id).toMatch(/^ios-/);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@smuppy_device_id', id);
    });

    it('should return fallback ID on error', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const id = await getCurrentDeviceId();
      expect(id).toMatch(/^fallback-/);
    });

    it('should retry write on first failure', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock)
        .mockRejectedValueOnce(new Error('First write failed'))
        .mockResolvedValueOnce(undefined);

      const id = await getCurrentDeviceId();
      expect(id).toMatch(/^ios-/);
      expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // getUserDevices
  // =========================================================================

  describe('getUserDevices', () => {
    it('should return devices from API', async () => {
      const devices = [{ id: 'd1', name: 'iPhone' }, { id: 'd2', name: 'iPad' }];
      mockGetUserDevices.mockResolvedValue(devices);

      const result = await getUserDevices();
      expect(result).toEqual(devices);
    });

    it('should return empty array on API error', async () => {
      mockGetUserDevices.mockRejectedValue(new Error('API error'));

      const result = await getUserDevices();
      expect(result).toEqual([]);
    });

    it('should return empty array when API returns null', async () => {
      mockGetUserDevices.mockResolvedValue(null);

      const result = await getUserDevices();
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // revokeDeviceSession
  // =========================================================================

  describe('revokeDeviceSession', () => {
    it('should return true on success', async () => {
      mockRevokeDeviceSession.mockResolvedValue({ success: true });

      const result = await revokeDeviceSession('session-123');
      expect(result).toBe(true);
      expect(mockRevokeDeviceSession).toHaveBeenCalledWith('session-123');
    });

    it('should return false on error', async () => {
      mockRevokeDeviceSession.mockRejectedValue(new Error('Revoke failed'));

      const result = await revokeDeviceSession('session-123');
      expect(result).toBe(false);
    });

    it('should return false when API returns no success flag', async () => {
      mockRevokeDeviceSession.mockResolvedValue({});

      const result = await revokeDeviceSession('session-123');
      expect(result).toBe(false);
    });
  });
});
