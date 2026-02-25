/**
 * CDN URL Normalization
 *
 * IMPORTANT:
 * - Absolute URLs returned by backend must be preserved as-is.
 * - Only raw object keys are mapped to the configured CDN domain.
 * This avoids staging/prod host drift where new media is uploaded in one
 * environment but rewritten to another.
 */

import { AWS_CONFIG } from '../config/aws-config';

// Current CDN hostname — derived from centralized AWS config
const CURRENT_CDN = (() => {
  const raw = AWS_CONFIG.storage.cdnDomain;
  try {
    return new URL(raw).hostname;
  } catch {
    return raw.replace(/^https?:\/\//, '');
  }
})();

const MOBILE_MEDIA_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

const ABSOLUTE_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:/i;
const HOST_WITHOUT_SCHEME_REGEX = /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i;
const KNOWN_CDN_HOSTS = Array.from(new Set([
  CURRENT_CDN,
  'dc8kq67t0asis.cloudfront.net',
  'd3gy4x1feicix3.cloudfront.net',
].filter(Boolean)));

const isLocalOrInlineUri = (value: string): boolean => {
  const lower = value.toLowerCase();
  return (
    lower.startsWith('file:') ||
    lower.startsWith('content:') ||
    lower.startsWith('ph:') ||
    lower.startsWith('assets-library:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('data:')
  );
};

const shouldAttachMediaHeaders = (url: string): boolean => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith('.cloudfront.net');
  } catch {
    return false;
  }
};

/**
 * Normalize a CDN URL: replace legacy staging CDN domain with the correct one.
 * Returns the original value unchanged when it's falsy or doesn't contain the legacy domain.
 */
export const normalizeCdnUrl = (url: string | undefined | null): string | undefined => {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  if (isLocalOrInlineUri(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      // Preserve explicit backend host (CloudFront/S3/custom).
      return trimmed;
    }
    return trimmed;
  } catch {
    // Fall through — handle host-without-scheme and raw object keys.
  }

  // Sometimes backend returns "cdn.example.com/path" without scheme.
  if (HOST_WITHOUT_SCHEME_REGEX.test(trimmed)) {
    return `https://${trimmed}`;
  }

  // Backend can also return raw object keys (posts/...jpg, avatars/...png).
  // Normalize those keys onto the configured CloudFront domain.
  if (!ABSOLUTE_SCHEME_REGEX.test(trimmed)) {
    const key = trimmed.replace(/^\/+/, '');
    if (!key) return undefined;
    return CURRENT_CDN ? `https://${CURRENT_CDN}/${key}` : key;
  }

  return trimmed;
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

export const buildRemoteMediaSource = (
  url: string | null | undefined,
): { uri: string; headers?: Record<string, string> } | undefined => {
  const normalized = normalizeCdnUrl(url);
  if (!normalized) return undefined;

  if (shouldAttachMediaHeaders(normalized)) {
    return {
      uri: normalized,
      headers: { 'User-Agent': MOBILE_MEDIA_USER_AGENT },
    };
  }

  return { uri: normalized };
};

export const getAlternateCdnUrls = (url: string | null | undefined): string[] => {
  const normalized = normalizeCdnUrl(url);
  if (!normalized) return [];

  try {
    const parsed = new URL(normalized);

    // Absolute URL on known CloudFront host: build same path on other known hosts.
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && KNOWN_CDN_HOSTS.includes(parsed.hostname)) {
      return KNOWN_CDN_HOSTS
        .filter((host) => host !== parsed.hostname)
        .map((host) => `https://${host}${parsed.pathname}${parsed.search || ''}`);
    }

    return [];
  } catch {
    return [];
  }
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
