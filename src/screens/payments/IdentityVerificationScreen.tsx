/**
 * IdentityVerificationScreen - Creator Identity Verification
 * Premium verification flow with payment
 * Inspired by Stripe Identity, Airbnb verification
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';

// TODO: Fetch from backend config API so price changes don't require app update
const VERIFICATION_FEE = '$14.90';
const VERIFICATION_PERIOD = '/month';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useStripe } from '@stripe/stripe-react-native';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { GRADIENTS, SHADOWS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const { width: _SCREEN_WIDTH } = Dimensions.get('window');

type VerificationStatus = 'not_started' | 'requires_input' | 'processing' | 'verified' | 'payment_required';

interface StatusInfo {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
}

const getStatusInfo = (colors: ThemeColors): Record<VerificationStatus, StatusInfo> => ({
  not_started: {
    icon: 'shield-outline',
    color: colors.gray,
    title: 'Not Verified',
    subtitle: 'Complete verification to get your badge',
  },
  payment_required: {
    icon: 'card-outline',
    color: '#FF9800',
    title: 'Payment Required',
    subtitle: 'Pay verification fee to continue',
  },
  requires_input: {
    icon: 'document-text-outline',
    color: '#FF9800',
    title: 'Documents Needed',
    subtitle: 'Please submit your documents',
  },
  processing: {
    icon: 'hourglass-outline',
    color: '#2196F3',
    title: 'Processing',
    subtitle: 'We\'re reviewing your documents',
  },
  verified: {
    icon: 'shield-checkmark',
    color: '#22C55E',
    title: 'Verified',
    subtitle: 'Your identity has been verified',
  },
});

const VERIFICATION_STEPS = [
  {
    icon: 'card',
    title: 'Subscribe to verification',
    subtitle: `${VERIFICATION_FEE}${VERIFICATION_PERIOD} subscription`,
  },
  {
    icon: 'camera',
    title: 'Take a selfie',
    subtitle: 'We\'ll match it to your ID',
  },
  {
    icon: 'id-card',
    title: 'Scan your ID',
    subtitle: 'Driver\'s license or passport',
  },
  {
    icon: 'checkmark-circle',
    title: 'Get verified',
    subtitle: 'Badge appears on your profile',
  },
];

const BENEFITS = [
  { icon: 'shield-checkmark', text: 'Verified badge on your profile' },
  { icon: 'trending-up', text: 'Higher visibility in search' },
  { icon: 'people', text: 'Build trust with your fans' },
  { icon: 'cash', text: 'Required for monetization' },
  { icon: 'lock-closed', text: 'Secure identity protection' },
];

export default function IdentityVerificationScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { colors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<VerificationStatus>('not_started');
  const [_paymentReady, setPaymentReady] = useState(false);
  const { showError, showAlert } = useSmuppyAlert();

  const STATUS_INFO = useMemo(() => getStatusInfo(colors), [colors]);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await awsAPI.request<{
        success: boolean;
        isVerified?: boolean;
        status?: string;
        hasSession?: boolean;
      }>('/payments/identity', {
        method: 'POST',
        body: { action: 'get-status' },
      });

      if (response.success) {
        if (response.isVerified) {
          setStatus('verified');
        } else if (response.status === 'requires_input') {
          setStatus('requires_input');
        } else if (response.status === 'processing') {
          setStatus('processing');
        } else if (!response.hasSession) {
          // Check if payment was made
          setStatus('not_started');
        }
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
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
        clientSecret?: string;
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

      if (response.success && response.clientSecret) {
        // Initialize payment sheet with subscription secret
        const { error } = await initPaymentSheet({
          paymentIntentClientSecret: response.clientSecret,
          merchantDisplayName: 'Smuppy',
          style: 'automatic',
          returnURL: 'smuppy://verification-complete',
        });

        if (error) {
          showError('Error', 'Something went wrong. Please try again.');
        } else {
          setPaymentReady(true);
          await handlePayment();
        }
      } else {
        showError('Error', 'Failed to initialize subscription. Please try again.');
      }
    } catch (error: unknown) {
      showError('Error', 'Something went wrong. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handlePayment = async () => {
    setProcessing(true);
    try {
      const { error } = await presentPaymentSheet();

      if (error) {
        if (error.code !== 'Canceled') {
          showError('Payment Failed', 'Something went wrong. Please try again.');
        }
      } else {
        // Subscription activated, start verification
        showAlert({
          title: 'Subscription Active',
          message: 'Now let\'s verify your identity',
          type: 'success',
          buttons: [{ text: 'Continue', onPress: startVerification }],
        });
      }
    } catch (error: unknown) {
      showError('Error', 'Payment failed. Please try again.');
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
          showError('Error', sessionResponse.error || 'Failed to start verification');
        }
      }
    } catch (error: any) {
      showError('Error', error.message || 'Something went wrong');
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
              <Ionicons name={statusInfo.icon as any} size={48} color="white" />
            </View>
            <Text style={styles.statusTitle}>{statusInfo.title}</Text>
            <Text style={styles.statusSubtitle}>{statusInfo.subtitle}</Text>
          </View>

          {status === 'verified' && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text style={styles.verifiedText}>Identity Verified</Text>
            </View>
          )}
        </LinearGradient>

        {status !== 'verified' && (
          <>
            {/* Price Card */}
            <View style={styles.priceCard}>
              <View style={styles.priceHeader}>
                <Text style={styles.priceLabel}>Verified Account</Text>
                <View style={styles.priceTag}>
                  <Text style={styles.priceAmount}>{VERIFICATION_FEE}</Text>
                  <Text style={styles.priceOnce}>{VERIFICATION_PERIOD}</Text>
                </View>
              </View>
              <View style={styles.priceDivider} />
              <View style={styles.priceInfo}>
                <Ionicons name="information-circle" size={18} color={colors.gray} />
                <Text style={styles.priceInfoText}>
                  Monthly subscription. Cancel anytime from your profile settings.
                </Text>
              </View>
            </View>

            {/* Steps */}
            <View style={styles.stepsSection}>
              <Text style={styles.sectionTitle}>How it works</Text>
              {VERIFICATION_STEPS.map((step, index) => (
                <View key={index} style={styles.stepItem}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <LinearGradient
                    colors={GRADIENTS.primary}
                    style={styles.stepIcon}
                  >
                    <Ionicons name={step.icon as any} size={20} color="white" />
                  </LinearGradient>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepSubtitle}>{step.subtitle}</Text>
                  </View>
                  {index < VERIFICATION_STEPS.length - 1 && (
                    <View style={styles.stepLine} />
                  )}
                </View>
              ))}
            </View>

            {/* Benefits */}
            <View style={styles.benefitsSection}>
              <Text style={styles.sectionTitle}>Why get verified?</Text>
              {BENEFITS.map((benefit, index) => (
                <View key={index} style={styles.benefitItem}>
                  <Ionicons name={benefit.icon as any} size={22} color={colors.primary} />
                  <Text style={styles.benefitText}>{benefit.text}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {status === 'verified' && (
          <View style={styles.verifiedSection}>
            <View style={styles.verifiedCard}>
              <Ionicons name="ribbon" size={48} color={colors.primary} />
              <Text style={styles.verifiedCardTitle}>Congratulations!</Text>
              <Text style={styles.verifiedCardText}>
                Your identity has been verified. The verified badge is now visible on your profile.
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
                    {status === 'requires_input' ? 'Continue Verification' : `Get Verified — ${VERIFICATION_FEE}${VERIFICATION_PERIOD}`}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.securityNote}>
            <Ionicons name="lock-closed" size={14} color={colors.gray} />
            <Text style={styles.securityText}>
              Powered by Stripe Identity • Your data is secure
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
