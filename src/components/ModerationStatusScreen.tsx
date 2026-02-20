/**
 * ModerationStatusScreen
 * Shared component for account suspended/banned screens.
 * Handles: icon display, title, description, reason card, notice text, action buttons.
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

interface ModerationStatusScreenProps {
  iconName: string;
  iconColor: string;
  title: string;
  /** Color override for the title text. Defaults to colors.dark. */
  titleColor?: string;
  description: string;
  reason?: string | null;
  /** Default reason label shown when reason is null/undefined. */
  defaultReason?: string;
  notice: string;
  showAppealButton?: boolean;
  appealButtonLabel?: string;
  appealButtonColor?: string;
  onLogout: () => void;
  onAppeal?: () => void;
  /** Additional info rendered between the reason card and the notice (e.g., duration card). */
  additionalInfo?: React.ReactNode;
}

const ModerationStatusScreen = ({
  iconName,
  iconColor,
  title,
  titleColor,
  description,
  reason,
  defaultReason,
  notice,
  showAppealButton = false,
  appealButtonLabel = 'Contact Support',
  appealButtonColor = '#FF3B30',
  onLogout,
  onAppeal,
  additionalInfo,
}: ModerationStatusScreenProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, titleColor), [colors, titleColor]);

  const handleLogout = useCallback(() => {
    onLogout();
  }, [onLogout]);

  const handleAppeal = useCallback(() => {
    onAppeal?.();
  }, [onAppeal]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name={iconName as keyof typeof Ionicons.glyphMap} size={64} color={iconColor} />
        </View>

        <Text style={styles.title}>{title}</Text>

        <Text style={styles.description}>{description}</Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Reason</Text>
          <Text style={styles.infoValue}>{reason || defaultReason || 'Community guidelines violation'}</Text>
        </View>

        {additionalInfo}

        <Text style={styles.notice}>{notice}</Text>

        {showAppealButton && (
          <TouchableOpacity
            style={[styles.appealButton, { backgroundColor: appealButtonColor }]}
            onPress={handleAppeal}
            activeOpacity={0.7}
          >
            <Ionicons name="mail-outline" size={18} color={colors.white} />
            <Text style={styles.appealText}>{appealButtonLabel}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, titleColor?: string) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    iconContainer: {
      alignItems: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: titleColor || colors.dark,
      textAlign: 'center',
      marginBottom: 12,
    },
    description: {
      fontSize: 15,
      color: colors.gray,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 24,
    },
    infoCard: {
      backgroundColor: colors.gray50,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.grayBorder,
    },
    infoLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.gray,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    infoValue: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.dark,
    },
    notice: {
      fontSize: 13,
      color: colors.gray,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 16,
      marginBottom: 24,
    },
    appealButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      marginBottom: 12,
    },
    appealText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.white,
    },
    logoutButton: {
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.grayBorder,
      alignItems: 'center',
    },
    logoutText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.gray,
    },
  });

export default ModerationStatusScreen;
