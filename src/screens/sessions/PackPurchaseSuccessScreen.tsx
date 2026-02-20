/**
 * Pack Purchase Success Screen
 * Confirmation screen after successful pack purchase
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import SuccessScreen from '../../components/SuccessScreen';
import type { SuccessAction } from '../../components/SuccessScreen';

interface Pack {
  id: string;
  name: string;
  sessionsIncluded: number;
  sessionDuration: number;
  validityDays: number;
  price: number;
}

interface Creator {
  id: string;
  name: string;
  username: string;
}

type RouteParams = {
  PackPurchaseSuccess: { pack: Pack; creator: Creator };
};

const PackPurchaseSuccessScreen = (): React.JSX.Element => {
  const navigation = useNavigation<{ replace: (screen: string, params?: Record<string, unknown>) => void }>();
  const route = useRoute<RouteProp<RouteParams, 'PackPurchaseSuccess'>>();
  const { colors } = useTheme();
  const { pack, creator } = route.params;

  const styles = useMemo(() => createLocalStyles(colors), [colors]);

  const handleBookNow = useCallback(() => {
    navigation.replace('BookSession', { creatorId: creator.id, fromPack: true });
  }, [navigation, creator.id]);

  const handleViewSessions = useCallback(() => {
    navigation.replace('MySessions');
  }, [navigation]);

  const handleGoHome = useCallback(() => {
    navigation.replace('Tabs');
  }, [navigation]);

  const expiryDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + pack.validityDays);
    return d;
  }, [pack.validityDays]);

  const actions: SuccessAction[] = useMemo(() => [
    { label: 'Book a session', onPress: handleBookNow, variant: 'primary', icon: 'calendar' },
    { label: 'View my sessions', onPress: handleViewSessions, variant: 'secondary' },
    { label: 'Back to home', onPress: handleGoHome, variant: 'link' },
  ], [handleBookNow, handleViewSessions, handleGoHome]);

  const gradientColors = useMemo(() => [colors.primary, colors.primaryDark] as const, [colors]);

  const summaryCard = useMemo(() => (
    <View style={styles.summaryCard}>
      <View style={styles.summaryRow}>
        <Ionicons name="cube" size={22} color={colors.primary} />
        <Text style={styles.summaryText}>{pack.name}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Ionicons name="videocam" size={22} color={colors.primary} />
        <Text style={styles.summaryText}>{pack.sessionsIncluded} sessions available</Text>
      </View>
      <View style={styles.summaryRow}>
        <Ionicons name="time" size={22} color={colors.primary} />
        <Text style={styles.summaryText}>{pack.sessionDuration} min/session</Text>
      </View>
      <View style={styles.summaryRow}>
        <Ionicons name="calendar" size={22} color={colors.primary} />
        <Text style={styles.summaryText}>
          Expires on {expiryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </Text>
      </View>
    </View>
  ), [styles, colors, pack, expiryDate]);

  const infoCard = useMemo(() => (
    <View style={styles.infoCard}>
      <Ionicons name="information-circle" size={24} color={colors.primary} />
      <Text style={styles.infoText}>
        You can book your sessions anytime from {creator.name}'s profile.
      </Text>
    </View>
  ), [styles, colors, creator.name]);

  return (
    <SuccessScreen
      title="Purchase successful!"
      subtitle={`You purchased the ${pack.name} with ${creator.name}`}
      details={summaryCard}
      extraContent={infoCard}
      actions={actions}
      gradientColors={gradientColors}
      centerContent
      darkBackground={false}
    />
  );
};

const createLocalStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    summaryCard: {
      width: '100%',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 16,
      padding: 20,
      gap: 16,
      marginBottom: 16,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    summaryText: {
      fontSize: 15,
      color: colors.dark,
      flex: 1,
    },
    infoCard: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: colors.primary + '15',
      borderRadius: 12,
      padding: 14,
    },
    infoText: {
      flex: 1,
      fontSize: 14,
      color: colors.gray,
      lineHeight: 20,
    },
  });

export default PackPurchaseSuccessScreen;
