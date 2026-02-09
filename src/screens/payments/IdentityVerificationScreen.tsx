/**
 * IdentityVerificationScreen - Creator Identity Verification
 * Premium verification flow with payment
 * Inspired by Stripe Identity, Airbnb verification
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTranslation } from 'react-i18next';
import { GRADIENTS, SHADOWS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

type VerificationStatus = 'not_started' | 'requires_input' | 'processing' | 'verified' | 'payment_required';

interface StatusInfo {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
}

const getStatusInfo = (t: (key: string) => string, colors: ThemeColors): Record<VerificationStatus, StatusInfo> => ({
  not_started: {
    icon: 'shield-outline',
    color: colors.gray,
    title: t('payments:identity:status:notVerified'),
    subtitle: t('payments:identity:status:notVerifiedDesc'),
  },
  payment_required: {
    icon: 'card-outline',
    color: '#FF9800',
    title: t('payments:identity:status:paymentRequired'),
    subtitle: t('payments:identity:status:paymentRequiredDesc'),
  },
  requires_input: {
    icon: 'document-text-outline',
    color: '#FF9800',
    title: t('payments:identity:status:docsNeeded'),
    subtitle: t('payments:identity:status:docsNeededDesc'),
  },
  processing: {
    icon: 'hourglass-outline',
    color: '#2196F3',
    title: t('payments:identity:status:processing'),
    subtitle: t('payments:identity:status:processingDesc'),
  },
  verified: {
    icon: 'shield-checkmark',
    color: '#22C55E',
    title: t('payments:identity:status:verified'),
    subtitle: t('payments:identity:status:verifiedDesc'),
  },
});

const STATIC_VERIFICATION_STEPS = [
  {
    icon: 'camera',
    titleKey: 'payments:identity:steps:selfie',
    subtitleKey: 'payments:identity:steps:selfieDesc',
  },
  {
    icon: 'id-card',
    titleKey: 'payments:identity:steps:scanId',
    subtitleKey: 'payments:identity:steps:scanIdDesc',
  },
  {
    icon: 'checkmark-circle',
    titleKey: 'payments:identity:steps:getVerified',
    subtitleKey: 'payments:identity:steps:getVerifiedDesc',
  },
];

const BENEFITS = [
  { icon: 'shield-checkmark', textKey: 'payments:identity:benefits:badge' },
  { icon: 'trending-up', textKey: 'payments:identity:benefits:visibility' },
  { icon: 'people', textKey: 'payments:identity:benefits:trust' },
  { icon: 'cash', textKey: 'payments:identity:benefits:monetization' },
  { icon: 'lock-closed', textKey: 'payments:identity:benefits:security' },
];

export default function IdentityVerificationScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<VerificationStatus>('not_started');
  const [pricing, setPricing] = useState<{ amount: number; currency: string; interval: string } | null>(null);
  const { showError, showAlert } = useSmuppyAlert();

  const formatPrice = useCallback((amountCents: number, currency: string) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: (currency || 'usd').toUpperCase(),
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amountCents / 100);
    } catch {
      return `${(amountCents / 100).toFixed(2)} ${(currency || 'USD').toUpperCase()}`;
    }
  }, []);

  const priceAmountText = pricing ? formatPrice(pricing.amount, pricing.currency) : '—';
  const priceIntervalText = pricing?.interval ? `/${pricing.interval}` : '';
  const priceLabel = pricing
    ? `${priceAmountText}${priceIntervalText}`
    : loading
      ? t('payments:identity:loadingPrice')
      : t('payments:identity:priceUnavailable');
  const intervalReadable = pricing?.interval || t('payments:identity:billingPeriod');
  const ctaPriceText = pricing ? `${priceAmountText}${priceIntervalText}` : null;
  const ctaLabel = status === 'requires_input'
    ? t('payments:identity:continueVerification')
    : ctaPriceText
      ? `${t('payments:identity:getVerified')} — ${ctaPriceText}`
      : t('payments:identity:getVerified');

  const STATUS_INFO = useMemo(() => getStatusInfo(t, colors), [t, colors]);
  const steps = useMemo(
    () => [
      {
        icon: 'card',
        title: t('payments:identity:steps:subscribe'),
        subtitle: priceLabel,
      },
      ...STATIC_VERIFICATION_STEPS,
    ],
    [priceLabel, t],
  );
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [statusResponse, configResponse] = await Promise.all([
        awsAPI.request<{
          success: boolean;
          isVerified?: boolean;
          status?: string;
          hasSession?: boolean;
        }>('/payments/identity', {
          method: 'POST',
          body: { action: 'get-status' },
        }),
        awsAPI.getVerificationConfig().catch(() => null),
      ]);

      if (configResponse?.success) {
        setPricing({
          amount: configResponse.amount ?? 0,
          currency: configResponse.currency ?? 'usd',
          interval: configResponse.interval ?? 'month',
        });
      }

      if (statusResponse.success) {
        if (statusResponse.isVerified) {
          setStatus('verified');
        } else if (statusResponse.status === 'requires_input') {
          setStatus('requires_input');
        } else if (statusResponse.status === 'processing') {
          setStatus('processing');
        } else if (!statusResponse.hasSession) {
          // Check if payment was made
          setStatus('not_started');
        }
      }
    } catch (error: unknown) {
      if (__DEV__) console.warn('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const initializePayment = async () => {
    setProcessing(true);
    try {
      // Create subscription
      const response = await awsAPI.request<{
        success: boolean;
        subscriptionActive?: boolean;
        checkoutUrl?: string;
        error?: string;
      }>('/payments/identity', {
        method: 'POST',
        body: { action: 'create-subscription' },
      });

      if (response.success && response.subscriptionActive) {
        // Already subscribed, proceed to verification
        await startVerification();
        return;
      }

      if (response.success && response.checkoutUrl) {
        // Open Stripe Checkout
        const result = await WebBrowser.openBrowserAsync(response.checkoutUrl);
        
        if (result.type === 'cancel') {
          setProcessing(false);
          return;
        }

        // Subscription activated, start verification
        showAlert({
          title: t('payments:identity:subscriptionActive'),
          message: t('payments:identity:verifyNow'),
          type: 'success',
          buttons: [{ text: t('payments:identity:continue'), onPress: startVerification }],
        });
      } else {
        showError(t('common:error'), t('payments:identity:errors:initSubscription'));
      }
    } catch (_error: unknown) {
      showError(t('common:error'), t('payments:generic:error'));
    } finally {
      setProcessing(false);
    }
  };

  const startVerification = async () => {
    setProcessing(true);
    try {
      const response = await awsAPI.request<{ success: boolean; url?: string; error?: string }>('/payments/identity', {
        method: 'POST',
        body: {
          action: 'confirm-subscription',
          returnUrl: 'smuppy://verification-complete',
        },
      });

      if (response.success && response.url) {
        // Open Stripe Identity verification
        const canOpen = await Linking.canOpenURL(response.url);
        if (canOpen) {
          await Linking.openURL(response.url);
        } else {
          navigation.navigate('WebView', { url: response.url, title: 'Verify Identity' });
        }
      } else {
        // Try creating session directly
        const sessionResponse = await awsAPI.request<{ success: boolean; url?: string; error?: string }>('/payments/identity', {
          method: 'POST',
          body: {
            action: 'create-session',
            returnUrl: 'smuppy://verification-complete',
          },
        });

        if (sessionResponse.success && sessionResponse.url) {
          const canOpen = await Linking.canOpenURL(sessionResponse.url);
          if (canOpen) {
            await Linking.openURL(sessionResponse.url);
          } else {
            navigation.navigate('WebView', { url: sessionResponse.url, title: 'Verify Identity' });
          }
        } else {
          // Generic error message per CLAUDE.md - never expose response.error to client
          showError(t('common:error'), t('payments:identity:errors:startVerification'));
        }
      }
    } catch (error: unknown) {
      if (__DEV__) console.warn('[IdentityVerification] Error:', error);
      // Generic error message per CLAUDE.md - never expose error.message to client
      showError(t('payments:generic:errorTitle'), t('payments:generic:error'));
    } finally {
      setProcessing(false);
    }
  };

  const statusInfo = STATUS_INFO[status];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <LinearGradient
          colors={status === 'verified' ? ['#22C55E', '#16A34A'] : GRADIENTS.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 10 }]}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>

          {/* Status Badge */}
          <View style={styles.statusContainer}>
            <View style={[styles.statusIcon, { backgroundColor: `${statusInfo.color}20` }]}>
              <Ionicons name={statusInfo.icon as keyof typeof Ionicons.glyphMap} size={48} color="white" />
            </View>
            <Text style={styles.statusTitle}>{statusInfo.title}</Text>
            <Text style={styles.statusSubtitle}>{statusInfo.subtitle}</Text>
          </View>

          {status === 'verified' && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text style={styles.verifiedText}>{t('payments:identity:verified')}</Text>
            </View>
          )}
        </LinearGradient>

        {status !== 'verified' && (
          <>
            {/* Price Card */}
            <View style={styles.priceCard}>
              <View style={styles.priceHeader}>
                <Text style={styles.priceLabel}>{t('payments:identity:verifiedAccount')}</Text>
                <View style={styles.priceTag}>
                  <Text style={styles.priceAmount}>{priceAmountText}</Text>
                  <Text style={styles.priceOnce}>{priceIntervalText}</Text>
                </View>
              </View>
              <View style={styles.priceDivider} />
              <View style={styles.priceInfo}>
                <Ionicons name="information-circle" size={18} color={colors.gray} />
                <Text style={styles.priceInfoText}>
                  {t('payments:identity:billingPeriod')}: {intervalReadable}
                </Text>
              </View>
            </View>

            {/* Steps */}
            <View style={styles.stepsSection}>
              <Text style={styles.sectionTitle}>{t('payments:identity:howItWorks')}</Text>
              {steps.map((step, index) => (
                <View key={index} style={styles.stepItem}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <LinearGradient
                    colors={GRADIENTS.primary}
                    style={styles.stepIcon}
                  >
                    <Ionicons name={step.icon as keyof typeof Ionicons.glyphMap} size={20} color="white" />
                  </LinearGradient>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>{'titleKey' in step ? t(step.titleKey as string) : step.title}</Text>
                    <Text style={styles.stepSubtitle}>{'subtitleKey' in step ? t(step.subtitleKey as string) : step.subtitle}</Text>
                  </View>
                  {index < steps.length - 1 && (
                    <View style={styles.stepLine} />
                  )}
                </View>
              ))}
            </View>

            {/* Benefits */}
            <View style={styles.benefitsSection}>
              <Text style={styles.sectionTitle}>{t('payments:identity:whyVerify')}</Text>
              {BENEFITS.map((benefit, index) => (
                <View key={index} style={styles.benefitItem}>
                  <Ionicons name={benefit.icon as keyof typeof Ionicons.glyphMap} size={22} color={colors.primary} />
                  <Text style={styles.benefitText}>{t(benefit.textKey)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {status === 'verified' && (
          <View style={styles.verifiedSection}>
            <View style={styles.verifiedCard}>
              <Ionicons name="ribbon" size={48} color={colors.primary} />
              <Text style={styles.verifiedCardTitle}>{t('payments:identity:congratulations')}</Text>
              <Text style={styles.verifiedCardText}>
                {t('payments:identity:verifiedBadgeVisible')}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      {status !== 'verified' && status !== 'processing' && (
        <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={status === 'requires_input' ? startVerification : initializePayment}
            disabled={processing}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={GRADIENTS.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              {processing ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons
                    name={status === 'requires_input' ? 'camera' : 'shield-checkmark'}
                    size={20}
                    color="white"
                  />
                  <Text style={styles.ctaText}>
                    {ctaLabel}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.securityNote}>
            <Ionicons name="lock-closed" size={14} color={colors.gray} />
            <Text style={styles.securityText}>
              {t('payments:identity:secureNote')}
            </Text>
          </View>
        </View>
      )}
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
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  statusIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: 'white',
    textAlign: 'center',
  },
  statusSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 6,
    textAlign: 'center',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
    alignSelf: 'center',
  },
  verifiedText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
  priceCard: {
    marginHorizontal: 16,
    marginTop: -20,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 20,
    padding: 20,
    ...SHADOWS.cardMedium,
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  priceTag: {
    alignItems: 'flex-end',
  },
  priceAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
  },
  priceOnce: {
    fontSize: 13,
    color: colors.gray,
    marginTop: -4,
  },
  priceDivider: {
    height: 1,
    backgroundColor: isDark ? colors.border : '#F1F5F9',
    marginVertical: 16,
  },
  priceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceInfoText: {
    flex: 1,
    fontSize: 13,
    color: colors.gray,
  },
  stepsSection: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 20,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    position: 'relative',
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  stepContent: {
    flex: 1,
    paddingTop: 2,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  stepSubtitle: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  stepLine: {
    position: 'absolute',
    left: 11,
    top: 32,
    width: 2,
    height: 30,
    backgroundColor: colors.primaryLight,
  },
  benefitsSection: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    gap: 14,
    ...SHADOWS.card,
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    color: colors.dark,
  },
  verifiedSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  verifiedCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    ...SHADOWS.cardMedium,
  },
  verifiedCardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.dark,
    marginTop: 16,
  },
  verifiedCardText: {
    fontSize: 15,
    color: colors.gray,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: isDark ? colors.border : '#F1F5F9',
  },
  ctaButton: {
    borderRadius: 16,
    overflow: 'hidden',
    ...SHADOWS.buttonGradient,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    gap: 6,
  },
  securityText: {
    fontSize: 12,
    color: colors.gray,
  },
});
