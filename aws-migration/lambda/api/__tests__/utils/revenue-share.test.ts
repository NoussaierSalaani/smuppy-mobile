import {
  calculatePlatformFeePercent,
  FAN_TIERS,
  DEFAULT_FEE_PERCENT,
  DEFAULT_TIER_NAME,
  DEFAULT_NEXT_TIER,
} from '../../utils/revenue-share';

describe('calculatePlatformFeePercent', () => {
  it('returns 40% for 0 fans (Bronze tier)', () => {
    expect(calculatePlatformFeePercent(0)).toBe(40);
  });

  it('returns 40% for 500 fans (still Bronze)', () => {
    expect(calculatePlatformFeePercent(500)).toBe(40);
  });

  it('returns 40% for 999 fans (just below Silver)', () => {
    expect(calculatePlatformFeePercent(999)).toBe(40);
  });

  it('returns 35% at exactly 1,000 fans (Silver tier boundary)', () => {
    expect(calculatePlatformFeePercent(1_000)).toBe(35);
  });

  it('returns 35% for 5,000 fans (mid-Silver)', () => {
    expect(calculatePlatformFeePercent(5_000)).toBe(35);
  });

  it('returns 30% at exactly 10,000 fans (Gold tier boundary)', () => {
    expect(calculatePlatformFeePercent(10_000)).toBe(30);
  });

  it('returns 25% at exactly 100,000 fans (Platinum tier boundary)', () => {
    expect(calculatePlatformFeePercent(100_000)).toBe(25);
  });

  it('returns 20% at exactly 1,000,000 fans (Diamond tier boundary)', () => {
    expect(calculatePlatformFeePercent(1_000_000)).toBe(20);
  });

  it('returns 20% for 5,000,000 fans (above Diamond)', () => {
    expect(calculatePlatformFeePercent(5_000_000)).toBe(20);
  });
});

describe('revenue-share constants', () => {
  it('FAN_TIERS is sorted descending by minFans', () => {
    for (let i = 1; i < FAN_TIERS.length; i++) {
      expect(FAN_TIERS[i - 1].minFans).toBeGreaterThan(FAN_TIERS[i].minFans);
    }
  });

  it('DEFAULT_FEE_PERCENT is 40', () => {
    expect(DEFAULT_FEE_PERCENT).toBe(40);
  });

  it('DEFAULT_TIER_NAME is Bronze', () => {
    expect(DEFAULT_TIER_NAME).toBe('Bronze');
  });

  it('DEFAULT_NEXT_TIER points to Silver at 1,000', () => {
    expect(DEFAULT_NEXT_TIER.name).toBe('Silver');
    expect(DEFAULT_NEXT_TIER.threshold).toBe(1_000);
  });
});
