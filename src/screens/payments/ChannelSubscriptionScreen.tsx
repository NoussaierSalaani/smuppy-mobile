/**
 * ChannelSubscriptionScreen - Subscribe to Creator Channel
 * Premium UI for subscribing to a creator's streaming channel
 * Inspired by Twitch, Patreon, and modern subscription flows
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AvatarImage } from '../../components/OptimizedImage';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { GRADIENTS, SHADOWS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useStripeCheckout } from '../../hooks/useStripeCheckout';
import { formatNumber } from '../../utils/formatters';

const { width: _SCREEN_WIDTH } = Dimensions.get('window');

interface ChannelInfo {
  creatorId: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  pricePerMonth: number;
  description: string | null;
  fanCount: number;
  subscriberCount: number;
  tier: string;
}

interface RouteParams {
  creatorId: string;
  creatorName?: string;
  creatorAvatar?: string;
}

const PERKS = [
  { icon: 'lock-open', text: 'Exclusive content access' },
  { icon: 'videocam', text: 'Members-only live streams' },
  { icon: 'chatbubble-ellipses', text: 'Direct messaging with creator' },
  { icon: 'notifications', text: 'Priority notifications' },
  { icon: 'heart', text: 'Support your favorite creator' },
  { icon: 'sparkles', text: 'Subscriber badge in chat' },
];

export default function ChannelSubscriptionScreen() {
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void }>();
  const route = useRoute();
  const params = route.params as RouteParams;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { showError, showSuccess } = useSmuppyAlert();
  const { openCheckout } = useStripeCheckout();

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const fetchChannelInfo = useCallback(async () => {
    try {
      const response = await awsAPI.request<{ success: boolean; channel?: ChannelInfo }>('/payments/channel-subscription', {
        method: 'POST',
        body: { action: 'get-channel-info', creatorId: params.creatorId },
      });
      if (response.success && response.channel) {
        setChannelInfo(response.channel);
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to fetch channel info:', error);
    } finally {
      setLoading(false);
    }
  }, [params.creatorId]);

  const checkSubscription = useCallback(async () => {
    try {
      const response = await awsAPI.request<{ success: boolean; subscriptions?: Array<{ creatorId: string }> }>('/payments/channel-subscription', {
        method: 'POST',
        body: { action: 'list-subscriptions' },
      });
      if (response.success && response.subscriptions) {
        const sub = response.subscriptions.find((s) => s.creatorId === params.creatorId);
        setIsSubscribed(!!sub);
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to check subscription:', error);
    }
  }, [params.creatorId]);

  useEffect(() => {
    fetchChannelInfo();
    checkSubscription();
  }, [fetchChannelInfo, checkSubscription]);

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };



  const handleSubscribe = async () => {
    if (!channelInfo) return;

    setSubscribing(true);
    try {
      const response = await awsAPI.request<{ success: boolean; checkoutUrl?: string; sessionId?: string; error?: string }>('/payments/channel-subscription', {
        method: 'POST',
        body: { action: 'subscribe', creatorId: params.creatorId },
      });

      if (response.success && response.checkoutUrl && response.sessionId) {
        const checkoutResult = await openCheckout(response.checkoutUrl, response.sessionId);

        if (checkoutResult.status === 'success') {
          showSuccess('Subscribed!', 'Your subscription is now active.');
          await checkSubscription();
        } else if (checkoutResult.status === 'pending') {
          showSuccess('Processing', checkoutResult.message);
        } else if (checkoutResult.status === 'failed') {
          showError('Payment Failed', checkoutResult.message);
        }
        // cancelled — do nothing
      } else if (response.success && response.checkoutUrl) {
        // Fallback if no sessionId returned
        navigation.navigate('WebView', { url: response.checkoutUrl, title: 'Complete Subscription' });
      } else {
        showError('Error', response.error || 'Failed to start subscription');
      }
    } catch (_error: unknown) {
      showError('Error', 'Something went wrong. Please try again.');
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!channelInfo) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.gray} />
        <Text style={styles.errorText}>Channel not found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero Section */}
        <LinearGradient
          colors={GRADIENTS.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 10 }]}
        >
          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>

          {/* Creator Avatar */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatarGlow}>
              <AvatarImage
                source={channelInfo.avatarUrl}
                style={styles.avatar}
                size={100}
              />
            </View>
            {channelInfo.isVerified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={28} color="#00D4FF" />
              </View>
            )}
          </View>

          {/* Creator Info */}
          <Text style={styles.creatorName}>{channelInfo.fullName}</Text>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatNumber(channelInfo.fanCount)}</Text>
              <Text style={styles.statLabel}>Fans</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatNumber(channelInfo.subscriberCount)}</Text>
              <Text style={styles.statLabel}>Subscribers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.tierBadge}>
                <Ionicons name="diamond" size={14} color="white" />
                <Text style={styles.tierText}>{channelInfo.tier}</Text>
              </View>
              <Text style={styles.statLabel}>Tier</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Subscription Card */}
        <View style={styles.subscriptionCard}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Channel Membership</Text>
              <Text style={styles.cardSubtitle}>Billed monthly • Cancel anytime</Text>
            </View>
            <View style={styles.priceTag}>
              <Text style={styles.priceAmount}>{formatCurrency(channelInfo.pricePerMonth)}</Text>
              <Text style={styles.pricePeriod}>/mo</Text>
            </View>
          </View>

          {/* Description */}
          {channelInfo.description && (
            <Text style={styles.channelDescription}>{channelInfo.description}</Text>
          )}

          {/* Perks */}
          <View style={styles.perksContainer}>
            <Text style={styles.perksTitle}>Membership includes</Text>
            {PERKS.map((perk, index) => (
              <View key={index} style={styles.perkItem}>
                <LinearGradient
                  colors={GRADIENTS.primary}
                  style={styles.perkIcon}
                >
                  <Ionicons name={perk.icon as keyof typeof Ionicons.glyphMap} size={16} color="white" />
                </LinearGradient>
                <Text style={styles.perkText}>{perk.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Social Proof */}
        <View style={styles.socialProof}>
          <Ionicons name="people" size={20} color={colors.primary} />
          <Text style={styles.socialProofText}>
            Join {formatNumber(channelInfo.subscriberCount)} other members supporting {channelInfo.fullName}
          </Text>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 16 }]}>
        {isSubscribed ? (
          <View style={styles.subscribedContainer}>
            <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            <Text style={styles.subscribedText}>You're a member!</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={styles.subscribeButton}
              onPress={handleSubscribe}
              disabled={subscribing}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={GRADIENTS.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.subscribeGradient}
              >
                {subscribing ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons name="star" size={20} color="white" />
                    <Text style={styles.subscribeText}>
                      Subscribe for {formatCurrency(channelInfo.pricePerMonth)}/month
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.termsText}>
              Subscription auto-renews monthly until canceled
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: colors.gray,
    marginTop: 16,
    marginBottom: 24,
  },
  backBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  avatarContainer: {
    marginTop: 40,
    marginBottom: 16,
  },
  avatarGlow: {
    padding: 4,
    borderRadius: 56,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: 'white',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 2,
  },
  creatorName: {
    fontSize: 26,
    fontWeight: '800',
    color: 'white',
    textAlign: 'center',
  },
  creatorUsername: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  tierText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  subscriptionCard: {
    marginHorizontal: 16,
    marginTop: -20,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 24,
    padding: 24,
    ...SHADOWS.cardMedium,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  priceTag: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
  },
  pricePeriod: {
    fontSize: 14,
    color: colors.gray,
    marginLeft: 2,
  },
  channelDescription: {
    fontSize: 14,
    color: colors.gray,
    lineHeight: 20,
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? colors.border : '#F1F5F9',
  },
  perksContainer: {
    marginTop: 8,
  },
  perksTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 16,
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  perkIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  perkText: {
    flex: 1,
    fontSize: 15,
    color: colors.dark,
  },
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
    gap: 8,
  },
  socialProofText: {
    fontSize: 14,
    color: colors.gray,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: isDark ? colors.border : '#F1F5F9',
  },
  subscribeButton: {
    borderRadius: 16,
    overflow: 'hidden',
    ...SHADOWS.buttonGradient,
  },
  subscribeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  subscribeText: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
  },
  termsText: {
    fontSize: 12,
    color: colors.gray,
    textAlign: 'center',
    marginTop: 12,
  },
  subscribedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    gap: 8,
  },
  subscribedText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.primary,
  },
});
