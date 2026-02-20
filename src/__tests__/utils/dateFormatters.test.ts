/**
 * Date Formatters Tests
 */

import {
  formatDateLong,
  formatDateShort,
  formatDateCompact,
  formatDDMMYYYY,
  formatDateForDisplay,
  formatFullDate,
  formatFullDateShort,
  formatShortDateTime,
  formatLongDateTime,
  formatDateTimeRelative,
  formatTime,
  formatRelativeTime,
  formatRelativeTimeShort,
  formatTimeAgo,
  formatDateRelative,
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

  describe('formatDDMMYYYY', () => {
    it('should format date as DD/MM/YYYY', () => {
      const result = formatDDMMYYYY('2024-01-15T14:30:00Z');
      // The result depends on timezone, but should match DD/MM/YYYY format
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it('should pad single-digit day and month with zeros', () => {
      const result = formatDDMMYYYY('2024-03-05T00:00:00Z');
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(result).toContain('2024');
    });

    it('should accept Date objects', () => {
      const date = new RealDate(2024, 0, 15, 14, 30); // Jan 15, 2024
      const result = formatDDMMYYYY(date);
      expect(result).toBe('15/01/2024');
    });
  });

  describe('formatDateForDisplay', () => {
    it('should return empty string for null', () => {
      expect(formatDateForDisplay(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(formatDateForDisplay(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(formatDateForDisplay('')).toBe('');
    });

    it('should format Date objects', () => {
      const date = new RealDate(2024, 0, 15);
      const result = formatDateForDisplay(date);
      expect(result).toBe('15/01/2024');
    });

    it('should convert YYYY-MM-DD to DD/MM/YYYY', () => {
      expect(formatDateForDisplay('2024-01-15')).toBe('15/01/2024');
    });

    it('should convert ISO datetime to DD/MM/YYYY', () => {
      expect(formatDateForDisplay('2024-01-15T14:30:00Z')).toBe('15/01/2024');
    });

    it('should pass through DD/MM/YYYY as-is', () => {
      expect(formatDateForDisplay('15/01/2024')).toBe('15/01/2024');
    });

    it('should return empty string for unrecognized format', () => {
      expect(formatDateForDisplay('January 15, 2024')).toBe('');
    });

    it('should return empty string for random text', () => {
      expect(formatDateForDisplay('not-a-date')).toBe('');
    });
  });

  describe('formatFullDate', () => {
    it('should format full date in en-US with weekday, month, day, year', () => {
      const result = formatFullDate('2024-09-15T14:30:00Z');
      // en-US locale: "Sunday, September 15, 2024"
      expect(result).toContain('September');
      expect(result).toContain('2024');
      expect(result).toContain('15');
    });

    it('should accept Date objects', () => {
      const result = formatFullDate(new RealDate(2024, 0, 15));
      expect(result).toContain('January');
      expect(result).toContain('2024');
    });
  });

  describe('formatFullDateShort', () => {
    it('should format with short weekday and month in en-US', () => {
      const result = formatFullDateShort('2024-09-15T14:30:00Z');
      expect(result).toContain('Sep');
      expect(result).toContain('2024');
    });
  });

  describe('formatShortDateTime', () => {
    it('should include weekday, month, day and time', () => {
      const result = formatShortDateTime('2024-09-15T14:30:00Z');
      expect(result).toContain('Sep');
      expect(result).toContain('15');
    });
  });

  describe('formatLongDateTime', () => {
    it('should include long weekday, day, month and time', () => {
      const result = formatLongDateTime('2024-01-15T14:30:00Z');
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

  describe('formatDateTimeRelative', () => {
    const NOW = new RealDate('2024-01-15T12:00:00Z').getTime();

    beforeEach(() => {
      global.Date = createMockDate(NOW);
      global.Date.now = () => NOW;
      global.Date.parse = RealDate.parse;
      global.Date.UTC = RealDate.UTC;
    });

    it('should return "Today, HH:MM" for today', () => {
      const result = formatDateTimeRelative(new RealDate(NOW + 2 * 60 * 60 * 1000).toISOString());
      expect(result).toContain('Today');
    });

    it('should return "Tomorrow, HH:MM" for tomorrow', () => {
      const result = formatDateTimeRelative(
        new RealDate(NOW + 24 * 60 * 60 * 1000).toISOString()
      );
      expect(result).toContain('Tomorrow');
    });

    it('should fallback to formatShortDateTime for other dates', () => {
      const result = formatDateTimeRelative(
        new RealDate(NOW + 5 * 24 * 60 * 60 * 1000).toISOString()
      );
      // Should not contain Today or Tomorrow
      expect(result).not.toContain('Today');
      expect(result).not.toContain('Tomorrow');
    });
  });

  describe('formatRelativeTimeShort', () => {
    const NOW = new RealDate('2024-01-15T12:00:00Z').getTime();

    beforeEach(() => {
      global.Date = createMockDate(NOW);
      global.Date.now = () => NOW;
      global.Date.parse = RealDate.parse;
      global.Date.UTC = RealDate.UTC;
    });

    it('should return "now" for very recent dates', () => {
      const result = formatRelativeTimeShort(new RealDate(NOW - 30 * 1000).toISOString());
      expect(result).toBe('now');
    });

    it('should return "Xm" for minutes under an hour', () => {
      const result = formatRelativeTimeShort(new RealDate(NOW - 15 * 60 * 1000).toISOString());
      expect(result).toBe('15m');
    });

    it('should return "Xh" for hours under a day', () => {
      const result = formatRelativeTimeShort(new RealDate(NOW - 5 * 60 * 60 * 1000).toISOString());
      expect(result).toBe('5h');
    });

    it('should return "Xd" for days under a week', () => {
      const result = formatRelativeTimeShort(
        new RealDate(NOW - 3 * 24 * 60 * 60 * 1000).toISOString()
      );
      expect(result).toBe('3d');
    });

    it('should return formatted date for over a week', () => {
      const result = formatRelativeTimeShort(
        new RealDate(NOW - 14 * 24 * 60 * 60 * 1000).toISOString()
      );
      // Should return toLocaleDateString() format
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('formatTimeAgo', () => {
    const NOW = new RealDate('2024-01-15T12:00:00Z').getTime();

    beforeEach(() => {
      global.Date = createMockDate(NOW);
      global.Date.now = () => NOW;
      global.Date.parse = RealDate.parse;
      global.Date.UTC = RealDate.UTC;
    });

    it('should return "Just now" for very recent', () => {
      const result = formatTimeAgo(new RealDate(NOW - 20 * 1000).toISOString());
      expect(result).toBe('Just now');
    });

    it('should return "Xm ago" for minutes', () => {
      const result = formatTimeAgo(new RealDate(NOW - 10 * 60 * 1000).toISOString());
      expect(result).toBe('10m ago');
    });

    it('should return "Xh ago" for hours', () => {
      const result = formatTimeAgo(new RealDate(NOW - 3 * 60 * 60 * 1000).toISOString());
      expect(result).toBe('3h ago');
    });

    it('should return "Xd ago" for days under a week', () => {
      const result = formatTimeAgo(new RealDate(NOW - 5 * 24 * 60 * 60 * 1000).toISOString());
      expect(result).toBe('5d ago');
    });

    it('should return formatted date for over a week', () => {
      const result = formatTimeAgo(new RealDate(NOW - 10 * 24 * 60 * 60 * 1000).toISOString());
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('formatDateRelative', () => {
    const NOW = new RealDate('2024-01-15T12:00:00Z').getTime();

    beforeEach(() => {
      global.Date = createMockDate(NOW);
      global.Date.now = () => NOW;
      global.Date.parse = RealDate.parse;
      global.Date.UTC = RealDate.UTC;
    });

    it('should return "Today" for the same day', () => {
      const result = formatDateRelative(new RealDate(NOW + 1000).toISOString());
      expect(result).toBe('Today');
    });

    it('should return "Tomorrow" for the next day', () => {
      const result = formatDateRelative(
        new RealDate(NOW + 24 * 60 * 60 * 1000).toISOString()
      );
      expect(result).toBe('Tomorrow');
    });

    it('should return "Yesterday" for the previous day', () => {
      const result = formatDateRelative(
        new RealDate(NOW - 24 * 60 * 60 * 1000).toISOString()
      );
      expect(result).toBe('Yesterday');
    });

    it('should return "X days ago" for past dates within a week', () => {
      const result = formatDateRelative(
        new RealDate(NOW - 3 * 24 * 60 * 60 * 1000).toISOString()
      );
      expect(result).toBe('3 days ago');
    });

    it('should return "In X days" for near future dates', () => {
      const result = formatDateRelative(
        new RealDate(NOW + 4 * 24 * 60 * 60 * 1000).toISOString()
      );
      expect(result).toBe('In 4 days');
    });

    it('should return formatted date for dates over a week', () => {
      const result = formatDateRelative(
        new RealDate(NOW + 14 * 24 * 60 * 60 * 1000).toISOString()
      );
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
