/**
 * Tests for utils/pagination — parseLimit, applyHasMore
 */

import { parseLimit, applyHasMore } from '../../utils/pagination';

describe('parseLimit', () => {
  it.each([
    ['undefined', undefined, 20],
    ['empty string', '', 20],
    ['NaN string', 'abc', 20],
    ['negative number', '-5', 20],
    ['zero', '0', 20],
    ['valid 1', '1', 1],
    ['valid 10', '10', 10],
    ['default 20', '20', 20],
    ['max 50', '50', 50],
    ['over max 51', '51', 50],
    ['way over max 100', '100', 50],
    ['way over max 9999', '9999', 50],
  ])('should return %s → %s', (_label, input, expected) => {
    expect(parseLimit(input)).toBe(expected);
  });
});

describe('applyHasMore', () => {
  it('should return hasMore=false when rows.length <= limit', () => {
    const result = applyHasMore([1, 2, 3], 5);
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.hasMore).toBe(false);
  });

  it('should return hasMore=false when rows.length === limit', () => {
    const result = applyHasMore([1, 2, 3], 3);
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.hasMore).toBe(false);
  });

  it('should return hasMore=true when rows.length > limit (slice to limit)', () => {
    const result = applyHasMore([1, 2, 3, 4], 3);
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.hasMore).toBe(true);
  });

  it('should handle empty array', () => {
    const result = applyHasMore([], 20);
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it('should handle limit+5 rows', () => {
    const rows = Array.from({ length: 25 }, (_, i) => i);
    const result = applyHasMore(rows, 20);
    expect(result.data).toHaveLength(20);
    expect(result.hasMore).toBe(true);
  });
});
