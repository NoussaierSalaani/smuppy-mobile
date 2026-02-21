/**
 * Channel Subscribe Screen
 * Checkout screen for subscribing to a creator's channel
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { awsAPI } from '../../services/aws-api';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useStripeCheckout } from '../../hooks/useStripeCheckout';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';

interface ChannelTier {
  id: string;
  name: string;
  price: number;
  perks: string[];
  popular?: boolean;
}

interface Creator {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  verified: boolean;
  subscribersCount: number;
}

type RouteParams = {
  ChannelSubscribe: { creatorId: string; tier: ChannelTier };
};

const ChannelSubscribeScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void }>();
  const route = useRoute<RouteProp<RouteParams, 'ChannelSubscribe'>>();
  const { colors, isDark } = useTheme();

  const { showError, showSuccess, showWarning } = useSmuppyAlert();
  const { openCheckout } = useStripeCheckout();
  const { formatAmount: formatCurrencyAmount } = useCurrency();
  const { creatorId, tier } = route.params;

  const [creator, setCreator] = useState<Creator>({
    id: creatorId, name: '', username: '', avatar: null, verified: false, subscribersCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [_fetchingCreator, setFetchingCreator] = useState(true);
  const mountedRef = useRef(true);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch creator info from API
  useEffect(() => {
    (async () => {
      try {
        const res = await awsAPI.request<{ success: boolean; channel?: { creatorId: string; username: string; fullName: string; avatarUrl: string | null; isVerified: boolean; subscriberCount: number } }>(
          '/payments/channel-subscription',
          { method: 'POST', body: { action: 'get-channel-info', creatorId } },
        );
        if (!mountedRef.current) return;
        if (res.success && res.channel) {
          setCreator({
            id: res.channel.creatorId,
            name: res.channel.fullName,
            username: res.channel.username,
            avatar: res.channel.avatarUrl,
            verified: res.channel.isVerified,
            subscribersCount: res.channel.subscriberCount,
          });
        }
      } catch (err) {
        if (__DEV__) console.warn('Failed to fetch creator info:', err);
      } finally {
        if (mountedRef.current) setFetchingCreator(false);
      }
    })();
  }, [creatorId]);

  const handleSubscribe = useCallback(async () => {
    try {
      setLoading(true);

      const response = await awsAPI.subscribeToChannel(creatorId);
      if (!mountedRef.current) return;

      if (!response.success || !response.checkoutUrl || !response.sessionId) {
        showError('Error', 'Could not create subscription. Please try again.');
        return;
      }

      // Open Stripe Checkout and verify payment
      const checkoutResult = await openCheckout(response.checkoutUrl, response.sessionId);

      if (!mountedRef.current) return;

      if (checkoutResult.status === 'cancelled') {
        // User dismissed — do nothing
      } else if (checkoutResult.status === 'success') {
        showSuccess('Subscription Active', 'Your payment has been confirmed.');
        navigation.goBack();
      } else if (checkoutResult.status === 'pending') {
        showWarning('Payment Processing', checkoutResult.message);
        navigation.goBack();
      } else {
        showError('Payment Failed', checkoutResult.message);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      if (__DEV__) console.warn('Payment error:', error);
      showError('Error', 'Payment failed. Please try again.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [creatorId, openCheckout, navigation, showError, showSuccess, showWarning]);

  const renewalDate = new Date();
  renewalDate.setMonth(renewalDate.getMonth() + 1);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.title}>Subscribe</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Creator Hero */}
        <View style={styles.heroSection}>
          <OptimizedImage
            source={creator.avatar}
            style={styles.heroAvatar as StyleProp<ImageStyle>}
            contentFit="cover"
            priority="high"
          />
          <View style={styles.heroInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.heroName}>{creator.name}</Text>
              {creator.verified && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              )}
            </View>
            <Text style={styles.subscribersCount}>
              {creator.subscribersCount.toLocaleString()} subscribers
            </Text>
          </View>
        </View>

        {/* Selected Tier */}
        <View style={styles.tierCard}>
          {tier.popular && (
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tierBadge}
            >
              <Ionicons name="star" size={12} color={colors.white} />
              <Text style={styles.tierBadgeText}>Recommended</Text>
            </LinearGradient>
          )}

          <View style={styles.tierHeader}>
            <View style={styles.tierIconContainer}>
              <Ionicons name="heart" size={28} color={colors.heartRed} />
            </View>
            <View style={styles.tierTitleContainer}>
              <Text style={styles.tierName}>{tier.name}</Text>
              <View style={styles.tierPriceRow}>
                <Text style={styles.tierPrice}>{formatCurrencyAmount(Math.round(tier.price * 100))}</Text>
                <Text style={styles.tierPeriod}>/month</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.perksTitle}>What's included:</Text>
          <View style={styles.perksList}>
            {tier.perks.map((perk) => (
              <View key={perk} style={styles.perkRow}>
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                <Text style={styles.perkText}>{perk}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Billing Info */}
        <View style={styles.billingCard}>
          <Text style={styles.billingTitle}>Billing Information</Text>

          <View style={styles.billingRow}>
            <Text style={styles.billingLabel}>Monthly subscription</Text>
            <Text style={styles.billingValue}>{formatCurrencyAmount(Math.round(tier.price * 100))}/month</Text>
          </View>

          <View style={styles.billingRow}>
            <Text style={styles.billingLabel}>Next renewal</Text>
            <Text style={styles.billingValue}>
              {renewalDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long' })}
            </Text>
          </View>

          <View style={styles.billingRow}>
            <Text style={styles.billingLabel}>Cancellation</Text>
            <Text style={styles.billingValue}>Anytime</Text>
          </View>
        </View>

        {/* Benefits */}
        <View style={styles.benefitsCard}>
          <View style={styles.benefitItem}>
            <View style={[styles.benefitIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="lock-open" size={20} color={colors.primary} />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>Instant Access</Text>
              <Text style={styles.benefitText}>Unlock all exclusive content right away</Text>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <View style={[styles.benefitIcon, { backgroundColor: colors.error + '20' }]}>
              <Ionicons name="close-circle" size={20} color={colors.error} />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>No commitment</Text>
              <Text style={styles.benefitText}>Cancel anytime at no extra cost</Text>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <View style={[styles.benefitIcon, { backgroundColor: colors.success + '20' }]}>
              <Ionicons name="shield-checkmark" size={20} color={colors.success} />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>Secure Payment</Text>
              <Text style={styles.benefitText}>Protected by Stripe, the payment leader</Text>
            </View>
          </View>
        </View>

        {/* Terms */}
        <Text style={styles.terms}>
          By subscribing, you agree that your subscription will automatically renew
          each month until cancelled. You can cancel anytime from your profile.
        </Text>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.subscribeButton, loading && styles.subscribeButtonDisabled]}
          onPress={handleSubscribe}
          disabled={loading}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.subscribeGradient}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="heart" size={20} color={colors.white} />
                <Text style={styles.subscribeButtonText}>
                  Subscribe for {formatCurrencyAmount(Math.round(tier.price * 100))}/month
                </Text>
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
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  heroAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  heroInfo: {
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.dark,
  },
  heroUsername: {
    fontSize: 15,
    color: colors.gray,
    marginTop: 4,
  },
  subscribersCount: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 6,
    fontWeight: '500',
  },
  tierCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  tierBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  tierIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  tierTitleContainer: {
    flex: 1,
  },
  tierName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 4,
  },
  tierPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  tierPrice: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
  },
  tierPeriod: {
    fontSize: 16,
    color: colors.gray,
    marginLeft: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.background,
    marginVertical: 16,
  },
  perksTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 12,
  },
  perksList: {
    gap: 12,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  perkText: {
    fontSize: 14,
    color: colors.gray,
    flex: 1,
  },
  billingCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  billingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 16,
  },
  billingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  billingLabel: {
    fontSize: 14,
    color: colors.gray,
  },
  billingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
  },
  benefitsCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 2,
  },
  benefitText: {
    fontSize: 13,
    color: colors.gray,
    lineHeight: 18,
  },
  terms: {
    fontSize: 12,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.backgroundSecondary,
  },
  subscribeButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  subscribeButtonDisabled: {
    opacity: 0.6,
  },
  subscribeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  subscribeButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
});

export default ChannelSubscribeScreen;
