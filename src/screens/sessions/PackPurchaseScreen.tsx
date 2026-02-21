/**
 * Pack Purchase Screen
 * Checkout screen for buying a monthly session pack
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OptimizedImage from '../../components/OptimizedImage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { resolveDisplayName } from '../../types/profile';
import { LinearGradient } from 'expo-linear-gradient';
import { awsAPI } from '../../services/aws-api';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useStripeCheckout } from '../../hooks/useStripeCheckout';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import { useDataFetch } from '../../hooks/useDataFetch';
import { isValidUUID } from '../../utils/formatters';

interface Pack {
  id: string;
  name: string;
  description: string;
  sessionsIncluded: number;
  sessionDuration: number;
  validityDays: number;
  price: number;
  savings: number;
}

interface Creator {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  verified: boolean;
}

type RouteParams = {
  PackPurchase: { creatorId: string; pack: Pack };
};

const PackPurchaseScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void; replace: (screen: string, params?: Record<string, unknown>) => void }>();
  const route = useRoute<RouteProp<RouteParams, 'PackPurchase'>>();
  const { colors, isDark } = useTheme();

  const { showError, showWarning } = useSmuppyAlert();
  const { openCheckout } = useStripeCheckout();
  const { formatAmount: formatCurrencyAmount } = useCurrency();
  const { creatorId, pack } = route.params;

  // SECURITY: Validate UUID on mount
  useEffect(() => {
    if (!creatorId || !isValidUUID(creatorId)) {
      if (__DEV__) console.warn('[PackPurchaseScreen] Invalid creatorId:', creatorId);
      showError('Error', 'Invalid creator');
      navigation.goBack();
    }
  }, [creatorId, showError, navigation]);

  const [purchasing, setPurchasing] = useState(false);

  const { data: creator, isLoading } = useDataFetch(
    async () => {
      const profile = await awsAPI.getProfile(creatorId);
      return {
        success: true as const,
        creator: {
          id: profile.id,
          name: resolveDisplayName(profile),
          username: profile.username,
          avatar: profile.avatarUrl || null,
          verified: profile.isVerified,
        } as Creator,
      };
    },
    {
      extractData: (r) => r.creator,
      defaultValue: null,
    },
  );

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handlePurchase = async () => {
    if (purchasing || isLoading) return;

    try {
      setPurchasing(true);

      // Create payment intent
      const response = await awsAPI.createPaymentIntent({
        creatorId,
        amount: Math.round(pack.price * 100), // cents
        packId: pack.id,
        type: 'pack',
        description: `Pack: ${pack.name}`,
      });

      if (!response.success || !response.checkoutUrl || !response.sessionId) {
        throw new Error(response.message || 'Failed to create payment intent');
      }

      const checkoutResult = await openCheckout(response.checkoutUrl, response.sessionId);

      if (checkoutResult.status === 'cancelled') {
        setPurchasing(false);
        return;
      }

      if (checkoutResult.status === 'failed') {
        throw new Error(checkoutResult.message);
      }

      if (checkoutResult.status === 'pending') {
        showWarning('Payment Processing', checkoutResult.message);
        return;
      }

      // Payment verified — navigate to success
      navigation.replace('PackPurchaseSuccess', {
        pack,
        creator,
      });
    } catch (error: unknown) {
      if (__DEV__) console.warn('Payment error:', error);
      showError('Error', 'Payment failed. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  // Loading state while fetching creator
  if (!creator) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.gray, marginTop: 16 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.title}>Buy a Pack</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Creator Info */}
        <View style={styles.creatorCard}>
          <OptimizedImage
            source={creator.avatar}
            style={styles.creatorAvatar as StyleProp<ImageStyle>}
            contentFit="cover"
            priority="high"
          />
          <View style={styles.creatorInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.creatorName}>{creator.name}</Text>
              {creator.verified && (
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
              )}
            </View>
          </View>
        </View>

        {/* Pack Details */}
        <View style={styles.packCard}>
          <View style={styles.packHeader}>
            <View style={styles.packIconContainer}>
              <Ionicons name="cube" size={28} color={colors.primary} />
            </View>
            <View style={styles.packTitleContainer}>
              <Text style={styles.packName}>{pack.name}</Text>
              <View style={styles.savingsBadge}>
                <Text style={styles.savingsText}>-{pack.savings}%</Text>
              </View>
            </View>
          </View>
          <Text style={styles.packDescription}>{pack.description}</Text>

          <View style={styles.packFeatures}>
            <View style={styles.featureRow}>
              <Ionicons name="videocam" size={20} color={colors.primary} />
              <Text style={styles.featureText}>{pack.sessionsIncluded} sessions included</Text>
            </View>
            <View style={styles.featureRow}>
              <Ionicons name="time" size={20} color={colors.primary} />
              <Text style={styles.featureText}>{pack.sessionDuration} minutes per session</Text>
            </View>
            <View style={styles.featureRow}>
              <Ionicons name="calendar" size={20} color={colors.primary} />
              <Text style={styles.featureText}>Valid for {pack.validityDays} days</Text>
            </View>
            <View style={styles.featureRow}>
              <Ionicons name="refresh" size={20} color={colors.primary} />
              <Text style={styles.featureText}>Reschedulable sessions</Text>
            </View>
          </View>
        </View>

        {/* Price Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{pack.name}</Text>
            <Text style={styles.summaryValue}>{formatCurrencyAmount(Math.round(pack.price * 100))}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Price per session
            </Text>
            <Text style={styles.summaryValueMuted}>
              {formatCurrencyAmount(Math.round((pack.price / pack.sessionsIncluded) * 100))}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrencyAmount(Math.round(pack.price * 100))}</Text>
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Secure Payment</Text>
            <Text style={styles.infoText}>
              Your payment information is protected by Stripe.
              You can cancel at any time.
            </Text>
          </View>
        </View>

        {/* Terms */}
        <Text style={styles.terms}>
          By continuing, you agree to the{' '}
          <Text style={styles.termsLink}>Terms of Service</Text>
          {' '}and the{' '}
          <Text style={styles.termsLink}>Refund Policy</Text>.
        </Text>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.priceDisplay}>
          <Text style={styles.priceLabel}>Total</Text>
          <Text style={styles.priceValue}>{formatCurrencyAmount(Math.round(pack.price * 100))}</Text>
        </View>
        <TouchableOpacity
          style={[styles.payButton, purchasing && styles.payButtonDisabled]}
          onPress={handlePurchase}
          disabled={purchasing}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.payGradient}
          >
            {purchasing ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="lock-closed" size={18} color={colors.white} />
                <Text style={styles.payButtonText}>Pay now</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  creatorAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  creatorInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  creatorUsername: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  packCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  packHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  packIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  packTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  packName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  savingsBadge: {
    backgroundColor: '#22C55E20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  savingsText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#22C55E',
  },
  packDescription: {
    fontSize: 14,
    color: colors.gray,
    marginBottom: 16,
    lineHeight: 20,
  },
  packFeatures: {
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 14,
    color: colors.dark,
  },
  summaryCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 15,
    color: colors.gray,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  summaryValueMuted: {
    fontSize: 14,
    color: colors.gray,
  },
  divider: {
    height: 1,
    backgroundColor: colors.background,
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.primary + '10',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: colors.gray,
    lineHeight: 18,
  },
  terms: {
    fontSize: 12,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.backgroundSecondary,
    gap: 16,
  },
  priceDisplay: {
    alignItems: 'flex-start',
  },
  priceLabel: {
    fontSize: 12,
    color: colors.gray,
  },
  priceValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.dark,
  },
  payButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
});

export default PackPurchaseScreen;
