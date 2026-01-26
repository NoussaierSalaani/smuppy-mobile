/**
 * CooldownModal - Modal de countdown avec timer
 * 
 * Usage:
 *   import CooldownModal, { useCooldown } from '../components/CooldownModal';
 *   const { canAction, remainingTime, showModal, setShowModal, tryAction } = useCooldown(30);
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { 
  COLORS, 
  GRADIENTS, 
  FORM, 
  SPACING, 
  SIZES,
  SHADOWS,
} from '../config/theme';

// ============================================
// COOLDOWN MODAL COMPONENT
// ============================================

interface CooldownModalProps {
  visible: boolean;
  onClose: () => void;
  seconds?: number;
  title?: string;
  message?: string;
}

export default function CooldownModal({
  visible,
  onClose,
  seconds = 30,
  title = "Please wait",
  message = "You can request a new code in"
}: CooldownModalProps) {
  const [countdown, setCountdown] = useState(seconds);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (visible) {
      // Reset state
      setCountdown(seconds);
      progressAnim.setValue(1);
      
      // Progress bar animation
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: seconds * 1000,
        useNativeDriver: false,
      }).start();

      // Countdown timer
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
            onClose();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Cleanup
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        progressAnim.stopAnimation();
      };
    }
  }, [visible, seconds, onClose, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const formatTime = useCallback((secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return mins > 0 
      ? `${mins}:${remainingSecs.toString().padStart(2, '0')}` 
      : `${remainingSecs}s`;
  }, []);

  return (
    <Modal 
      visible={visible} 
      transparent 
      animationType="fade" 
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.container}>
              {/* Close Button */}
              <TouchableOpacity 
                style={styles.closeBtn} 
                onPress={onClose} 
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={COLORS.grayMuted} />
              </TouchableOpacity>

              {/* Icon */}
              <LinearGradient
                colors={GRADIENTS.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBox}
              >
                <Ionicons name="time-outline" size={40} color={COLORS.white} />
              </LinearGradient>

              {/* Title */}
              <Text style={styles.title}>{title}</Text>

              {/* Message */}
              <Text style={styles.message}>{message}</Text>

              {/* Countdown */}
              <Text style={styles.countdown}>{formatTime(countdown)}</Text>

              {/* Progress Bar */}
              <View style={styles.progressBg}>
                <Animated.View style={[styles.progressBarContainer, { width: progressWidth }]}>
                  <LinearGradient
                    colors={GRADIENTS.primary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.progressBar}
                  />
                </Animated.View>
              </View>

              {/* Info */}
              <Text style={styles.info}>
                This helps us prevent spam and keep your account secure.
              </Text>

              {/* OK Button */}
              <LinearGradient
                colors={GRADIENTS.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.okBtn}
              >
                <TouchableOpacity 
                  style={styles.okBtnInner} 
                  onPress={onClose} 
                  activeOpacity={0.8}
                >
                  <Text style={styles.okText}>Got it</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ============================================
// COOLDOWN HOOK
// ============================================

/**
 * Hook pour gérer le cooldown
 * @param {number} cooldownSeconds - Durée du cooldown en secondes
 * @returns {Object} - { canAction, startCooldown, remainingTime, showModal, setShowModal, tryAction }
 */
export function useCooldown(cooldownSeconds = 30) {
  const [lastActionTime, setLastActionTime] = useState<number | null>(null);
  const [remainingTime, setRemainingTime] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (lastActionTime) {
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - lastActionTime) / 1000);
        const remaining = Math.max(0, cooldownSeconds - elapsed);
        setRemainingTime(remaining);

        if (remaining === 0) {
          setLastActionTime(null);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
        }
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [lastActionTime, cooldownSeconds]);

  const canAction = !lastActionTime || remainingTime === 0;

  const startCooldown = useCallback(() => {
    setLastActionTime(Date.now());
    setRemainingTime(cooldownSeconds);
  }, [cooldownSeconds]);

  const tryAction = useCallback((action: () => void) => {
    if (canAction) {
      action();
      startCooldown();
    } else {
      setShowModal(true);
    }
  }, [canAction, startCooldown]);

  return {
    canAction,
    startCooldown,
    remainingTime,
    showModal,
    setShowModal,
    tryAction,
  };
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  overlay: { 
    flex: 1, 
    backgroundColor: COLORS.overlay, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: SPACING.xl,
  },
  
  container: { 
    width: '100%', 
    backgroundColor: COLORS.white, 
    borderRadius: SIZES.radiusXl, 
    padding: SPACING['2xl'], 
    alignItems: 'center',
  },
  
  closeBtn: { 
    position: 'absolute', 
    top: SPACING.base, 
    right: SPACING.base, 
    zIndex: 10,
  },
  
  // Icon
  iconBox: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: SPACING.lg, 
    marginTop: SPACING.sm,
    ...SHADOWS.buttonGradient,
  },
  
  // Text
  title: { 
    fontFamily: 'WorkSans-Bold',
    fontSize: 22, 
    color: COLORS.dark, 
    marginBottom: SPACING.sm, 
    textAlign: 'center',
  },
  
  message: { 
    fontFamily: 'Poppins-Regular',
    fontSize: 14, 
    color: COLORS.gray, 
    textAlign: 'center', 
    marginBottom: SPACING.base,
  },
  
  countdown: { 
    fontFamily: 'Poppins-Bold',
    fontSize: 48, 
    color: COLORS.primary, 
    marginBottom: SPACING.base,
  },
  
  // Progress
  progressBg: { 
    width: '100%', 
    height: 6, 
    backgroundColor: COLORS.grayBorder, 
    borderRadius: 3, 
    overflow: 'hidden', 
    marginBottom: SPACING.lg,
  },
  
  progressBarContainer: {
    height: '100%',
    overflow: 'hidden',
  },
  
  progressBar: { 
    flex: 1,
    borderRadius: 3,
  },
  
  // Info
  info: { 
    fontFamily: 'Poppins-Regular',
    fontSize: 12, 
    color: COLORS.gray, 
    textAlign: 'center', 
    lineHeight: 18, 
    marginBottom: SPACING.lg,
  },
  
  // Button
  okBtn: { 
    width: '100%', 
    height: FORM.buttonHeight, 
    borderRadius: FORM.buttonRadius,
  },
  
  okBtnInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  okText: { 
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16, 
    color: COLORS.white,
  },
});
