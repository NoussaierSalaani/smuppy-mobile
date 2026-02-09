/**
 * AccountSuspendedScreen
 * Shown when the user's account is temporarily suspended.
 * Displays suspension reason, duration, and a logout button.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useModerationStore } from '../../stores/moderationStore';
import * as backend from '../../services/backend';

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
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLogout = async () => {
    await backend.signOut();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="time-outline" size={64} color="#FF9500" />
        </View>

        <Text style={styles.title}>Account Suspended</Text>

        <Text style={styles.description}>
          Your account has been temporarily suspended for violating our community guidelines.
        </Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Reason</Text>
          <Text style={styles.infoValue}>{reason || 'Community guidelines violation'}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Duration</Text>
          <Text style={styles.infoValue}>{formatTimeRemaining(suspendedUntil)}</Text>
        </View>

        <Text style={styles.notice}>
          During the suspension, you cannot post, comment, or send messages. You can still browse content.
        </Text>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
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
      color: colors.dark,
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
      marginBottom: 32,
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
