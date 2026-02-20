/**
 * VibeGuardianOverlay — Full-screen breathing modal
 *
 * Shown when the Vibe Guardian detects doom-scrolling patterns.
 * Displays a breathing circle, a gentle message, and a dismiss button.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BreathingCircle from './BreathingCircle';
import { SPACING } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

type VibeGuardianOverlayProps = Readonly<{
  visible: boolean;
  onDismiss: () => void;
}>;

const VibeGuardianOverlay: React.FC<VibeGuardianOverlayProps> = ({ visible, onDismiss }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
    >
      <LinearGradient
        colors={isDark ? ['#0a252f', '#0d3d3d', '#0a252f'] : ['#E6FAF8', '#D4F5F0', '#E6FAF8']}
        style={styles.container}
      >
        <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
          {/* Header message */}
          <View style={styles.headerSection}>
            <Text style={styles.title}>Take a moment</Text>
            <Text style={styles.subtitle}>
              You've been scrolling for a while.{'\n'}
              Let's pause and breathe together.
            </Text>
          </View>

          {/* Breathing circle */}
          <View style={styles.breatheSection}>
            <BreathingCircle size={160} color={colors.primary} showLabel />
          </View>

          {/* Dismiss */}
          <View style={styles.bottomSection}>
            <Text style={styles.tip}>
              Taking small breaks helps you enjoy content more
            </Text>
            <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} activeOpacity={0.8}>
              <LinearGradient
                colors={['#00B3C7', '#0EBF8A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.dismissGradient}
              >
                <Text style={styles.dismissText}>I'm good, continue</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  headerSection: {
    alignItems: 'center',
  },
  title: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 28,
    color: colors.dark,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  subtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(10,37,47,0.7)',
    textAlign: 'center',
    lineHeight: 24,
  },
  breatheSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSection: {
    alignItems: 'center',
    width: '100%',
  },
  tip: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(10,37,47,0.5)',
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  dismissButton: {
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
  },
  dismissGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 28,
  },
  dismissText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: colors.white,
  },
});

export default React.memo(VibeGuardianOverlay);
