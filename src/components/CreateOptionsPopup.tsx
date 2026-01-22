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
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

const { height, width } = Dimensions.get('window');

const COLORS = {
  primary: '#0EBF8A',
  secondary: '#00B5C1',
  accent: '#0081BE',
  dark: '#0A0A0F',
  white: '#FFFFFF',
  gray: '#8E8E93',
  cardBg: '#1C1C1E',
};

// Smuppy S Logo for Peak button
const SmuppySLogo = ({ size = 28 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 60 60" fill="none">
    <Path
      d="M36.8445 16.3889C40.2001 16.3889 43.1112 17.5 45.5778 19.7222C48.089 21.9 49.3445 24.6778 49.3445 28.0556C49.3445 30.4556 48.6223 32.5722 47.1778 34.4056C45.7334 36.1944 43.889 37.4389 41.6445 38.1389C43.6668 38.4833 45.3556 39.2389 46.7112 40.4056C48.1112 41.5278 49.1556 42.8556 49.8445 44.3889C50.5334 45.8778 50.8778 47.4222 50.8778 49.0222C50.8778 52.4 49.5556 55.2222 46.9112 57.4889C44.3112 59.7111 41.1779 60.8222 37.5112 60.8222H17.0667V55.0889H37.5112C39.8445 55.0889 41.7334 54.4 43.1778 53.0222C44.6223 51.6444 45.3445 49.9 45.3445 47.7889C45.3445 45.6778 44.6223 43.9333 43.1778 42.5556C41.7334 41.1333 39.8445 40.4222 37.5112 40.4222H17.0667V34.6889H36.8445C39.089 34.6889 40.9001 34.0667 42.2778 32.8222C43.6556 31.5778 44.3445 30.0056 44.3445 28.1056C44.3445 26.1611 43.6556 24.5667 42.2778 23.3222C40.9001 22.0778 39.089 21.4556 36.8445 21.4556H17.0667V16.3889H36.8445Z"
      fill={COLORS.dark}
    />
  </Svg>
);

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
                      <SmuppySLogo size={32} />
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
