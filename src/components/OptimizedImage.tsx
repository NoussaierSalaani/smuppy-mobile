/**
 * OptimizedImage Component
 * High-performance image component using expo-image
 * Features: caching, blurhash placeholders, lazy loading
 */

import React, { memo, ReactNode } from 'react';
import { StyleSheet, View, ViewStyle, ImageStyle, StyleProp } from 'react-native';
import { Image, ImageContentFit, ImageSource } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

// Blurhash placeholder for smooth loading
const DEFAULT_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

// Cache policy
const CACHE_POLICY = 'memory-disk';

// CDN URL normalization - fix legacy URLs pointing to wrong CloudFront
const WRONG_CDN = 'd3gy4x1feicix3.cloudfront.net';
const CORRECT_CDN = 'dc8kq67t0asis.cloudfront.net';

const normalizeCdnUrl = (url: string | undefined | null): string | undefined => {
  if (!url || typeof url !== 'string') return undefined;
  // Fix URLs with wrong CDN domain
  if (url.includes(WRONG_CDN)) {
    return url.replace(WRONG_CDN, CORRECT_CDN);
  }
  return url;
};

interface OptimizedImageProps {
  source?: ImageSource | string | number | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  placeholder?: string;
  transition?: number;
  priority?: 'low' | 'normal' | 'high';
  recyclingKey?: string;
  onLoad?: () => void;
  onError?: () => void;
}

interface AvatarImageProps {
  source?: ImageSource | string | number | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
  fallbackColor?: string;
}

interface PostImageProps {
  source?: ImageSource | string | number | null;
  aspectRatio?: number;
  style?: StyleProp<ImageStyle>;
}

interface BackgroundImageProps {
  source?: ImageSource | string | number | null;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

interface ThumbnailImageProps {
  source?: ImageSource | string | number | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
}

/**
 * Optimized Image component with caching and placeholders
 */
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
  // Handle different source formats and normalize CDN URLs
  let resolvedSource: ImageSource | number | undefined;
  if (typeof source === 'string') {
    resolvedSource = { uri: normalizeCdnUrl(source) };
  } else if (source != null && typeof source === 'object') {
    resolvedSource = source.uri
      ? { ...source, uri: normalizeCdnUrl(source.uri) }
      : source;
  } else if (typeof source === 'number') {
    resolvedSource = source;
  }

  // Skip rendering if no valid source
  if (!resolvedSource || (typeof resolvedSource === 'object' && !resolvedSource.uri)) {
    return (
      <View style={[styles.placeholder, style as StyleProp<ViewStyle>]} />
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
      onError={onError}
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
