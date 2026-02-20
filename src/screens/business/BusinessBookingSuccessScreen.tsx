/**
 * BusinessBookingSuccessScreen
 * Confirmation screen after successful booking
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { formatDateLong } from '../../utils/dateFormatters';
import SharePostModal from '../../components/SharePostModal';
import SuccessScreen from '../../components/SuccessScreen';
import type { SuccessAction } from '../../components/SuccessScreen';
import type { ShareContentData } from '../../hooks/useModalState';

interface Props {
  route: {
    params: {
      bookingId: string;
      businessName: string;
      serviceName: string;
      date: string;
      time: string;
    };
  };
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void; popToTop: () => void };
}

export default function BusinessBookingSuccessScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { showConfirm, showSuccess } = useSmuppyAlert();
  const { bookingId, businessName, serviceName, date, time } = route.params;

  const [shareModalVisible, setShareModalVisible] = useState(false);

  const shareContent: ShareContentData = useMemo(() => ({
    id: bookingId,
    type: 'text',
    title: `Booking at ${businessName}`,
    subtitle: `${serviceName} - ${formatDateLong(date)} at ${time}`,
    shareText: `I just booked "${serviceName}" at ${businessName} on Smuppy!\n\n${formatDateLong(date)} at ${time}`,
  }), [bookingId, businessName, serviceName, date, time]);

  const styles = useMemo(() => createLocalStyles(colors), [colors]);

  const handleAddToCalendar = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    showConfirm(
      'Add to Calendar',
      `Would you like to add "${serviceName}" at ${businessName} on ${formatDateLong(date)} at ${time} to your calendar?`,
      () => { showSuccess('Added', 'Event added to your calendar'); },
      'Add',
    );
  }, [showConfirm, showSuccess, serviceName, businessName, date, time]);

  const handleDone = useCallback(() => {
    try {
      navigation.popToTop();
      navigation.navigate('Tabs');
    } catch {
      navigation.navigate('Tabs');
    }
  }, [navigation]);

  const actions: SuccessAction[] = useMemo(() => [
    { label: 'Add to Calendar', onPress: handleAddToCalendar, variant: 'secondary', icon: 'calendar-outline' },
    { label: 'Share', onPress: () => setShareModalVisible(true), variant: 'secondary', icon: 'share-outline' },
    { label: 'Done', onPress: handleDone, variant: 'primary' },
  ], [handleAddToCalendar, handleDone]);

  const detailsCard = useMemo(() => (
    <View style={styles.detailsCard}>
      <View style={styles.detailRow}>
        <View style={styles.detailIcon}>
          <Ionicons name="business" size={20} color={colors.primary} />
        </View>
        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>Location</Text>
          <Text style={styles.detailValue}>{businessName}</Text>
        </View>
      </View>
      <View style={styles.detailDivider} />
      <View style={styles.detailRow}>
        <View style={styles.detailIcon}>
          <Ionicons name="fitness" size={20} color={colors.primary} />
        </View>
        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>Service</Text>
          <Text style={styles.detailValue}>{serviceName}</Text>
        </View>
      </View>
      <View style={styles.detailDivider} />
      <View style={styles.detailRow}>
        <View style={styles.detailIcon}>
          <Ionicons name="calendar" size={20} color={colors.primary} />
        </View>
        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>Date & Time</Text>
          <Text style={styles.detailValue}>{formatDateLong(date)}</Text>
          <Text style={styles.detailSubvalue}>{time}</Text>
        </View>
      </View>
      <View style={styles.detailDivider} />
      <View style={styles.detailRow}>
        <View style={styles.detailIcon}>
          <Ionicons name="receipt" size={20} color={colors.primary} />
        </View>
        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>Booking ID</Text>
          <Text style={styles.detailValueSmall}>{bookingId}</Text>
        </View>
      </View>
    </View>
  ), [styles, colors, businessName, serviceName, date, time, bookingId]);

  const reminderCard = useMemo(() => (
    <View style={styles.reminderCard}>
      <Ionicons name="notifications" size={20} color="#FFD700" />
      <Text style={styles.reminderText}>
        We'll send you a reminder 24 hours before your appointment
      </Text>
    </View>
  ), [styles]);

  return (
    <SuccessScreen
      title="Booking Confirmed! 🎉"
      subtitle="Your session has been booked successfully"
      details={detailsCard}
      extraContent={reminderCard}
      actions={actions}
    >
      <SharePostModal
        visible={shareModalVisible}
        content={shareContent}
        onClose={() => setShareModalVisible(false)}
      />
    </SuccessScreen>
  );
}

const createLocalStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    detailsCard: {
      width: '100%',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 20,
      padding: 20,
      marginBottom: 16,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 12,
    },
    detailIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    detailContent: {
      flex: 1,
    },
    detailLabel: {
      fontSize: 12,
      color: colors.gray,
      marginBottom: 4,
    },
    detailValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.dark,
    },
    detailSubvalue: {
      fontSize: 14,
      color: colors.grayLight,
      marginTop: 2,
    },
    detailValueSmall: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.grayLight,
      fontFamily: 'monospace',
    },
    detailDivider: {
      height: 1,
      backgroundColor: colors.border,
    },
    reminderCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,215,0,0.1)',
      padding: 14,
      borderRadius: 14,
      gap: 12,
      width: '100%',
    },
    reminderText: {
      flex: 1,
      fontSize: 13,
      color: 'rgba(255,215,0,0.9)',
    },
  });
