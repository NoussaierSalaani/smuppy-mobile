/**
 * BusinessSubscriptionSuccessScreen
 * Confirmation screen after successful subscription
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import SharePostModal from '../../components/SharePostModal';
import SuccessScreen from '../../components/SuccessScreen';
import type { SuccessAction } from '../../components/SuccessScreen';
import type { ShareContentData } from '../../hooks/useModalState';

interface Props {
  route: {
    params: {
      subscriptionId: string;
      businessName: string;
      planName: string;
      period: 'weekly' | 'monthly' | 'yearly';
      trialDays?: number;
    };
  };
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void; popToTop: () => void; replace: (screen: string, params?: Record<string, unknown>) => void };
}

const PERIOD_TEXT: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Annual',
};

export default function BusinessSubscriptionSuccessScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { subscriptionId, businessName, planName, period, trialDays } = route.params;

  const [shareModalVisible, setShareModalVisible] = useState(false);

  const shareContent: ShareContentData = useMemo(() => ({
    id: subscriptionId,
    type: 'text',
    title: `Subscribed to ${businessName}`,
    subtitle: `${planName} - ${PERIOD_TEXT[period]}`,
    shareText: `I just subscribed to ${businessName} on Smuppy!\n\nJoin me and let's workout together!`,
  }), [subscriptionId, businessName, planName, period]);

  const styles = useMemo(() => createLocalStyles(colors), [colors]);

  const handleDone = useCallback(() => {
    navigation.popToTop();
    navigation.navigate('Tabs');
  }, [navigation]);

  const actions: SuccessAction[] = useMemo(() => [
    { label: 'My Subscriptions', onPress: () => navigation.replace('MySubscriptions'), variant: 'secondary', icon: 'card-outline' },
    { label: 'Share', onPress: () => setShareModalVisible(true), variant: 'secondary', icon: 'share-outline' },
    { label: 'Start Exploring', onPress: handleDone, variant: 'primary', icon: 'arrow-forward' },
  ], [navigation, handleDone]);

  const subscriptionCard = useMemo(() => (
    <View style={styles.subscriptionCard}>
      <View style={styles.cardHeader}>
        <View style={styles.planBadge}>
          <Ionicons name="star" size={14} color="#FFD700" />
          <Text style={styles.planBadgeText}>{PERIOD_TEXT[period]}</Text>
        </View>
      </View>

      <Text style={styles.businessName}>{businessName}</Text>
      <Text style={styles.planName}>{planName}</Text>

      {trialDays ? (
        <View style={styles.trialInfo}>
          <Ionicons name="gift" size={18} color="#FFD700" />
          <Text style={styles.trialText}>
            {trialDays}-day free trial {'\u2022'} Cancel anytime
          </Text>
        </View>
      ) : null}

      <View style={styles.cardDivider} />

      <View style={styles.benefitsList}>
        <View style={styles.benefitItem}>
          <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
          <Text style={styles.benefitText}>Unlimited access to all facilities</Text>
        </View>
        <View style={styles.benefitItem}>
          <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
          <Text style={styles.benefitText}>Priority booking for classes</Text>
        </View>
        <View style={styles.benefitItem}>
          <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
          <Text style={styles.benefitText}>Exclusive member discounts</Text>
        </View>
      </View>
    </View>
  ), [styles, colors, period, businessName, planName, trialDays]);

  const infoCard = useMemo(() => (
    <View style={styles.infoCard}>
      <Ionicons name="information-circle" size={20} color={colors.primary} />
      <Text style={styles.infoText}>
        You can manage your subscription anytime from your profile settings
      </Text>
    </View>
  ), [styles, colors]);

  return (
    <SuccessScreen
      title={trialDays ? 'Trial Started! 🎉' : 'Subscribed! 🎉'}
      subtitle={trialDays ? `Enjoy your ${trialDays}-day free trial` : 'You now have full access to all features'}
      details={subscriptionCard}
      extraContent={infoCard}
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
    subscriptionCard: {
      width: '100%',
      backgroundColor: 'rgba(255,255,255,0.05)',
      borderRadius: 24,
      padding: 24,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: 'rgba(14,191,138,0.3)',
    },
    cardHeader: {
      marginBottom: 12,
    },
    planBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,215,0,0.15)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      gap: 6,
    },
    planBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFD700',
    },
    businessName: {
      fontSize: 14,
      color: colors.gray,
      marginBottom: 4,
    },
    planName: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.dark,
      marginBottom: 16,
    },
    trialInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,215,0,0.1)',
      padding: 12,
      borderRadius: 12,
      gap: 10,
      marginBottom: 16,
    },
    trialText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#FFD700',
    },
    cardDivider: {
      height: 1,
      backgroundColor: 'rgba(255,255,255,0.1)',
      marginBottom: 16,
    },
    benefitsList: {
      gap: 12,
    },
    benefitItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    benefitText: {
      fontSize: 14,
      color: colors.grayLight,
    },
    infoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(14,191,138,0.1)',
      padding: 14,
      borderRadius: 14,
      gap: 12,
      width: '100%',
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      color: colors.primary,
    },
  });
