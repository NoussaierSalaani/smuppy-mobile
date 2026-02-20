/**
 * SuccessScreen
 * Shared component for success/confirmation screens.
 * Handles: success animation, haptics, gradient icon, layout, action buttons.
 * The caller is responsible for rendering any modals (e.g. SharePostModal) outside this component.
 */

import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GRADIENTS } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

type ActionVariant = 'primary' | 'secondary' | 'link';

export interface SuccessAction {
  label: string;
  onPress: () => void;
  variant: ActionVariant;
  icon?: string;
}

interface SuccessScreenProps {
  title: string;
  subtitle: string;
  /** The details card content rendered between the subtitle and extraContent. */
  details?: React.ReactNode;
  /** Action buttons rendered at the bottom. Secondary buttons are grouped in a row. */
  actions: SuccessAction[];
  /** Override the gradient colors for the success circle. Defaults to GRADIENTS.primary. */
  gradientColors?: readonly string[];
  /** Extra content rendered below details (e.g., reminder cards, info cards). */
  extraContent?: React.ReactNode;
  /** Custom hero element rendered instead of the default checkmark circle (e.g., avatar with badge). */
  customHero?: React.ReactNode;
  /** Additional elements rendered after SafeAreaView (e.g., SharePostModal, ConfettiCannon). */
  children?: React.ReactNode;
  /** Whether to use dark background gradient. Defaults to true. */
  darkBackground?: boolean;
  /** Center content vertically instead of top-aligning with paddingTop. Defaults to false. */
  centerContent?: boolean;
}

const SuccessScreen = ({
  title,
  subtitle,
  details,
  actions,
  gradientColors,
  extraContent,
  customHero,
  children,
  darkBackground = true,
  centerContent = false,
}: SuccessScreenProps) => {
  const { colors, isDark } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(
    () => createStyles(colors, isDark, centerContent),
    [colors, isDark, centerContent],
  );
  const resolvedGradient: [string, string, ...string[]] = useMemo(
    () =>
      (gradientColors
        ? [...gradientColors]
        : [...GRADIENTS.primary]) as [string, string, ...string[]],
    [gradientColors],
  );

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Split actions by variant
  const secondaryActions = useMemo(() => actions.filter((a) => a.variant === 'secondary'), [actions]);
  const primaryActions = useMemo(() => actions.filter((a) => a.variant === 'primary'), [actions]);
  const linkActions = useMemo(() => actions.filter((a) => a.variant === 'link'), [actions]);

  const renderActionButton = useCallback(
    (action: SuccessAction) => {
      if (action.variant === 'primary') {
        return (
          <TouchableOpacity key={action.label} style={styles.primaryButton} onPress={action.onPress}>
            <LinearGradient colors={resolvedGradient} style={styles.primaryGradient}>
              {action.icon && (
                <Ionicons
                  name={action.icon as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color="#fff"
                />
              )}
              <Text style={styles.primaryButtonText}>{action.label}</Text>
            </LinearGradient>
          </TouchableOpacity>
        );
      }
      if (action.variant === 'secondary') {
        return (
          <TouchableOpacity key={action.label} style={styles.secondaryButton} onPress={action.onPress}>
            {action.icon && (
              <Ionicons
                name={action.icon as keyof typeof Ionicons.glyphMap}
                size={20}
                color="#fff"
              />
            )}
            <Text style={styles.secondaryButtonText}>{action.label}</Text>
          </TouchableOpacity>
        );
      }
      // link variant
      return (
        <TouchableOpacity key={action.label} style={styles.linkButton} onPress={action.onPress}>
          <Text style={styles.linkButtonText}>{action.label}</Text>
        </TouchableOpacity>
      );
    },
    [styles, resolvedGradient],
  );

  return (
    <View style={styles.container}>
      {darkBackground && (
        <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />
      )}

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* Hero: custom or default animated checkmark */}
          {customHero ?? (
            <Animated.View
              style={[
                styles.animationContainer,
                {
                  transform: [{ scale: scaleAnim }],
                  opacity: opacityAnim,
                },
              ]}
            >
              <LinearGradient colors={resolvedGradient} style={styles.successCircle}>
                <Ionicons name="checkmark" size={60} color="#fff" />
              </LinearGradient>
            </Animated.View>
          )}

          {/* Success Message */}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* Details Card */}
          {details}

          {/* Extra Content */}
          {extraContent}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {secondaryActions.length > 0 && (
            <View style={styles.actionRow}>
              {secondaryActions.map(renderActionButton)}
            </View>
          )}
          {primaryActions.map(renderActionButton)}
          {linkActions.map(renderActionButton)}
        </View>
      </SafeAreaView>

      {/* Additional elements (modals, confetti, etc.) */}
      {children}
    </View>
  );
};

const createStyles = (colors: ThemeColors, _isDark: boolean, centerContent: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    safeArea: {
      flex: 1,
    },
    content: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 24,
      ...(centerContent
        ? { justifyContent: 'center' as const }
        : { paddingTop: 40 }),
    },
    animationContainer: {
      width: 120,
      height: 120,
      marginBottom: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    successCircle: {
      width: 100,
      height: 100,
      borderRadius: 50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.dark,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 15,
      color: colors.gray,
      textAlign: 'center',
      marginBottom: 32,
    },
    actions: {
      padding: 20,
      paddingBottom: 34,
      gap: 12,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 12,
    },
    secondaryButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.1)',
      paddingVertical: 14,
      borderRadius: 14,
      gap: 8,
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#fff',
    },
    primaryButton: {
      borderRadius: 14,
      overflow: 'hidden',
    },
    primaryGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      gap: 8,
    },
    primaryButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
    linkButton: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    linkButtonText: {
      fontSize: 15,
      color: colors.gray,
    },
  });

export default SuccessScreen;
