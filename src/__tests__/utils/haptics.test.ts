/**
 * Haptic Feedback Utility Tests
 * Tests for haptic feedback triggers across all types.
 */

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

import * as Haptics from 'expo-haptics';
import {
  triggerHaptic,
  hapticButtonPress,
  hapticSuccess,
  hapticError,
  hapticNavigation,
  hapticSubmit,
  hapticDestructive,
} from '../../utils/haptics';

describe('Haptics Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('triggerHaptic', () => {
    it('should trigger light impact by default', async () => {
      await triggerHaptic();
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });

    it('should trigger light impact for "light" type', async () => {
      await triggerHaptic('light');
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });

    it('should trigger medium impact for "medium" type', async () => {
      await triggerHaptic('medium');
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
    });

    it('should trigger heavy impact for "heavy" type', async () => {
      await triggerHaptic('heavy');
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
    });

    it('should trigger success notification for "success" type', async () => {
      await triggerHaptic('success');
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success
      );
    });

    it('should trigger warning notification for "warning" type', async () => {
      await triggerHaptic('warning');
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Warning
      );
    });

    it('should trigger error notification for "error" type', async () => {
      await triggerHaptic('error');
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Error
      );
    });

    it('should not throw when haptics fail', async () => {
      (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error('Haptics unavailable'));
      await expect(triggerHaptic('light')).resolves.toBeUndefined();
    });

    it('should not throw when notification haptics fail', async () => {
      (Haptics.notificationAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Haptics unavailable')
      );
      await expect(triggerHaptic('success')).resolves.toBeUndefined();
    });
  });

  describe('convenience functions', () => {
    it('hapticButtonPress should trigger light haptic', () => {
      hapticButtonPress();
      // It calls triggerHaptic('light') which is async, but the convenience fn is sync (fire-and-forget)
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });

    it('hapticSuccess should trigger success haptic', () => {
      hapticSuccess();
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success
      );
    });

    it('hapticError should trigger error haptic', () => {
      hapticError();
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Error
      );
    });

    it('hapticNavigation should trigger light haptic', () => {
      hapticNavigation();
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });

    it('hapticSubmit should trigger medium haptic', () => {
      hapticSubmit();
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
    });

    it('hapticDestructive should trigger heavy haptic', () => {
      hapticDestructive();
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
    });
  });
});
