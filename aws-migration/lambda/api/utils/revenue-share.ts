/**
 * Platform fee calculation based on creator fan count.
 * Single source of truth — used by webhook, channel-subscription, wallet, and web-checkout.
 *
 * Revenue Share Tiers:
 * - 1-999 fans: Creator 60%, Smuppy 40%
 * - 1K-9,999 fans: Creator 65%, Smuppy 35%
 * - 10K-99,999 fans: Creator 70%, Smuppy 30%
 * - 100K-999,999 fans: Creator 75%, Smuppy 25%
 * - 1M+ fans: Creator 80%, Smuppy 20%
 */

/** Fan-count tier thresholds for platform fee calculation (sorted descending) */
export const FAN_TIERS = [
  { minFans: 1_000_000, feePercent: 20, name: 'Diamond', nextTierName: null, nextTierThreshold: null },
  { minFans: 100_000, feePercent: 25, name: 'Platinum', nextTierName: 'Diamond', nextTierThreshold: 1_000_000 },
  { minFans: 10_000, feePercent: 30, name: 'Gold', nextTierName: 'Platinum', nextTierThreshold: 100_000 },
  { minFans: 1_000, feePercent: 35, name: 'Silver', nextTierName: 'Gold', nextTierThreshold: 10_000 },
] as const;

/** Default fee percentage for creators with fewer than 1,000 fans (Bronze tier) */
export const DEFAULT_FEE_PERCENT = 40;

/** Default tier name for creators below the lowest threshold */
export const DEFAULT_TIER_NAME = 'Bronze';

/** Next tier available from the default Bronze tier */
export const DEFAULT_NEXT_TIER = { name: 'Silver' as const, threshold: 1_000 };

/**
 * Calculate Smuppy's fee percentage based on creator's fan count.
 * Returns the platform fee as a percentage (e.g., 40 for 40%).
 */
export function calculatePlatformFeePercent(fanCount: number): number {
  for (const tier of FAN_TIERS) {
    if (fanCount >= tier.minFans) return tier.feePercent;
  }
  return DEFAULT_FEE_PERCENT;
}
