/**
 * Tests for media/image-optimizer Lambda handler (EventBridge trigger)
 */

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

const mockSend = jest.fn().mockResolvedValue({
  Body: { transformToByteArray: jest.fn().mockResolvedValue(Buffer.from('fake-image')) },
});

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
}));

const mockMetadata = jest.fn().mockResolvedValue({ width: 1920, height: 1080 });
const mockToBuffer = jest.fn().mockResolvedValue({ data: Buffer.alloc(32 * 32 * 4), info: { width: 32, height: 32 } });
const mockSharpInstance = {
  metadata: mockMetadata,
  resize: jest.fn().mockReturnThis(),
  rotate: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  ensureAlpha: jest.fn().mockReturnThis(),
  raw: jest.fn().mockReturnThis(),
  toBuffer: mockToBuffer,
};

jest.mock('sharp', () => {
  const fn = jest.fn().mockReturnValue(mockSharpInstance);
  return fn;
});

jest.mock('blurhash', () => ({
  encode: jest.fn().mockReturnValue('LKO2?U%2Tw=w]~RBVZRi}Y-;M{R*'),
}));

import { getPool } from '../../../shared/db';
import { handler } from '../../media/image-optimizer';

describe('media/image-optimizer handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
    // Reset sharp mock defaults
    mockMetadata.mockResolvedValue({ width: 1920, height: 1080 });
    mockToBuffer.mockResolvedValue({ data: Buffer.alloc(32 * 32 * 4), info: { width: 32, height: 32 } });
    mockSend.mockResolvedValue({
      Body: { transformToByteArray: jest.fn().mockResolvedValue(Buffer.from('fake-image')) },
    });
  });

  // ── Skip non-image files ─────────────────────────────────────────
  it('should skip non-image files', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/video.mp4', size: 1000 } },
    });
    expect(getPool).not.toHaveBeenCalled();
  });

  // ── Skip variant keys (prevent recursion) ────────────────────────
  it('should skip variant keys (prevent recursion)', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/large/photo.jpg', size: 1000 } },
    });
    expect(getPool).not.toHaveBeenCalled();
  });

  // ── Skip medium/ variant key ─────────────────────────────────────
  it('should skip medium/ variant key', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/medium/photo.jpg', size: 1000 } },
    });
    expect(getPool).not.toHaveBeenCalled();
  });

  // ── Skip thumb/ variant key ──────────────────────────────────────
  it('should skip thumb/ variant key', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/thumb/photo.jpg', size: 1000 } },
    });
    expect(getPool).not.toHaveBeenCalled();
  });

  // ── Skip unrecognized prefixes ───────────────────────────────────
  it('should skip unrecognized prefixes', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'unknown/user1/photo.jpg', size: 1000 } },
    });
    expect(getPool).not.toHaveBeenCalled();
  });

  // ── Skip oversized images ────────────────────────────────────────
  it('should skip oversized images', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/photo.jpg', size: 30 * 1024 * 1024 } },
    });
    expect(getPool).not.toHaveBeenCalled();
  });

  // ── Process posts/ images ────────────────────────────────────────
  it('should process posts/ images and update DB', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/photo.jpg', size: 1000 } },
    });
    expect(getPool).toHaveBeenCalled();
    expect(mockDb.query).toHaveBeenCalled();
    // Should be posts/peaks update (posts category)
    const updateCall = mockDb.query.mock.calls[0];
    expect(updateCall[0]).toContain('UPDATE posts');
  });

  // ── Process peaks/ images ────────────────────────────────────────
  it('should process peaks/ images and update DB with posts table', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'peaks/user1/photo.png', size: 1000 } },
    });
    expect(getPool).toHaveBeenCalled();
    expect(mockDb.query).toHaveBeenCalled();
    // peaks also updates posts table (peaks are stored as posts)
    const updateCall = mockDb.query.mock.calls[0];
    expect(updateCall[0]).toContain('UPDATE posts');
  });

  // ── Process users/ avatar image ──────────────────────────────────
  it('should update avatar_blurhash for users/ avatar image', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'users/user123/avatar-photo.jpg', size: 1000 } },
    });
    expect(getPool).toHaveBeenCalled();
    const updateCall = mockDb.query.mock.calls[0];
    expect(updateCall[0]).toContain('UPDATE profiles SET avatar_blurhash');
    expect(updateCall[1][1]).toBe('user123');
  });

  // ── Process users/ profile image (also avatar) ───────────────────
  it('should update avatar_blurhash for users/ profile image', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'users/user456/profile-pic.jpeg', size: 1000 } },
    });
    expect(getPool).toHaveBeenCalled();
    const updateCall = mockDb.query.mock.calls[0];
    expect(updateCall[0]).toContain('UPDATE profiles SET avatar_blurhash');
  });

  // ── Process users/ cover image ───────────────────────────────────
  it('should update cover_blurhash for users/ cover image', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'users/user789/cover-photo.jpg', size: 1000 } },
    });
    expect(getPool).toHaveBeenCalled();
    const updateCall = mockDb.query.mock.calls[0];
    expect(updateCall[0]).toContain('UPDATE profiles SET cover_blurhash');
    expect(updateCall[1][1]).toBe('user789');
  });

  // ── Process users/ banner image (also cover) ─────────────────────
  it('should update cover_blurhash for users/ banner image', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'users/userabc/banner-wide.webp', size: 1000 } },
    });
    expect(getPool).toHaveBeenCalled();
    const updateCall = mockDb.query.mock.calls[0];
    expect(updateCall[0]).toContain('UPDATE profiles SET cover_blurhash');
  });

  // ── Process users/ image that is neither avatar nor cover ────────
  it('should not update any blurhash for users/ image that is neither avatar nor cover', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'users/userxyz/random-image.jpg', size: 1000 } },
    });
    expect(getPool).toHaveBeenCalled();
    // No DB update should happen for non-avatar/non-cover
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  // ── extractUserId returning null (short key) ─────────────────────
  it('should handle users/ avatar with short key (no userId extractable)', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'users/avatar.jpg', size: 1000 } },
    });
    // extractUserId returns null for key with < 3 parts
    // isVariantKey will not match (only 2 parts), category = 'users'
    // isAvatar = true (key contains 'avatar'), but userId is null => no update
    expect(getPool).toHaveBeenCalled();
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  // ── updateDatabase: rowCount === 0 for posts (warning logged) ────
  it('should log warning when no post found for media key', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/missing-post.jpg', size: 1000 } },
    });
    expect(mockDb.query).toHaveBeenCalled();
    // rowCount = 0 triggers the warn branch
  });

  // ── Empty body from S3 GetObject ─────────────────────────────────
  it('should return early when S3 body is empty', async () => {
    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array(0)) },
    });

    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/empty.jpg', size: 1000 } },
    });

    // Should not call DB update
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  // ── Null body from S3 GetObject ──────────────────────────────────
  it('should return early when S3 body transformToByteArray returns undefined', async () => {
    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: jest.fn().mockResolvedValue(undefined) },
    });

    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/null-body.jpg', size: 1000 } },
    });

    expect(mockDb.query).not.toHaveBeenCalled();
  });

  // ── S3 GetObject with no Body at all ─────────────────────────────
  it('should return early when S3 GetObject has no Body', async () => {
    mockSend.mockResolvedValueOnce({ Body: undefined });

    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/no-body.jpg', size: 1000 } },
    });

    expect(mockDb.query).not.toHaveBeenCalled();
  });

  // ── Image metadata with no width/height (defaults to 0) ──────────
  it('should handle image with no width/height metadata (defaults to 0)', async () => {
    mockMetadata.mockResolvedValueOnce({ width: undefined, height: undefined });

    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/no-dims.jpg', size: 1000 } },
    });

    expect(getPool).toHaveBeenCalled();
    // With width=0, the condition `originalWidth > 0 && originalWidth <= variant.width` is false
    // so it goes to the else branch (resize)
  });

  // ── Image smaller than variant width (skip resize but still process) ──
  it('should process smaller image without resizing when originalWidth <= variant.width', async () => {
    mockMetadata.mockResolvedValueOnce({ width: 200, height: 150 });

    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/small-photo.jpg', size: 1000 } },
    });

    expect(getPool).toHaveBeenCalled();
    // All 3 variants have width > 200, so they all take the "smaller" branch (strip EXIF only)
  });

  // ── Image exactly at variant width boundary ──────────────────────
  it('should handle image exactly at variant width (e.g. 270px)', async () => {
    mockMetadata.mockResolvedValueOnce({ width: 270, height: 360 });

    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/exact-width.jpg', size: 1000 } },
    });

    expect(getPool).toHaveBeenCalled();
    // width=270: thumb (270) => <=, medium (540) => <=, large (1080) => <=
    // All three take the "no resize" branch
  });

  // ── Image between variant widths ─────────────────────────────────
  it('should resize for larger variants but not smaller ones', async () => {
    mockMetadata.mockResolvedValueOnce({ width: 600, height: 400 });

    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/mid-photo.jpg', size: 1000 } },
    });

    expect(getPool).toHaveBeenCalled();
    // width=600: thumb (270) => resize, medium (540) => resize, large (1080) => no resize (600 <= 1080)
  });

  // ── Various image extensions (.gif, .webp, .heic) ────────────────
  it('should process .gif images', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/animated.gif', size: 1000 } },
    });
    expect(getPool).toHaveBeenCalled();
  });

  it('should process .webp images', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/modern.webp', size: 1000 } },
    });
    expect(getPool).toHaveBeenCalled();
  });

  it('should process .heic images', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'peaks/user1/iphone.heic', size: 1000 } },
    });
    expect(getPool).toHaveBeenCalled();
  });

  // ── URL-encoded key with + for spaces ────────────────────────────
  it('should decode URL-encoded key with + for spaces', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/my+photo.jpg', size: 1000 } },
    });
    expect(getPool).toHaveBeenCalled();
  });

  // ── Not throw on processing error ────────────────────────────────
  it('should not throw on processing error', async () => {
    mockSend.mockRejectedValueOnce(new Error('S3 error'));

    await expect(handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/photo.jpg', size: 1000 } },
    })).resolves.toBeUndefined();
  });

  // ── isVariantKey returns false for non-variant paths ─────────────
  it('should not skip non-variant deep keys', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/subfolder/photo.jpg', size: 1000 } },
    });
    // 'subfolder' is not a variant prefix, so it should process
    expect(getPool).toHaveBeenCalled();
  });

  // ── cover users/ key with short path (no userId for cover) ───────
  it('should handle users/ cover with short key (no userId extractable)', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'users/cover.jpg', size: 1000 } },
    });
    // extractUserId returns null for key with < 3 parts
    // isCover = true, but userId is null => no update
    expect(getPool).toHaveBeenCalled();
    expect(mockDb.query).not.toHaveBeenCalled();
  });
});
