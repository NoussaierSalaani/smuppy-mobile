/**
 * Date Formatters Tests
 */

import {
  formatDateLong,
  formatDateShort,
  formatDateCompact,
  formatTime,
  formatRelativeTime,
  getDayName,
  isToday,
  isPast,
  getDaysRemaining,
} from '../../utils/dateFormatters';

// Helper to create a mock Date class
const createMockDate = (nowTimestamp: number) => {
  const RealDate = Date;
  return function MockDate(this: Date, ...args: unknown[]) {
    if (args.length === 0) {
      return new RealDate(nowTimestamp);
    }
    // @ts-expect-error - Date constructor accepts various argument types
    return new RealDate(...args);
  } as unknown as DateConstructor;
};

describe('Date Formatters', () => {
  // Use fixed date for testing
  const TEST_DATE = '2024-01-15T14:30:00Z';
  const RealDate = Date;

  afterEach(() => {
    global.Date = RealDate;
  });

  describe('formatDateLong', () => {
    it('should format date with weekday, day, and month', () => {
      const result = formatDateLong(TEST_DATE);
      // Result varies by locale, but should contain the day number
      expect(result).toContain('15');
    });
  });

  describe('formatDateShort', () => {
    it('should format date with day, month, and year', () => {
      const result = formatDateShort(TEST_DATE);
      // Result varies by locale, but should contain year
      expect(result).toContain('2024');
    });
  });

  describe('formatDateCompact', () => {
    it('should format date in compact format', () => {
      const result = formatDateCompact(TEST_DATE);
      // Result varies by locale, but should contain day number
      expect(result).toContain('15');
    });
  });

  describe('formatTime', () => {
    it('should format time in 24-hour format', () => {
      const result = formatTime(TEST_DATE);
      // Time formatting varies by system timezone, but should be in HH:MM format
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('formatRelativeTime', () => {
    const NOW = new RealDate('2024-01-15T12:00:00Z').getTime();

    beforeEach(() => {
      global.Date = createMockDate(NOW);
      global.Date.now = () => NOW;
      global.Date.parse = RealDate.parse;
      global.Date.UTC = RealDate.UTC;
    });

    it('should return "Just now" for very recent dates', () => {
      const result = formatRelativeTime(new RealDate(NOW - 30 * 1000).toISOString());
      expect(result).toBe('Just now');
    });

    it('should return minutes for dates under an hour', () => {
      const result = formatRelativeTime(new RealDate(NOW - 30 * 60 * 1000).toISOString());
      expect(result).toBe('30 min ago');
    });

    it('should return hours for dates under a day', () => {
      const result = formatRelativeTime(new RealDate(NOW - 5 * 60 * 60 * 1000).toISOString());
      expect(result).toBe('5h ago');
    });

    it('should return days for dates under a week', () => {
      const result = formatRelativeTime(new RealDate(NOW - 3 * 24 * 60 * 60 * 1000).toISOString());
      expect(result).toBe('3d ago');
    });

    it('should return formatted date for dates over a week', () => {
      const result = formatRelativeTime(new RealDate(NOW - 14 * 24 * 60 * 60 * 1000).toISOString());
      // Should return short date format for old dates
      expect(result).toContain('2024');
    });
  });

  describe('getDayName', () => {
    it('should return the day name', () => {
      // January 15, 2024 is a Monday
      const result = getDayName('2024-01-15T14:30:00Z');
      // Result varies by locale
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('isToday', () => {
    const NOW = new RealDate('2024-01-15T12:00:00Z').getTime();

    beforeEach(() => {
      global.Date = createMockDate(NOW);
      global.Date.now = () => NOW;
      global.Date.parse = RealDate.parse;
      global.Date.UTC = RealDate.UTC;
    });

    it('should return true for today\'s date', () => {
      const result = isToday('2024-01-15T10:00:00Z');
      expect(result).toBe(true);
    });

    it('should return false for yesterday', () => {
      const result = isToday('2024-01-14T10:00:00Z');
      expect(result).toBe(false);
    });

    it('should return false for tomorrow', () => {
      const result = isToday('2024-01-16T10:00:00Z');
      expect(result).toBe(false);
    });
  });

  describe('isPast', () => {
    const NOW = new RealDate('2024-01-15T12:00:00Z').getTime();

    beforeEach(() => {
      global.Date = createMockDate(NOW);
      global.Date.now = () => NOW;
      global.Date.parse = RealDate.parse;
      global.Date.UTC = RealDate.UTC;
    });

    it('should return true for past dates', () => {
      const result = isPast('2024-01-14T10:00:00Z');
      expect(result).toBe(true);
    });

    it('should return false for future dates', () => {
      const result = isPast('2024-01-16T10:00:00Z');
      expect(result).toBe(false);
    });
  });

  describe('getDaysRemaining', () => {
    const NOW = new RealDate('2024-01-15T12:00:00Z').getTime();

    beforeEach(() => {
      global.Date = createMockDate(NOW);
      global.Date.now = () => NOW;
      global.Date.parse = RealDate.parse;
      global.Date.UTC = RealDate.UTC;
    });

    it('should return positive days for future dates', () => {
      const result = getDaysRemaining('2024-01-20T12:00:00Z');
      expect(result).toBe(5);
    });

    it('should return negative days for past dates', () => {
      const result = getDaysRemaining('2024-01-10T12:00:00Z');
      expect(result).toBe(-5);
    });

    it('should return 0 for same day', () => {
      const result = getDaysRemaining('2024-01-15T12:00:00Z');
      expect(result).toBe(0);
    });

    it('should round up partial days', () => {
      const result = getDaysRemaining('2024-01-16T10:00:00Z');
      // 22 hours remaining -> rounds up to 1 day
      expect(result).toBe(1);
    });
  });
});
