// src/screens/sessions/SessionPaymentScreen.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import OptimizedImage from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { awsAPI } from '../../services/aws-api';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useStripeCheckout } from '../../hooks/useStripeCheckout';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { formatFullDateShort } from '../../utils/dateFormatters';
import { useCurrency } from '../../hooks/useCurrency';

export default function SessionPaymentScreen(): React.JSX.Element {
  const navigation = useNavigation<{ goBack: () => void; replace: (screen: string, params?: Record<string, unknown>) => void }>();
  const route = useRoute<{ key: string; name: string; params: { creator: { id: string; name: string; avatar: string | null }; date: { date: number; month: string; fullDate?: Date }; time: string; duration: number; price: number; sessionId?: string; datetime?: string } }>();
  const { colors, gradients, isDark } = useTheme();

  const { showError, showWarning } = useSmuppyAlert();
  const { openCheckout } = useStripeCheckout();
  const { formatAmount: formatCurrencyAmount } = useCurrency();

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { creator, date, time, duration, price, sessionId } = route.params || {
    creator: { id: '', name: 'Creator', avatar: null },
    date: { date: 15, month: 'Sep' },
    time: '15:00',
    duration: 60,
    price: 20,
  };

  const [isProcessing, setIsProcessing] = useState(false);

  const handleBack = () => {
    navigation.goBack();
  };

  const handlePayment = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const response = await awsAPI.createPaymentIntent({
        creatorId: creator.id,
        amount: price * 100,
        sessionId: sessionId,
        type: 'session',
        description: `Session with ${creator.name} - ${duration} min`,
      });

      if (!response.success || !response.checkoutUrl || !response.sessionId) {
        throw new Error(response.message || 'Failed to create payment');
      }

      const checkoutResult = await openCheckout(response.checkoutUrl, response.sessionId);

      if (checkoutResult.status === 'cancelled') {
        setIsProcessing(false);
        return;
      }

      if (checkoutResult.status === 'failed') {
        throw new Error(checkoutResult.message);
      }

      if (checkoutResult.status === 'pending') {
        showWarning('Payment Processing', checkoutResult.message);
        return;
      }

      // Payment verified — now create booking
      const bookingResponse = await awsAPI.bookSession({
        creatorId: creator.id,
        scheduledAt: route.params?.datetime || new Date(date.fullDate!.setHours(
          Number.parseInt(time.split(':')[0]),
          Number.parseInt(time.split(':')[1])
        )).toISOString(),
        duration: duration,
        price: price,
      });

      if (bookingResponse.success) {
        navigation.replace('SessionBooked', {
          creator,
          date,
          time,
          duration,
          sessionId: bookingResponse.session?.id,
        });
      } else {
        showError('Booking Issue', 'Payment was successful but there was an issue creating your booking. Please contact support.');
      }
    } catch (err: unknown) {
      if (__DEV__) console.warn('Payment error:', err);
      // SECURITY: Never expose raw error messages to users
      showError('Error', 'Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = () => formatFullDateShort(date.fullDate || new Date());

  const renderContent = () => {
    return (
      <>
        {/* Session Summary */}
        <View style={styles.summaryCard}>
          <OptimizedImage
              source={creator.avatar}
              style={styles.creatorAvatar as StyleProp<ImageStyle>}
              contentFit="cover"
              priority="high"
            />
          <View style={styles.summaryInfo}>
            <Text style={styles.creatorName}>{creator.name}</Text>
            <Text style={styles.sessionDetails}>
              {formatDate()} • {time} • {duration} min
            </Text>
          </View>
          <Text style={styles.price}>{formatCurrencyAmount(Math.round(price * 100))}</Text>
        </View>

        {/* Payment Info */}
        <View style={styles.paymentInfo}>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Session fee</Text>
            <Text style={styles.paymentValue}>{formatCurrencyAmount(Math.round(price * 100))}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Service fee</Text>
            <Text style={styles.paymentValue}>{formatCurrencyAmount(0)}</Text>
          </View>
          <View style={[styles.paymentRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrencyAmount(Math.round(price * 100))}</Text>
          </View>
        </View>

        {/* Secure Payment Badge */}
        <View style={styles.secureBadge}>
          <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
          <Text style={styles.secureText}>Secure payment powered by Stripe</Text>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Bottom Button */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          onPress={handlePayment}
          disabled={isProcessing}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.payButton}
          >
            {isProcessing ? (
              <>
                <ActivityIndicator size="small" color="white" />
                <Text style={styles.payButtonText}>Processing...</Text>
              </>
            ) : (
              <>
                <Text style={styles.payButtonText}>Pay {formatCurrencyAmount(Math.round(price * 100))}</Text>
                <Ionicons name="arrow-forward" size={20} color="white" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
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
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  creatorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  summaryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
  },
  sessionDetails: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
  },
  paymentInfo: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  paymentLabel: {
    fontSize: 15,
    color: colors.gray,
  },
  paymentValue: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.dark,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    marginTop: 8,
    paddingTop: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secureText: {
    fontSize: 13,
    color: colors.gray,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    backgroundColor: colors.background,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 16,
    gap: 8,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
