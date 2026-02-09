/**
 * AccountBannedScreen
 * Shown when the user's account has been permanently banned.
 * Displays ban reason, support email, and logout button.
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useModerationStore } from '../../stores/moderationStore';
import * as backend from '../../services/backend';

export default function AccountBannedScreen(): React.ReactNode {
  const { colors } = useTheme();
  const { reason } = useModerationStore();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLogout = async () => {
    await backend.signOut();
  };

  const handleContactSupport = useCallback(() => {
    const subject = encodeURIComponent('Account Ban Appeal');
    const body = encodeURIComponent(
      'I would like to appeal my account ban.\n\nPlease describe why you believe this was a mistake:\n',
    );
    Linking.openURL(`mailto:support@smuppy.com?subject=${subject}&body=${body}`).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="ban-outline" size={64} color="#FF3B30" />
        </View>

        <Text style={styles.title}>Account Banned</Text>

        <Text style={styles.description}>
          Your account has been permanently banned due to repeated violations of our community guidelines.
        </Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Reason</Text>
          <Text style={styles.infoValue}>{reason || 'Repeated community guidelines violations'}</Text>
        </View>

        <Text style={styles.notice}>
          If you believe this was a mistake, you can contact our support team to file an appeal.
        </Text>

        <TouchableOpacity style={styles.appealButton} onPress={handleContactSupport} activeOpacity={0.7}>
          <Ionicons name="mail-outline" size={18} color={colors.white} />
          <Text style={styles.appealText}>Contact Support</Text>
        </TouchableOpacity>

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
      color: '#FF3B30',
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
      marginBottom: 16,
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
      marginBottom: 24,
    },
    appealButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: '#FF3B30',
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
