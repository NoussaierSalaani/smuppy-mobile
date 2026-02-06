/**
 * useTipPayment Hook
 * Handles the complete tip payment flow with Stripe Checkout via WebBrowser
 */

import { useState, useCallback, useRef } from 'react';
import { useSmuppyAlert } from '../context/SmuppyAlertContext';
import { awsAPI } from '../services/aws-api';
import * as Haptics from 'expo-haptics';
import { useStripeCheckout } from './useStripeCheckout';

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
  const { showSuccess, showError, showWarning } = useSmuppyAlert();
  const { openCheckout } = useStripeCheckout();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processingRef = useRef(false);

  const sendTip = useCallback(
    async (
      recipient: TipRecipient,
      amount: number,
      context: TipContext,
      options?: { message?: string; isAnonymous?: boolean }
    ): Promise<boolean> => {
      if (processingRef.current) return false;
      processingRef.current = true;
      setIsProcessing(true);
      setError(null);

      try {
        // Create tip checkout session via backend
        const response = await awsAPI.sendTip({
          receiverId: recipient.id,
          amount: amount,
          contextType: context.type,
          contextId: context.id,
          message: options?.message,
          isAnonymous: options?.isAnonymous,
        });

        if (!response.success) {
          throw new Error(response.message || 'Failed to create tip');
        }

        // If backend returns a checkout URL, open and verify
        if (response.checkoutUrl && response.sessionId) {
          const checkoutResult = await openCheckout(response.checkoutUrl, response.sessionId);

          if (checkoutResult.status === 'cancelled') {
            processingRef.current = false;
            setIsProcessing(false);
            return false;
          }

          if (checkoutResult.status === 'failed') {
            throw new Error(checkoutResult.message);
          }

          if (checkoutResult.status === 'success') {
            showSuccess('Tip Sent!', `You sent ${formatDisplayAmount(amount)} to ${recipient.displayName || recipient.username}`);
          } else {
            showWarning('Tip Processing', 'Your tip is being processed. You will be notified when complete.');
          }
          processingRef.current = false;
          setIsProcessing(false);
          return checkoutResult.status === 'success' || checkoutResult.status === 'pending';
        }

        // Fallback: if backend returned clientSecret (legacy PaymentSheet flow)
        // Just show not available since we removed PaymentSheet dependency
        if (response.clientSecret) {
          throw new Error('Payment method not available. Please update the app.');
        }

        throw new Error('No payment method returned');
      } catch (err: unknown) {
        if (__DEV__) console.warn('Tip payment error:', err);
        const message = err instanceof Error ? err.message : 'Payment failed';
        setError(message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showError('Payment Failed', message || 'Could not process your tip. Please try again.');
        processingRef.current = false;
        setIsProcessing(false);
        return false;
      }
    },
    [openCheckout, showError, showSuccess, showWarning]
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
