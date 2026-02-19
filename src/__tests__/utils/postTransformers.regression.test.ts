/**
 * Post Transformers — Regression Tests
 *
 * Targeted regression tests for formatDuration and getMasonryHeight.
 * These cover edge cases (null, undefined, negative, NaN) that caused
 * runtime crashes in production feeds.
 */

import { formatDuration, getMasonryHeight } from '../../utils/postTransformers';

const MASONRY_MIN_HEIGHT = 140;
const MASONRY_MAX_HEIGHT = 320;
const FALLBACK_HEIGHTS = [160, 200, 240, 280, 220, 180, 260];

describe('formatDuration — regression', () => {
  it('BUG-2026-02-05: accepts null input', () => {
    expect(formatDuration(null)).toBeUndefined();
  });

  it('BUG-2026-02-05: accepts undefined input', () => {
    expect(formatDuration(undefined)).toBeUndefined();
  });

  it('formats valid number of seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('formats string number of seconds', () => {
    expect(formatDuration('125')).toBe('2:05');
  });

  it('returns undefined for zero', () => {
    expect(formatDuration(0)).toBeUndefined();
  });

  it('returns undefined for NaN string', () => {
    expect(formatDuration('abc')).toBeUndefined();
  });

  it('pads single-digit seconds with leading zero', () => {
    expect(formatDuration(61)).toBe('1:01');
  });

  it('returns undefined for negative number', () => {
    expect(formatDuration(-5)).toBeUndefined();
  });
});

describe('getMasonryHeight — regression', () => {
  it('BUG-2026-02-05: uses real aspect ratio and clamps to max for tall portrait image', () => {
    // Portrait: width 1000, height 2000 => aspect ratio 0.5
    // computed = 200 / 0.5 = 400 => clamped to MASONRY_MAX_HEIGHT (320)
    const result = getMasonryHeight('post-1', { width: 1000, height: 2000 }, 200);
    expect(result).toBe(MASONRY_MAX_HEIGHT);
  });

  it('clamps to min for wide landscape image', () => {
    // Landscape: width 2000, height 1000 => aspect ratio 2
    // computed = 200 / 2 = 100 => clamped to MASONRY_MIN_HEIGHT (140)
    const result = getMasonryHeight('post-2', { width: 2000, height: 1000 }, 200);
    expect(result).toBe(MASONRY_MIN_HEIGHT);
  });

  it('returns exact computed height for square image within range', () => {
    // Square: width 1000, height 1000 => aspect ratio 1
    // computed = 200 / 1 = 200 => within [140, 320]
    const result = getMasonryHeight('post-3', { width: 1000, height: 1000 }, 200);
    expect(result).toBe(200);
  });

  it('falls back to deterministic height without mediaMeta', () => {
    const result = getMasonryHeight('some-post-id');
    expect(FALLBACK_HEIGHTS).toContain(result);
  });

  it('returns consistent value for the same postId', () => {
    const id = 'deterministic-test-id';
    const first = getMasonryHeight(id);
    const second = getMasonryHeight(id);
    expect(first).toBe(second);
  });

  it('result is always in [140, 320] range when mediaMeta is provided', () => {
    const testCases = [
      { width: 100, height: 5000 },   // extremely tall
      { width: 5000, height: 100 },   // extremely wide
      { width: 1, height: 1 },        // tiny square
      { width: 4000, height: 3000 },  // 4:3
      { width: 1920, height: 1080 },  // 16:9
    ];
    for (const meta of testCases) {
      const result = getMasonryHeight('range-test', meta, 200);
      expect(result).toBeGreaterThanOrEqual(MASONRY_MIN_HEIGHT);
      expect(result).toBeLessThanOrEqual(MASONRY_MAX_HEIGHT);
    }
  });

  it('fallback always returns a value from FALLBACK_HEIGHTS array', () => {
    const testIds = [
      'a',
      'abcdef',
      '00000000-0000-0000-0000-000000000000',
      'zzzzzzzzzz',
      'short',
      'a-very-long-post-id-that-goes-on-and-on',
    ];
    for (const id of testIds) {
      const result = getMasonryHeight(id);
      expect(FALLBACK_HEIGHTS).toContain(result);
    }
  });
});
