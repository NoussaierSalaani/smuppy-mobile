/**
 * useWebCheckout Hook
 * Handles web-based checkout flow to avoid 30% App Store fees
 *
 * Flow:
 * 1. Create checkout session via API
 * 2. Open Stripe Checkout in browser (Safari/Chrome)
 * 3. User completes payment with Apple Pay, Google Pay, or Card
 * 4. Success page redirects back to app via deep link
 * 5. App verifies payment status
 */

import { useState, useCallback, useEffect } from 'react';
import { Linking, Alert, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { awsAPI } from '../services/aws-api';

type ProductType = 'session' | 'pack' | 'channel_subscription' | 'platform_subscription' | 'tip';

interface WebCheckoutOptions {
  productType: ProductType;
  productId?: string;
  creatorId?: string;
  amount?: number;
  planType?: 'pro_creator' | 'pro_business';
  onSuccess?: (sessionId: string) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

interface WebCheckoutState {
  isLoading: boolean;
  sessionId: string | null;
  checkoutUrl: string | null;
  status: 'idle' | 'pending' | 'complete' | 'canceled' | 'error';
  error: Error | null;
  showDisclosure: boolean;
  pendingOptions: WebCheckoutOptions | null;
}

export function useWebCheckout() {
  const [state, setState] = useState<WebCheckoutState>({
    isLoading: false,
    sessionId: null,
    checkoutUrl: null,
    status: 'idle',
    error: null,
    showDisclosure: false,
    pendingOptions: null,
  });

  /**
   * Show disclosure modal before starting checkout
   * Required by Apple's External Link Entitlement
   */
  const requestCheckout = useCallback((options: WebCheckoutOptions) => {
    setState((prev) => ({
      ...prev,
      showDisclosure: true,
      pendingOptions: options,
    }));
  }, []);

  /**
   * Cancel the disclosure and don't proceed
   */
  const cancelDisclosure = useCallback(() => {
    const { pendingOptions } = state;
    setState((prev) => ({
      ...prev,
      showDisclosure: false,
      pendingOptions: null,
    }));
    pendingOptions?.onCancel?.();
  }, [state]);

  /**
   * User confirmed disclosure, proceed with checkout
   */
  const confirmDisclosure = useCallback(async () => {
    const options = state.pendingOptions;
    if (!options) return;

    setState((prev) => ({
      ...prev,
      showDisclosure: false,
      pendingOptions: null,
    }));

    await startCheckoutInternal(options);
  }, [state.pendingOptions]);

  /**
   * Internal: Start the web checkout process after disclosure confirmed
   */
  const startCheckoutInternal = useCallback(async (options: WebCheckoutOptions) => {
    const { productType, productId, creatorId, amount, planType, onSuccess, onCancel, onError } = options;

    setState((prev) => ({
      ...prev,
      isLoading: true,
      status: 'pending',
      error: null,
    }));

    try {
      // Create checkout session
      const response = await awsAPI.createWebCheckout({
        productType,
        productId,
        creatorId,
        amount,
        planType,
      });

      if (!response.success || !response.checkoutUrl) {
        throw new Error(response.message || 'Failed to create checkout session');
      }

      setState((prev) => ({
        ...prev,
        sessionId: response.sessionId || null,
        checkoutUrl: response.checkoutUrl || null,
      }));

      // Open Stripe Checkout in browser
      const result = await WebBrowser.openAuthSessionAsync(
        response.checkoutUrl,
        'smuppy://', // Deep link scheme to return to app
        {
          showInRecents: true,
          preferEphemeralSession: false, // Keep session for Apple Pay to work
        }
      );

      if (result.type === 'success' && result.url) {
        // User completed checkout and returned to app
        const url = new URL(result.url);
        const sessionId = url.searchParams.get('session_id');

        if (sessionId) {
          // Verify payment status
          const statusResponse = await awsAPI.getWebCheckoutStatus(sessionId);

          if (statusResponse.paymentStatus === 'paid' || statusResponse.status === 'complete') {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              status: 'complete',
            }));
            onSuccess?.(sessionId);
          } else {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              status: 'pending',
            }));
            // Payment might still be processing
            Alert.alert(
              'Paiement en cours',
              'Votre paiement est en cours de traitement. Vous recevrez une notification une fois confirme.'
            );
          }
        }
      } else if (result.type === 'cancel') {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          status: 'canceled',
        }));
        onCancel?.();
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          status: 'error',
        }));
      }
    } catch (error: any) {
      console.error('Web checkout error:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        status: 'error',
        error,
      }));
      onError?.(error);
      Alert.alert('Erreur', error.message || 'Une erreur est survenue lors du paiement');
    }
  }, []);

  /**
   * Check the status of a checkout session
   */
  const checkStatus = useCallback(async (sessionId: string) => {
    try {
      const response = await awsAPI.getWebCheckoutStatus(sessionId);
      return response;
    } catch (error) {
      console.error('Failed to check checkout status:', error);
      return null;
    }
  }, []);

  /**
   * Reset the checkout state
   */
  const reset = useCallback(() => {
    setState({
      isLoading: false,
      sessionId: null,
      checkoutUrl: null,
      status: 'idle',
      error: null,
      showDisclosure: false,
      pendingOptions: null,
    });
  }, []);

  /**
   * Start checkout with disclosure (recommended)
   * Shows Apple-required disclosure before redirecting
   */
  const startCheckout = useCallback((options: WebCheckoutOptions) => {
    requestCheckout(options);
  }, [requestCheckout]);

  /**
   * Start checkout without disclosure (use only if you show your own disclosure)
   */
  const startCheckoutDirect = useCallback(async (options: WebCheckoutOptions) => {
    await startCheckoutInternal(options);
  }, []);

  return {
    ...state,
    // Main methods
    startCheckout,
    startCheckoutDirect,
    checkStatus,
    reset,
    // Disclosure handling
    showDisclosure: state.showDisclosure,
    pendingOptions: state.pendingOptions,
    confirmDisclosure,
    cancelDisclosure,
  };
}

/**
 * Alternative: Open checkout in external browser (Safari/Chrome)
 * Use this if WebBrowser.openAuthSessionAsync doesn't work well
 */
export async function openExternalCheckout(checkoutUrl: string): Promise<boolean> {
  const canOpen = await Linking.canOpenURL(checkoutUrl);
  if (canOpen) {
    await Linking.openURL(checkoutUrl);
    return true;
  }
  return false;
}

export default useWebCheckout;
