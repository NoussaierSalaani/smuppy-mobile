import React, { useState, useEffect } from 'react';
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

// Style unifié Smuppy
const FORM = {
  buttonHeight: 56,
  buttonRadius: 28,
};

/**
 * CooldownModal - Modal affichant un countdown
 */
export default function CooldownModal({ 
  visible, 
  onClose, 
  seconds = 30,
  title = "Please wait",
  message = "You can request a new code in"
}) {
  const [countdown, setCountdown] = useState(seconds);
  const [progressAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (visible) {
      setCountdown(seconds);
      
      // Animation du progress
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: seconds * 1000,
        useNativeDriver: false,
      }).start();

      // Countdown timer
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            // AUTO-FERMER quand countdown = 0
            onClose();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        clearInterval(interval);
        progressAnim.setValue(1);
      };
    }
  }, [visible, seconds]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return mins > 0 ? `${mins}:${remainingSecs.toString().padStart(2, '0')}` : `${remainingSecs}s`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.container}>
              {/* Close */}
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Icon with gradient */}
              <LinearGradient
                colors={['#00cdb5', '#0066ac']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBox}
              >
                <Ionicons name="time-outline" size={40} color="#FFFFFF" />
              </LinearGradient>

              {/* Title */}
              <Text style={styles.title}>{title}</Text>

              {/* Message */}
              <Text style={styles.message}>{message}</Text>

              {/* Countdown */}
              <Text style={styles.countdown}>{formatTime(countdown)}</Text>

              {/* Progress */}
              <View style={styles.progressBg}>
                <Animated.View style={[styles.progressBarContainer, { width: progressWidth }]}>
                  <LinearGradient
                    colors={['#00cdb5', '#0066ac']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.progressBar}
                  />
                </Animated.View>
              </View>

              {/* Info */}
              <Text style={styles.info}>This helps us prevent spam and keep your account secure.</Text>

              {/* OK Button with gradient */}
              <LinearGradient
                colors={['#00cdb5', '#0066ac']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.okBtn}
              >
                <TouchableOpacity style={styles.okBtnInner} onPress={onClose} activeOpacity={0.8}>
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

/**
 * Hook pour gérer le cooldown
 * - canAction : true si on peut faire l'action
 * - tryAction : exécute l'action si possible, sinon affiche le modal
 * - remainingTime : temps restant
 * - showModal / setShowModal : contrôle du modal
 */
export function useCooldown(cooldownSeconds = 30) {
  const [lastActionTime, setLastActionTime] = useState(null);
  const [remainingTime, setRemainingTime] = useState(0);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let interval;
    
    if (lastActionTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - lastActionTime) / 1000);
        const remaining = Math.max(0, cooldownSeconds - elapsed);
        setRemainingTime(remaining);
        
        if (remaining === 0) {
          setLastActionTime(null);
          clearInterval(interval);
        }
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [lastActionTime, cooldownSeconds]);

  const canAction = !lastActionTime || remainingTime === 0;

  const startCooldown = () => {
    setLastActionTime(Date.now());
    setRemainingTime(cooldownSeconds);
  };

  const tryAction = (action) => {
    if (canAction) {
      action();
      startCooldown();
    } else {
      setShowModal(true);
    }
  };

  return {
    canAction,
    startCooldown,
    remainingTime,
    showModal,
    setShowModal,
    tryAction,
  };
}

const styles = StyleSheet.create({
  overlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0, 0, 0, 0.5)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 24,
  },
  container: { 
    width: '100%', 
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    padding: 28, 
    alignItems: 'center',
  },
  closeBtn: { 
    position: 'absolute', 
    top: 16, 
    right: 16, 
    zIndex: 10,
  },
  
  // Icon with gradient
  iconBox: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 20, 
    marginTop: 8,
    // Shadow
    shadowColor: '#00cdb5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  
  // Text styles
  title: { 
    fontFamily: 'WorkSans-Bold',
    fontSize: 22, 
    fontWeight: '700', 
    color: '#0a252f', 
    marginBottom: 8, 
    textAlign: 'center',
  },
  message: { 
    fontSize: 14, 
    color: '#676C75', 
    textAlign: 'center', 
    marginBottom: 16,
  },
  countdown: { 
    fontSize: 48, 
    fontWeight: '800', 
    color: '#00cdb5', 
    marginBottom: 16,
  },
  
  // Progress bar
  progressBg: { 
    width: '100%', 
    height: 6, 
    backgroundColor: '#E5E7EB', 
    borderRadius: 3, 
    overflow: 'hidden', 
    marginBottom: 20,
  },
  progressBarContainer: {
    height: '100%',
    overflow: 'hidden',
  },
  progressBar: { 
    flex: 1,
    borderRadius: 3,
  },
  
  // Info text
  info: { 
    fontSize: 12, 
    color: '#676C75', 
    textAlign: 'center', 
    lineHeight: 18, 
    marginBottom: 20,
  },
  
  // Button with gradient - STYLE CAPSULE UNIFIÉ
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
    fontSize: 16, 
    fontWeight: '600', 
    color: '#FFFFFF',
  },
});