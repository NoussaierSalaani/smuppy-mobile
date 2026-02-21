/**
 * IAP Products Configuration Tests
 *
 * Tests all exports from iap-products.ts:
 * - IAP_SUBSCRIPTIONS / IAP_CONSUMABLES constants
 * - getSubscriptionSkus() — platform-specific subscription SKUs
 * - getConsumableSkus() — iOS-only consumable SKUs
 * - shouldUseIAP(category) — IAP routing by platform + category
 * - getSubscriptionProductId(key) — store-specific subscription product ID
 * - getTipProductId(amountCents) — iOS-only tip product ID lookup
 *
 * Each function is tested across iOS, Android, and web platforms.
 */

let mockPlatformOS = 'ios';

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
}));

import {
  IAP_SUBSCRIPTIONS,
  IAP_CONSUMABLES,
  getSubscriptionSkus,
  getConsumableSkus,
  shouldUseIAP,
  getSubscriptionProductId,
  getTipProductId,
} from '../../config/iap-products';

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

const IOS_PREFIX = 'com.nou09.Smuppy';
const ANDROID_PREFIX = 'com_nou09_smuppy';

// ────────────────────────────────────────────
// IAP_SUBSCRIPTIONS
// ────────────────────────────────────────────

describe('IAP_SUBSCRIPTIONS', () => {
  it('should have exactly 4 subscription keys', () => {
    const keys = Object.keys(IAP_SUBSCRIPTIONS);
    expect(keys).toEqual(['PRO_CREATOR', 'PRO_BUSINESS', 'VERIFIED', 'CHANNEL_SUB']);
  });

  it('should have correct iOS product IDs', () => {
    expect(IAP_SUBSCRIPTIONS.PRO_CREATOR.ios).toBe(`${IOS_PREFIX}.pro_creator_monthly`);
    expect(IAP_SUBSCRIPTIONS.PRO_BUSINESS.ios).toBe(`${IOS_PREFIX}.pro_business_monthly`);
    expect(IAP_SUBSCRIPTIONS.VERIFIED.ios).toBe(`${IOS_PREFIX}.verified_monthly`);
    expect(IAP_SUBSCRIPTIONS.CHANNEL_SUB.ios).toBe(`${IOS_PREFIX}.channel_sub_monthly`);
  });

  it('should have correct Android product IDs', () => {
    expect(IAP_SUBSCRIPTIONS.PRO_CREATOR.android).toBe(`${ANDROID_PREFIX}_pro_creator_monthly`);
    expect(IAP_SUBSCRIPTIONS.PRO_BUSINESS.android).toBe(`${ANDROID_PREFIX}_pro_business_monthly`);
    expect(IAP_SUBSCRIPTIONS.VERIFIED.android).toBe(`${ANDROID_PREFIX}_verified_monthly`);
    expect(IAP_SUBSCRIPTIONS.CHANNEL_SUB.android).toBe(`${ANDROID_PREFIX}_channel_sub_monthly`);
  });

  it('should have correct productType values', () => {
    expect(IAP_SUBSCRIPTIONS.PRO_CREATOR.productType).toBe('pro_creator');
    expect(IAP_SUBSCRIPTIONS.PRO_BUSINESS.productType).toBe('pro_business');
    expect(IAP_SUBSCRIPTIONS.VERIFIED.productType).toBe('verified');
    expect(IAP_SUBSCRIPTIONS.CHANNEL_SUB.productType).toBe('channel_subscription');
  });

  it('should use dot separator for iOS and underscore separator for Android', () => {
    Object.values(IAP_SUBSCRIPTIONS).forEach((sub) => {
      expect(sub.ios).toContain('com.nou09.Smuppy.');
      expect(sub.android).toContain('com_nou09_smuppy_');
    });
  });
});

// ────────────────────────────────────────────
// IAP_CONSUMABLES
// ────────────────────────────────────────────

describe('IAP_CONSUMABLES', () => {
  it('should have exactly 4 tip tiers', () => {
    const keys = Object.keys(IAP_CONSUMABLES);
    expect(keys).toEqual(['TIP_200', 'TIP_500', 'TIP_1000', 'TIP_2000']);
  });

  it('should have correct iOS product IDs', () => {
    expect(IAP_CONSUMABLES.TIP_200.ios).toBe(`${IOS_PREFIX}.tip_200`);
    expect(IAP_CONSUMABLES.TIP_500.ios).toBe(`${IOS_PREFIX}.tip_500`);
    expect(IAP_CONSUMABLES.TIP_1000.ios).toBe(`${IOS_PREFIX}.tip_1000`);
    expect(IAP_CONSUMABLES.TIP_2000.ios).toBe(`${IOS_PREFIX}.tip_2000`);
  });

  it('should have correct cent amounts', () => {
    expect(IAP_CONSUMABLES.TIP_200.amount).toBe(200);
    expect(IAP_CONSUMABLES.TIP_500.amount).toBe(500);
    expect(IAP_CONSUMABLES.TIP_1000.amount).toBe(1000);
    expect(IAP_CONSUMABLES.TIP_2000.amount).toBe(2000);
  });

  it('should NOT have android product IDs (tips are iOS-only IAP)', () => {
    Object.values(IAP_CONSUMABLES).forEach((tip) => {
      expect(tip).not.toHaveProperty('android');
    });
  });
});

// ────────────────────────────────────────────
// getSubscriptionSkus()
// ────────────────────────────────────────────

describe('getSubscriptionSkus', () => {
  afterEach(() => {
    mockPlatformOS = 'ios';
  });

  it('should return all iOS subscription SKUs on iOS', () => {
    mockPlatformOS = 'ios';
    const skus = getSubscriptionSkus();
    expect(skus).toHaveLength(4);
    expect(skus).toEqual([
      `${IOS_PREFIX}.pro_creator_monthly`,
      `${IOS_PREFIX}.pro_business_monthly`,
      `${IOS_PREFIX}.verified_monthly`,
      `${IOS_PREFIX}.channel_sub_monthly`,
    ]);
  });

  it('should return all Android subscription SKUs on Android', () => {
    mockPlatformOS = 'android';
    const skus = getSubscriptionSkus();
    expect(skus).toHaveLength(4);
    expect(skus).toEqual([
      `${ANDROID_PREFIX}_pro_creator_monthly`,
      `${ANDROID_PREFIX}_pro_business_monthly`,
      `${ANDROID_PREFIX}_verified_monthly`,
      `${ANDROID_PREFIX}_channel_sub_monthly`,
    ]);
  });

  it('should return empty array on web', () => {
    mockPlatformOS = 'web';
    const skus = getSubscriptionSkus();
    expect(skus).toEqual([]);
  });

  it('should return empty array on unknown platform', () => {
    mockPlatformOS = 'windows';
    const skus = getSubscriptionSkus();
    expect(skus).toEqual([]);
  });

  it('should return only strings', () => {
    mockPlatformOS = 'ios';
    const skus = getSubscriptionSkus();
    skus.forEach((sku) => {
      expect(typeof sku).toBe('string');
      expect(sku.length).toBeGreaterThan(0);
    });
  });
});

// ────────────────────────────────────────────
// getConsumableSkus()
// ────────────────────────────────────────────

describe('getConsumableSkus', () => {
  afterEach(() => {
    mockPlatformOS = 'ios';
  });

  it('should return all iOS consumable SKUs on iOS', () => {
    mockPlatformOS = 'ios';
    const skus = getConsumableSkus();
    expect(skus).toHaveLength(4);
    expect(skus).toEqual([
      `${IOS_PREFIX}.tip_200`,
      `${IOS_PREFIX}.tip_500`,
      `${IOS_PREFIX}.tip_1000`,
      `${IOS_PREFIX}.tip_2000`,
    ]);
  });

  it('should return empty array on Android', () => {
    mockPlatformOS = 'android';
    const skus = getConsumableSkus();
    expect(skus).toEqual([]);
  });

  it('should return empty array on web', () => {
    mockPlatformOS = 'web';
    const skus = getConsumableSkus();
    expect(skus).toEqual([]);
  });

  it('should return empty array on unknown platform', () => {
    mockPlatformOS = 'macos';
    const skus = getConsumableSkus();
    expect(skus).toEqual([]);
  });
});

// ────────────────────────────────────────────
// shouldUseIAP(category)
// ────────────────────────────────────────────

describe('shouldUseIAP', () => {
  afterEach(() => {
    mockPlatformOS = 'ios';
  });

  describe('digital products', () => {
    it('should return true on iOS', () => {
      mockPlatformOS = 'ios';
      expect(shouldUseIAP('digital')).toBe(true);
    });

    it('should return true on Android', () => {
      mockPlatformOS = 'android';
      expect(shouldUseIAP('digital')).toBe(true);
    });

    it('should return false on web', () => {
      mockPlatformOS = 'web';
      expect(shouldUseIAP('digital')).toBe(false);
    });

    it('should return false on unknown platform', () => {
      mockPlatformOS = 'windows';
      expect(shouldUseIAP('digital')).toBe(false);
    });
  });

  describe('service products', () => {
    it('should return false on iOS (services use Stripe)', () => {
      mockPlatformOS = 'ios';
      expect(shouldUseIAP('service')).toBe(false);
    });

    it('should return false on Android (services use Stripe)', () => {
      mockPlatformOS = 'android';
      expect(shouldUseIAP('service')).toBe(false);
    });

    it('should return false on web', () => {
      mockPlatformOS = 'web';
      expect(shouldUseIAP('service')).toBe(false);
    });
  });
});

// ────────────────────────────────────────────
// getSubscriptionProductId(key)
// ────────────────────────────────────────────

describe('getSubscriptionProductId', () => {
  afterEach(() => {
    mockPlatformOS = 'ios';
  });

  describe('on iOS', () => {
    beforeEach(() => {
      mockPlatformOS = 'ios';
    });

    it('should return iOS product ID for PRO_CREATOR', () => {
      expect(getSubscriptionProductId('PRO_CREATOR')).toBe(
        `${IOS_PREFIX}.pro_creator_monthly`,
      );
    });

    it('should return iOS product ID for PRO_BUSINESS', () => {
      expect(getSubscriptionProductId('PRO_BUSINESS')).toBe(
        `${IOS_PREFIX}.pro_business_monthly`,
      );
    });

    it('should return iOS product ID for VERIFIED', () => {
      expect(getSubscriptionProductId('VERIFIED')).toBe(
        `${IOS_PREFIX}.verified_monthly`,
      );
    });

    it('should return iOS product ID for CHANNEL_SUB', () => {
      expect(getSubscriptionProductId('CHANNEL_SUB')).toBe(
        `${IOS_PREFIX}.channel_sub_monthly`,
      );
    });
  });

  describe('on Android', () => {
    beforeEach(() => {
      mockPlatformOS = 'android';
    });

    it('should return Android product ID for PRO_CREATOR', () => {
      expect(getSubscriptionProductId('PRO_CREATOR')).toBe(
        `${ANDROID_PREFIX}_pro_creator_monthly`,
      );
    });

    it('should return Android product ID for PRO_BUSINESS', () => {
      expect(getSubscriptionProductId('PRO_BUSINESS')).toBe(
        `${ANDROID_PREFIX}_pro_business_monthly`,
      );
    });

    it('should return Android product ID for VERIFIED', () => {
      expect(getSubscriptionProductId('VERIFIED')).toBe(
        `${ANDROID_PREFIX}_verified_monthly`,
      );
    });

    it('should return Android product ID for CHANNEL_SUB', () => {
      expect(getSubscriptionProductId('CHANNEL_SUB')).toBe(
        `${ANDROID_PREFIX}_channel_sub_monthly`,
      );
    });
  });

  describe('on web', () => {
    beforeEach(() => {
      mockPlatformOS = 'web';
    });

    it('should return null for all subscription keys', () => {
      expect(getSubscriptionProductId('PRO_CREATOR')).toBeNull();
      expect(getSubscriptionProductId('PRO_BUSINESS')).toBeNull();
      expect(getSubscriptionProductId('VERIFIED')).toBeNull();
      expect(getSubscriptionProductId('CHANNEL_SUB')).toBeNull();
    });
  });

  describe('on unknown platform', () => {
    it('should return null', () => {
      mockPlatformOS = 'tvos';
      expect(getSubscriptionProductId('PRO_CREATOR')).toBeNull();
    });
  });
});

// ────────────────────────────────────────────
// getTipProductId(amountCents)
// ────────────────────────────────────────────

describe('getTipProductId', () => {
  afterEach(() => {
    mockPlatformOS = 'ios';
  });

  describe('on iOS', () => {
    beforeEach(() => {
      mockPlatformOS = 'ios';
    });

    it('should return correct product ID for 200 cents', () => {
      expect(getTipProductId(200)).toBe(`${IOS_PREFIX}.tip_200`);
    });

    it('should return correct product ID for 500 cents', () => {
      expect(getTipProductId(500)).toBe(`${IOS_PREFIX}.tip_500`);
    });

    it('should return correct product ID for 1000 cents', () => {
      expect(getTipProductId(1000)).toBe(`${IOS_PREFIX}.tip_1000`);
    });

    it('should return correct product ID for 2000 cents', () => {
      expect(getTipProductId(2000)).toBe(`${IOS_PREFIX}.tip_2000`);
    });

    it('should return null for unknown amount (e.g. 100 cents)', () => {
      expect(getTipProductId(100)).toBeNull();
    });

    it('should return null for zero amount', () => {
      expect(getTipProductId(0)).toBeNull();
    });

    it('should return null for negative amount', () => {
      expect(getTipProductId(-500)).toBeNull();
    });

    it('should return null for very large amount', () => {
      expect(getTipProductId(999999)).toBeNull();
    });

    it('should return null for fractional amount that does not match', () => {
      expect(getTipProductId(200.5)).toBeNull();
    });
  });

  describe('on Android', () => {
    beforeEach(() => {
      mockPlatformOS = 'android';
    });

    it('should return null for all amounts (Android tips use Stripe)', () => {
      expect(getTipProductId(200)).toBeNull();
      expect(getTipProductId(500)).toBeNull();
      expect(getTipProductId(1000)).toBeNull();
      expect(getTipProductId(2000)).toBeNull();
    });
  });

  describe('on web', () => {
    beforeEach(() => {
      mockPlatformOS = 'web';
    });

    it('should return null for all amounts (web uses Stripe)', () => {
      expect(getTipProductId(200)).toBeNull();
      expect(getTipProductId(500)).toBeNull();
      expect(getTipProductId(1000)).toBeNull();
      expect(getTipProductId(2000)).toBeNull();
    });
  });
});

// ────────────────────────────────────────────
// Cross-cutting: consistency checks
// ────────────────────────────────────────────

describe('Cross-cutting consistency', () => {
  afterEach(() => {
    mockPlatformOS = 'ios';
  });

  it('getSubscriptionSkus on iOS should match IAP_SUBSCRIPTIONS iOS values', () => {
    mockPlatformOS = 'ios';
    const skus = getSubscriptionSkus();
    const expected = Object.values(IAP_SUBSCRIPTIONS).map((s) => s.ios);
    expect(skus).toEqual(expected);
  });

  it('getSubscriptionSkus on Android should match IAP_SUBSCRIPTIONS Android values', () => {
    mockPlatformOS = 'android';
    const skus = getSubscriptionSkus();
    const expected = Object.values(IAP_SUBSCRIPTIONS).map((s) => s.android);
    expect(skus).toEqual(expected);
  });

  it('getConsumableSkus on iOS should match IAP_CONSUMABLES iOS values', () => {
    mockPlatformOS = 'ios';
    const skus = getConsumableSkus();
    const expected = Object.values(IAP_CONSUMABLES).map((c) => c.ios);
    expect(skus).toEqual(expected);
  });

  it('every valid tip amount from IAP_CONSUMABLES should resolve via getTipProductId on iOS', () => {
    mockPlatformOS = 'ios';
    Object.values(IAP_CONSUMABLES).forEach((consumable) => {
      const productId = getTipProductId(consumable.amount);
      expect(productId).toBe(consumable.ios);
    });
  });

  it('every subscription key should resolve via getSubscriptionProductId on iOS', () => {
    mockPlatformOS = 'ios';
    (Object.keys(IAP_SUBSCRIPTIONS) as (keyof typeof IAP_SUBSCRIPTIONS)[]).forEach((key) => {
      const productId = getSubscriptionProductId(key);
      expect(productId).toBe(IAP_SUBSCRIPTIONS[key].ios);
    });
  });

  it('every subscription key should resolve via getSubscriptionProductId on Android', () => {
    mockPlatformOS = 'android';
    (Object.keys(IAP_SUBSCRIPTIONS) as (keyof typeof IAP_SUBSCRIPTIONS)[]).forEach((key) => {
      const productId = getSubscriptionProductId(key);
      expect(productId).toBe(IAP_SUBSCRIPTIONS[key].android);
    });
  });

  it('all iOS product IDs should be unique', () => {
    const allIosIds = [
      ...Object.values(IAP_SUBSCRIPTIONS).map((s) => s.ios),
      ...Object.values(IAP_CONSUMABLES).map((c) => c.ios),
    ];
    const unique = new Set(allIosIds);
    expect(unique.size).toBe(allIosIds.length);
  });

  it('all Android product IDs should be unique', () => {
    const allAndroidIds = Object.values(IAP_SUBSCRIPTIONS).map((s) => s.android);
    const unique = new Set(allAndroidIds);
    expect(unique.size).toBe(allAndroidIds.length);
  });

  it('iOS and Android product IDs should never collide', () => {
    const iosIds = new Set<string>(Object.values(IAP_SUBSCRIPTIONS).map((s) => s.ios));
    const androidIds: string[] = Object.values(IAP_SUBSCRIPTIONS).map((s) => s.android);
    androidIds.forEach((id) => {
      expect(iosIds.has(id)).toBe(false);
    });
  });
});
