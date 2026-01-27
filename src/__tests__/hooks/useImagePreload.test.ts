/**
 * Image Preload Utilities Tests
 */

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
