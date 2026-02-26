/**
 * OptimizedImage Component
 * High-performance image component using expo-image
 * Features: caching, blurhash placeholders, lazy loading
 */

import React, { memo, useEffect, useMemo, useState, ReactNode } from 'react';
import { StyleSheet, View, ViewStyle, ImageStyle, StyleProp, Pressable } from 'react-native';
import { Image, ImageContentFit, ImageSource } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { buildRemoteMediaSource, getAlternateCdnUrls, normalizeCdnUrl } from '../utils/cdnUrl';
import { addBreadcrumb } from '../lib/sentry';

// Blurhash placeholder for smooth loading
const DEFAULT_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

// Cache policy
const CACHE_POLICY = 'memory-disk';

type OptimizedImageProps = Readonly<{
  source?: ImageSource | string | number | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  placeholder?: string;
  transition?: number;
  priority?: 'low' | 'normal' | 'high';
  recyclingKey?: string;
  onLoad?: () => void;
  onError?: () => void;
}>;

type AvatarImageProps = Readonly<{
  source?: ImageSource | string | number | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
  fallbackColor?: string;
}>;

type PostImageProps = Readonly<{
  source?: ImageSource | string | number | null;
  aspectRatio?: number;
  style?: StyleProp<ImageStyle>;
}>;

type BackgroundImageProps = Readonly<{
  source?: ImageSource | string | number | null;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}>;

type ThumbnailImageProps = Readonly<{
  source?: ImageSource | string | number | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
}>;

/**
 * Optimized Image component with caching and placeholders
 */
const buildSourceCandidates = (source?: ImageSource | string | number | null): Array<ImageSource | number> => {
  if (typeof source === 'number') return [source];

  if (typeof source === 'string') {
    const candidates: Array<ImageSource> = [];
    const primary = buildRemoteMediaSource(source);
    if (primary) {
      candidates.push(primary);
    } else if (source.trim()) {
      // Fallback: use raw string as URI when CDN normalization fails
      // (e.g., pending-scan paths or non-CDN URLs)
      candidates.push({ uri: source.trim() });
    }

    for (const alternateUrl of getAlternateCdnUrls(source)) {
      const alternateSource = buildRemoteMediaSource(alternateUrl);
      if (alternateSource) candidates.push(alternateSource);
    }
    return candidates;
  }

  if (source != null && typeof source === 'object') {
    if (!source.uri) return [source];

    const candidates: Array<ImageSource> = [];
    const primary = buildRemoteMediaSource(source.uri);
    if (primary) {
      candidates.push({
        ...source,
        ...primary,
        headers: {
          ...(source as { headers?: Record<string, string> }).headers,
          ...primary.headers,
        },
      });
    } else {
      candidates.push({ ...source, uri: normalizeCdnUrl(source.uri) });
    }

    for (const alternateUrl of getAlternateCdnUrls(source.uri)) {
      const altSource = buildRemoteMediaSource(alternateUrl);
      if (!altSource) continue;
      candidates.push({
        ...source,
        ...altSource,
        headers: {
          ...(source as { headers?: Record<string, string> }).headers,
          ...altSource.headers,
        },
      });
    }
    return candidates;
  }

  return [];
};

const OptimizedImage = memo<OptimizedImageProps>(({
  source,
  style,
  contentFit = 'cover',
  placeholder = DEFAULT_BLURHASH,
  transition = 200,
  priority = 'normal',
  recyclingKey,
  onLoad,
  onError,
  ...props
}) => {
  const [hasError, setHasError] = useState(false);
  const [attemptIndex, setAttemptIndex] = useState(0);

  const sourceCandidates = useMemo(() => buildSourceCandidates(source), [source]);
  const safeIndex = Math.min(attemptIndex, Math.max(sourceCandidates.length - 1, 0));
  const resolvedSource = sourceCandidates[safeIndex];

  useEffect(() => {
    setHasError(false);
    setAttemptIndex(0);
  }, [source]);

  // Skip rendering if no valid source or image failed to load
  if (hasError || !resolvedSource || (typeof resolvedSource === 'object' && !resolvedSource.uri)) {
    return (
      <Pressable
        style={[styles.placeholder, styles.errorPlaceholder, style as StyleProp<ViewStyle>]}
        onPress={hasError ? () => setHasError(false) : undefined}
      >
        <Ionicons name={hasError ? 'refresh-outline' : 'image-outline'} size={24} color="#9CA3AF" />
      </Pressable>
    );
  }

  return (
    <Image
      source={resolvedSource}
      style={style}
      contentFit={contentFit}
      placeholder={placeholder}
      placeholderContentFit="cover"
      transition={transition}
      cachePolicy={CACHE_POLICY}
      priority={priority}
      recyclingKey={recyclingKey}
      onLoad={onLoad}
      onError={(e) => {
        const uri = typeof resolvedSource === 'object' ? resolvedSource.uri : String(resolvedSource);
        const errorMsg = (e as { error?: string })?.error || 'unknown';
        if (__DEV__) {
          console.warn(`[MEDIA_ERROR] Image load failed: ${errorMsg} | URI: ${uri}`);
        }
        addBreadcrumb(
          `Image load failed: ${errorMsg}`,
          'media',
          { uri: uri?.slice(0, 200), error: errorMsg },
        );
        if (attemptIndex < sourceCandidates.length - 1) {
          setAttemptIndex((prev) => prev + 1);
          return;
        }

        setHasError(true);
        onError?.();
      }}
      {...props}
    />
  );
});

/**
 * Avatar Image with circular styling
 */
export const AvatarImage = memo<AvatarImageProps>(({
  source,
  size = 40,
  style,
  fallbackColor = '#E5E7EB',
  ...props
}) => {
  const avatarStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  // If no source, show placeholder with person icon
  if (!source) {
    return (
      <View style={[avatarStyle, { backgroundColor: fallbackColor, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Ionicons name="person" size={size * 0.5} color="#9CA3AF" />
      </View>
    );
  }

  return (
    <OptimizedImage
      source={source}
      style={[avatarStyle, style] as StyleProp<ImageStyle>}
      contentFit="cover"
      priority="high"
      {...props}
    />
  );
});

/**
 * Post Image with aspect ratio
 */
export const PostImage = memo<PostImageProps>(({
  source,
  aspectRatio = 1,
  style,
  ...props
}) => {
  return (
    <OptimizedImage
      source={source}
      style={[{ width: '100%', aspectRatio }, style] as StyleProp<ImageStyle>}
      contentFit="cover"
      priority="normal"
      {...props}
    />
  );
});

/**
 * Background Image (full cover)
 */
export const BackgroundImage = memo<BackgroundImageProps>(({
  source,
  style,
  children,
  ...props
}) => {
  return (
    <View style={[styles.backgroundContainer, style]}>
      <OptimizedImage
        source={source}
        style={StyleSheet.absoluteFill as StyleProp<ImageStyle>}
        contentFit="cover"
        priority="low"
        {...props}
      />
      {children}
    </View>
  );
});

/**
 * Thumbnail Image (small, high priority)
 */
export const ThumbnailImage = memo<ThumbnailImageProps>(({
  source,
  size = 60,
  style,
  ...props
}) => {
  return (
    <OptimizedImage
      source={source}
      style={[{ width: size, height: size, borderRadius: 8 }, style] as StyleProp<ImageStyle>}
      contentFit="cover"
      priority="high"
      transition={100}
      {...props}
    />
  );
});

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#F3F4F6',
  },
  errorPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundContainer: {
    flex: 1,
  },
});

// Named exports
OptimizedImage.displayName = 'OptimizedImage';
AvatarImage.displayName = 'AvatarImage';
PostImage.displayName = 'PostImage';
BackgroundImage.displayName = 'BackgroundImage';
ThumbnailImage.displayName = 'ThumbnailImage';

export default OptimizedImage;
