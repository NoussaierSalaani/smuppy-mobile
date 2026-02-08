/**
 * Haptic Feedback Utility
 * Provides consistent haptic feedback across the app
 */
import * as Haptics from 'expo-haptics';

export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

/**
 * Trigger haptic feedback
 * @param type - Type of haptic feedback
 */
export const triggerHaptic = async (type: HapticType = 'light'): Promise<void> => {
  try {
    switch (type) {
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      default:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    // Silently fail if haptics not available
  }
};

/**
 * Haptic feedback for button presses
 */
export const hapticButtonPress = (): void => {
  triggerHaptic('light');
};

/**
 * Haptic feedback for successful actions
 */
export const hapticSuccess = (): void => {
  triggerHaptic('success');
};

/**
 * Haptic feedback for errors
 */
export const hapticError = (): void => {
  triggerHaptic('error');
};

/**
 * Haptic feedback for navigation
 */
export const hapticNavigation = (): void => {
  triggerHaptic('light');
};

/**
 * Haptic feedback for form submission
 */
export const hapticSubmit = (): void => {
  triggerHaptic('medium');
};

/**
 * Haptic feedback for destructive actions
 */
export const hapticDestructive = (): void => {
  triggerHaptic('heavy');
};
