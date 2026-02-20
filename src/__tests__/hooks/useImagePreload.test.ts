/**
 * Image Preload Utilities & Hook Tests
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

import { preloadImage, preloadImages } from '../../hooks/useImagePreload';

// Mock expo-image
const mockPrefetch = jest.fn();
jest.mock('expo-image', () => ({
  Image: {
    prefetch: (url: string) => mockPrefetch(url),
  },
}));

describe('Image Preload Utilities', () => {
  beforeEach(() => {
    mockPrefetch.mockClear();
    mockPrefetch.mockResolvedValue(true);
  });

  describe('preloadImage', () => {
    it('should return false for null URL', async () => {
      const result = await preloadImage(null);

      expect(result).toBe(false);
      expect(mockPrefetch).not.toHaveBeenCalled();
    });

    it('should return false for undefined URL', async () => {
      const result = await preloadImage(undefined);

      expect(result).toBe(false);
      expect(mockPrefetch).not.toHaveBeenCalled();
    });

    it('should return true on successful preload', async () => {
      mockPrefetch.mockResolvedValue(true);

      const result = await preloadImage('https://example.com/image.jpg');

      expect(result).toBe(true);
      expect(mockPrefetch).toHaveBeenCalledWith('https://example.com/image.jpg');
    });

    it('should return false on preload failure', async () => {
      mockPrefetch.mockRejectedValue(new Error('Network error'));

      const result = await preloadImage('https://example.com/image.jpg');

      expect(result).toBe(false);
    });
  });

  describe('preloadImages', () => {
    it('should preload multiple valid URLs', async () => {
      await preloadImages([
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
        'https://example.com/image3.jpg',
      ]);

      expect(mockPrefetch).toHaveBeenCalledTimes(3);
      expect(mockPrefetch).toHaveBeenCalledWith('https://example.com/image1.jpg');
      expect(mockPrefetch).toHaveBeenCalledWith('https://example.com/image2.jpg');
      expect(mockPrefetch).toHaveBeenCalledWith('https://example.com/image3.jpg');
    });

    it('should filter out null and undefined URLs', async () => {
      await preloadImages([
        'https://example.com/image1.jpg',
        null,
        undefined,
        'https://example.com/image2.jpg',
      ]);

      expect(mockPrefetch).toHaveBeenCalledTimes(2);
      expect(mockPrefetch).toHaveBeenCalledWith('https://example.com/image1.jpg');
      expect(mockPrefetch).toHaveBeenCalledWith('https://example.com/image2.jpg');
    });

    it('should filter out empty strings', async () => {
      await preloadImages([
        'https://example.com/image1.jpg',
        '',
        'https://example.com/image2.jpg',
      ]);

      expect(mockPrefetch).toHaveBeenCalledTimes(2);
    });

    it('should handle empty array', async () => {
      await preloadImages([]);

      expect(mockPrefetch).not.toHaveBeenCalled();
    });

    it('should handle all invalid URLs', async () => {
      await preloadImages([null, undefined, '']);

      expect(mockPrefetch).not.toHaveBeenCalled();
    });

    it('should continue even if some preloads fail', async () => {
      mockPrefetch
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(true);

      // Should not throw
      await expect(
        preloadImages([
          'https://example.com/image1.jpg',
          'https://example.com/image2.jpg',
          'https://example.com/image3.jpg',
        ])
      ).resolves.toBeUndefined();

      expect(mockPrefetch).toHaveBeenCalledTimes(3);
    });
  });
});

// ========================================
// useImagePreload Hook Tests
// ========================================

/**
 * Minimal hook runner for useImagePreload (needs useEffect + useRef)
 */
function createHookRunner<T>(hookFn: () => T) {
  let refMap: Map<number, { current: unknown }> = new Map();
  let refIndex = 0;
  let effectIndex = 0;
  let previousEffectDeps: Array<unknown[] | undefined> = [];
  let effectCleanups: Array<(() => void) | void> = [];
  let pendingEffects: Array<{ idx: number; fn: () => void | (() => void) }> = [];
  let result: T;

  const mockUseRef = jest.fn((initial: unknown) => {
    const idx = refIndex++;
    if (!refMap.has(idx)) refMap.set(idx, { current: initial });
    return refMap.get(idx);
  });

  const mockUseEffect = jest.fn((fn: () => void | (() => void), deps?: unknown[]) => {
    const idx = effectIndex++;
    const prevDeps = previousEffectDeps[idx];
    let shouldRun = false;
    if (prevDeps === undefined) shouldRun = true;
    else if (deps === undefined) shouldRun = true;
    else if (deps.length !== prevDeps.length) shouldRun = true;
    else { for (let i = 0; i < deps.length; i++) { if (deps[i] !== prevDeps[i]) { shouldRun = true; break; } } }
    if (shouldRun) pendingEffects.push({ idx, fn });
    previousEffectDeps[idx] = deps;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useRef').mockImplementation(mockUseRef as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useEffect').mockImplementation(mockUseEffect as any);

  function flushEffects() {
    const effects = [...pendingEffects];
    pendingEffects = [];
    for (const { idx, fn } of effects) {
      if (effectCleanups[idx]) effectCleanups[idx]!();
      const cleanup = fn();
      effectCleanups[idx] = cleanup || undefined;
    }
  }

  function render() {
    refIndex = 0;
    effectIndex = 0;
    pendingEffects = [];
    result = hookFn();
    flushEffects();
  }

  render();

  return {
    get current() { return result; },
    rerender() { render(); },
    cleanup() {
      for (const cleanup of effectCleanups) {
        if (cleanup) cleanup();
      }
    },
  };
}

import { default as useImagePreload } from '../../hooks/useImagePreload';

describe('useImagePreload hook', () => {
  beforeEach(() => {
    mockPrefetch.mockClear();
    mockPrefetch.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should preload valid URLs on mount', () => {
    createHookRunner(() =>
      useImagePreload(['https://example.com/img1.jpg', 'https://example.com/img2.jpg'])
    );

    expect(mockPrefetch).toHaveBeenCalledTimes(2);
    expect(mockPrefetch).toHaveBeenCalledWith('https://example.com/img1.jpg');
    expect(mockPrefetch).toHaveBeenCalledWith('https://example.com/img2.jpg');
  });

  it('should filter out null, undefined, and empty strings', () => {
    createHookRunner(() =>
      useImagePreload([null, undefined, '', 'https://example.com/img.jpg'])
    );

    expect(mockPrefetch).toHaveBeenCalledTimes(1);
    expect(mockPrefetch).toHaveBeenCalledWith('https://example.com/img.jpg');
  });

  it('should not preload when disabled', () => {
    createHookRunner(() =>
      useImagePreload(['https://example.com/img.jpg'], { enabled: false })
    );

    expect(mockPrefetch).not.toHaveBeenCalled();
  });

  it('should not preload duplicate URLs within same render', () => {
    createHookRunner(() =>
      useImagePreload([
        'https://example.com/img.jpg',
        'https://example.com/img.jpg',
      ])
    );

    // The hook tracks preloaded URLs via Set, so duplicates are skipped
    expect(mockPrefetch).toHaveBeenCalledTimes(1);
  });

  it('should handle empty URL array', () => {
    createHookRunner(() => useImagePreload([]));

    expect(mockPrefetch).not.toHaveBeenCalled();
  });

  it('should handle prefetch errors silently', () => {
    mockPrefetch.mockRejectedValue(new Error('Network error'));

    // Should not throw
    expect(() => {
      createHookRunner(() =>
        useImagePreload(['https://example.com/img.jpg'])
      );
    }).not.toThrow();

    expect(mockPrefetch).toHaveBeenCalledTimes(1);
  });

  it('should cap preloaded URLs to MAX_PRELOADED_URLS', () => {
    // Create 201 unique URLs (max is 200)
    const urls = Array.from({ length: 201 }, (_, i) =>
      `https://example.com/img${i}.jpg`
    );

    createHookRunner(() => useImagePreload(urls));

    // All 201 should be attempted (the cap evicts the oldest from the set)
    expect(mockPrefetch).toHaveBeenCalledTimes(201);
  });
});
