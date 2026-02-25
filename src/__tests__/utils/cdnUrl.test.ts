/**
 * CDN URL Normalization — Regression Tests
 *
 * Tests for normalizeCdnUrl, getVideoPlaybackUrl, and getMediaVariant utilities.
 * These ensure absolute backend URLs are preserved while raw object keys
 * are mapped to the configured CloudFront distribution.
 */

jest.mock('../../config/aws-config', () => ({
  AWS_CONFIG: {
    storage: {
      cdnDomain: 'https://dc8kq67t0asis.cloudfront.net',
    },
  },
}));

import {
  normalizeCdnUrl,
  getVideoPlaybackUrl,
  getMediaVariant,
  buildRemoteMediaSource,
  getAlternateCdnUrls,
} from '../../utils/cdnUrl';

const LEGACY_CDN = 'd3gy4x1feicix3.cloudfront.net';
const CURRENT_CDN = 'dc8kq67t0asis.cloudfront.net';

describe('normalizeCdnUrl', () => {
  it('preserves legacy CDN URL host as-is', () => {
    const legacyUrl = `https://${LEGACY_CDN}/media/uploads/photo-abc123.jpg`;
    const result = normalizeCdnUrl(legacyUrl);
    expect(result).toBe(legacyUrl);
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

  it('preserves S3 URLs without rewriting host', () => {
    const s3Url = 'https://smuppy-media-staging-471112656108.s3.amazonaws.com/posts/u1/photo.jpg';
    expect(normalizeCdnUrl(s3Url)).toBe(s3Url);
  });

  it('normalizes raw object keys to current CDN URL', () => {
    const key = 'posts/u1/photo-abc123.jpg';
    expect(normalizeCdnUrl(key)).toBe(`https://${CURRENT_CDN}/posts/u1/photo-abc123.jpg`);
  });

  it('normalizes leading-slash object keys to current CDN URL', () => {
    const key = '/avatars/u1/profile.jpg';
    expect(normalizeCdnUrl(key)).toBe(`https://${CURRENT_CDN}/avatars/u1/profile.jpg`);
  });

  it('adds https for host-only URLs without scheme', () => {
    expect(normalizeCdnUrl('example.com/media/image.jpg')).toBe('https://example.com/media/image.jpg');
  });

  it('keeps file/data/blob URIs unchanged', () => {
    expect(normalizeCdnUrl('file:///tmp/photo.jpg')).toBe('file:///tmp/photo.jpg');
    expect(normalizeCdnUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(normalizeCdnUrl('blob:https://example.com/id')).toBe('blob:https://example.com/id');
  });

  it('handles empty string', () => {
    expect(normalizeCdnUrl('')).toBeUndefined();
  });
});

describe('getVideoPlaybackUrl', () => {
  it('prefers HLS URL over direct video URL', () => {
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
    expect(result).toBe(legacyHls);
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
    expect(result).toBe(legacyUrl);
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

describe('buildRemoteMediaSource', () => {
  it('adds mobile user-agent for CloudFront URLs', () => {
    const source = buildRemoteMediaSource(`https://${CURRENT_CDN}/media/uploads/photo-abc123.jpg`);
    expect(source).toBeDefined();
    expect(source?.uri).toBe(`https://${CURRENT_CDN}/media/uploads/photo-abc123.jpg`);
    expect(source?.headers?.['User-Agent']).toContain('iPhone');
  });

  it('preserves legacy domain and keeps CloudFront header behavior', () => {
    const source = buildRemoteMediaSource(`https://${LEGACY_CDN}/media/uploads/photo-abc123.jpg`);
    expect(source?.uri).toBe(`https://${LEGACY_CDN}/media/uploads/photo-abc123.jpg`);
    expect(source?.headers?.['User-Agent']).toContain('Mobile');
  });

  it('does not add headers for non-cloudfront URLs', () => {
    const source = buildRemoteMediaSource('https://example.com/static/image.jpg');
    expect(source).toEqual({ uri: 'https://example.com/static/image.jpg' });
  });

  it('returns undefined for empty input', () => {
    expect(buildRemoteMediaSource('')).toBeUndefined();
  });

  it('normalizes raw keys before building source', () => {
    const source = buildRemoteMediaSource('posts/u1/photo-abc123.jpg');
    expect(source?.uri).toBe(`https://${CURRENT_CDN}/posts/u1/photo-abc123.jpg`);
    expect(source?.headers?.['User-Agent']).toContain('Mobile');
  });
});

describe('getAlternateCdnUrls', () => {
  it('returns empty array for current CDN URL (single canonical host)', () => {
    const currentUrl = `https://${CURRENT_CDN}/avatars/u1/photo.jpg`;
    const alternates = getAlternateCdnUrls(currentUrl);
    expect(alternates).toEqual([]);
  });

  it('returns empty array for legacy CDN URL (no fallback fan-out)', () => {
    const legacyUrl = `https://${LEGACY_CDN}/covers/u1/cover.jpg`;
    const alternates = getAlternateCdnUrls(legacyUrl);
    expect(alternates).toEqual([]);
  });

  it('returns empty array for non-cloudfront URL', () => {
    expect(getAlternateCdnUrls('https://example.com/image.jpg')).toEqual([]);
  });
});
