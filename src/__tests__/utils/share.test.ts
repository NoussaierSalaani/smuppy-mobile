/**
 * Share Utility Tests
 * Tests for link generation and clipboard copy functions.
 */

// Define __DEV__ before imports
(global as Record<string, unknown>).__DEV__ = true;

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { copyPostLink, copyPeakLink, copyProfileLink } from '../../utils/share';

describe('Share Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('copyPostLink', () => {
    it('should copy post link to clipboard', async () => {
      const result = await copyPostLink('post-123');
      expect(result).toBe(true);
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://smuppy.app/p/post-123');
    });

    it('should trigger success haptic after copying', async () => {
      await copyPostLink('post-123');
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success
      );
    });

    it('should return false when clipboard fails', async () => {
      (Clipboard.setStringAsync as jest.Mock).mockRejectedValueOnce(new Error('Clipboard error'));
      const result = await copyPostLink('post-123');
      expect(result).toBe(false);
    });
  });

  describe('copyPeakLink', () => {
    it('should copy peak link to clipboard', async () => {
      const result = await copyPeakLink('peak-456');
      expect(result).toBe(true);
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://smuppy.app/peak/peak-456');
    });

    it('should return false on error', async () => {
      (Clipboard.setStringAsync as jest.Mock).mockRejectedValueOnce(new Error('Fail'));
      const result = await copyPeakLink('peak-456');
      expect(result).toBe(false);
    });
  });

  describe('copyProfileLink', () => {
    it('should copy profile link with username', async () => {
      const result = await copyProfileLink('user-789', 'johndoe');
      expect(result).toBe(true);
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://smuppy.app/u/johndoe');
    });

    it('should copy profile link with userId when no username', async () => {
      const result = await copyProfileLink('user-789');
      expect(result).toBe(true);
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://smuppy.app/u/user-789');
    });

    it('should use userId when username is undefined', async () => {
      const result = await copyProfileLink('user-789', undefined);
      expect(result).toBe(true);
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://smuppy.app/u/user-789');
    });

    it('should return false on error', async () => {
      (Clipboard.setStringAsync as jest.Mock).mockRejectedValueOnce(new Error('Fail'));
      const result = await copyProfileLink('user-789', 'johndoe');
      expect(result).toBe(false);
    });
  });
});
