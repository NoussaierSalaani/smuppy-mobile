import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SmuppyPeaksIcon from './icons/SmuppyPeaksIcon';

const { height } = Dimensions.get('window');

const COLORS = {
  primary: '#0EBF8A',
  secondary: '#00B5C1',
  accent: '#0081BE',
  dark: '#0A0A0F',
  white: '#FFFFFF',
  gray: '#8E8E93',
  cardBg: '#1C1C1E',
};

interface CreateOptionsPopupProps {
  visible: boolean;
  onClose?: () => void;
  onSelectPost?: () => void;
  onSelectPeak?: () => void;
}

const CreateOptionsPopup = ({ visible, onClose, onSelectPost, onSelectPeak }: CreateOptionsPopupProps): React.JSX.Element | null => {
  const insets = useSafeAreaInsets();

  // Animations
  const slideAnim = useRef(new Animated.Value(height)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const peakPulseAnim = useRef(new Animated.Value(1)).current;
  const postSlideAnim = useRef(new Animated.Value(50)).current;
  const peakSlideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      // Reset animations
      postSlideAnim.setValue(50);
      peakSlideAnim.setValue(50);
      scaleAnim.setValue(0.8);

      // Start entrance animations
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 150,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 15,
          stiffness: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Staggered card animations
      Animated.sequence([
        Animated.delay(100),
        Animated.parallel([
          Animated.spring(postSlideAnim, {
            toValue: 0,
            damping: 15,
            stiffness: 150,
            useNativeDriver: true,
          }),
          Animated.spring(peakSlideAnim, {
            toValue: 0,
            damping: 15,
            stiffness: 150,
            delay: 50,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      // Peak pulse animation
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(peakPulseAnim, {
            toValue: 1.02,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(peakPulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimation.start();

      return () => pulseAnimation.stop();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: height,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, slideAnim, scaleAnim, peakPulseAnim, postSlideAnim, peakSlideAnim]);

  const handleSelectPost = (): void => {
    onClose?.();
    setTimeout(() => onSelectPost?.(), 100);
  };

  const handleSelectPeak = (): void => {
    onClose?.();
    setTimeout(() => onSelectPeak?.(), 100);
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => onClose?.()}
        />

        <Animated.View
          style={[
            styles.container,
            {
              transform: [
                { translateY: slideAnim },
                { scale: scaleAnim },
              ],
              paddingBottom: Math.max(40, insets.bottom + 20),
            }
          ]}
        >
          {/* Gradient Header Accent */}
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary, COLORS.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerAccent}
          />

          {/* Handle */}
          <View style={styles.handle} />

          {/* Title */}
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Create</Text>
            <Text style={styles.subtitle}>What do you want to share?</Text>
          </View>

          {/* Options */}
          <View style={styles.options}>
            {/* Post Option */}
            <Animated.View style={{ transform: [{ translateY: postSlideAnim }] }}>
              <TouchableOpacity
                style={styles.option}
                onPress={handleSelectPost}
                activeOpacity={0.8}
              >
                <View style={styles.optionContent}>
                  <View style={styles.optionIconContainer}>
                    <LinearGradient
                      colors={['rgba(14, 191, 138, 0.15)', 'rgba(0, 181, 193, 0.15)']}
                      style={styles.optionIconBg}
                    >
                      <Ionicons name="images" size={26} color={COLORS.primary} />
                    </LinearGradient>
                  </View>
                  <View style={styles.optionInfo}>
                    <Text style={styles.optionTitle}>Post</Text>
                    <Text style={styles.optionDesc}>Share photos or videos from your gallery</Text>
                  </View>
                </View>
                <View style={styles.optionArrow}>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
                </View>
              </TouchableOpacity>
            </Animated.View>

            {/* Peak Option - Featured */}
            <Animated.View
              style={{
                transform: [
                  { translateY: peakSlideAnim },
                  { scale: peakPulseAnim },
                ]
              }}
            >
              <TouchableOpacity
                style={styles.peakOption}
                onPress={handleSelectPeak}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={[COLORS.primary, COLORS.secondary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.peakGradient}
                >
                  <View style={styles.optionContent}>
                    <View style={styles.peakIconContainer}>
                      <SmuppyPeaksIcon size={32} color={COLORS.dark} filled />
                    </View>
                    <View style={styles.optionInfo}>
                      <View style={styles.peakTitleRow}>
                        <Text style={styles.peakTitle}>Peak</Text>
                        <View style={styles.hotBadge}>
                          <Text style={styles.hotBadgeText}>🔥 HOT</Text>
                        </View>
                      </View>
                      <Text style={styles.peakDesc}>Record a short video (6-60s) and go viral!</Text>
                    </View>
                  </View>
                  <View style={styles.peakArrow}>
                    <Ionicons name="videocam" size={22} color={COLORS.dark} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Feature Highlight */}
          <View style={styles.featureHighlight}>
            <Ionicons name="sparkles" size={16} color={COLORS.primary} />
            <Text style={styles.featureText}>Peaks get 5x more engagement!</Text>
          </View>

          {/* Cancel Button */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => onClose?.()}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  container: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 40,
    overflow: 'hidden',
  },
  headerAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
  },
  titleContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 4,
  },
  options: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  optionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIconContainer: {
    marginRight: 14,
  },
  optionIconBg: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 3,
  },
  optionDesc: {
    fontSize: 13,
    color: COLORS.gray,
    lineHeight: 18,
  },
  optionArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Peak Featured Option
  peakOption: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  peakGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  peakIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  peakTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  peakTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.dark,
  },
  hotBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hotBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.dark,
  },
  peakDesc: {
    fontSize: 13,
    color: 'rgba(10, 10, 15, 0.7)',
    marginTop: 3,
    lineHeight: 18,
  },
  peakArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Feature Highlight
  featureHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 8,
  },
  featureText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '500',
  },

  cancelButton: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray,
  },
});

export default CreateOptionsPopup;
