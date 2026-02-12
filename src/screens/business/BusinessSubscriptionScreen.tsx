/**
 * BusinessSubscriptionScreen
 * Subscribe to recurring services (gym membership, monthly pass, etc.)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import OptimizedImage from '../../components/OptimizedImage';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useStripeCheckout } from '../../hooks/useStripeCheckout';
import { GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { IconName } from '../../types';

interface BusinessSubscriptionScreenProps {
  route: { params: { businessId: string; serviceId?: string } };
  navigation: NavigationProp<ParamListBase>;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  price_cents: number;
  period: 'weekly' | 'monthly' | 'yearly';
  features: string[];
  image_url?: string;
  is_popular?: boolean;
  trial_days?: number;
  access_type: 'unlimited' | 'limited';
  sessions_per_period?: number;
}

interface Business {
  id: string;
  name: string;
  logo_url?: string;
  category: {
    name: string;
    icon: IconName;
    color: string;
  };
}

interface UserSubscription {
  id: string;
  plan_id?: string;
  plan_name?: string;
  status?: string;
}

const PERIOD_LABELS = {
  weekly: '/week',
  monthly: '/month',
  yearly: '/year',
};

export default function BusinessSubscriptionScreen({ route, navigation }: BusinessSubscriptionScreenProps) {
  const { colors } = useTheme();
  const { showError, showWarning, showConfirm } = useSmuppyAlert();
  const { businessId, serviceId } = route.params;
  const { formatAmount } = useCurrency();
  const { openCheckout } = useStripeCheckout();

  const [business, setBusiness] = useState<Business | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [existingSubscription, setExistingSubscription] = useState<UserSubscription | null>(null);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const loadSubscriptionData = useCallback(async () => {
    try {
      const [profileRes, plansRes, subRes] = await Promise.all([
        awsAPI.getBusinessProfile(businessId),
        awsAPI.getBusinessSubscriptionPlans(businessId),
        awsAPI.getUserBusinessSubscription(businessId),
      ]);

      if (profileRes.success && profileRes.business) {
        const biz = profileRes.business;
        setBusiness({
          id: biz.id,
          name: biz.name,
          logo_url: (biz as unknown as { logo_url?: string }).logo_url ?? biz.avatarUrl,
          category: biz.category as unknown as Business['category'],
        });
      }

      if (plansRes.success) {
        const castPlans = (plansRes.plans || []) as unknown as SubscriptionPlan[];
        setPlans(castPlans);

        // Auto-select service if provided or popular plan
        if (serviceId) {
          const preselected = castPlans.find((p) => p.id === serviceId);
          if (preselected) setSelectedPlan(preselected);
        } else {
          const popular = castPlans.find((p) => p.is_popular);
          if (popular) setSelectedPlan(popular);
        }
      }

      if (subRes.success && subRes.subscription) {
        setExistingSubscription(subRes.subscription);
      }
    } catch (error) {
      if (__DEV__) console.warn('Load subscription data error:', error);
      showError('Error', 'Failed to load subscription plans');
    } finally {
      setIsLoading(false);
    }
  }, [businessId, serviceId, showError]);

  useEffect(() => {
    loadSubscriptionData();
  }, [loadSubscriptionData]);

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlan(plan);
  };

  const handleSubscribe = async () => {
    if (!selectedPlan) return;

    // Already subscribed warning
    if (existingSubscription) {
      showConfirm(
        'Already Subscribed',
        `You already have an active subscription to ${business?.name}.\n\nWould you like to change your plan?`,
        () => processSubscription(),
        'Change Plan'
      );
      return;
    }

    processSubscription();
  };

  const processSubscription = async () => {
    if (!selectedPlan) return;

    setIsSubscribing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      // Create Stripe Checkout session
      const response = await awsAPI.createBusinessCheckout({
        businessId,
        serviceId: selectedPlan.id,
      });

      if (!response.success || !response.checkoutUrl || !response.sessionId) {
        throw new Error('Failed to create checkout session');
      }

      // Open Stripe Checkout and verify payment status
      const checkoutResult = await openCheckout(response.checkoutUrl, response.sessionId);

      if (checkoutResult.status === 'cancelled') {
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
      (navigation as unknown as { replace: (screen: string, params?: Record<string, unknown>) => void }).replace('BusinessSubscriptionSuccess', {
        businessName: business?.name || 'Business',
        planName: selectedPlan.name,
        period: selectedPlan.period,
        trialDays: selectedPlan.trial_days,
      });
    } catch (error: unknown) {
      if (__DEV__) console.warn('Subscription error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = error instanceof Error ? error.message : 'Please try again';
      showError('Subscription Failed', message);
    } finally {
      setIsSubscribing(false);
    }
  };

  const getPeriodSavings = (plan: SubscriptionPlan) => {
    if (plan.period !== 'yearly') return null;
    const monthlyPlan = plans.find(p => p.period === 'monthly');
    if (!monthlyPlan) return null;

    const yearlyCost = plan.price_cents;
    const monthlyEquivalent = monthlyPlan.price_cents * 12;
    const savings = monthlyEquivalent - yearlyCost;

    if (savings <= 0) return null;
    return Math.round((savings / monthlyEquivalent) * 100);
  };

  const renderPlanCard = (plan: SubscriptionPlan) => {
    const isSelected = selectedPlan?.id === plan.id;
    const savings = getPeriodSavings(plan);

    return (
      <TouchableOpacity
        key={plan.id}
        style={[styles.planCard, isSelected && styles.planCardSelected]}
        onPress={() => handleSelectPlan(plan)}
        activeOpacity={0.8}
      >
        {plan.is_popular && (
          <View style={styles.popularBadge}>
            <Ionicons name="star" size={10} color="#fff" />
            <Text style={styles.popularText}>Most Popular</Text>
          </View>
        )}

        {savings && (
          <View style={styles.savingsBadge}>
            <Text style={styles.savingsText}>Save {savings}%</Text>
          </View>
        )}

        <View style={styles.planHeader}>
          <View style={styles.planNameRow}>
            <Text style={styles.planName}>{plan.name}</Text>
            {isSelected && (
              <View style={styles.planCheck}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
            )}
          </View>
          {plan.description && (
            <Text style={styles.planDescription}>{plan.description}</Text>
          )}
        </View>

        <View style={styles.planPricing}>
          <Text style={styles.planPrice}>{formatAmount(plan.price_cents)}</Text>
          <Text style={styles.planPeriod}>{PERIOD_LABELS[plan.period]}</Text>
        </View>

        {plan.trial_days && plan.trial_days > 0 && (
          <View style={styles.trialBadge}>
            <Ionicons name="gift" size={14} color="#FFD700" />
            <Text style={styles.trialText}>{plan.trial_days}-day free trial</Text>
          </View>
        )}

        <View style={styles.planFeatures}>
          {plan.features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <View style={styles.accessInfo}>
          <Ionicons
            name={plan.access_type === 'unlimited' ? 'infinite' : 'ticket'}
            size={16}
            color={colors.primary}
          />
          <Text style={styles.accessText}>
            {plan.access_type === 'unlimited'
              ? 'Unlimited access'
              : `${plan.sessions_per_period} sessions per ${plan.period.replace('ly', '')}`}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const categoryColor = business?.category.color ?? colors.primary;
  const categoryIcon = business?.category.icon ?? 'briefcase-outline';

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscribe</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Business Info */}
          <View style={styles.businessCard}>
            {business?.logo_url ? (
              <OptimizedImage source={business.logo_url} style={styles.businessLogo} />
            ) : (
              <View style={[styles.businessLogoPlaceholder, { backgroundColor: categoryColor }]}>
                <Ionicons name={categoryIcon} size={28} color="#fff" />
              </View>
            )}
            <View style={styles.businessInfo}>
              <Text style={styles.businessName}>{business?.name}</Text>
              <View style={styles.businessCategory}>
                <Ionicons name={categoryIcon} size={12} color={categoryColor} />
                <Text style={[styles.businessCategoryText, { color: categoryColor }]}>
                  {business?.category.name}
                </Text>
              </View>
            </View>
          </View>

          {/* Existing Subscription Warning */}
          {existingSubscription && (
            <View style={styles.warningCard}>
              <Ionicons name="information-circle" size={20} color="#FFD700" />
              <View style={styles.warningContent}>
                <Text style={styles.warningTitle}>Active Subscription</Text>
                <Text style={styles.warningText}>
                  You're currently subscribed to {existingSubscription.plan_name}
                </Text>
              </View>
            </View>
          )}

          {/* Section Title */}
          <Text style={styles.sectionTitle}>Choose Your Plan</Text>
          <Text style={styles.sectionSubtitle}>
            Cancel anytime • All plans include full access
          </Text>

          {/* Plans */}
          {plans.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="card-outline" size={48} color={colors.gray} />
              <Text style={styles.emptyTitle}>No subscription plans</Text>
              <Text style={styles.emptySubtitle}>This business hasn't set up subscription plans yet</Text>
            </View>
          ) : (
            <View style={styles.plansList}>
              {plans.map(renderPlanCard)}
            </View>
          )}

          {/* Benefits */}
          <View style={styles.benefitsCard}>
            <Text style={styles.benefitsTitle}>Subscriber Benefits</Text>
            <View style={styles.benefitsList}>
              <View style={styles.benefitItem}>
                <View style={styles.benefitIcon}>
                  <Ionicons name="calendar" size={18} color={colors.primary} />
                </View>
                <View style={styles.benefitContent}>
                  <Text style={styles.benefitTitle}>Priority Booking</Text>
                  <Text style={styles.benefitText}>Book classes & sessions first</Text>
                </View>
              </View>

              <View style={styles.benefitItem}>
                <View style={styles.benefitIcon}>
                  <Ionicons name="pricetag" size={18} color={colors.primary} />
                </View>
                <View style={styles.benefitContent}>
                  <Text style={styles.benefitTitle}>Member Discounts</Text>
                  <Text style={styles.benefitText}>Exclusive pricing on extras</Text>
                </View>
              </View>

              <View style={styles.benefitItem}>
                <View style={styles.benefitIcon}>
                  <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
                </View>
                <View style={styles.benefitContent}>
                  <Text style={styles.benefitTitle}>Flexible Cancellation</Text>
                  <Text style={styles.benefitText}>Cancel or pause anytime</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Bottom Action */}
        {selectedPlan && (
          <View style={styles.bottomAction}>
            <BlurView intensity={80} tint="dark" style={styles.bottomBlur}>
              <View style={styles.bottomInfo}>
                <Text style={styles.bottomPlanName}>{selectedPlan.name}</Text>
                <View style={styles.bottomPriceRow}>
                  <Text style={styles.bottomPrice}>{formatAmount(selectedPlan.price_cents)}</Text>
                  <Text style={styles.bottomPeriod}>{PERIOD_LABELS[selectedPlan.period]}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.subscribeButton}
                onPress={handleSubscribe}
                disabled={isSubscribing}
              >
                <LinearGradient colors={GRADIENTS.primary} style={styles.subscribeGradient}>
                  {isSubscribing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="card" size={20} color="#fff" />
                      <Text style={styles.subscribeText}>
                        {selectedPlan.trial_days ? 'Start Free Trial' : 'Subscribe Now'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </BlurView>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  // Header
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
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },

  content: {
    flex: 1,
    paddingHorizontal: 16,
  },

  // Business Card
  businessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    gap: 14,
  },
  businessLogo: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  businessLogoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 4,
  },
  businessCategory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  businessCategoryText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Warning
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,215,0,0.1)',
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
    gap: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 2,
  },
  warningText: {
    fontSize: 13,
    color: 'rgba(255,215,0,0.8)',
  },

  // Section
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.gray,
    marginBottom: 16,
  },

  // Plans
  plansList: {
    gap: 14,
    marginBottom: 24,
  },
  planCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(14,191,138,0.08)',
  },
  popularBadge: {
    position: 'absolute',
    top: -1,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    gap: 4,
  },
  popularText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  savingsBadge: {
    position: 'absolute',
    top: -1,
    left: 20,
    backgroundColor: '#FFD700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  savingsText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000',
  },
  planHeader: {
    marginBottom: 16,
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  planName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  planCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planDescription: {
    fontSize: 13,
    color: colors.gray,
  },
  planPricing: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  planPrice: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.dark,
  },
  planPeriod: {
    fontSize: 14,
    color: colors.gray,
    marginLeft: 4,
  },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
    marginBottom: 16,
  },
  trialText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD700',
  },
  planFeatures: {
    gap: 8,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    color: colors.grayLight,
  },
  accessInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  accessText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },

  // Benefits
  benefitsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 20,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 16,
  },
  benefitsList: {
    gap: 14,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(14,191,138,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 2,
  },
  benefitText: {
    fontSize: 12,
    color: colors.gray,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
  },

  // Bottom Action
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 34,
    backgroundColor: 'rgba(15,15,26,0.9)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 16,
  },
  bottomInfo: {
    flex: 1,
  },
  bottomPlanName: {
    fontSize: 13,
    color: colors.gray,
  },
  bottomPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  bottomPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.dark,
  },
  bottomPeriod: {
    fontSize: 13,
    color: colors.gray,
    marginLeft: 2,
  },
  subscribeButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  subscribeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 8,
  },
  subscribeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
