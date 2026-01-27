/**
 * useImagePreload Hook
 * Preloads images for better perceived performance
 */

import { useEffect, useRef } from 'react';
import { Image } from 'expo-image';

interface UseImagePreloadOptions {
  enabled?: boolean;
}

/**
 * Preload images when component mounts
 * Useful for preloading images before navigation
 */
export const useImagePreload = (
  imageUrls: (string | undefined | null)[],
  options: UseImagePreloadOptions = {}
): void => {
  const { enabled = true } = options;
  const preloadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const validUrls = imageUrls.filter(
      (url): url is string => typeof url === 'string' && url.length > 0
    );

    validUrls.forEach((url) => {
      // Skip if already preloaded
      if (preloadedRef.current.has(url)) return;

      // Mark as preloaded
      preloadedRef.current.add(url);

      // Preload using expo-image
      Image.prefetch(url).catch(() => {
        // Silently fail - preload is optional optimization
      });
    });
  }, [imageUrls, enabled]);
};

/**
 * Preload a single image
 */
export const preloadImage = async (url: string | undefined | null): Promise<boolean> => {
  if (!url) return false;

  try {
    await Image.prefetch(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Preload multiple images in parallel
 */
export const preloadImages = async (urls: (string | undefined | null)[]): Promise<void> => {
  const validUrls = urls.filter(
    (url): url is string => typeof url === 'string' && url.length > 0
  );

  await Promise.allSettled(validUrls.map((url) => Image.prefetch(url)));
};

export default useImagePreload;
