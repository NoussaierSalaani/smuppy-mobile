/**
 * Media Upload Service Tests — uploadImage, uploadVideo, uploadMultiple, helpers
 *
 * Covers the upload functions (uploadImage, uploadVideo, uploadMultiple,
 * uploadAvatar, uploadCoverImage, uploadPostMedia, uploadPeakMedia),
 * file validation, and the uploadToS3 / uploadWithFileSystem paths.
 *
 * The existing mediaUpload.test.ts covers getCloudFrontUrl, s3ToCloudFront,
 * getPresignedUrl, generateVideoThumbnail, and deleteFromS3.
 * This file targets the remaining uncovered 59.5%.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = true;

// ---------------------------------------------------------------------------
// Mocks — BEFORE imports
// ---------------------------------------------------------------------------

const mockGetInfoAsync = jest.fn();
const mockUploadAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: mockGetInfoAsync,
  uploadAsync: mockUploadAsync,
  readAsStringAsync: mockReadAsStringAsync,
}));

jest.mock('../../config/env', () => ({
  ENV: {
    S3_BUCKET_NAME: 'test-bucket',
    AWS_REGION: 'us-east-1',
    CLOUDFRONT_URL: 'https://cdn.test.com',
    API_URL: 'https://api.test.com',
  },
}));

jest.mock('../../config/aws-config', () => ({
  AWS_CONFIG: {
    region: 'us-east-1',
    storage: {
      bucket: 'test-bucket',
      cdnDomain: 'https://cdn.test.com',
    },
    api: {
      restEndpoint: 'https://api.test.com',
      restEndpoint2: 'https://api2.test.com',
      restEndpoint3: 'https://api3.test.com',
      restEndpointDisputes: 'https://disputes.test.com',
      websocketEndpoint: 'wss://ws.test.com',
    },
    cognito: {
      userPoolId: 'us-east-1_test',
      userPoolClientId: 'test-client-id',
      identityPoolId: 'us-east-1:test-identity-id',
    },
    dynamodb: {
      tables: {
        feed: 'feed-test',
        likes: 'likes-test',
      },
    },
  },
}));

const mockCaptureException = jest.fn();
jest.mock('../../lib/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const mockCompressImage = jest.fn();
const mockCompressAvatar = jest.fn();
const mockCompressCover = jest.fn();
const mockCompressPost = jest.fn();
const mockCompressThumbnail = jest.fn();

jest.mock('../../utils/imageCompression', () => ({
  compressImage: (...a: unknown[]) => mockCompressImage(...a),
  compressAvatar: (...a: unknown[]) => mockCompressAvatar(...a),
  compressCover: (...a: unknown[]) => mockCompressCover(...a),
  compressPost: (...a: unknown[]) => mockCompressPost(...a),
  compressThumbnail: (...a: unknown[]) => mockCompressThumbnail(...a),
}));

const mockGetUploadUrl = jest.fn();
const mockGetCDNUrl = jest.fn();

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    getUploadUrl: (...a: unknown[]) => mockGetUploadUrl(...a),
    getCDNUrl: (...a: unknown[]) => mockGetCDNUrl(...a),
  },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock FileReader
class MockFileReader {
  result: string | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(_blob: unknown) {
    this.result = 'data:image/jpeg;base64,dGVzdA==';
    setTimeout(() => this.onloadend?.(), 0);
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).FileReader = MockFileReader;

// Mock atob
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary');

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  uploadImage,
  uploadVideo,
  uploadMultiple,
  uploadAvatar,
  uploadCoverImage,
  uploadPostMedia,
  uploadPeakMedia,
  uploadToS3,
  uploadWithFileSystem,
} from '../../services/mediaUpload';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupValidFile() {
  // getFileInfo: exists, small size
  mockGetInfoAsync.mockResolvedValue({ exists: true, size: 5000 });
  // fetch for readFileAsBase64
  mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
    if (opts?.method === 'HEAD') {
      return Promise.resolve({ ok: true });
    }
    if (typeof url === 'string' && url.startsWith('https://s3')) {
      // S3 upload response
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') });
    }
    // readFileAsBase64 fetch
    return Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(['test'])),
    });
  });
}

function setupPresignedUrl() {
  mockGetUploadUrl.mockResolvedValue({
    uploadUrl: 'https://s3.presigned.url',
    fileUrl: 'posts/u1/image.jpg',
  });
  mockGetCDNUrl.mockReturnValue('https://cdn.test.com/posts/u1/image.jpg');
}

function setupCompression() {
  mockCompressPost.mockResolvedValue({
    uri: 'file:///compressed.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1500,
  });
  mockCompressAvatar.mockResolvedValue({
    uri: 'file:///avatar.jpg',
    mimeType: 'image/jpeg',
    fileSize: 500,
  });
  mockCompressCover.mockResolvedValue({
    uri: 'file:///cover.jpg',
    mimeType: 'image/jpeg',
    fileSize: 2000,
  });
  mockCompressThumbnail.mockResolvedValue({
    uri: 'file:///thumb.jpg',
    mimeType: 'image/jpeg',
    fileSize: 300,
  });
  mockCompressImage.mockResolvedValue({
    uri: 'file:///custom.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mediaUpload — upload functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupValidFile();
    setupPresignedUrl();
    setupCompression();
  });

  // =========================================================================
  // uploadToS3
  // =========================================================================
  describe('uploadToS3', () => {
    it('reads file, converts to blob, and PUTs to presigned URL', async () => {
      const putResponse = { ok: true, status: 200, text: () => Promise.resolve('') };
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(new Blob(['test'])),
        })
        .mockResolvedValueOnce(putResponse);

      const onProgress = jest.fn();
      const result = await uploadToS3('file:///test.jpg', 'https://s3.presigned.url', 'image/jpeg', onProgress);

      expect(result).toBe(true);
      expect(onProgress).toHaveBeenCalledWith(100);
      // The second fetch call is the PUT to S3
      expect(mockFetch).toHaveBeenCalledWith(
        'https://s3.presigned.url',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('returns false on S3 upload failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(new Blob(['test'])),
        })
        .mockResolvedValueOnce({ ok: false, status: 403, text: () => Promise.resolve('Forbidden') });

      const result = await uploadToS3('file:///test.jpg', 'https://s3.presigned.url', 'image/jpeg');
      expect(result).toBe(false);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('falls back to FileSystem.readAsStringAsync for file:// URIs when fetch fails', async () => {
      // First fetch (readFileAsBase64) fails, then fallback readAsStringAsync,
      // then the PUT fetch
      mockFetch
        .mockRejectedValueOnce(new Error('fetch not supported'))
        .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('') });

      mockReadAsStringAsync.mockResolvedValue('dGVzdA==');

      // The uploadToS3 calls readFileAsBase64 which falls back to readAsStringAsync
      // Then it creates a Uint8Array and does a PUT
      const result = await uploadToS3('file:///test.jpg', 'https://s3.presigned.url', 'image/jpeg');

      expect(mockReadAsStringAsync).toHaveBeenCalledWith('file:///test.jpg', { encoding: 'base64' });
      expect(result).toBe(true);
    });

    it('returns false and captures exception on total failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await uploadToS3('https://example.com/test.jpg', 'https://s3.url', 'image/jpeg');
      expect(result).toBe(false);
      expect(mockCaptureException).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // uploadWithFileSystem
  // =========================================================================
  describe('uploadWithFileSystem', () => {
    it('uses FileSystem.uploadAsync on success', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      const onProgress = jest.fn();
      const result = await uploadWithFileSystem('file:///test.jpg', 'https://s3.url', 'image/jpeg', onProgress);

      expect(result).toBe(true);
      expect(onProgress).toHaveBeenCalledWith(100);
      expect(mockUploadAsync).toHaveBeenCalledWith(
        'https://s3.url',
        'file:///test.jpg',
        expect.objectContaining({
          httpMethod: 'PUT',
          uploadType: 0,
        }),
      );
    });

    it('falls back to uploadToS3 when FileSystem returns non-2xx', async () => {
      mockUploadAsync.mockResolvedValue({ status: 500, body: 'error' });

      // Setup fetch for the uploadToS3 fallback
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(new Blob(['test'])),
        })
        .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('') });

      const result = await uploadWithFileSystem('file:///test.jpg', 'https://s3.url', 'image/jpeg');
      expect(result).toBe(true);
    });

    it('falls back to uploadToS3 when FileSystem throws', async () => {
      mockUploadAsync.mockRejectedValue(new Error('native error'));

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(new Blob(['test'])),
        })
        .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('') });

      const result = await uploadWithFileSystem('file:///test.jpg', 'https://s3.url', 'image/jpeg');
      expect(result).toBe(true);
    });

    it('returns false when both FileSystem and fetch fallback fail', async () => {
      mockUploadAsync.mockRejectedValue(new Error('native error'));
      mockFetch.mockRejectedValue(new Error('all failed'));

      const result = await uploadWithFileSystem('https://example.com/test.jpg', 'https://s3.url', 'image/jpeg');
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // uploadImage
  // =========================================================================
  describe('uploadImage', () => {
    it('validates, compresses, gets presigned URL, and uploads image', async () => {
      // All mocks already set up in beforeEach
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      const onProgress = jest.fn();
      const result = await uploadImage('user-1', 'file:///photo.jpg', {
        folder: 'posts',
        compress: true,
        onProgress,
      });

      expect(result.success).toBe(true);
      expect(result.key).toBe('posts/u1/image.jpg');
      expect(result.cdnUrl).toBe('https://cdn.test.com/posts/u1/image.jpg');
      expect(result.fileSize).toBe(1500);
      expect(mockCompressPost).toHaveBeenCalledWith('file:///photo.jpg');
      expect(mockGetUploadUrl).toHaveBeenCalled();
    });

    it('uses compressAvatar for avatars folder', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      await uploadImage('user-1', 'file:///photo.jpg', { folder: 'avatars' });
      expect(mockCompressAvatar).toHaveBeenCalledWith('file:///photo.jpg');
    });

    it('uses compressCover for covers folder', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      await uploadImage('user-1', 'file:///photo.jpg', { folder: 'covers' });
      expect(mockCompressCover).toHaveBeenCalledWith('file:///photo.jpg');
    });

    it('uses compressThumbnail for thumbnails folder', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      await uploadImage('user-1', 'file:///photo.jpg', { folder: 'thumbnails' });
      expect(mockCompressThumbnail).toHaveBeenCalledWith('file:///photo.jpg');
    });

    it('uses custom compressionOptions with compressImage', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      const opts = { quality: 0.5, maxWidth: 800 };
      await uploadImage('user-1', 'file:///photo.jpg', {
        folder: 'posts',
        compress: true,
        compressionOptions: opts,
      });
      expect(mockCompressImage).toHaveBeenCalledWith('file:///photo.jpg', opts);
    });

    it('skips compression when compress=false', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      await uploadImage('user-1', 'file:///photo.jpg', { compress: false });
      expect(mockCompressPost).not.toHaveBeenCalled();
      expect(mockCompressImage).not.toHaveBeenCalled();
    });

    it('returns error when file validation fails (not found)', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false });

      const result = await uploadImage('user-1', 'file:///missing.jpg');
      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('returns error when presigned URL fails', async () => {
      mockGetUploadUrl.mockRejectedValue(new Error('API down'));

      const result = await uploadImage('user-1', 'file:///photo.jpg');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to get upload URL');
    });

    it('returns error when S3 upload fails', async () => {
      mockUploadAsync.mockRejectedValue(new Error('upload error'));
      mockFetch.mockRejectedValue(new Error('all fail'));

      const result = await uploadImage('user-1', 'file:///photo.jpg');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Upload to storage failed');
    });

    it('returns generic error on unexpected exception', async () => {
      // Force compression to throw (after validation passes) to hit the outer catch
      mockCompressPost.mockRejectedValue(new Error('unexpected compression error'));

      const result = await uploadImage('user-1', 'file:///photo.jpg');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Upload failed');
      expect(mockCaptureException).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // uploadVideo
  // =========================================================================
  describe('uploadVideo', () => {
    it('validates and uploads video without compression', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      const result = await uploadVideo('user-1', 'file:///video.mp4');
      expect(result.success).toBe(true);
      expect(result.key).toBe('posts/u1/image.jpg'); // from mock presigned URL
      // No compression functions should be called for video
      expect(mockCompressPost).not.toHaveBeenCalled();
    });

    it('returns error when validation fails', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false });

      const result = await uploadVideo('user-1', 'file:///missing.mp4');
      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('returns error when presigned URL fails', async () => {
      mockGetUploadUrl.mockRejectedValue(new Error('API down'));

      const result = await uploadVideo('user-1', 'file:///video.mp4');
      expect(result.success).toBe(false);
    });

    it('calls onProgress during upload', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });
      const onProgress = jest.fn();

      await uploadVideo('user-1', 'file:///video.mp4', { onProgress });
      expect(onProgress).toHaveBeenCalled();
    });

    it('returns generic error on unexpected exception', async () => {
      // Force an exception after presigned URL by making onProgress throw at the upload stage
      // The simplest way: make uploadWithFileSystem AND uploadToS3 throw by having
      // uploadAsync throw and then fetch (for fallback) also throw - but that returns false,
      // not an exception. Instead, we make the videoUri.substring throw by passing something weird.
      // Actually, just mock the result so presignedData is returned, then make uploadWithFileSystem
      // throw an unhandled error by making the callback throw inside the try.
      // Simplest: provide an onProgress that throws when called at stage 30
      const badProgress = jest.fn().mockImplementation((p: number) => {
        if (p === 30) throw new Error('boom in progress');
      });

      const result = await uploadVideo('user-1', 'file:///video.mp4', { onProgress: badProgress });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Upload failed');
    });
  });

  // =========================================================================
  // uploadMultiple
  // =========================================================================
  describe('uploadMultiple', () => {
    it('uploads multiple image files', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      const files = [
        { uri: 'file:///img1.jpg', type: 'image' as const },
        { uri: 'file:///img2.jpg', type: 'image' as const },
      ];
      const results = await uploadMultiple('user-1', files);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('uploads mixed image and video files', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      const files = [
        { uri: 'file:///img1.jpg', type: 'image' as const },
        { uri: 'file:///vid1.mp4', type: 'video' as const },
      ];
      const results = await uploadMultiple('user-1', files);

      expect(results).toHaveLength(2);
    });

    it('reports overall progress across files', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });
      const onProgress = jest.fn();

      const files = [
        { uri: 'file:///img1.jpg', type: 'image' as const },
        { uri: 'file:///img2.jpg', type: 'image' as const },
      ];
      await uploadMultiple('user-1', files, { onProgress });

      expect(onProgress).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Convenience wrappers
  // =========================================================================
  describe('uploadAvatar', () => {
    it('calls uploadImage with avatars folder', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      const result = await uploadAvatar('user-1', 'file:///avatar.jpg');
      expect(result.success).toBe(true);
      expect(mockCompressAvatar).toHaveBeenCalled();
    });
  });

  describe('uploadCoverImage', () => {
    it('calls uploadImage with covers folder', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      const result = await uploadCoverImage('user-1', 'file:///cover.jpg');
      expect(result.success).toBe(true);
      expect(mockCompressCover).toHaveBeenCalled();
    });
  });

  describe('uploadPostMedia', () => {
    it('delegates to uploadImage for image type', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      const result = await uploadPostMedia('user-1', 'file:///post.jpg', 'image');
      expect(result.success).toBe(true);
      expect(mockCompressPost).toHaveBeenCalled();
    });

    it('delegates to uploadVideo for video type', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      const result = await uploadPostMedia('user-1', 'file:///post.mp4', 'video');
      expect(result.success).toBe(true);
    });
  });

  describe('uploadPeakMedia', () => {
    it('delegates to uploadVideo with peaks folder', async () => {
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      const result = await uploadPeakMedia('user-1', 'file:///peak.mp4');
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // File validation edge cases (via uploadImage)
  // =========================================================================
  describe('file validation edge cases', () => {
    it('handles ph:// URIs via fetch HEAD', async () => {
      // ph:// URIs use fetch HEAD for validation
      mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
        if (typeof url === 'string' && url.startsWith('ph://') && opts?.method === 'HEAD') {
          return Promise.resolve({ ok: true });
        }
        if (typeof url === 'string' && url.startsWith('https://s3')) {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['test'])) });
      });
      mockUploadAsync.mockResolvedValue({ status: 200, body: '' });

      const result = await uploadImage('user-1', 'ph://asset123');
      expect(result.success).toBe(true);
    });

    it('rejects file exceeding max size', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: true, size: 20 * 1024 * 1024 }); // 20MB > 10MB limit

      const result = await uploadImage('user-1', 'file:///huge.jpg');
      expect(result.success).toBe(false);
      expect(result.error).toContain('File too large');
    });
  });
});
