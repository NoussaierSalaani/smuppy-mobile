/**
 * CDN URL Normalization
 *
 * The backend API returns full URLs using the staging CloudFront distribution
 * (d3gy4x1feicix3.cloudfront.net) which points to an empty staging S3 bucket.
 * All media lives in the production bucket served by dc8kq67t0asis.cloudfront.net.
 *
 * This utility normalizes URLs so every component — images, videos, avatars —
 * resolves to the correct CDN domain.
 */

const LEGACY_CDN = 'd3gy4x1feicix3.cloudfront.net';
const CURRENT_CDN = 'dc8kq67t0asis.cloudfront.net';

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
