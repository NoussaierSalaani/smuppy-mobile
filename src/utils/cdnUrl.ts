/**
 * CDN URL Normalization
 *
 * The backend API returns full URLs using the staging CloudFront distribution
 * (d3gy4x1feicix3.cloudfront.net) which points to an empty staging S3 bucket.
 * All media lives in the production bucket served by the CDN configured in
 * AWS_CONFIG.storage.cdnDomain (env var EXPO_PUBLIC_CDN_DOMAIN).
 *
 * This utility normalizes URLs so every component — images, videos, avatars —
 * resolves to the correct CDN domain.
 */

import AWS_CONFIG from '../config/aws-config';

// CDK staging distribution — backend APIs return URLs using this domain
const LEGACY_CDN = 'd3gy4x1feicix3.cloudfront.net';

// Current CDN hostname — derived from centralized AWS config
const CURRENT_CDN = (() => {
  const raw = AWS_CONFIG.storage.cdnDomain;
  try {
    return new URL(raw).hostname;
  } catch {
    return raw.replace(/^https?:\/\//, '');
  }
})();

/**
 * Normalize a CDN URL: replace legacy staging CDN domain with the correct one.
 * Returns the original value unchanged when it's falsy or doesn't contain the legacy domain.
 */
export const normalizeCdnUrl = (url: string | undefined | null): string | undefined => {
  if (!url || typeof url !== 'string') return undefined;
  if (url.includes(LEGACY_CDN)) {
    return url.replace(LEGACY_CDN, CURRENT_CDN);
  }
  return url;
};

/**
 * Get an optimized media variant URL.
 * If the post has media_meta with variant keys, builds a CDN URL for the requested variant.
 * Falls back to the original URL when no variant is available (graceful degradation for old posts).
 *
 * @param originalUrl - The original media URL
 * @param variant - 'large' | 'medium' | 'thumb'
 * @param mediaMeta - media_meta from the post (may be undefined for old posts)
 */
/**
 * Get the best video playback URL: prefer HLS (adaptive bitrate) when available,
 * fall back to raw MP4. Both are normalized through the CDN.
 */
export const getVideoPlaybackUrl = (
  hlsUrl: string | null | undefined,
  videoUrl: string | null | undefined,
): string | undefined => {
  const preferred = hlsUrl || videoUrl;
  return normalizeCdnUrl(preferred) || undefined;
};

export const getMediaVariant = (
  originalUrl: string | null | undefined,
  variant: 'large' | 'medium' | 'thumb',
  mediaMeta?: { variants?: { large?: string; medium?: string; thumb?: string } },
): string | undefined => {
  if (!originalUrl) return undefined;

  // If variant key exists in media_meta, build CDN URL from it
  const variantKey = mediaMeta?.variants?.[variant];
  if (variantKey) {
    return `https://${CURRENT_CDN}/${variantKey}`;
  }

  // Fallback to original URL (normalized)
  return normalizeCdnUrl(originalUrl);
};
