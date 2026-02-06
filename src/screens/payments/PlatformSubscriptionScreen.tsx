/**
 * PlatformSubscriptionScreen - Upgrade to Pro
 * Premium subscription selection for Pro Creator ($99) and Pro Business ($49)
 * Inspired by Spotify Premium, YouTube Premium selection screens
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { SHADOWS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useUserStore } from '../../stores';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useStripeCheckout } from '../../hooks/useStripeCheckout';

const { width: _SCREEN_WIDTH } = Dimensions.get('window');

interface PlanFeature {
  icon: string;
  text: string;
  highlight?: boolean;
}

interface SubscriptionPlan {
  id: 'pro_creator' | 'pro_business';
  name: string;
  price: number;
  priceText: string;
  description: string;
  popular?: boolean;
  gradient: readonly [string, string, ...string[]];
  features: PlanFeature[];
}

// Display-only prices — actual amounts are enforced server-side via Stripe price IDs
const PLANS: SubscriptionPlan[] = [
  {
    id: 'pro_creator',
    name: 'Pro Creator',
    price: 9900,
    priceText: '$99',
    description: 'For influencers & content creators who want to monetize their audience',
    popular: true,
    gradient: ['#667EEA', '#764BA2'] as const,
    features: [
      { icon: 'videocam', text: 'Unlimited live streaming', highlight: true },
      { icon: 'cash', text: 'Monetize with channel subscriptions' },
      { icon: 'calendar', text: 'Sell 1:1 sessions & packs' },
      { icon: 'analytics', text: 'Advanced analytics dashboard' },
      { icon: 'shield-checkmark', text: 'Identity verification badge' },
      { icon: 'trending-up', text: 'Up to 80% revenue share' },
      { icon: 'megaphone', text: 'Priority support' },
      { icon: 'sparkles', text: 'Exclusive creator features' },
    ],
  },
  {
    id: 'pro_business',
    name: 'Pro Business',
    price: 4900,
    priceText: '$49',
    description: 'For local businesses & professionals offering services',
    gradient: ['#11998E', '#38EF7D'] as const,
    features: [
      { icon: 'storefront', text: 'Business profile badge' },
      { icon: 'calendar', text: 'Sell sessions & consultations' },
      { icon: 'location', text: 'Local discovery features' },
      { icon: 'people', text: 'Client management tools' },
      { icon: 'cash', text: 'Accept payments directly' },
      { icon: 'analytics', text: 'Business analytics' },
      { icon: 'chatbubbles', text: 'Priority messaging' },
      { icon: 'star', text: 'Reviews & ratings' },
    ],
  },
];

export default function PlatformSubscriptionScreen() {
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void }>();
  const insets = useSafeAreaInsets();
  const user = useUserStore((state) => state.user);
  const { showError, showSuccess } = useSmuppyAlert();
  const { openCheckout } = useStripeCheckout();
  const { colors, isDark } = useTheme();

  // Filter plans based on account type
  // pro_creator users can only subscribe to pro_creator premium, not pro_business
  // personal users can choose between both
  const availablePlans = user?.accountType === 'pro_creator'
    ? PLANS.filter(p => p.id === 'pro_creator')
    : PLANS;

  const [selectedPlan, setSelectedPlan] = useState<'pro_creator' | 'pro_business'>('pro_creator');
  const [loading, setLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    fetchCurrentSubscription();
  }, []);

  const fetchCurrentSubscription = async () => {
    try {
      const response = await awsAPI.request('/payments/platform-subscription', {
        method: 'POST',
        body: { action: 'get-status' },
      }) as { success?: boolean; hasSubscription?: boolean; subscription?: { planType: string } };
      if (response.success && response.hasSubscription) {
        setCurrentPlan(response.subscription?.planType || null);
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to fetch subscription:', error);
    }
  };

  const handleSelectPlan = (planId: 'pro_creator' | 'pro_business') => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    setSelectedPlan(planId);
  };

  const handleSubscribe = async () => {
    if (currentPlan === selectedPlan) {
      showSuccess('Already Subscribed', 'You are already on this plan.');
      return;
    }

    setLoading(true);
    try {
      const response = await awsAPI.request('/payments/platform-subscription', {
        method: 'POST',
        body: { action: 'subscribe', planType: selectedPlan },
      }) as { success?: boolean; checkoutUrl?: string; sessionId?: string; error?: string };

      if (response.success && response.checkoutUrl && response.sessionId) {
        const checkoutResult = await openCheckout(response.checkoutUrl, response.sessionId);

        if (checkoutResult.status === 'success') {
          showSuccess('Subscribed!', 'Your subscription is now active.');
        } else if (checkoutResult.status === 'pending') {
          showSuccess('Processing', checkoutResult.message);
        } else if (checkoutResult.status === 'failed') {
          showError('Payment Failed', checkoutResult.message);
        }
        // cancelled — do nothing
      } else if (response.success && response.checkoutUrl) {
        // Fallback if no sessionId returned
        navigation.navigate('WebView', { url: response.checkoutUrl, title: 'Complete Payment' });
      } else {
        showError('Error', response.error || 'Failed to start subscription');
      }
    } catch (_error: unknown) {
      showError('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedPlanData = PLANS.find(p => p.id === selectedPlan)!;

  return (
    <View style={styles.container}>
      {/* Header Background */}
      <LinearGradient
        colors={selectedPlanData.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerGradient, { paddingTop: insets.top }]}
      >
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={28} color="white" />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>
            {user?.accountType === 'pro_creator' ? 'Premium Subscription' : 'Go Pro'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {user?.accountType === 'pro_creator'
              ? 'Unlock premium creator features'
              : 'Unlock your full potential'}
          </Text>
        </View>

        {/* Floating Icon */}
        <View style={styles.floatingIcon}>
          <LinearGradient
            colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)']}
            style={styles.floatingIconGradient}
          >
            <Ionicons name="rocket" size={40} color="white" />
          </LinearGradient>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Plan Selection */}
        <View style={styles.plansContainer}>
          {availablePlans.map((plan) => (
            <Animated.View
              key={plan.id}
              style={[
                selectedPlan === plan.id && { transform: [{ scale: scaleAnim }] }
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.planCard,
                  selectedPlan === plan.id && styles.planCardSelected,
                  currentPlan === plan.id && styles.planCardCurrent,
                ]}
                onPress={() => handleSelectPlan(plan.id)}
                activeOpacity={0.8}
              >
                {plan.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularText}>Most Popular</Text>
                  </View>
                )}
                {currentPlan === plan.id && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentText}>Current Plan</Text>
                  </View>
                )}

                <LinearGradient
                  colors={plan.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.planIconContainer}
                >
                  <Ionicons
                    name={plan.id === 'pro_creator' ? 'star' : 'business'}
                    size={24}
                    color="white"
                  />
                </LinearGradient>

                <Text style={styles.planName}>{plan.name}</Text>
                <View style={styles.priceContainer}>
                  <Text style={styles.planPrice}>{plan.priceText}</Text>
                  <Text style={styles.planPeriod}>/month</Text>
                </View>
                <Text style={styles.planDescription}>{plan.description}</Text>

                {selectedPlan === plan.id && (
                  <View style={styles.checkmark}>
                    <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <Text style={styles.featuresTitle}>
            {selectedPlanData.name} includes
          </Text>
          {selectedPlanData.features.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <LinearGradient
                colors={selectedPlanData.gradient}
                style={styles.featureIconContainer}
              >
                <Ionicons name={feature.icon as keyof typeof Ionicons.glyphMap} size={18} color="white" />
              </LinearGradient>
              <Text style={[styles.featureText, feature.highlight && styles.featureTextHighlight]}>
                {feature.text}
              </Text>
            </View>
          ))}
        </View>

        {/* Guarantee */}
        <View style={styles.guaranteeSection}>
          <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
          <View style={styles.guaranteeText}>
            <Text style={styles.guaranteeTitle}>Cancel anytime</Text>
            <Text style={styles.guaranteeSubtitle}>No commitment, cancel whenever you want</Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.subscribeButton}
          onPress={handleSubscribe}
          disabled={loading || currentPlan === selectedPlan}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={currentPlan === selectedPlan ? ['#CCC', '#AAA'] : selectedPlanData.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.subscribeGradient}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text style={styles.subscribeText}>
                  {currentPlan === selectedPlan ? 'Current Plan' : `Subscribe for ${selectedPlanData.priceText}/mo`}
                </Text>
                {currentPlan !== selectedPlan && (
                  <Ionicons name="arrow-forward" size={20} color="white" />
                )}
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.termsText}>
          By subscribing, you agree to our Terms of Service
        </Text>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerGradient: {
    paddingHorizontal: 20,
    paddingBottom: 60,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  headerContent: {
    alignItems: 'center',
    marginTop: 20,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: 'white',
    letterSpacing: -1,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  floatingIcon: {
    position: 'absolute',
    right: 30,
    bottom: -30,
  },
  floatingIconGradient: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.buttonGradient,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  plansContainer: {
    paddingHorizontal: 16,
    gap: 12,
  },
  planCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    ...SHADOWS.card,
  },
  planCardSelected: {
    borderColor: colors.primary,
    ...SHADOWS.cardMedium,
  },
  planCardCurrent: {
    borderColor: '#FFD700',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'white',
  },
  currentBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currentText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#333',
  },
  planIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  planName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 4,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  planPrice: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.dark,
  },
  planPeriod: {
    fontSize: 16,
    color: colors.gray,
    marginLeft: 4,
  },
  planDescription: {
    fontSize: 14,
    color: colors.gray,
    lineHeight: 20,
  },
  checkmark: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  featuresSection: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  featuresTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 14,
  },
  featureIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    color: colors.dark,
  },
  featureTextHighlight: {
    fontWeight: '600',
  },
  guaranteeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    marginHorizontal: 20,
    padding: 16,
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    gap: 12,
  },
  guaranteeText: {
    flex: 1,
  },
  guaranteeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  guaranteeSubtitle: {
    fontSize: 13,
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
    gap: 8,
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
});
