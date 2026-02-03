import React, { useEffect, useRef, useMemo } from 'react';
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
import { FEATURES } from '../config/featureFlags';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

const { height } = Dimensions.get('window');

interface CreateOptionsPopupProps {
  visible: boolean;
  onClose?: () => void;
  onSelectPost?: () => void;
  onSelectPeak?: () => void;
  onSelectChallenge?: () => void;
  onSelectEvent?: () => void;
}

const CreateOptionsPopup = ({ visible, onClose, onSelectPost, onSelectPeak, onSelectChallenge, onSelectEvent }: CreateOptionsPopupProps): React.JSX.Element | null => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
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

  const handleSelectChallenge = (): void => {
    onClose?.();
    setTimeout(() => onSelectChallenge?.(), 100);
  };

  const handleSelectEvent = (): void => {
    onClose?.();
    setTimeout(() => onSelectEvent?.(), 100);
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
            colors={[colors.primary, colors.cyanBlue, colors.blueMedium]}
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
                      <Ionicons name="images" size={26} color={colors.primary} />
                    </LinearGradient>
                  </View>
                  <View style={styles.optionInfo}>
                    <Text style={styles.optionTitle}>Post</Text>
                    <Text style={styles.optionDesc}>Share photos or videos from your gallery</Text>
                  </View>
                </View>
                <View style={styles.optionArrow}>
                  <Ionicons name="chevron-forward" size={20} color={colors.gray} />
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
                  colors={[colors.primary, colors.cyanBlue]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.peakGradient}
                >
                  <View style={styles.optionContent}>
                    <View style={styles.peakIconContainer}>
                      <SmuppyPeaksIcon size={32} color={colors.dark} filled />
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
                    <Ionicons name="videocam" size={22} color={colors.dark} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {/* Challenge Option */}
            {FEATURES.CHALLENGES && onSelectChallenge && (
              <Animated.View style={{ transform: [{ translateY: postSlideAnim }] }}>
                <TouchableOpacity
                  style={styles.option}
                  onPress={handleSelectChallenge}
                  activeOpacity={0.8}
                >
                  <View style={styles.optionContent}>
                    <View style={styles.optionIconContainer}>
                      <LinearGradient
                        colors={['rgba(255, 107, 53, 0.15)', 'rgba(255, 69, 0, 0.15)']}
                        style={styles.optionIconBg}
                      >
                        <Ionicons name="trophy" size={26} color="#FF6B35" />
                      </LinearGradient>
                    </View>
                    <View style={styles.optionInfo}>
                      <Text style={styles.optionTitle}>Challenge</Text>
                      <Text style={styles.optionDesc}>Create a challenge and tag your fans!</Text>
                    </View>
                  </View>
                  <View style={styles.optionArrow}>
                    <Ionicons name="chevron-forward" size={20} color={colors.gray} />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Event Option */}
            {onSelectEvent && (
              <Animated.View style={{ transform: [{ translateY: postSlideAnim }] }}>
                <TouchableOpacity
                  style={styles.option}
                  onPress={handleSelectEvent}
                  activeOpacity={0.8}
                >
                  <View style={styles.optionContent}>
                    <View style={styles.optionIconContainer}>
                      <LinearGradient
                        colors={['rgba(0, 129, 190, 0.15)', 'rgba(0, 181, 193, 0.15)']}
                        style={styles.optionIconBg}
                      >
                        <Ionicons name="calendar" size={26} color="#0081BE" />
                      </LinearGradient>
                    </View>
                    <View style={styles.optionInfo}>
                      <Text style={styles.optionTitle}>Event</Text>
                      <Text style={styles.optionDesc}>Organize a running, hiking, or sports event</Text>
                    </View>
                  </View>
                  <View style={styles.optionArrow}>
                    <Ionicons name="chevron-forward" size={20} color={colors.gray} />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>

          {/* Feature Highlight */}
          <View style={styles.featureHighlight}>
            <Ionicons name="sparkles" size={16} color={colors.primary} />
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

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  container: {
    backgroundColor: colors.cardBg,
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
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.15)',
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
    color: colors.dark,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 4,
  },
  options: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
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
    color: colors.dark,
    marginBottom: 3,
  },
  optionDesc: {
    fontSize: 13,
    color: colors.gray,
    lineHeight: 18,
  },
  optionArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Peak Featured Option
  peakOption: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: colors.primary,
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
    color: colors.dark,
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
    color: colors.dark,
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
    color: colors.primary,
    fontWeight: '500',
  },

  cancelButton: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.gray,
  },
});

export default CreateOptionsPopup;
