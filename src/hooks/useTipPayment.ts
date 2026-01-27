/**
 * useTipPayment Hook
 * Handles the complete tip payment flow with Stripe
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { awsAPI } from '../services/aws-api';
import * as Haptics from 'expo-haptics';

interface TipRecipient {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

interface TipContext {
  type: 'profile' | 'live' | 'peak' | 'battle';
  id?: string;
}

interface UseTipPaymentReturn {
  sendTip: (
    recipient: TipRecipient,
    amount: number,
    context: TipContext,
    options?: { message?: string; isAnonymous?: boolean }
  ) => Promise<boolean>;
  isProcessing: boolean;
  error: string | null;
}

export function useTipPayment(): UseTipPaymentReturn {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendTip = useCallback(
    async (
      recipient: TipRecipient,
      amount: number,
      context: TipContext,
      options?: { message?: string; isAnonymous?: boolean }
    ): Promise<boolean> => {
      setIsProcessing(true);
      setError(null);

      try {
        // Step 1: Create tip and get PaymentIntent from backend
        const response = await awsAPI.sendTip({
          receiverId: recipient.id,
          amount: amount,
          contextType: context.type,
          contextId: context.id,
          message: options?.message,
          isAnonymous: options?.isAnonymous,
        });

        if (!response.success || !response.clientSecret) {
          throw new Error(response.message || 'Failed to create tip');
        }

        // Step 2: Initialize Stripe Payment Sheet
        const { error: initError } = await initPaymentSheet({
          paymentIntentClientSecret: response.clientSecret,
          merchantDisplayName: 'Smuppy',
          style: 'alwaysDark',
          appearance: {
            colors: {
              primary: '#FF6B35',
              background: '#1a1a2e',
              componentBackground: '#2a2a3e',
              componentBorder: '#3a3a4e',
              componentDivider: '#3a3a4e',
              primaryText: '#ffffff',
              secondaryText: '#888888',
              componentText: '#ffffff',
              placeholderText: '#666666',
              icon: '#FF6B35',
              error: '#FF4444',
            },
            shapes: {
              borderRadius: 12,
              borderWidth: 1,
            },
          },
        });

        if (initError) {
          throw new Error(initError.message);
        }

        // Step 3: Present Payment Sheet
        const { error: presentError } = await presentPaymentSheet();

        if (presentError) {
          if (presentError.code === 'Canceled') {
            // User cancelled - not an error
            setIsProcessing(false);
            return false;
          }
          throw new Error(presentError.message);
        }

        // Step 4: Payment successful!
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Show success feedback
        Alert.alert(
          'Tip Sent! 🎉',
          `You sent ${formatDisplayAmount(amount)} to @${recipient.username}`,
          [{ text: 'OK' }]
        );

        setIsProcessing(false);
        return true;
      } catch (err: any) {
        console.error('Tip payment error:', err);
        setError(err.message || 'Payment failed');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        Alert.alert('Payment Failed', err.message || 'Could not process your tip. Please try again.');

        setIsProcessing(false);
        return false;
      }
    },
    [initPaymentSheet, presentPaymentSheet]
  );

  return {
    sendTip,
    isProcessing,
    error,
  };
}

// Helper to format amount for display
function formatDisplayAmount(amountCents: number): string {
  const amount = amountCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

export default useTipPayment;
