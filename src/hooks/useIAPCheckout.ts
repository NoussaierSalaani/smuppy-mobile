/**
 * useIAPCheckout Hook
 * Handles In-App Purchase flow for digital products:
 * 1. Initializes IAP connection and fetches available products
 * 2. Requests purchase from App Store / Google Play
 * 3. Sends receipt to backend for verification
 * 4. Finishes the transaction after backend confirms
 *
 * Returns the same CheckoutResult shape as useStripeCheckout
 * so payment screens can use either engine with identical handling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  ErrorCode,
  type Purchase,
  type PurchaseError,
  type ProductCommon,
  type EventSubscription,
} from 'react-native-iap';
import { awsAPI } from '../services/aws-api';
import { getSubscriptionSkus, getConsumableSkus } from '../config/iap-products';
import type { CheckoutResult } from './useStripeCheckout';

// Re-export for convenience
export type { CheckoutResult };

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface IAPProduct {
  productId: string;
  title: string;
  description: string;
  displayPrice: string;
  price: number;
  currency: string;
}

interface UseIAPCheckoutReturn {
  /** Whether IAP connection is initialized and products are loaded */
  isReady: boolean;
  /** Available subscription products from the store */
  subscriptions: IAPProduct[];
  /** Available consumable products from the store (tips — iOS only) */
  consumables: IAPProduct[];
  /** Purchase a subscription by store product ID (SKU) */
  purchaseSubscription: (sku: string) => Promise<CheckoutResult>;
  /** Purchase a consumable (tip) by store product ID (SKU) */
  purchaseConsumable: (sku: string) => Promise<CheckoutResult>;
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function mapProduct(prod: ProductCommon): IAPProduct {
  return {
    productId: prod.id,
    title: prod.title || '',
    description: prod.description || '',
    displayPrice: prod.displayPrice || '',
    price: prod.price ?? 0,
    currency: prod.currency || 'USD',
  };
}

/** Determine if a product ID corresponds to a subscription (vs consumable) */
function isSubscriptionProduct(productId: string): boolean {
  const subSkus = getSubscriptionSkus();
  return subSkus.includes(productId);
}

// ────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────

export function useIAPCheckout(): UseIAPCheckoutReturn {
  const [isReady, setIsReady] = useState(false);
  const [subscriptions, setSubscriptions] = useState<IAPProduct[]>([]);
  const [consumables, setConsumables] = useState<IAPProduct[]>([]);

  // Guard against concurrent purchases
  const processingRef = useRef(false);

  // Promise resolver for the current purchase (bridges event listener → Promise)
  const resolverRef = useRef<{
    resolve: (result: CheckoutResult) => void;
    sku: string;
  } | null>(null);

  // ──────── Initialize IAP on mount ────────
  useEffect(() => {
    // IAP only works on native platforms
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

    let mounted = true;
    let purchaseUpdateSub: EventSubscription | null = null;
    let purchaseErrorSub: EventSubscription | null = null;

    async function init() {
      try {
        await initConnection();
        if (!mounted) return;

        // Fetch available products from the store
        const subSkus = getSubscriptionSkus();
        const conSkus = getConsumableSkus();

        if (subSkus.length > 0) {
          const subs = await fetchProducts({ skus: subSkus, type: 'subs' });
          if (mounted && subs) {
            setSubscriptions(subs.map(s => mapProduct(s as ProductCommon)));
          }
        }

        if (conSkus.length > 0) {
          const prods = await fetchProducts({ skus: conSkus, type: 'in-app' });
          if (mounted && prods) {
            setConsumables(prods.map(p => mapProduct(p as ProductCommon)));
          }
        }

        if (mounted) setIsReady(true);
      } catch (err) {
        if (__DEV__) console.warn('[useIAPCheckout] Init failed:', err);
      }
    }

    // ──────── Purchase listeners ────────
    // react-native-iap uses event-based purchase delivery.
    // We bridge events into Promises via resolverRef.

    purchaseUpdateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
      if (!resolverRef.current) return;

      const { resolve, sku } = resolverRef.current;

      // Verify this purchase matches the one we requested
      if (purchase.productId !== sku) return;

      try {
        // Get the receipt data for backend verification
        // In v14, purchaseToken is unified across platforms (JWS on iOS, token on Android)
        const receiptData = purchase.purchaseToken;

        if (!receiptData) {
          resolve({ status: 'failed', message: 'No receipt data received' });
          resolverRef.current = null;
          processingRef.current = false;
          return;
        }

        // Send receipt to backend for server-side verification
        const transactionId = purchase.transactionId ?? purchase.id ?? '';

        const verifyResult = await awsAPI.verifyIAPReceipt({
          platform: Platform.OS as 'ios' | 'android',
          productId: purchase.productId,
          transactionId,
          receipt: Platform.OS === 'ios' ? receiptData : undefined,
          purchaseToken: Platform.OS === 'android' ? receiptData : undefined,
        });

        if (verifyResult.success) {
          // Acknowledge the purchase with the store (critical — prevents refund)
          await finishTransaction({
            purchase,
            isConsumable: !isSubscriptionProduct(purchase.productId),
          });

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          resolve({
            status: 'success',
            paymentStatus: 'verified',
            metadata: { productType: verifyResult.productType || '' },
          });
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          resolve({ status: 'failed', message: 'Receipt verification failed' });
        }
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        resolve({ status: 'failed', message: 'Purchase verification failed' });
      } finally {
        resolverRef.current = null;
        processingRef.current = false;
      }
    });

    purchaseErrorSub = purchaseErrorListener((error: PurchaseError) => {
      if (!resolverRef.current) return;

      const { resolve } = resolverRef.current;

      if (error.code === ErrorCode.UserCancelled) {
        resolve({ status: 'cancelled' });
      } else {
        if (__DEV__) console.warn('[useIAPCheckout] Purchase error:', error.code, error.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        resolve({ status: 'failed', message: 'Purchase could not be completed' });
      }

      resolverRef.current = null;
      processingRef.current = false;
    });

    init();

    return () => {
      mounted = false;
      purchaseUpdateSub?.remove();
      purchaseErrorSub?.remove();
      endConnection();
    };
  }, []);

  // ──────── Purchase subscription ────────
  const purchaseSubscription = useCallback(async (sku: string): Promise<CheckoutResult> => {
    if (processingRef.current) {
      return { status: 'failed', message: 'A purchase is already in progress' };
    }

    if (!isReady) {
      return { status: 'failed', message: 'Store not ready. Please try again.' };
    }

    processingRef.current = true;

    return new Promise<CheckoutResult>((resolve) => {
      // Timeout: if store doesn't respond within 2 minutes, fail gracefully
      const timeout = setTimeout(() => {
        if (resolverRef.current?.sku === sku) {
          resolverRef.current = null;
          processingRef.current = false;
          resolve({ status: 'pending', message: 'Purchase is being processed. You will be notified when complete.' });
        }
      }, 120_000);

      const wrappedResolve = (result: CheckoutResult) => {
        clearTimeout(timeout);
        resolve(result);
      };

      // Set up resolver before requesting purchase
      resolverRef.current = { resolve: wrappedResolve, sku };

      // Initiate the store purchase dialog
      requestPurchase({
        type: 'subs',
        request: {
          apple: { sku },
          google: { skus: [sku] },
        },
      }).catch(() => {
        clearTimeout(timeout);
        resolverRef.current = null;
        processingRef.current = false;
        resolve({ status: 'failed', message: 'Failed to initiate subscription purchase' });
      });
    });
  }, [isReady]);

  // ──────── Purchase consumable (tips) ────────
  const purchaseConsumable = useCallback(async (sku: string): Promise<CheckoutResult> => {
    if (processingRef.current) {
      return { status: 'failed', message: 'A purchase is already in progress' };
    }

    if (!isReady) {
      return { status: 'failed', message: 'Store not ready. Please try again.' };
    }

    processingRef.current = true;

    return new Promise<CheckoutResult>((resolve) => {
      const timeout = setTimeout(() => {
        if (resolverRef.current?.sku === sku) {
          resolverRef.current = null;
          processingRef.current = false;
          resolve({ status: 'pending', message: 'Purchase is being processed. You will be notified when complete.' });
        }
      }, 120_000);

      const wrappedResolve = (result: CheckoutResult) => {
        clearTimeout(timeout);
        resolve(result);
      };

      resolverRef.current = { resolve: wrappedResolve, sku };

      requestPurchase({
        type: 'in-app',
        request: {
          apple: { sku },
          google: { skus: [sku] },
        },
      }).catch(() => {
        clearTimeout(timeout);
        resolverRef.current = null;
        processingRef.current = false;
        resolve({ status: 'failed', message: 'Failed to initiate purchase' });
      });
    });
  }, [isReady]);

  return {
    isReady,
    subscriptions,
    consumables,
    purchaseSubscription,
    purchaseConsumable,
  };
}

export default useIAPCheckout;
