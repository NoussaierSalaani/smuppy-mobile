/**
 * AccountSuspendedScreen
 * Shown when the user's account is temporarily suspended.
 * Displays suspension reason, duration, and a logout button.
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useModerationStore } from '../../stores/moderationStore';
import * as backend from '../../services/backend';
import ModerationStatusScreen from '../../components/ModerationStatusScreen';

function formatTimeRemaining(suspendedUntil: string | null): string {
  if (!suspendedUntil) return 'until further notice';
  const end = new Date(suspendedUntil);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return 'ending soon';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} remaining`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
  const minutes = Math.floor(diffMs / (1000 * 60));
  return `${minutes} minute${minutes > 1 ? 's' : ''} remaining`;
}

export default function AccountSuspendedScreen(): React.ReactNode {
  const { colors } = useTheme();
  const { reason, suspendedUntil } = useModerationStore();
  const styles = useMemo(() => createLocalStyles(colors), [colors]);

  const handleLogout = useCallback(async () => {
    await backend.signOut();
  }, []);

  const durationCard = useMemo(() => (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>Duration</Text>
      <Text style={styles.infoValue}>{formatTimeRemaining(suspendedUntil)}</Text>
    </View>
  ), [styles, suspendedUntil]);

  return (
    <ModerationStatusScreen
      iconName="time-outline"
      iconColor="#FF9500"
      title="Account Suspended"
      description="Your account has been temporarily suspended for violating our community guidelines."
      reason={reason}
      defaultReason="Community guidelines violation"
      notice="During the suspension, you cannot post, comment, or send messages. You can still browse content."
      onLogout={handleLogout}
      additionalInfo={durationCard}
    />
  );
}

const createLocalStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
  });
