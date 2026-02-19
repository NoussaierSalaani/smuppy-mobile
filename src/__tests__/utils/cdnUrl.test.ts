/**
 * CDN URL Normalization — Regression Tests
 *
 * Tests for normalizeCdnUrl, getVideoPlaybackUrl, and getMediaVariant utilities.
 * These ensure legacy CDN domains are correctly replaced and media URLs resolve
 * to the current CloudFront distribution.
 */

jest.mock('../../config/aws-config', () => ({
  AWS_CONFIG: {
    storage: {
      cdnDomain: 'https://dc8kq67t0asis.cloudfront.net',
    },
  },
}));

import { normalizeCdnUrl, getVideoPlaybackUrl, getMediaVariant } from '../../utils/cdnUrl';

const LEGACY_CDN = 'd3gy4x1feicix3.cloudfront.net';
const CURRENT_CDN = 'dc8kq67t0asis.cloudfront.net';

describe('normalizeCdnUrl', () => {
  it('BUG-2026-01-25: replaces legacy CDN domain with current', () => {
    const legacyUrl = `https://${LEGACY_CDN}/media/uploads/photo-abc123.jpg`;
    const result = normalizeCdnUrl(legacyUrl);
    expect(result).toBe(`https://${CURRENT_CDN}/media/uploads/photo-abc123.jpg`);
  });

  it('returns undefined for null input', () => {
    expect(normalizeCdnUrl(null)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(normalizeCdnUrl(undefined)).toBeUndefined();
  });

  it('returns original URL when no legacy domain present', () => {
    const url = `https://${CURRENT_CDN}/media/uploads/photo-abc123.jpg`;
    expect(normalizeCdnUrl(url)).toBe(url);
  });

  it('handles empty string', () => {
    expect(normalizeCdnUrl('')).toBeUndefined();
  });
});

describe('getVideoPlaybackUrl', () => {
  it('prefers HLS URL over video URL', () => {
    const hlsUrl = `https://${CURRENT_CDN}/videos/hls/master.m3u8`;
    const videoUrl = `https://${CURRENT_CDN}/videos/raw/video.mp4`;
    const result = getVideoPlaybackUrl(hlsUrl, videoUrl);
    expect(result).toBe(hlsUrl);
  });

  it('falls back to video URL when no HLS', () => {
    const videoUrl = `https://${CURRENT_CDN}/videos/raw/video.mp4`;
    const result = getVideoPlaybackUrl(null, videoUrl);
    expect(result).toBe(videoUrl);
  });

  it('returns undefined when both are null', () => {
    expect(getVideoPlaybackUrl(null, null)).toBeUndefined();
  });

  it('normalizes legacy CDN in returned URL', () => {
    const legacyHls = `https://${LEGACY_CDN}/videos/hls/master.m3u8`;
    const result = getVideoPlaybackUrl(legacyHls, null);
    expect(result).toBe(`https://${CURRENT_CDN}/videos/hls/master.m3u8`);
  });
});

describe('getMediaVariant', () => {
  it('builds CDN URL from variant key when available', () => {
    const originalUrl = `https://${CURRENT_CDN}/media/uploads/photo-abc123.jpg`;
    const mediaMeta = {
      variants: {
        large: 'media/processed/photo-abc123-large.jpg',
        medium: 'media/processed/photo-abc123-medium.jpg',
        thumb: 'media/processed/photo-abc123-thumb.jpg',
      },
    };
    const result = getMediaVariant(originalUrl, 'medium', mediaMeta);
    expect(result).toBe(`https://${CURRENT_CDN}/media/processed/photo-abc123-medium.jpg`);
  });

  it('falls back to normalized original URL when no variant', () => {
    const legacyUrl = `https://${LEGACY_CDN}/media/uploads/photo-abc123.jpg`;
    const result = getMediaVariant(legacyUrl, 'large', undefined);
    expect(result).toBe(`https://${CURRENT_CDN}/media/uploads/photo-abc123.jpg`);
  });

  it('returns undefined for null originalUrl', () => {
    expect(getMediaVariant(null, 'large')).toBeUndefined();
  });

  it('returns undefined for undefined originalUrl', () => {
    expect(getMediaVariant(undefined, 'large')).toBeUndefined();
  });

  it('handles empty variants object', () => {
    const originalUrl = `https://${CURRENT_CDN}/media/uploads/photo-abc123.jpg`;
    const mediaMeta = { variants: {} };
    const result = getMediaVariant(originalUrl, 'thumb', mediaMeta);
    expect(result).toBe(originalUrl);
  });
});
