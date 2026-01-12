/**
 * OptimizedImage Component
 * High-performance image component using expo-image
 * Features: caching, blurhash placeholders, lazy loading
 */

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../config/theme';

// Blurhash placeholder for smooth loading
const DEFAULT_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

// Cache policy
const CACHE_POLICY = 'memory-disk';

/**
 * Optimized Image component with caching and placeholders
 */
const OptimizedImage = memo(({
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
  // Handle different source formats
  const imageSource = typeof source === 'string'
    ? { uri: source }
    : source;

  // Skip rendering if no valid source
  if (!imageSource || (!imageSource.uri && typeof source !== 'number')) {
    return (
      <View style={[styles.placeholder, style]} />
    );
  }

  return (
    <Image
      source={imageSource}
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
export const AvatarImage = memo(({
  source,
  size = 40,
  style,
  fallbackColor = COLORS.gray200 || '#E5E5E5',
  ...props
}) => {
  const avatarStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  // If no source, show colored placeholder
  if (!source) {
    return (
      <View style={[avatarStyle, { backgroundColor: fallbackColor }, style]} />
    );
  }

  return (
    <OptimizedImage
      source={source}
      style={[avatarStyle, style]}
      contentFit="cover"
      priority="high"
      {...props}
    />
  );
});

/**
 * Post Image with aspect ratio
 */
export const PostImage = memo(({
  source,
  aspectRatio = 1,
  style,
  ...props
}) => {
  return (
    <OptimizedImage
      source={source}
      style={[{ width: '100%', aspectRatio }, style]}
      contentFit="cover"
      priority="normal"
      {...props}
    />
  );
});

/**
 * Background Image (full cover)
 */
export const BackgroundImage = memo(({
  source,
  style,
  children,
  ...props
}) => {
  return (
    <View style={[styles.backgroundContainer, style]}>
      <OptimizedImage
        source={source}
        style={StyleSheet.absoluteFill}
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
export const ThumbnailImage = memo(({
  source,
  size = 60,
  style,
  ...props
}) => {
  return (
    <OptimizedImage
      source={source}
      style={[{ width: size, height: size, borderRadius: 8 }, style]}
      contentFit="cover"
      priority="high"
      transition={100}
      {...props}
    />
  );
});

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: COLORS.gray100,
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
