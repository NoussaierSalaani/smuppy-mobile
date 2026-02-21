/**
 * IAP Product Configuration
 *
 * Maps Smuppy digital products to App Store / Play Store product IDs.
 * Used by useIAPCheckout to route purchases to the correct store product.
 *
 * IMPORTANT: These IDs must match exactly what is configured in:
 * - App Store Connect (iOS) → Features → In-App Purchases
 * - Google Play Console (Android) → Monetize → Products
 */

import { Platform } from 'react-native';

// ────────────────────────────────────────────
// Product IDs per platform
// ────────────────────────────────────────────

const BUNDLE_PREFIX_IOS = 'com.nou09.Smuppy';
const BUNDLE_PREFIX_ANDROID = 'com_nou09_smuppy';

/** Auto-renewable subscriptions */
export const IAP_SUBSCRIPTIONS = {
  PRO_CREATOR: {
    ios: `${BUNDLE_PREFIX_IOS}.pro_creator_monthly`,
    android: `${BUNDLE_PREFIX_ANDROID}_pro_creator_monthly`,
    productType: 'pro_creator' as const,
  },
  PRO_BUSINESS: {
    ios: `${BUNDLE_PREFIX_IOS}.pro_business_monthly`,
    android: `${BUNDLE_PREFIX_ANDROID}_pro_business_monthly`,
    productType: 'pro_business' as const,
  },
  VERIFIED: {
    ios: `${BUNDLE_PREFIX_IOS}.verified_monthly`,
    android: `${BUNDLE_PREFIX_ANDROID}_verified_monthly`,
    productType: 'verified' as const,
  },
  CHANNEL_SUB: {
    ios: `${BUNDLE_PREFIX_IOS}.channel_sub_monthly`,
    android: `${BUNDLE_PREFIX_ANDROID}_channel_sub_monthly`,
    productType: 'channel_subscription' as const,
  },
} as const;

/** Consumable products (tips — iOS only, Android uses Stripe) */
export const IAP_CONSUMABLES = {
  TIP_200: { ios: `${BUNDLE_PREFIX_IOS}.tip_200`, amount: 200 },
  TIP_500: { ios: `${BUNDLE_PREFIX_IOS}.tip_500`, amount: 500 },
  TIP_1000: { ios: `${BUNDLE_PREFIX_IOS}.tip_1000`, amount: 1000 },
  TIP_2000: { ios: `${BUNDLE_PREFIX_IOS}.tip_2000`, amount: 2000 },
} as const;

/** All subscription SKUs for the current platform (used to initialize IAP) */
export function getSubscriptionSkus(): string[] {
  const platform = Platform.OS;
  if (platform !== 'ios' && platform !== 'android') return [];

  return Object.values(IAP_SUBSCRIPTIONS).map(
    (p) => p[platform as 'ios' | 'android'],
  );
}

/** All consumable SKUs for the current platform */
export function getConsumableSkus(): string[] {
  if (Platform.OS !== 'ios') return [];
  return Object.values(IAP_CONSUMABLES).map((p) => p.ios);
}

// ────────────────────────────────────────────
// Routing: should this product use IAP?
// ────────────────────────────────────────────

type ProductCategory = 'digital' | 'service';

/**
 * Returns true if the current platform requires IAP for the given product category.
 *
 * - 'digital' → IAP on iOS and Android (App Store / Play Store requirement)
 * - 'service' → always Stripe (real-world services, exempt under Apple 3.1.3(e))
 */
export function shouldUseIAP(category: ProductCategory): boolean {
  if (category === 'service') return false;
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/**
 * Returns the store-specific product ID for a subscription.
 * Returns null on web (web uses Stripe).
 */
export function getSubscriptionProductId(
  key: keyof typeof IAP_SUBSCRIPTIONS,
): string | null {
  const platform = Platform.OS;
  if (platform !== 'ios' && platform !== 'android') return null;
  return IAP_SUBSCRIPTIONS[key][platform as 'ios' | 'android'];
}

/**
 * Returns the store-specific product ID for a tip consumable.
 * Returns null on non-iOS (Android/web use Stripe for tips).
 */
export function getTipProductId(
  amountCents: number,
): string | null {
  if (Platform.OS !== 'ios') return null;
  const match = Object.values(IAP_CONSUMABLES).find((p) => p.amount === amountCents);
  return match?.ios ?? null;
}
