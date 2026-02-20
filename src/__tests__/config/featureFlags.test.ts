/**
 * Feature Flags Tests
 * Tests for feature flag evaluation logic.
 */

import { FEATURES, isFeatureEnabled } from '../../config/featureFlags';
import type { FeatureKey } from '../../config/featureFlags';

describe('Feature Flags', () => {
  describe('FEATURES object', () => {
    it('should be a non-empty object', () => {
      expect(typeof FEATURES).toBe('object');
      expect(Object.keys(FEATURES).length).toBeGreaterThan(0);
    });

    it('should have all values as booleans', () => {
      Object.values(FEATURES).forEach((value) => {
        expect(typeof value).toBe('boolean');
      });
    });
  });

  describe('V1 enabled features', () => {
    const v1EnabledFeatures: FeatureKey[] = [
      'CREATE_POST',
      'CREATE_PEAK',
      'MESSAGING',
      'FOLLOW_SYSTEM',
      'NOTIFICATIONS',
      'SEARCH',
      'XPLORER_MAP',
      'CREATE_ACTIVITY',
      'SPOTS',
      'CHALLENGES',
      'BUSINESS_DISCOVERY',
      'DISPUTES',
      'VIBE_GUARDIAN',
      'EMOTIONAL_RIPPLE',
      'VIBE_PRESCRIPTIONS',
      'VIBE_SCORE',
    ];

    v1EnabledFeatures.forEach((feature) => {
      it(`should have ${feature} enabled`, () => {
        expect(FEATURES[feature]).toBe(true);
      });
    });
  });

  describe('V1 disabled features (monetization / live)', () => {
    const v1DisabledFeatures: FeatureKey[] = [
      'GO_LIVE',
      'VIEWER_LIVE_STREAM',
      'BATTLES',
      'PAID_ACTIVITIES',
      'PRIVATE_SESSIONS',
      'CHANNEL_SUBSCRIBE',
      'TIPPING',
      'CREATOR_WALLET',
      'GIFTING',
      'BUSINESS_DASHBOARD',
      'BUSINESS_BOOKING',
      'BUSINESS_SCANNER',
      'UPGRADE_TO_PRO',
      'IDENTITY_VERIFICATION',
      'PLATFORM_SUBSCRIPTION',
    ];

    v1DisabledFeatures.forEach((feature) => {
      it(`should have ${feature} disabled`, () => {
        expect(FEATURES[feature]).toBe(false);
      });
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return true for enabled features', () => {
      expect(isFeatureEnabled('CREATE_POST')).toBe(true);
      expect(isFeatureEnabled('MESSAGING')).toBe(true);
      expect(isFeatureEnabled('SEARCH')).toBe(true);
    });

    it('should return false for disabled features', () => {
      expect(isFeatureEnabled('GO_LIVE')).toBe(false);
      expect(isFeatureEnabled('BATTLES')).toBe(false);
      expect(isFeatureEnabled('TIPPING')).toBe(false);
    });

    it('should return consistent results with FEATURES object', () => {
      (Object.keys(FEATURES) as FeatureKey[]).forEach((key) => {
        expect(isFeatureEnabled(key)).toBe(FEATURES[key]);
      });
    });
  });
});
