/**
 * UpgradeToProScreen
 * Upgrade from Personal to Pro Creator account
 * This is a ONE-WAY process - cannot be reversed
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../config/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { awsAPI } from '../../services/aws-api';
import { useStripeCheckout } from '../../hooks/useStripeCheckout';
import { useUserStore } from '../../stores';
import { useCurrentProfile } from '../../hooks';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useCurrency } from '../../hooks/useCurrency';

const { width: _width } = Dimensions.get('window');

interface Feature {
  icon: string;
  title: string;
  description: string;
  personal: boolean | string;
  pro: boolean | string;
}

const FEATURES: Feature[] = [
  {
    icon: 'calendar',
    title: 'Create Events',
    description: 'Organize sports events, runs, hikes...',
    personal: '1/month',
    pro: true,
  },
  {
    icon: 'people',
    title: 'Create Groups',
    description: 'Build your community',
    personal: '1/month',
    pro: true,
  },
  {
    icon: 'cash',
    title: 'Paid Events',
    description: 'Charge for your events',
    personal: false,
    pro: true,
  },
  {
    icon: 'gift',
    title: 'Receive Tips',
    description: 'Get tips from your fans',
    personal: false,
    pro: true,
  },
  {
    icon: 'videocam',
    title: 'Go Live',
    description: 'Stream live to your fans',
    personal: false,
    pro: true,
  },
  {
    icon: 'star',
    title: 'Channel Subscriptions',
    description: 'Offer premium content',
    personal: false,
    pro: true,
  },
  {
    icon: 'trophy',
    title: 'Create Challenges',
    description: 'Launch viral challenges',
    personal: false,
    pro: true,
  },
  {
    icon: 'wallet',
    title: 'Creator Wallet',
    description: 'Track earnings & payouts',
    personal: false,
    pro: true,
  },
  {
    icon: 'analytics',
    title: 'Advanced Analytics',
    description: 'Detailed insights & stats',
    personal: false,
    pro: true,
  },
  {
    icon: 'checkmark-circle',
    title: 'Verified Badge',
    description: 'Stand out with verification',
    personal: false,
    pro: true,
  },
];

export default function UpgradeToProScreen() {
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void; replace: (screen: string, params?: Record<string, unknown>) => void }>();
  const { showDestructiveConfirm, showWarning, showAlert, showError } = useSmuppyAlert();
  const { openCheckout } = useStripeCheckout();
  const { formatAmount } = useCurrency();
  const _user = useUserStore((state) => state.user);
  const _setUser = useUserStore((state) => state.setUser);

  const [isLoading, setIsLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [step, setStep] = useState<'info' | 'confirm'>('info');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FIRST CONFIRMATION: Warning about irreversibility
  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    showDestructiveConfirm(
      'Irreversible Upgrade',
      'Upgrading to Pro Creator is a ONE-WAY process.\n\nYou will LOSE your Personal profile forever.\n\nYou will become a Pro Creator with monetization features.\n\nThis action CANNOT be undone.',
      () => setStep('confirm')
    );
  };

  // SECOND CONFIRMATION: Final "Are you sure?"
  const handleConfirmUpgrade = async () => {
    if (!acceptedTerms) {
      showWarning('Terms Required', 'Please accept the Pro Creator terms to continue.');
      return;
    }

    // Final confirmation
    showDestructiveConfirm(
      'Final Confirmation',
      'Are you absolutely sure?\n\nOnce you upgrade, your Personal account will be permanently converted to Pro Creator.',
      performUpgrade
    );
  };

  const { refetch: refetchProfile } = useCurrentProfile();

  const performUpgrade = async () => {
    setIsLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    try {
      // Create Stripe Checkout session for Pro Creator subscription
      const response = await awsAPI.request<{ success: boolean; checkoutUrl: string; sessionId: string }>(
        '/payments/platform-subscription',
        { method: 'POST', body: { action: 'subscribe', planType: 'pro_creator' } }
      );

      if (!response.checkoutUrl || !response.sessionId) {
        throw new Error('No checkout URL received');
      }

      // Open Stripe Checkout and verify payment
      const checkoutResult = await openCheckout(response.checkoutUrl, response.sessionId);

      if (checkoutResult.status === 'cancelled') {
        return;
      }

      if (checkoutResult.status === 'failed') {
        throw new Error(checkoutResult.message);
      }

      // Refresh profile to check if upgrade went through via webhook
      await refetchProfile();
      const updatedUser = useUserStore.getState().user;

      if (updatedUser?.accountType === 'pro_creator' || checkoutResult.status === 'success') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert({
          title: 'Welcome, Pro Creator!',
          message: 'Your account has been upgraded successfully!\n\nComplete your setup to start earning from your content.',
          type: 'success',
          buttons: [
            {
              text: 'Set Up Verification',
              onPress: () => navigation.replace('IdentityVerification'),
            },
            {
              text: 'Later',
              onPress: () => navigation.goBack(),
            },
          ],
        });
      } else {
        // Payment may still be processing via webhook
        showAlert({
          title: 'Processing',
          message: 'Your payment is being processed. Your account will be upgraded shortly.',
          type: 'info',
          buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
        });
      }
    } catch (_error: unknown) {
      if (__DEV__) console.warn('Upgrade error:', _error);
      showError('Upgrade Failed', 'Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderFeatureRow = (feature: Feature, index: number) => (
    <Animated.View
      key={feature.title}
      style={[
        styles.featureRow,
        {
          opacity: fadeAnim,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 30],
                outputRange: [0, 30 + index * 5],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.featureInfo}>
        <View style={styles.featureIconContainer}>
          <Ionicons name={feature.icon as keyof typeof Ionicons.glyphMap} size={20} color={COLORS.primary} />
        </View>
        <View style={styles.featureText}>
          <Text style={styles.featureTitle}>{feature.title}</Text>
          <Text style={styles.featureDesc}>{feature.description}</Text>
        </View>
      </View>

      <View style={styles.featureComparison}>
        <View style={styles.featureValue}>
          {feature.personal === true ? (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
          ) : feature.personal === false ? (
            <Ionicons name="close-circle" size={20} color={COLORS.gray} />
          ) : (
            <Text style={styles.limitText}>{feature.personal}</Text>
          )}
        </View>
        <View style={[styles.featureValue, styles.proValue]}>
          {feature.pro === true ? (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.gold} />
          ) : (
            <Text style={styles.proValueText}>{feature.pro}</Text>
          )}
        </View>
      </View>
    </Animated.View>
  );

  if (step === 'confirm') {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setStep('info')} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Confirm Upgrade</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.confirmContainer}>
              <View style={styles.warningIcon}>
                <Ionicons name="warning" size={48} color={COLORS.gold} />
              </View>

              <Text style={styles.confirmTitle}>One-Way Upgrade</Text>
              <Text style={styles.confirmText}>
                By upgrading to Pro Creator, you acknowledge that:
              </Text>

              <View style={styles.termsList}>
                <View style={styles.termItem}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                  <Text style={styles.termText}>This upgrade is permanent and cannot be reversed</Text>
                </View>
                <View style={styles.termItem}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                  <Text style={styles.termText}>You'll need to complete identity verification</Text>
                </View>
                <View style={styles.termItem}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                  <Text style={styles.termText}>Platform takes 20% fee on earnings</Text>
                </View>
                <View style={styles.termItem}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                  <Text style={styles.termText}>You agree to Pro Creator Terms of Service</Text>
                </View>
              </View>

              {/* Accept Terms */}
              <TouchableOpacity
                style={styles.termsToggle}
                onPress={() => setAcceptedTerms(!acceptedTerms)}
              >
                <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                  {acceptedTerms && <Ionicons name="checkmark" size={16} color={COLORS.white} />}
                </View>
                <Text style={styles.termsText}>
                  I understand and accept the Pro Creator terms
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.upgradeButton, !acceptedTerms && styles.buttonDisabled]}
              onPress={handleConfirmUpgrade}
              disabled={!acceptedTerms || isLoading}
            >
              <LinearGradient
                colors={acceptedTerms ? [COLORS.gold, '#FFA500'] : [COLORS.gray600, COLORS.gray800]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.upgradeGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.dark} />
                ) : (
                  <>
                    <Ionicons name="rocket" size={22} color={COLORS.dark} />
                    <Text style={styles.upgradeButtonText}>Upgrade Now</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Become Pro Creator</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <LinearGradient
              colors={[COLORS.gold, '#FFA500']}
              style={styles.heroBadge}
            >
              <Ionicons name="star" size={32} color={COLORS.dark} />
            </LinearGradient>
            <Text style={styles.heroTitle}>Unlock Your Potential</Text>
            <Text style={styles.heroSubtitle}>
              Monetize your content, grow your community, and build your brand
            </Text>
          </View>

          {/* Comparison Header */}
          <View style={styles.comparisonHeader}>
            <View style={styles.comparisonLabel} />
            <View style={styles.comparisonTypes}>
              <Text style={styles.typeLabel}>Personal</Text>
              <Text style={[styles.typeLabel, styles.proLabel]}>Pro Creator</Text>
            </View>
          </View>

          {/* Features List */}
          <View style={styles.featuresContainer}>
            {FEATURES.map((feature, index) => renderFeatureRow(feature, index))}
          </View>

          {/* Bottom Spacing */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
            <LinearGradient
              colors={[COLORS.gold, '#FFA500']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.upgradeGradient}
            >
              <Ionicons name="rocket" size={22} color={COLORS.dark} />
              <Text style={styles.upgradeButtonText}>Upgrade to Pro Creator</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.freeText}>{formatAmount(9900)}/month • Cancel anytime</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  safeArea: {
    flex: 1,
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
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  heroBadge: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  comparisonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 8,
  },
  comparisonLabel: {
    flex: 1,
  },
  comparisonTypes: {
    flexDirection: 'row',
    width: 140,
  },
  typeLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray,
    textAlign: 'center',
  },
  proLabel: {
    color: COLORS.gold,
  },
  featuresContainer: {
    gap: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  featureInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(14,191,138,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  featureDesc: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  featureComparison: {
    flexDirection: 'row',
    width: 140,
  },
  featureValue: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proValue: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderRadius: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  limitText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray,
  },
  proValueText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gold,
  },
  footer: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: 'rgba(15,15,26,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  upgradeButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  upgradeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  upgradeButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.dark,
  },
  freeText: {
    fontSize: 13,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 12,
  },
  // Confirm Step
  confirmContainer: {
    alignItems: 'center',
    paddingTop: 32,
  },
  warningIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,215,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 12,
  },
  confirmText: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: 24,
  },
  termsList: {
    width: '100%',
    gap: 16,
    marginBottom: 32,
  },
  termItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 12,
  },
  termText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.grayMuted,
    lineHeight: 20,
  },
  termsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.gray600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.white,
  },
  headerSpacer: { width: 40 },
  bottomSpacer: { height: 120 },
});
