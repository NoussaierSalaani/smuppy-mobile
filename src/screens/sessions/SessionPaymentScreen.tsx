// src/screens/sessions/SessionPaymentScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { usePaymentSheet, PaymentSheetError } from '@stripe/stripe-react-native';
import { COLORS, GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';

export default function SessionPaymentScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  const { creator, date, time, duration, price, sessionId } = route.params || {
    creator: { id: '', name: 'Creator', avatar: 'https://i.pravatar.cc/100?img=33' },
    date: { date: 15, month: 'Sep' },
    time: '15:00',
    duration: 60,
    price: 20,
  };

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize payment sheet on mount
  useEffect(() => {
    initializePayment();
  }, []);

  const initializePayment = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Create payment intent on backend
      const response = await awsAPI.createPaymentIntent({
        creatorId: creator.id,
        amount: price * 100, // Convert to cents
        sessionId: sessionId,
        description: `Session with ${creator.name} - ${duration} min`,
      });

      if (!response.success || !response.paymentIntent) {
        throw new Error(response.message || 'Failed to create payment');
      }

      const { clientSecret } = response.paymentIntent;

      // Initialize the Payment Sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'Smuppy',
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: {
          name: '',
        },
        applePay: {
          merchantCountryCode: 'US',
        },
        googlePay: {
          merchantCountryCode: 'US',
          testEnv: __DEV__,
        },
        style: 'automatic',
        returnURL: 'smuppy://payment-complete',
      });

      if (initError) {
        console.error('Payment sheet init error:', initError);
        setError(initError.message);
      } else {
        setPaymentReady(true);
      }
    } catch (err: any) {
      console.error('Payment initialization error:', err);
      setError(err.message || 'Failed to initialize payment');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handlePayment = async () => {
    if (!paymentReady) {
      Alert.alert('Please wait', 'Payment is still loading...');
      return;
    }

    setIsProcessing(true);

    try {
      const { error: paymentError } = await presentPaymentSheet();

      if (paymentError) {
        if (paymentError.code === PaymentSheetError.Canceled) {
          // User cancelled - do nothing
          console.log('Payment cancelled by user');
        } else {
          Alert.alert('Payment Failed', paymentError.message);
        }
      } else {
        // Payment successful!
        navigation.replace('SessionBooked', {
          creator,
          date,
          time,
          duration,
        });
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      Alert.alert('Error', err.message || 'Something went wrong');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = () => {
    const d = date.fullDate || new Date();
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Setting up payment...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#FF3B30" />
          <Text style={styles.errorTitle}>Payment Setup Failed</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializePayment}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        {/* Session Summary */}
        <View style={styles.summaryCard}>
          <Image source={{ uri: creator.avatar }} style={styles.creatorAvatar} />
          <View style={styles.summaryInfo}>
            <Text style={styles.creatorName}>{creator.name}</Text>
            <Text style={styles.sessionDetails}>
              {formatDate()} • {time} • {duration} min
            </Text>
          </View>
          <Text style={styles.price}>${price}</Text>
        </View>

        {/* Payment Info */}
        <View style={styles.paymentInfo}>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Session fee</Text>
            <Text style={styles.paymentValue}>${price.toFixed(2)}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Service fee</Text>
            <Text style={styles.paymentValue}>$0.00</Text>
          </View>
          <View style={[styles.paymentRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${price.toFixed(2)}</Text>
          </View>
        </View>

        {/* Secure Payment Badge */}
        <View style={styles.secureBadge}>
          <Ionicons name="shield-checkmark" size={16} color={COLORS.primary} />
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
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Bottom Button */}
      {!isLoading && !error && (
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            onPress={handlePayment}
            disabled={isProcessing || !paymentReady}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={paymentReady ? GRADIENTS.primary : ['#CCC', '#AAA']}
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
                  <Text style={styles.payButtonText}>Pay ${price.toFixed(2)}</Text>
                  <Ionicons name="arrow-forward" size={20} color="white" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
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
    color: COLORS.dark,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.dark,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.dark,
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: 'rgba(10, 37, 47, 0.6)',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 37, 47, 0.03)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  creatorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  summaryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
  },
  sessionDetails: {
    fontSize: 13,
    color: 'rgba(10, 37, 47, 0.6)',
    marginTop: 2,
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.dark,
  },
  paymentInfo: {
    backgroundColor: 'rgba(10, 37, 47, 0.03)',
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
    color: 'rgba(10, 37, 47, 0.6)',
  },
  paymentValue: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.dark,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
    marginTop: 8,
    paddingTop: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.dark,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secureText: {
    fontSize: 13,
    color: 'rgba(10, 37, 47, 0.5)',
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    backgroundColor: 'white',
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
