/**
 * useStripeCheckout Hook
 * Centralizes the Stripe Checkout flow:
 * 1. Opens checkout URL in WebBrowser (or Linking fallback)
 * 2. After browser closes, polls getWebCheckoutStatus to verify payment
 * 3. Returns verified success/failure/cancelled status
 *
 * Prevents the "assume success if not cancelled" anti-pattern.
 */

import { useCallback, useRef } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { awsAPI } from '../services/aws-api';

type CheckoutResult =
  | { status: 'success'; paymentStatus: string; metadata?: Record<string, string> }
  | { status: 'cancelled' }
  | { status: 'pending'; message: string }
  | { status: 'failed'; message: string };

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 8; // 8 x 1.5s = 12s max wait

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll the web-checkout status endpoint until the session is complete or max retries.
 * Stripe webhooks may take a few seconds to process, so we poll.
 */
async function pollCheckoutStatus(
  sessionId: string,
  maxPolls: number = MAX_POLLS,
): Promise<CheckoutResult> {
  for (let i = 0; i < maxPolls; i++) {
    try {
      const result = await awsAPI.getWebCheckoutStatus(sessionId);

      if (result.success) {
        // Stripe session statuses: 'complete', 'expired', 'open'
        if (result.status === 'complete' && result.paymentStatus === 'paid') {
          return { status: 'success', paymentStatus: result.paymentStatus, metadata: result.metadata };
        }
        if (result.status === 'complete' && result.paymentStatus === 'no_payment_required') {
          // Free trial or 100% discount
          return { status: 'success', paymentStatus: result.paymentStatus, metadata: result.metadata };
        }
        if (result.status === 'expired') {
          return { status: 'failed', message: 'Checkout session expired' };
        }
        // status === 'open' means not yet completed — keep polling
      }
    } catch {
      // Network error during poll — keep trying
      if (__DEV__) console.warn(`[useStripeCheckout] Poll ${i + 1}/${maxPolls} failed`);
    }

    if (i < maxPolls - 1) {
      await wait(POLL_INTERVAL_MS);
    }
  }

  // After max polls, the session is still open — payment may still process via webhook
  return { status: 'pending', message: 'Payment is being processed. You will be notified when complete.' };
}

interface UseStripeCheckoutReturn {
  /**
   * Opens Stripe Checkout and verifies payment status on return.
   * @param checkoutUrl - The Stripe Checkout URL
   * @param sessionId - The Stripe Checkout Session ID (for status polling)
   * @returns CheckoutResult with verified status
   */
  openCheckout: (checkoutUrl: string, sessionId: string) => Promise<CheckoutResult>;
}

export function useStripeCheckout(): UseStripeCheckoutReturn {
  const processingRef = useRef(false);

  const openCheckout = useCallback(async (
    checkoutUrl: string,
    sessionId: string,
  ): Promise<CheckoutResult> => {
    if (processingRef.current) {
      return { status: 'failed', message: 'A checkout is already in progress' };
    }

    processingRef.current = true;

    try {
      // Try WebBrowser first (preferred — returns result.type)
      const result = await WebBrowser.openBrowserAsync(checkoutUrl, {
        dismissButtonStyle: 'cancel',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });

      if (result.type === 'cancel') {
        return { status: 'cancelled' };
      }

      // Browser closed (dismiss/done) — poll for actual payment status
      const checkoutResult = await pollCheckoutStatus(sessionId);

      if (checkoutResult.status === 'success') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (checkoutResult.status === 'failed') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      return checkoutResult;
    } catch {
      // WebBrowser failed — try Linking as fallback
      try {
        const canOpen = await Linking.canOpenURL(checkoutUrl);
        if (canOpen) {
          await Linking.openURL(checkoutUrl);
        }
      } catch {
        // Expected: Linking fallback may fail on some devices — webhook handles payment status
        if (__DEV__) console.warn('[useStripeCheckout] Both WebBrowser and Linking failed');
      }

      // With Linking.openURL we can't detect when user returns,
      // so return pending — the webhook will handle it
      return { status: 'pending', message: 'Payment opened in browser. You will be notified when complete.' };
    } finally {
      processingRef.current = false;
    }
  }, []);

  return { openCheckout };
}

export type { CheckoutResult };
export default useStripeCheckout;
